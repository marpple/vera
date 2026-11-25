#!/usr/bin/env node
/* Live sync for the hub dashboard. Copied into the hub folder; never edited there.
   Every cycle (15 s after the previous one started, never overlapping) it runs, in parallel:
   - `orca worktree ps --agent-wait` (what each worker is doing, prompt waits),
   - `orca orchestration worker-list`, `task-list`, and `inbox` for the hub's Run, so it sees workers the hub has not
     written into state.js yet and worker messages the hub has not handled yet (state.js lastMsgId),
   - every 4th cycle `gh pr view` for each open PR (CI),
   and writes live.js. dashboard.html re-reads live.js every 5 s. It writes only live.js and sync.pid; state.js stays the hub's.
   With state.js runtime "claude-app" (references/claude-app.md) it reads each worker's Claude Code transcript instead of Orca
   (the newest .jsonl in the home directory's .claude/projects/<worktree path, non-alphanumerics as "-">) for its activity and the VERA messages it sent,
   and in loop mode serves the hub folder read-only on http://127.0.0.1:<port>/ (port in sync.port), because the app's
   browser pane shows file:// pages outside the project only as static snapshots.

   node <hub>/sync.cjs          loop (one instance per hub folder, guarded by sync.pid); it exits by itself once state.js has closed: true,
                                state.js has been missing for 4 cycles, or sync.pid names another process
   node <hub>/sync.cjs --once   one cycle, no lock
   node <hub>/sync.cjs --wait   claude-app only: never touches sync.pid and writes only wait.pid; exits 0 once a worker has
                                something for the hub, printing one line each, after its time: a VERA message newer than state.js
                                lastMsgAt, or "stopped <item>: <its last text>" for a worker whose turn ended after lastMsgAt
                                without ask, question, or done; exits 1 when state.js stays unreadable, 2 when the hub is not
                                claude-app. One wait per hub folder (wait.pid): a new one replaces the running one, which exits 3
                                and prints nothing; one ended from outside exits 143. Each VERA line is followed by its
                                message's body, indented by four spaces. The hub runs it in the background so a worker's message wakes it: in the app
                                SendMessage always asks the developer, so workers end their turn with the VERA message as its
                                text instead (references/claude-app.md).
   node <hub>/sync.cjs --wait --now   the same lines at once (none when nothing waits), then exit; never touches wait.pid
   node <hub>/sync.cjs --stop   stop the running loop, when sync.pid names one */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFile, execFileSync } = require("child_process");

const HUB = __dirname;
const STATE = path.join(HUB, "state.js"), LIVE = path.join(HUB, "live.js"), PID = path.join(HUB, "sync.pid"), PORT = path.join(HUB, "sync.port"), WAIT_PID = path.join(HUB, "wait.pid");
const PROJECTS = process.env.VERA_TRANSCRIPTS || path.join(os.homedir(), ".claude", "projects"); // claude-app transcripts
const CYCLE_MS = Number(process.env.VERA_CYCLE_MS) || 15000, GH_EVERY = 4, INBOX_LIMIT = 60, MISSING_CYCLES = 4;
const PHASE_NUM = { red: 1, green: 2, verified: 3, "pr-open": 6, "ci-green": 7 }; // status --phase → state.js phases
const FROM_WORKERS = new Set(["status", "ask", "question", "worker_done", "escalation"]);

const oneLine = (s, n) => String(s ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, n);
const flat = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const iso = ms => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);
const arr = x => Array.isArray(x) ? x : [];
const rows = x => arr(x).filter(e => e && typeof e === "object"); // a list from a CLI: one bad entry must not stop the cycle

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "utf8", timeout: 25000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
    });
  });
}
const result = j => (j && j.result !== undefined ? j.result : j) || {};
const errLine = (what, e) => `${what}: ${oneLine(e.stderr || e.message, 120)}`;

function readState() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(STATE, "utf8"), ctx, { timeout: 1000 });
  if (!ctx.window.HUB_STATE) throw new Error("state.js did not set window.HUB_STATE");
  return ctx.window.HUB_STATE;
}

function lastAssistantText(read) {
  const msgs = (read && read.transcript && read.transcript.messages) || [];
  const texts = msgs.filter(m => m.role === "assistant")
    .flatMap(m => (m.blocks || []).filter(b => b.type === "text" && b.text).map(b => ({ t: m.timestamp || 0, text: b.text })));
  texts.sort((a, b) => a.t - b.t);
  return texts.length ? flat(texts[texts.length - 1].text, 200) : null;
}

function ciOf(rollup) {
  let pass = 0, fail = 0, pending = 0;
  for (const c of rollup || []) {
    const st = c.__typename === "StatusContext" ? c.state : (c.status !== "COMPLETED" ? "PENDING" : c.conclusion);
    if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(st)) pass++;
    else if (!st || ["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED"].includes(st)) pending++;
    else fail++; // FAILURE, ERROR, CANCELLED (blocks a required check), TIMED_OUT, ACTION_REQUIRED, STARTUP_FAILURE, STALE
  }
  return { ci: !(pass + fail + pending) ? "none" : fail ? "fail" : pending ? "pending" : "pass", pass, fail, pending };
}

// Item ids in state.js; a task titled "<id>: <title>" (SKILL.md, step 6) belongs to that item.
function itemOfTitle(title, ids) {
  const m = String(title || "").match(/^([A-Za-z0-9_-]+):/);
  return m && ids.has(m[1]) ? m[1] : null;
}

// The worktree path in a worker-list row's workspace ("<repo id>::<path>").
const pathOf = (workspace) => { const ws = String(workspace || ""); return ws.includes("::") ? ws.slice(ws.indexOf("::") + 2) : null; };

// Workers the hub started but has not recorded in state.js yet, from the Run's worker list.
function discover(S, workerList, taskList, ids) {
  const known = new Set(arr(S.workers).map(w => w.dispatch).filter(Boolean));
  const paths = new Set(arr(S.workers).map(w => w.path).filter(Boolean));
  const titleOf = new Map(rows(result(taskList).tasks).map(t => [t.id, t.title]));
  const out = {};
  for (const w of rows(result(workerList).workers)) {
    if (known.has(w.dispatchId) || ["succeeded", "failed", "stopped", "abandoned", "released"].includes(w.state)) continue;
    if (paths.has(pathOf(w.workspace))) continue; // a follow-up dispatch of a worker state.js already names
    const item = itemOfTitle(titleOf.get(w.taskId), ids);
    if (!item || arr(S.workers).some(x => x.item === item && x.tone !== "done")) continue;
    out[item] = { dispatch: w.dispatchId, path: pathOf(w.workspace), state: w.state };
  }
  return out;
}

// The "SUMMARY: <sentence>" line (protocol rule 7), also indented, in a list, or in bold.
const SUMMARY_LINE = /^[ \t>*\-\d.]*SUMMARY:[ \t*]*(.+)$/im;

// Each item's newest "SUMMARY: <sentence>" line from its worker's status and worker_done messages (protocol rule 7):
// the card shows what the PR does so far without waiting for the hub. Uses every fetched message, handled or not.
function notes(inbox, itemOf, after) {
  const out = {};
  for (const m of rows(result(inbox).messages).filter(m => ["status", "worker_done"].includes(m.type)).sort((a, b) => a.sequence - b.sequence)) {
    const hit = SUMMARY_LINE.exec(String(m.body || ""));
    const item = hit && itemOf(m);
    // fresh: the hub has not handled this message yet, so its own `done` in state.js is older than this line.
    if (item) out[item] = { text: oneLine(hit[1], 200), at: m.created_at, fresh: m.sequence > after };
  }
  return out;
}

// Worker messages newer than state.js lastMsgId: what the hub has not handled yet.
function pending(S, inbox, workerList, taskList, ids, discovered) {
  const msgs = rows(result(inbox).messages).filter(m => FROM_WORKERS.has(m.type)).sort((a, b) => a.sequence - b.sequence);
  const all = rows(result(inbox).messages);
  const last = S.lastMsgId ? all.find(m => m.id === S.lastMsgId) : null;
  // lastMsgId outside the fetched window is older than all of it; an empty one means nothing was handled yet.
  const after = last ? last.sequence : -Infinity;
  const fresh = msgs.filter(m => m.sequence > after);
  const titleOf = new Map(rows(result(taskList).tasks).map(t => [t.id, t.title]));
  // `send` to a worker that already reported, or was stopped, continues it under a new dispatch id whose task is titled
  // after the message, not the item. Its worktree still names the item, so the path comes last and
  // wins: a message titled "N1: merged, rebase" sent to N2's worker makes a task whose title names N1.
  const itemOfPath = new Map(arr(S.workers).filter(w => w.path).map(w => [w.path, w.item]));
  const itemOfDispatch = new Map([
    ...arr(S.workers).filter(w => w.dispatch).map(w => [w.dispatch, w.item]),
    ...Object.entries(discovered).map(([item, d]) => [d.dispatch, item]),
    ...rows(result(workerList).workers).map(w => [w.dispatchId, itemOfTitle(titleOf.get(w.taskId), ids)]).filter(([, i]) => i),
    ...rows(result(workerList).workers).map(w => [w.dispatchId, itemOfPath.get(pathOf(w.workspace))]).filter(([, i]) => i)
  ]);
  const payload = m => { try { return JSON.parse(m.payload || "{}"); } catch { return {}; } };
  const itemOf = m => { const p = payload(m); return itemOfDispatch.get(p.dispatchId) || itemOfTitle(titleOf.get(p.taskId), ids) || itemOfTitle(m.subject, ids); };
  const items = {};
  for (const m of fresh) {
    const p = payload(m);
    const item = itemOf(m);
    if (!item) continue;
    const e = items[item] || (items[item] = { count: 0 });
    e.count++;
    e.last = { type: m.type, subject: oneLine(m.subject, 100), at: m.created_at };
    if (m.type === "status" && PHASE_NUM[p.phase] && (!e.phase || PHASE_NUM[p.phase] >= PHASE_NUM[e.phase])) e.phase = p.phase;
  }
  return {
    count: fresh.length, more: !last && !!S.lastMsgId && all.length >= INBOX_LIMIT,
    oldestAt: fresh.length ? fresh[0].created_at : null, items, notes: notes(inbox, itemOf, after)
  };
}

async function syncWorkers(S, ps, discovered, errors) {
  const watched = [
    ...arr(S.workers).filter(w => w.tone !== "done" && w.path),
    ...Object.entries(discovered).filter(([, d]) => d.path).map(([item, d]) => ({ item, path: d.path, dispatch: d.dispatch }))
  ];
  if (!watched.length || !ps) return {};
  const byPath = new Map(rows(result(ps).worktrees).map(r => [r.path, r]));
  const out = {};
  await Promise.all(watched.map(async w => {
    const row = byPath.get(w.path);
    if (!row) return;
    const agents = row.agents || [];
    // An agent waiting on a prompt matters most, then one that is working (a worktree can hold several agents).
    const a = agents.find(x => x.agentWait) || agents.find(x => x.state === "working") || agents[0] || {};
    const entry = {
      at: iso(Math.max(a.updatedAt || 0, row.lastActivityAt || 0)),
      state: a.state || row.status || null,
      say: a.lastAssistantMessage ? flat(a.lastAssistantMessage, 200) : null,
      tool: a.toolName ? `${a.toolName}: ${oneLine(a.toolInput, 80)}`.replace(/: $/, "") : null,
      wait: a.agentWait || null
    };
    if (!["done", "idle"].includes(entry.state) && w.dispatch) { // working or waiting on a prompt: show its latest sentence
      try { entry.say = lastAssistantText(result(await run("orca", ["orchestration", "worker-read", "--dispatch", w.dispatch, "--limit", "8", "--json"]))) || entry.say; }
      catch (e) { errors.push(errLine(`orca worker-read ${w.item}`, e)); }
    }
    out[w.item] = entry;
  }));
  return out;
}

// ---- Claude app runtime (state.js runtime: "claude-app"; references/claude-app.md) ----
const APP_WAIT_MS = 5 * 60000; // a tool call open this long may be a permission prompt
const VERA = /^VERA\s+(status|ask|question|done)\s+([A-Za-z0-9_-]+)((?:\s+[a-z]+=\S+)*)\s*(?::\s*(.*))?$/;
const VERA_TYPE = { status: "status", ask: "ask", question: "question", done: "worker_done" }; // VERA kind → Orca type
const ms = t => { const v = Date.parse(t || ""); return Number.isFinite(v) ? v : 0; };

// One VERA message (references/claude-app.md, "Worker to hub") from a worker's text or a SendMessage call, or null.
function parseVera(text, at) {
  const lines = String(text || "").split("\n");
  const m = (lines[0] || "").trim().match(VERA);
  if (!m) return null;
  const opts = Object.fromEntries((m[3].match(/[a-z]+=\S+/g) || []).map(kv => kv.split("=")));
  const hit = SUMMARY_LINE.exec(lines.slice(1).join("\n"));
  const raw = m[4] || "";
  const subject = raw.startsWith(`${m[2]}:`) ? raw.slice(m[2].length + 1).trim() : raw; // Orca subjects already start with the id
  const body = lines.slice(1).join("\n").trim();
  return { kind: m[1], item: m[2], phase: opts.phase || null, outcome: opts.outcome || null, subject, at, summary: hit ? hit[1].trim() : null, body };
}

// The worker's transcript: the newest top-level .jsonl in its worktree's project folder, and how many there are.
function transcriptOf(worktree) {
  const dir = path.join(PROJECTS, String(worktree).replace(/[^A-Za-z0-9]/g, "-"));
  let best = null, count = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith(".jsonl")) continue;
    count++;
    const p = path.join(dir, f), m = fs.statSync(p).mtimeMs;
    if (!best || m > best.m) best = { p, m };
  }
  return { dir, file: best && best.p, count };
}

// Reads only the bytes appended since the last cycle. Lines are cut at a newline byte, so a multibyte
// character split across two reads is decoded whole.
const transcripts = new Map();
// A turn that writes the same VERA message again (a Stop hook asked it to rewrite its text, say) sent it once: keep the first
// one's time, so a hub that handled it is not woken again, and take the later body.
function addVera(c, v) {
  const t = c.turnVera;
  if (t && t.kind === v.kind && t.item === v.item && t.subject === v.subject) { if (v.body) { t.body = v.body; t.summary = v.summary; } return; }
  c.vera.push(v);
  c.turnVera = v;
}
const TURN_GOES_ON = new Set(["tool_use", "pause_turn"]); // any other stop_reason (end_turn, max_tokens, refusal, …) ends the turn
function readTranscript(file) {
  let c = transcripts.get(file);
  const size = fs.statSync(file).size;
  if (!c || size < c.offset) c = { offset: 0, rest: Buffer.alloc(0), at: 0, say: null, ended: false, endedAt: 0, open: new Map(), sent: new Map(), vera: [], turnVera: null };
  if (size > c.offset) {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(size - c.offset);
    fs.readSync(fd, buf, 0, buf.length, c.offset);
    fs.closeSync(fd);
    c.offset = size;
    const all = Buffer.concat([c.rest, buf]);
    const cut = all.lastIndexOf(0x0a) + 1;
    c.rest = all.subarray(cut);
    for (const line of all.subarray(0, cut).toString("utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.type !== "assistant" && o.type !== "user") continue;
      const t = ms(o.timestamp), msg = o.message || {}, content = msg.content;
      if (t) c.at = Math.max(c.at, t);
      if (o.type === "user") {
        for (const b of arr(content)) {
          if (b.type !== "tool_result") continue;
          c.open.delete(b.tool_use_id);
          // A VERA message counts once its SendMessage returned without an error.
          const v = c.sent.get(b.tool_use_id);
          if (v && !b.is_error) addVera(c, v);
          c.sent.delete(b.tool_use_id);
        }
        const text = typeof content === "string" ? content : arr(content).filter(b => b.type === "text").map(b => b.text || "").join("");
        const from = typeof o.origin === "string" ? o.origin : o.origin && o.origin.kind;
        if (/^\[Request interrupted by user/.test(text)) { c.ended = true; c.endedAt = t; } // an interrupt ends the turn
        else if (from === "peer") { c.ended = false; c.turnVera = null; } // another session's message (the hub's reply) starts a new turn; the app marks it isMeta
        else if (!o.isMeta && !/^\s*<(command-name|local-command-)/.test(text)) {
          c.ended = false; // local slash commands start no turn
          // A prompt starts a new turn. A task notification does too, but a worker that wakes for one while it waits on the hub still waits.
          // A compaction's summary is no prompt either: the worker still waits on what it asked.
          if (from !== "task-notification" && !o.isCompactSummary && !arr(content).some(b => b.type === "tool_result")) c.turnVera = null;
        }
        continue;
      }
      for (const b of arr(content)) {
        if (b.type === "text" && b.text) {
          c.say = flat(b.text, 200);
          const v = parseVera(b.text, o.timestamp); // a worker that ends its turn with the VERA message as its text
          if (v) addVera(c, v);
        }
        if (b.type !== "tool_use") continue;
        c.open.set(b.id, { name: b.name, input: b.input || {}, t });
        if (/SendMessage$/.test(b.name || "")) {
          const v = parseVera(b.input && b.input.message, o.timestamp);
          if (v) c.sent.set(b.id, v);
        }
      }
      // Each content block is its own line, carrying its message's stop_reason. The turn is over unless the model goes on to a
      // tool (tool_use) or the line is cut off (none yet); an API error ends the turn whatever stop_reason it carries.
      c.ended = o.isApiErrorMessage === true || (!!msg.stop_reason && !TURN_GOES_ON.has(msg.stop_reason));
      if (c.ended) c.endedAt = t; // when the turn ended: later lines that open no turn (a local /cost) do not move it
    }
  }
  transcripts.set(file, c);
  return c;
}

function syncAppWorkers(S, errors) {
  const workers = {}, vera = [];
  for (const w of arr(S.workers)) {
    if (!w.path || !w.item) continue;
    try {
      const found = transcriptOf(w.path);
      if (!found.file) {
        if (w.tone !== "done") errors.push(`transcript ${w.item}: none yet in ${path.basename(found.dir)}`);
        continue;
      }
      if (found.count > 1 && w.tone !== "done") errors.push(`transcript ${w.item}: ${found.count} transcripts in its folder; showing the newest`);
      const c = readTranscript(found.file);
      vera.push(...c.vera.filter(v => v.item === w.item)); // a worker reports only on its own item
      if (w.tone === "done") continue;
      const open = [...c.open.values()].sort((x, y) => y.t - x.t)[0] || null;
      const i = open ? open.input : {};
      const arg = i.command || i.file_path || i.description || i.pattern || "";
      workers[w.item] = {
        at: c.at ? new Date(c.at).toISOString() : null,
        endedAt: c.ended && c.endedAt ? new Date(c.endedAt).toISOString() : null,
        state: open || !c.ended ? "working" : "idle",
        turnKind: c.turnVera && c.turnVera.item === w.item ? c.turnVera.kind : null, // the last VERA kind of its latest turn: ask, question, or done means it waits on the hub
        say: c.say,
        tool: open ? `${open.name}${arg ? `: ${oneLine(arg, 80)}` : ""}` : null,
        wait: open && open.t && Date.now() - open.t >= APP_WAIT_MS ? { source: "transcript", since: open.t, reason: null } : null
      };
    } catch (e) { errors.push(errLine(`transcript ${w.item}`, e)); }
  }
  return { workers, vera };
}

// Worker messages newer than state.js lastMsgAt, in the shape pending() gives the page for Orca.
function appPending(S, vera) {
  const ids = new Set(arr(S.lanes).flatMap(l => arr(l.items)).map(i => i.id));
  const after = ms(S.lastMsgAt);
  const msgs = vera.filter(v => ids.has(v.item)).sort((a, b) => ms(a.at) - ms(b.at));
  const fresh = msgs.filter(v => ms(v.at) > after);
  const items = {}, notesOut = {};
  for (const v of fresh) {
    const e = items[v.item] || (items[v.item] = { count: 0 });
    e.count++;
    e.last = { type: VERA_TYPE[v.kind], subject: oneLine(`${v.item}: ${v.subject}`, 100), at: v.at };
    if (v.kind === "status" && PHASE_NUM[v.phase] && (!e.phase || PHASE_NUM[v.phase] >= PHASE_NUM[e.phase])) e.phase = v.phase;
  }
  for (const v of msgs) if ((v.kind === "status" || v.kind === "done") && v.summary) notesOut[v.item] = { text: oneLine(v.summary, 200), at: v.at, fresh: ms(v.at) > after };
  return { count: fresh.length, more: false, oldestAt: fresh.length ? fresh[0].at : null, items, notes: notesOut };
}

// --wait: the lines that end the wait, or none. Each starts with the time to set lastMsgAt to once it is handled.
// The body follows its line, each line indented by four spaces: the options of a question, a SUMMARY:, the background.
const veraLine = v => `${v.at} VERA ${v.kind} ${v.item}${v.phase ? ` phase=${v.phase}` : ""}${v.outcome ? ` outcome=${v.outcome}` : ""}: ${oneLine(v.subject, 200)}` +
  (v.body ? "\n" + (v.body.length > 4000 ? `${v.body.slice(0, 4000)}\n… (cut here: read the rest with list_events)` : v.body).split("\n").map(l => `    ${l}`).join("\n") : "");
const WAITS_ON_HUB = new Set(["ask", "question", "done"]);
function waitLines(S, workers, vera) {
  const ids = new Set(arr(S.lanes).flatMap(l => arr(l.items)).map(i => i.id));
  const after = ms(S.lastMsgAt);
  const out = vera.filter(v => ids.has(v.item) && ms(v.at) > after).sort((a, b) => ms(a.at) - ms(b.at)).map(veraLine);
  // A worker whose turn ended after lastMsgAt without ask, question, or done stopped on its own, whenever that happened.
  for (const [item, w] of Object.entries(workers)) {
    if (ids.has(item) && w.state === "idle" && !WAITS_ON_HUB.has(w.turnKind) && w.endedAt && ms(w.endedAt) > after) out.push(`${w.endedAt} stopped ${item}: ${w.say || ""}`);
  }
  return out;
}

// One wait per hub folder: a new one replaces the one wait.pid names, which leaves with exit 3 and prints nothing,
// so a hub that started a second wait (after a compaction, or in a new session) is woken once per message.
// A wait of this hub: never the sync loop, which a stale pid in wait.pid could name after a reboot.
function isWait(pid) {
  if (!isSync(pid)) return false;
  try { return /\s--wait(\s|$)/.test(execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", timeout: 5000 })); }
  catch { return false; } // without ps, end nothing: a stale pid may name something else
}
const ownsWait = () => { try { return fs.readFileSync(WAIT_PID, "utf8").trim() === String(process.pid); } catch { return false; } };
function waitForWorkers(now) {
  const every = Number(process.env.VERA_WAIT_MS) || 5000;
  const leave = code => { try { if (ownsWait()) fs.unlinkSync(WAIT_PID); } catch {} process.exit(code); };
  if (now) { // --wait --now: the same lines at once, none when nothing waits; no lock, so it never replaces a running wait
    let S;
    try { S = readState(); } catch (e) { console.error(`state.js: ${oneLine(e.message, 120)}`); process.exit(1); }
    if (S.closed) { console.log("closed"); process.exit(0); }
    if (S.runtime !== "claude-app") { console.error("--wait is for a claude-app hub"); process.exit(2); }
    const { workers, vera } = syncAppWorkers(S, []);
    const out = waitLines(S, workers, vera);
    return process.stdout.write(out.length ? out.join("\n") + "\n" : "", () => process.exit(0)); // exit once a piped stdout has it all
  }
  // Replaced: wait.pid names the new wait, so exit 3. Ended from outside (it still owns wait.pid): exit 143, and the hub starts one again.
  // Exit 3 only when wait.pid names another live wait; with no wait left (wait.pid gone or stale) the hub must start one.
  process.on("SIGTERM", () => {
    if (ownsWait()) leave(143);
    let next = 0;
    try { next = Number(fs.readFileSync(WAIT_PID, "utf8").trim()); } catch {}
    process.exit(next && next !== process.pid && isWait(next) ? 3 : 143);
  });
  let other = 0;
  try { other = Number(fs.readFileSync(WAIT_PID, "utf8").trim()); } catch {}
  fs.writeFileSync(WAIT_PID, String(process.pid)); // first, so the replaced wait, which removes only its own pid, leaves it
  if (other && other !== process.pid && isWait(other)) { try { process.kill(other, "SIGTERM"); } catch {} }
  let misses = 0;
  const tick = () => {
    if (!ownsWait()) { // a newer wait took over; with none left (wait.pid removed), 143 so the hub starts one
      let next = 0;
      try { next = Number(fs.readFileSync(WAIT_PID, "utf8").trim()); } catch {}
      process.exit(next && next !== process.pid && alive(next) ? 3 : 143);
    }
    let S;
    try { S = readState(); misses = 0; } catch (e) {
      console.error(`state.js: ${oneLine(e.message, 120)}`);
      if (++misses >= 4) leave(1); // as the loop does: a hub folder without a readable state.js is gone
      return setTimeout(tick, every);
    }
    if (S.closed) { console.log("closed"); leave(0); }
    if (S.runtime !== "claude-app") { console.error("--wait is for a claude-app hub"); leave(2); }
    const { workers, vera } = syncAppWorkers(S, []);
    const out = waitLines(S, workers, vera);
    if (out.length) return process.stdout.write(out.join("\n") + "\n", () => leave(0)); // exit once a piped stdout has it all
    setTimeout(tick, every);
  };
  tick();
}

// Read-only static server for the pages: only .html, .js, and .md files inside the hub folder.
function serve() {
  const http = require("http");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".md": "text/plain; charset=utf-8" };
  const root = fs.realpathSync(HUB);
  const server = http.createServer((req, res) => {
    // Only this machine's own pages: a Host other than 127.0.0.1/localhost is DNS rebinding, and a cross-site
    // request is another site pulling state.js in with <script src>.
    const host = String(req.headers.host || "").replace(/:\d+$/, "");
    if (!["127.0.0.1", "localhost"].includes(host) || req.headers["sec-fetch-site"] === "cross-site") { res.writeHead(403).end(); return; }
    let rel;
    try { rel = decodeURIComponent(new URL(`http://x${req.url}`).pathname).replace(/^\/+/, "") || "dashboard.html"; }
    catch { res.writeHead(400).end(); return; }
    const type = TYPES[path.extname(rel)];
    // The real path, so a link inside the hub folder cannot serve a file outside it.
    let file = null;
    try { file = fs.realpathSync(path.resolve(HUB, rel)); } catch {}
    let isFile = false;
    try { isFile = !!file && file.startsWith(root + path.sep) && fs.statSync(file).isFile(); } catch {}
    if (!type || !isFile) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res); // a file removed or unreadable mid-request must not end the sync
  });
  server.on("error", e => console.error(new Date().toISOString(), "server:", e.message));
  server.listen(Number(process.env.VERA_PORT) || 0, "127.0.0.1", () => {
    myPort = String(server.address().port);
    fs.writeFileSync(PORT, myPort);
    console.log(`serving http://127.0.0.1:${server.address().port}/dashboard.html`);
  });
}
// ---- end of the Claude app runtime ----

async function syncPrs(S, errors) {
  const items = arr(S.lanes).flatMap(l => arr(l.items)).filter(i => i.pr && i.status !== "merged");
  const out = {};
  await Promise.all(items.map(async i => {
    try {
      const args = ["pr", "view", String(i.pr)];
      const repo = i.repo || S.repo; // an item may live in another repo than the hub's
      if (repo) args.push("--repo", repo);
      args.push("--json", "state,statusCheckRollup,mergeStateStatus,reviewDecision,headRefOid");
      const p = await run("gh", args);
      out[i.pr] = { state: p.state, merge: p.mergeStateStatus, review: p.reviewDecision || null, head: p.headRefOid, ...ciOf(p.statusCheckRollup) };
    } catch (e) { errors.push(errLine(`gh pr view ${i.pr}`, e)); }
  }));
  return out;
}

function writeLive(live) {
  const tmp = `${LIVE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `window.HUB_LIVE = ${JSON.stringify(live, null, 1)};\n`);
  fs.renameSync(tmp, LIVE); // atomic: the page never reads half a file
}

let prev = { workers: {}, prs: {}, discovered: {}, hub: null }, cycle = 0, serving = false, myPort = "";
async function syncOnce(withGh) {
  const started = Date.now(), errors = [];
  let S;
  try { S = readState(); }
  catch (e) { errors.push(`state.js: ${oneLine(e.message, 120)}`); writeLive({ at: new Date().toISOString(), ...prev, errors }); return null; }
  if (S.runtime === "claude-app") {
    const prs = withGh ? await syncPrs(S, errors) : prev.prs;
    const { workers, vera } = syncAppWorkers(S, errors);
    prev = { workers, prs, discovered: {}, hub: appPending(S, vera) };
    writeLive({ at: new Date().toISOString(), cycleMs: Date.now() - started, ...prev, errors });
    return S;
  }
  const ids = new Set(arr(S.lanes).flatMap(l => arr(l.items)).map(i => i.id));
  const soft = (what, p) => p.catch(e => { errors.push(errLine(what, e)); return null; });
  const runArgs = S.runId ? ["--run", S.runId, "--json"] : null;
  const [ps, workerList, taskList, inbox, prs] = await Promise.all([
    soft("orca worktree ps", run("orca", ["worktree", "ps", "--agent-wait", "--json", "--limit", "200"])),
    runArgs ? soft("orca worker-list", run("orca", ["orchestration", "worker-list", ...runArgs])) : null,
    runArgs ? soft("orca task-list", run("orca", ["orchestration", "task-list", ...runArgs])) : null,
    S.runId ? soft("orca inbox", run("orca", ["orchestration", "inbox", "--terminal", `run:${S.runId}`, "--limit", String(INBOX_LIMIT), "--json", "--full"])) : null,
    withGh ? syncPrs(S, errors) : Promise.resolve(prev.prs)
  ]);
  const discovered = workerList && taskList ? discover(S, workerList, taskList, ids) : prev.discovered;
  const workers = await syncWorkers(S, ps, discovered, errors);
  const hub = inbox ? pending(S, inbox, workerList, taskList, ids, discovered) : prev.hub;
  prev = { workers: ps ? workers : prev.workers, prs, discovered, hub };
  writeLive({ at: new Date().toISOString(), cycleMs: Date.now() - started, ...prev, errors });
  return S;
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }
// Is the process sync.pid names a sync? After a reboot the pid may belong to another program, and the sync would never start.
// Without a ps to ask (or when it fails), a live pid counts as the sync, as before.
function isSync(pid) {
  if (!alive(pid)) return false;
  let cmd;
  try { cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", timeout: 5000 }); }
  catch { return true; }
  // This hub's own copy, or one started with a relative path. Another hub's sync (an absolute path to another folder) is not this one.
  return cmd.includes(path.join(HUB, "sync.cjs")) || /(^|\s)(\.\/)?sync\.cjs(\s|$)/.test(cmd);
}
const ownsPid = () => { try { return fs.readFileSync(PID, "utf8").trim() === String(process.pid); } catch { return false; } };

if (require.main !== module) {
  module.exports = { notes, pending, discover, parseVera, appPending, transcriptOf, readTranscript }; // loaded by tests: export the pure functions, start nothing
} else if (process.argv.includes("--wait")) {
  waitForWorkers(process.argv.includes("--now"));
} else if (process.argv.includes("--once")) {
  syncOnce(true).then(() => process.exit(0));
} else if (process.argv.includes("--stop")) {
  // Stops this hub's running sync. A bare kill of the pid in sync.pid could end another program that got the pid after a reboot.
  const other = fs.existsSync(PID) ? Number(fs.readFileSync(PID, "utf8").trim()) : 0;
  if (other && isSync(other)) { process.kill(other, "SIGTERM"); console.log(`stopped sync (pid ${other})`); }
  else console.log("no sync running");
} else {
  const other = fs.existsSync(PID) ? Number(fs.readFileSync(PID, "utf8").trim()) : 0;
  if (other && other !== process.pid && isSync(other)) {
    console.log(`sync already running (pid ${other})`);
    process.exit(0);
  }
  fs.writeFileSync(PID, String(process.pid));
  const stop = () => { try { if (ownsPid()) { fs.unlinkSync(PID); fs.rmSync(PORT, { force: true }); } } catch {} process.exit(0); };
  let missing = 0;
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  // One cycle at a time: the next starts CYCLE_MS after this one started, or right away when it ran longer.
  const loop = async () => {
    const t = Date.now();
    if (!ownsPid()) { // another sync started at the same moment and wrote sync.pid last: it runs, this one leaves
      try { if (myPort && fs.readFileSync(PORT, "utf8").trim() === myPort) fs.rmSync(PORT, { force: true }); } catch {} // only its own port
      process.exit(0);
    }
    // The hub folder was removed. One cycle without state.js is the hub rewriting it, so wait a few before leaving.
    missing = fs.existsSync(STATE) ? 0 : missing + 1;
    if (missing >= MISSING_CYCLES) stop();
    let S = null;
    try { S = await syncOnce(cycle++ % GH_EVERY === 0); } catch (e) { console.error(new Date().toISOString(), e); }
    if (S && S.closed) stop(); // the hub set closed: true after the final sweep
    if (S && S.runtime === "claude-app" && !serving) { serving = true; serve(); } // once state.js reads as a claude-app hub
    setTimeout(loop, Math.max(0, CYCLE_MS - (Date.now() - t)));
  };
  loop();
}

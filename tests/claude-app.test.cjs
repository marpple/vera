"use strict";
// The Claude desktop app runtime (skills/hub/references/claude-app.md): the hub picks it by itself,
// preflight checks the app instead of Orca, and sync.cjs reads workers' transcripts instead of Orca's inbox.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const skillDir = path.join(root, "skills", "hub");
const read = f => fs.readFileSync(f, "utf8");

test("SKILL.md decides the runtime first and points the app to claude-app.md", () => {
  const runtime = read(path.join(skillDir, "SKILL.md")).match(/\n## Runtime\n([\s\S]*?)(?=\n## )/);
  assert.ok(runtime, "SKILL.md has no '## Runtime' section");
  assert.match(runtime[1], /`mcp__ccd_session__start_session`/);
  assert.match(runtime[1], /\[references\/claude-app\.md\]\(references\/claude-app\.md\)/);
  assert.match(runtime[1], /without `runtime` is an Orca hub/);
});

test("preflight --runtime claude-app checks the app, not Orca", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-"));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "bin-"));
  try {
    fs.mkdirSync(path.join(home, ".claude", "projects"), { recursive: true });
    fs.writeFileSync(path.join(bin, "git"), '#!/bin/sh\necho "git version 2.40.0"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "gh"), '#!/bin/sh\necho "  ✓ Logged in to github.com account octo (keyring)"\n', { mode: 0o755 });
    const r = spawnSync(process.execPath, [path.join(skillDir, "scripts", "preflight.cjs"), "--runtime", "claude-app"],
      { env: { PATH: bin, HOME: home }, encoding: "utf8", timeout: 20000 });
    assert.strictEqual(r.status, 0, r.stdout);
    assert.match(r.stdout.trim(), /^ok: claude-app, gh octo, node v\d+\.\d+\.\d+, git 2\.40\.0$/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(bin, { recursive: true, force: true });
  }
});

test("sync.cjs --once on a claude-app hub reads a worker's transcript into live.js", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-"));
  try {
    const hub = path.join(dir, "hub"), projects = path.join(dir, "projects"), worktree = "/w/app/.claude/worktrees/s1";
    fs.mkdirSync(hub);
    fs.copyFileSync(path.join(skillDir, "templates", "sync.cjs"), path.join(hub, "sync.cjs"));
    fs.writeFileSync(path.join(hub, "state.js"), `window.HUB_STATE = ${JSON.stringify({
      runtime: "claude-app", lastMsgAt: "2026-11-17T05:00:30Z", workers: [{ item: "S1", path: worktree }],
      lanes: [{ items: [{ id: "S1", status: "active" }] }]
    })};`);
    const tdir = path.join(projects, worktree.replace(/[^A-Za-z0-9]/g, "-"));
    fs.mkdirSync(tdir, { recursive: true });
    const send = (id, at, message) => ({ type: "assistant", timestamp: at, message: { content: [{ type: "tool_use", id, name: "SendMessage", input: { to: "local_hub", message } }] } });
    const done = (id, at) => ({ type: "user", timestamp: at, message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } });
    fs.writeFileSync(path.join(tdir, "t.jsonl"), [
      send("a", "2026-11-17T05:00:00Z", "VERA status S1 phase=red: red\nSUMMARY: 이미 반영된 상태"), done("a", "2026-11-17T05:00:01Z"),
      send("b", "2026-11-17T05:01:00Z", "VERA status S1 phase=green: green\nSUMMARY: 시험 6건이 통과합니다"), done("b", "2026-11-17T05:01:01Z"),
      send("c", "2026-11-17T05:02:00Z", "VERA ask S1: S1: ready for review: w1. Head abc."), done("c", "2026-11-17T05:02:01Z"),
      { type: "assistant", timestamp: "2026-11-17T05:02:05Z", message: { stop_reason: "end_turn", content: [{ type: "text", text: "Asked the hub; ending my turn." }] } }
    ].map(o => JSON.stringify(o)).join("\n") + "\n");
    execFileSync(process.execPath, [path.join(hub, "sync.cjs"), "--once"], { env: { ...process.env, VERA_TRANSCRIPTS: projects }, encoding: "utf8" });
    const live = new Function("window", `${read(path.join(hub, "live.js"))}; return window.HUB_LIVE;`)({});
    assert.strictEqual(live.workers.S1.state, "idle");
    assert.strictEqual(live.workers.S1.say, "Asked the hub; ending my turn.");
    assert.strictEqual(live.hub.count, 2, "only the messages after lastMsgAt are not handled yet");
    assert.strictEqual(live.hub.items.S1.last.type, "ask");
    assert.strictEqual(live.hub.items.S1.last.subject, "S1: ready for review: w1. Head abc.", "the id shows once");
    assert.strictEqual(live.hub.items.S1.phase, "green");
    assert.deepStrictEqual(live.hub.notes.S1, { text: "시험 6건이 통과합니다", at: "2026-11-17T05:01:00Z", fresh: true });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("readTranscript decodes a Korean character split across two reads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-"));
  try {
    const sync = require(path.join(skillDir, "templates", "sync.cjs"));
    const file = path.join(dir, "t.jsonl");
    const line = Buffer.from(JSON.stringify({ type: "assistant", timestamp: "2026-11-17T05:00:00Z",
      message: { stop_reason: "end_turn", content: [{ type: "text", text: "시험이 통과합니다" }] } }) + "\n");
    const cut = line.indexOf(Buffer.from("험")) + 1; // inside the three bytes of one character
    fs.writeFileSync(file, line.subarray(0, cut));
    sync.readTranscript(file);
    fs.appendFileSync(file, line.subarray(cut));
    const c = sync.readTranscript(file);
    assert.strictEqual(c.say, "시험이 통과합니다");
    assert.strictEqual(c.ended, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("sync.cjs reads the documented approval line, skips local slash commands, and drops failed sends", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-"));
  try {
    const sync = require(path.join(skillDir, "templates", "sync.cjs"));
    const at = "2026-11-18T00:00:00Z";
    assert.strictEqual(sync.parseVera("VERA status S1 phase=approval\ngit push -u origin HEAD", at).phase, "approval");
    const line = o => JSON.stringify({ timestamp: at, ...o });
    const send = (id, message) => line({ type: "assistant", message: { stop_reason: "tool_use", content: [{ type: "tool_use", id, name: "SendMessage", input: { message } }] } });
    const result = (id, is_error) => line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error, content: "" }] } });
    const file = path.join(dir, "t.jsonl");
    fs.writeFileSync(file, [
      send("x", "VERA ask S1: q"), result("x", true), send("y", "VERA ask S1: q"), result("y", false),
      line({ type: "assistant", message: { stop_reason: "end_turn", content: [{ type: "text", text: "Asked the hub." }] } }),
      line({ type: "user", isMeta: true, message: { content: "<local-command-caveat>…</local-command-caveat>" } }),
      line({ type: "user", message: { content: "<command-name>/model</command-name>" } }),
      line({ type: "user", message: { content: "<local-command-stdout>Set model</local-command-stdout>" } })
    ].join("\n") + "\n");
    const c = sync.readTranscript(file);
    assert.strictEqual(c.ended, true, "a local slash command starts no turn");
    assert.deepStrictEqual(c.vera.map(v => v.kind), ["ask"], "the failed send is not counted");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// In the app, SendMessage always stops on a prompt the developer must allow, whatever the permission rules say, and
// that prompt shows the worker's question with only Deny and Allow. So a worker ends its turn with the VERA message
// as its text, and the hub waits on sync.cjs --wait, which exits as soon as a worker has something for it.
test("readTranscript counts a VERA message the worker wrote as its turn's text, without SendMessage", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-"));
  try {
    const sync = require(path.join(skillDir, "templates", "sync.cjs"));
    const file = path.join(dir, "t.jsonl");
    const text = (at, t, stop) => JSON.stringify({ type: "assistant", timestamp: at, message: { stop_reason: stop, content: [{ type: "text", text: t }] } });
    fs.writeFileSync(file, [
      text("2026-11-23T00:00:00Z", "Running the tests now.", "tool_use"),
      text("2026-11-23T00:01:00Z", "VERA question S1: 결제 수단 화면을 어떻게 할까요?\n(a) 버튼 (b) 고정", "end_turn")
    ].join("\n") + "\n");
    const c = sync.readTranscript(file);
    assert.deepStrictEqual(c.vera.map(v => [v.kind, v.item, v.subject, v.at]),
      [["question", "S1", "결제 수단 화면을 어떻게 할까요?", "2026-11-23T00:01:00Z"]]);
    assert.strictEqual(c.ended, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function waitLab(lastMsgAt, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-"));
  const hub = path.join(dir, "hub"), projects = path.join(dir, "projects"), worktree = "/w/app/.claude/worktrees/s1";
  fs.mkdirSync(hub);
  fs.copyFileSync(path.join(skillDir, "templates", "sync.cjs"), path.join(hub, "sync.cjs"));
  fs.writeFileSync(path.join(hub, "state.js"), `window.HUB_STATE = ${JSON.stringify({
    runtime: "claude-app", lastMsgAt, workers: [{ item: "S1", path: worktree }], lanes: [{ items: [{ id: "S1", status: "active" }] }], ...extra
  })};`);
  const tdir = path.join(projects, worktree.replace(/[^A-Za-z0-9]/g, "-"));
  fs.mkdirSync(tdir, { recursive: true });
  const file = path.join(tdir, "t.jsonl");
  const add = (at, t, stop) => fs.appendFileSync(file, JSON.stringify({ type: "assistant", timestamp: at, message: { stop_reason: stop, content: [{ type: "text", text: t }] } }) + "\n");
  // How the app records another session's message in the worker's transcript.
  const peer = (at, t) => fs.appendFileSync(file, JSON.stringify({ type: "user", timestamp: at, isMeta: true, origin: { kind: "peer", from: "local_hub", body: t }, message: { content: `Another Claude session sent a message:\n<cross-session-message from="local_hub">${t}</cross-session-message>` } }) + "\n");
  const note = (at, t) => fs.appendFileSync(file, JSON.stringify({ type: "user", timestamp: at, origin: { kind: "task-notification" }, message: { content: t } }) + "\n");
  // An old-protocol worker's SendMessage and its result, then the turn's end.
  const sent = (at, msg, id) => {
    fs.appendFileSync(file, JSON.stringify({ type: "assistant", timestamp: at, message: { stop_reason: "tool_use", content: [{ type: "tool_use", id, name: "SendMessage", input: { to: "local_hub", message: msg } }] } }) + "\n");
    fs.appendFileSync(file, JSON.stringify({ type: "user", timestamp: at, message: { content: [{ type: "tool_result", tool_use_id: id, content: "sent" }] } }) + "\n");
  };
  const user = (at, t) => fs.appendFileSync(file, JSON.stringify({ type: "user", timestamp: at, message: { content: t } }) + "\n");
  const start = () => {
    const { spawn } = require("node:child_process");
    const p = spawn(process.execPath, [path.join(hub, "sync.cjs"), "--wait"], { env: { ...process.env, VERA_TRANSCRIPTS: projects, VERA_WAIT_MS: "100" } });
    let out = "";
    p.stdout.on("data", d => { out += d; });
    p.stderr.on("data", d => { out += d; });
    const exited = new Promise(r => p.on("exit", code => r({ code, out })));
    return { p, exited };
  };
  return { dir, hub, file, add, user, peer, note, sent, start };
}
const within = (ms, p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

test("sync.cjs --wait exits at once with a VERA message the hub has not handled", async () => {
  const l = waitLab("2026-11-23T00:00:00Z");
  try {
    l.add("2026-11-23T00:01:00Z", "VERA question S1: 화면을 어떻게 할까요?", "end_turn");
    const r = await within(5000, l.start().exited);
    assert.ok(r, "--wait did not exit");
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /^2026-11-23T00:01:00Z VERA question S1: 화면을 어떻게 할까요\?$/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait keeps waiting while nothing is new, and exits when a worker ends its turn with a VERA message", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    l.add("2026-11-23T00:01:00Z", "VERA ask S1: ready for review: w1. Head abc.", "end_turn"); // handled already
    l.add("2026-11-23T00:02:00Z", "Fixing the review findings.", "tool_use"); // working again
    const w = l.start();
    assert.strictEqual(await within(800, w.exited), null, "--wait exited with nothing new");
    l.add("2026-11-23T00:03:00Z", "VERA done S1 outcome=succeeded: PR open", "end_turn");
    const r = await within(5000, w.exited);
    if (!r) w.p.kill();
    assert.ok(r, "--wait did not exit after the new message");
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /^2026-11-23T00:03:00Z VERA done S1 outcome=succeeded: PR open$/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait exits when a working worker stops without a VERA message", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    l.add("2026-11-23T00:02:00Z", "Fixing the review findings.", "tool_use");
    const w = l.start();
    assert.strictEqual(await within(800, w.exited), null, "--wait exited with nothing new");
    l.add("2026-11-23T00:03:00Z", "I could not finish.", "end_turn");
    const r = await within(5000, w.exited);
    if (!r) w.p.kill();
    assert.ok(r, "--wait did not exit after the worker stopped");
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /^2026-11-23T00:03:00\.000Z stopped S1: I could not finish\.$/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait exits at once for a worker that stopped without ask, question, or done before the wait began", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    l.add("2026-11-23T00:01:00Z", "VERA status S1 phase=tdd: tests red", "tool_use"); // handled already
    l.add("2026-11-23T00:02:00Z", "I am stuck on the fixture.", "end_turn"); // stopped while the hub handled the status
    const r = await within(5000, l.start().exited);
    assert.ok(r, "--wait did not exit");
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /^2026-11-23T00:02:00\.000Z stopped S1: I am stuck on the fixture\.$/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait does not wake again for a stop the hub handled, nor for a worker waiting on the hub's reply", async () => {
  for (const [lastMsgAt, text] of [
    ["2026-11-23T00:02:00.000Z", "I am stuck on the fixture."], // lastMsgAt set to the stopped line's time
    ["2026-11-23T00:02:00Z", "VERA question S1: 화면을 어떻게 할까요?"] // handled; the reply has not reached it yet
  ]) {
    const l = waitLab(lastMsgAt);
    try {
      l.add("2026-11-23T00:02:00Z", text, "end_turn");
      const w = l.start();
      const r = await within(800, w.exited);
      if (!r) w.p.kill();
      assert.strictEqual(r, null, `--wait exited: ${r && r.out}`);
    } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
  }
});

test("sync.cjs --wait counts a worker as stopped when the turn after the hub's reply ends without a VERA message", async () => {
  const l = waitLab("2026-11-23T00:02:00Z");
  try {
    l.add("2026-11-23T00:02:00Z", "VERA question S1: 화면을 어떻게 할까요?", "end_turn"); // handled
    l.peer("2026-11-23T00:03:00Z", "(a) 로 해 주세요."); // the hub's reply starts a new turn
    l.add("2026-11-23T00:04:00Z", "Done, I think.", "end_turn");
    const r = await within(5000, l.start().exited);
    assert.ok(r, "--wait did not exit");
    assert.match(r.out, /^2026-11-23T00:04:00\.000Z stopped S1: Done, I think\.$/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait does not count a worker as stopped between the hub's reply and its first answer, nor after a task notification while it waits", async () => {
  for (const after of [
    l => l.peer("2026-11-23T00:03:00Z", "(a) 로 해 주세요."), // the reply arrived; the worker has not written yet
    l => { l.note("2026-11-23T00:03:00Z", "<task-notification>tests done</task-notification>"); l.add("2026-11-23T00:03:01Z", "Waiting for the hub.", "end_turn"); }
  ]) {
    const l = waitLab("2026-11-23T00:02:00Z");
    try {
      l.add("2026-11-23T00:02:00Z", "VERA question S1: 화면을 어떻게 할까요?", "end_turn"); // handled
      after(l);
      const w = l.start();
      const r = await within(800, w.exited);
      if (!r) w.p.kill();
      assert.strictEqual(r, null, `--wait exited: ${r && r.out}`);
    } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
  }
});

test("sync.cjs --wait counts a worker as stopped when its last VERA names another item", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    l.add("2026-11-23T00:02:00Z", "VERA question s1: 화면을 어떻게 할까요?", "end_turn"); // wrong id: the hub never sees it
    const r = await within(5000, l.start().exited);
    assert.ok(r, "--wait did not exit");
    assert.match(r.out, /^2026-11-23T00:02:00\.000Z stopped S1: VERA question s1/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait counts a worker as stopped when the developer's own prompt in its session ends without a VERA message", async () => {
  const l = waitLab("2026-11-23T00:02:00Z");
  try {
    l.add("2026-11-23T00:02:00Z", "VERA question S1: 화면을 어떻게 할까요?", "end_turn"); // handled
    l.user("2026-11-23T00:03:00Z", "왜 멈췄어?"); // typed in the worker's session: a new turn
    l.add("2026-11-23T00:04:00Z", "I was waiting for the hub.", "end_turn");
    const r = await within(5000, l.start().exited);
    assert.ok(r, "--wait did not exit");
    assert.match(r.out, /^2026-11-23T00:04:00\.000Z stopped S1: I was waiting for the hub\.$/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("the app instructions keep workers off SendMessage and the hub on sync.cjs --wait", () => {
  const app = fs.readFileSync(path.join(skillDir, "references", "claude-app.md"), "utf8");
  // In the app SendMessage always asks the developer, with only Deny and Allow (measured 2026-11-23).
  assert.match(app, /Read <hub>\/specs\/<id>\.md in full before anything else and follow it exactly\. Write every hub message as your own text, never with SendMessage\./);
  assert.match(app, /0\. MESSAGES\. Never call SendMessage: in the app it stops on a prompt the developer cannot answer\./);
  assert.match(app, /For a question, list the options in the body as \(a\), \(b\), \(c\) with your recommendation; the hub asks the developer with them\./);
  assert.match(app, /End every hub turn with `node <hub>\/sync\.cjs --wait` run in the background/);
  assert.match(app, /set `lastMsgAt` to the newest time among the lines you handled, so a handled stop does not wake you again/);
  assert.doesNotMatch(app, /HUB MOVED/);
  // A no-reply notice wakes a worker that waits on the hub, which then stops without a message.
  const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  // A "walkthrough answered" status owes no reply, so the worker stops after it.
  assert.match(skill, /When the worker's turn ends with that status as its last text, the `escalation` right after it \(on the Claude app, a `stopped` line whose text is that status\) needs nothing; a stop that ends with anything else is the `escalation` row as usual/);
  assert.match(app, /One runs per hub folder: a new wait replaces the running one, which exits 3 and prints nothing/);
  // The loop's question row still decides who answers (high, technical) and what the ask carries (impact, recommendation).
  assert.match(app, /start from the \(a\), \(b\), \(c\) options in the body, keeping their words, add impact and your recommendation as that row says, and never offer an option the body does not give; at `high`, or for a technical question, decide as that row says\./);
  assert.match(app, /such as 143 when something outside ended the wait, leaves no wait running: start it again\./);
  // A replaced wait's own exit would wake the hub; starting another then would replace the running one, and so on.
  assert.match(app, /a turn that only its exit started ends without starting another wait/);
  // Stops are not in live.js: resume and every move of lastMsgAt read them from --wait --now.
  assert.match(app, /`node <hub>\/sync\.cjs --wait --now`, which prints at once, as `--wait` does, every VERA message and every stop after `lastMsgAt`/);
  assert.match(app, /Before you move it, run `node <hub>\/sync\.cjs --wait --now` and handle every line it prints that you have not handled/);
  // A message can reach the hub twice (an earlier wait's exit, the app's own note): only lines after lastMsgAt count.
  assert.match(app, /A line whose time is not after `lastMsgAt` was handled already \(an earlier wait printed it too\): skip it\./);
  assert.match(app, /Handle a stop only from that line, which carries the time to set `lastMsgAt` to\./);
  assert.doesNotMatch(app, /So at every wake, check `mcp__ccd_session_mgmt__list_sessions`/);
  assert.match(skill, /or that waits on your answer to its ask or question, wakes for this `send`[^\n]*\(on the Claude app, a `stopped` line\) needs nothing, while an ask or question it waited on still waits for your answer/);
});

test("sync.cjs --wait does not count a worker as stopped after a tool result in a turn that sent ask", async () => {
  const l = waitLab("2026-11-23T00:02:00Z");
  try {
    l.sent("2026-11-23T00:02:00Z", "VERA ask S1: ready for review: w1.", "tu1"); // handled; the tool result is no new prompt
    l.add("2026-11-23T00:02:01Z", "Waiting for the hub.", "end_turn");
    const w = l.start();
    const r = await within(1500, w.exited);
    if (!r) w.p.kill();
    assert.strictEqual(r, null, `--wait exited: ${r && r.out}`);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait exits 0 with closed, 2 on an Orca hub, and 1 when state.js stays unreadable", async () => {
  const closed = waitLab("2026-11-23T00:02:00Z", { closed: true });
  const orca = waitLab("2026-11-23T00:02:00Z", { runtime: "orca" });
  const gone = waitLab("2026-11-23T00:02:00Z");
  try {
    fs.rmSync(path.join(gone.hub, "state.js"));
    const [a, b, c] = await Promise.all([closed, orca, gone].map(l => within(5000, l.start().exited)));
    assert.ok(a && b && c, "a wait did not exit");
    assert.strictEqual(a.code, 0, a.out); assert.match(a.out, /^closed$/m);
    assert.strictEqual(b.code, 2, b.out);
    assert.strictEqual(c.code, 1, c.out);
    for (const l of [closed, orca, gone]) assert.ok(!fs.existsSync(path.join(l.hub, "wait.pid")), "wait.pid left behind");
  } finally { for (const l of [closed, orca, gone]) fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("a second sync.cjs --wait replaces the first, which exits 3 without a line, so one message wakes the hub once", async () => {
  const l = waitLab("2026-11-23T00:02:00Z");
  try {
    const first = l.start();
    await new Promise(r => setTimeout(r, 500)); // the first has written wait.pid
    const second = l.start();
    const r1 = await within(5000, first.exited);
    assert.ok(r1, "the first wait did not leave");
    assert.strictEqual(r1.code, 3, r1.out);
    assert.strictEqual(r1.out, "");
    l.add("2026-11-23T00:03:00Z", "VERA question S1: 화면을 어떻게 할까요?", "end_turn");
    const r2 = await within(5000, second.exited);
    if (!r2) second.p.kill();
    assert.ok(r2, "the second wait did not exit");
    assert.strictEqual(r2.code, 0, r2.out);
    assert.match(r2.out, /VERA question S1/);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait --now prints the stops and messages after lastMsgAt at once, takes no lock, and prints nothing when none wait", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    fs.writeFileSync(path.join(l.hub, "wait.pid"), "999999"); // a running wait's pid stays as it is
    const run = () => require("node:child_process").spawnSync(process.execPath, [path.join(l.hub, "sync.cjs"), "--wait", "--now"], { env: { ...process.env, VERA_TRANSCRIPTS: path.join(l.dir, "projects") }, encoding: "utf8", timeout: 10000 });
    l.add("2026-11-23T00:00:30Z", "VERA status S1 phase=tdd: red", "tool_use"); // handled
    let r = run();
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout, "");
    l.add("2026-11-23T00:02:00Z", "I am stuck on the fixture.", "end_turn");
    r = run();
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /^2026-11-23T00:02:00\.000Z stopped S1: I am stuck on the fixture\.$/m);
    assert.strictEqual(fs.readFileSync(path.join(l.hub, "wait.pid"), "utf8"), "999999");
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait never ends this hub's sync loop when wait.pid names it", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  const { spawn } = require("node:child_process");
  // A process whose command names this hub's sync.cjs without --wait, as the loop's does.
  const loop = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", path.join(l.hub, "sync.cjs")]);
  try {
    await new Promise(r => setTimeout(r, 300));
    fs.writeFileSync(path.join(l.hub, "wait.pid"), String(loop.pid)); // a stale pid the loop now holds
    const w = l.start();
    await new Promise(r => setTimeout(r, 1000));
    assert.strictEqual(loop.exitCode, null, "the loop was ended");
    assert.strictEqual(loop.signalCode, null, "the loop was signalled");
    w.p.kill();
  } finally { loop.kill(); fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait prints a VERA message's body under its line, so the hub asks with the worker's own options", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    l.add("2026-11-23T00:02:00Z", "VERA question S1: 버튼 문구를 골라 주세요\n(a) \"다시 주문하기\"\n(b) \"재주문\"\n추천: (a)", "end_turn");
    const r = await within(5000, l.start().exited);
    assert.ok(r, "--wait did not exit");
    assert.match(r.out, /^2026-11-23T00:02:00Z VERA question S1: 버튼 문구를 골라 주세요\n {4}\(a\) "다시 주문하기"\n {4}\(b\) "재주문"\n {4}추천: \(a\)$/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait counts a turn that ended on an API error, a refusal, or max_tokens as ended", async () => {
  for (const [stop, extra] of [["tool_use", { isApiErrorMessage: true }], ["refusal", {}], ["max_tokens", {}], ["stop_sequence", {}], ["model_context_window_exceeded", {}]]) {
    const l = waitLab("2026-11-23T00:01:00Z");
    try {
      fs.appendFileSync(l.file, JSON.stringify({ type: "assistant", timestamp: "2026-11-23T00:02:00Z", ...extra, message: { stop_reason: stop, content: [{ type: "text", text: "API Error: Connection lost" }] } }) + "\n");
      const r = await within(5000, l.start().exited);
      assert.ok(r, `--wait did not exit for ${stop}`);
      assert.match(r.out, /stopped S1: API Error: Connection lost/);
    } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
  }
});

test("sync.cjs --wait ended from outside exits 143 and removes wait.pid, so the hub starts it again", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    const w = l.start();
    await new Promise(r => setTimeout(r, 500));
    w.p.kill("SIGTERM");
    const r = await within(5000, w.exited);
    assert.ok(r, "--wait did not exit");
    assert.strictEqual(r.code, 143, r.out);
    assert.ok(!fs.existsSync(path.join(l.hub, "wait.pid")), "wait.pid left behind");
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait does not count a compaction's summary in the worker's session as a new prompt", async () => {
  const l = waitLab("2026-11-23T00:02:00Z");
  try {
    l.add("2026-11-23T00:02:00Z", "VERA question S1: 화면을 어떻게 할까요?", "end_turn"); // handled
    fs.appendFileSync(l.file, JSON.stringify({ type: "user", timestamp: "2026-11-23T00:03:00Z", isCompactSummary: true, message: { content: "This session is being continued from a previous conversation." } }) + "\n");
    l.add("2026-11-23T00:03:01Z", "Still waiting for the hub.", "end_turn");
    const w = l.start();
    const r = await within(1500, w.exited);
    if (!r) w.p.kill();
    assert.strictEqual(r, null, `--wait exited: ${r && r.out}`);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait ended from outside after wait.pid was removed exits 143, not 3", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    const w = l.start();
    await new Promise(r => setTimeout(r, 500));
    fs.rmSync(path.join(l.hub, "wait.pid"));
    w.p.kill("SIGTERM");
    const r = await within(5000, w.exited);
    assert.ok(r, "--wait did not exit");
    assert.strictEqual(r.code, 143, r.out);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait does not wake again for a handled stop when a local command in the worker's session comes later", async () => {
  const l = waitLab("2026-11-23T00:02:00.000Z"); // the stop at 00:02 was handled
  try {
    l.add("2026-11-23T00:02:00Z", "I am stuck on the fixture.", "end_turn");
    l.user("2026-11-23T00:05:00Z", "<command-name>/cost</command-name>"); // opens no turn
    fs.appendFileSync(l.file, JSON.stringify({ type: "user", timestamp: "2026-11-23T00:05:01Z", message: { content: "<local-command-stdout>Total cost: $0.10</local-command-stdout>" } }) + "\n");
    const w = l.start();
    const r = await within(1500, w.exited);
    if (!r) w.p.kill();
    assert.strictEqual(r, null, `--wait exited: ${r && r.out}`);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait counts a VERA message the worker writes again in the same turn once, with the later body", async () => {
  const l = waitLab("2026-11-23T00:01:00Z");
  try {
    l.add("2026-11-23T00:02:00Z", "VERA ask S1: ready for review: w1. Head abc.\nThe work is ready.", "end_turn");
    // A Stop hook sends the turn back (an isMeta line, no new prompt) and the worker writes the message again.
    fs.appendFileSync(l.file, JSON.stringify({ type: "user", timestamp: "2026-11-23T00:02:05Z", isMeta: true, message: { content: "Stop hook feedback:\nRewrite it in Korean." } }) + "\n");
    l.add("2026-11-23T00:02:09Z", "VERA ask S1: ready for review: w1. Head abc.\n작업이 준비됐습니다.", "end_turn");
    const r = await within(5000, l.start().exited);
    assert.ok(r, "--wait did not exit");
    assert.strictEqual((r.out.match(/VERA ask S1/g) || []).length, 1, r.out);
    assert.match(r.out, /^2026-11-23T00:02:00Z VERA ask S1: ready for review: w1\. Head abc\.\n {4}작업이 준비됐습니다\.$/m);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});

test("sync.cjs --wait does not wake again when the worker rewrites a message the hub handled", async () => {
  const l = waitLab("2026-11-23T00:02:00Z"); // the first copy was handled
  try {
    l.add("2026-11-23T00:02:00Z", "VERA ask S1: ready for review: w1. Head abc.", "end_turn");
    fs.appendFileSync(l.file, JSON.stringify({ type: "user", timestamp: "2026-11-23T00:02:05Z", isMeta: true, message: { content: "Stop hook feedback:\nRewrite it in Korean." } }) + "\n");
    l.add("2026-11-23T00:02:09Z", "VERA ask S1: ready for review: w1. Head abc.\n작업이 준비됐습니다.", "end_turn");
    const w = l.start();
    const r = await within(1500, w.exited);
    if (!r) w.p.kill();
    assert.strictEqual(r, null, `--wait exited: ${r && r.out}`);
  } finally { fs.rmSync(l.dir, { recursive: true, force: true }); }
});


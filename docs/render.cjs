"use strict";
// Makes the images README.md shows, from the hub's own templates and one sample feature, "Saved searches":
//   docs/dashboard.gif    the dashboard as the feature moves from its first workers to its last merge
//   docs/dashboard.png    the dashboard with three kinds of to-do at once: a decision, a walkthrough, and a merge
//   docs/walkthrough.gif  the seven steps of one PR walkthrough
//   docs/hub-flow.png     who does what: you, the hub, and the workers
//   docs/checkpoints.png  the eight checkpoints every PR passes
// Run `node docs/render.cjs` after a change that a user would see in dashboard.html or walkthrough.html, or in what the
// diagrams draw (SKILL.md's autonomy levels, references/review.md), and commit the images. It replaces the five only
// when all of them were made. It needs Google Chrome or Chromium (set CHROME to its path when it is not found) and
// ImageMagick (`magick` or `convert`). The pages load their fonts from Google Fonts, as the real ones do, so run it
// online. A Chromium installed as a snap cannot read the system temp folder: set TMPDIR to a folder in your home.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const TEMPLATES = path.join(ROOT, "skills", "hub", "templates");
const DOCS = __dirname;
const IMAGES = ["dashboard.gif", "dashboard.png", "walkthrough.gif", "hub-flow.png", "checkpoints.png"];

const onPath = names => names.find(n => { try { execFileSync("which", [n], { stdio: "ignore" }); return true; } catch { return false; } });
const CHROME = process.env.CHROME
  || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"].find(p => fs.existsSync(p))
  || onPath(["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]);
const MAGICK = onPath(["magick", "convert"]);
if (!CHROME) throw new Error("Chrome or Chromium not found: set CHROME to its path");
if (!MAGICK) throw new Error("ImageMagick not found: install it so that `magick` or `convert` runs");

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "vera-docs-"));
const HUB = path.join(WORK, "hub");
const FRAMES_DIR = path.join(WORK, "frames");
const OUT = path.join(WORK, "out"); // the five images, copied into docs/ only when all of them were made
// Remove the temp folder however the run ends, including a throw before the first image.
process.on("exit", () => fs.rmSync(WORK, { recursive: true, force: true, maxRetries: 3 }));

// One headless Chrome screenshot of a local page. query holds ?w=... and #step for the walkthrough.
// stderr is kept so that a failure says why (for example, Chrome run as root without --no-sandbox).
function shot(file, out, { w, h, scale = 1, query = "" }) {
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${path.join(WORK, "profile")}`,
    `--force-device-scale-factor=${scale}`, "--force-prefers-color-scheme=light", `--window-size=${w},${h}`,
    "--virtual-time-budget=5000", `--screenshot=${out}`, pathToFileURL(file).href + query], { stdio: ["ignore", "ignore", "pipe"] });
  if (!fs.existsSync(out)) throw new Error(`Chrome wrote no screenshot of ${path.basename(file)}${query}`);
}
const magick = args => execFileSync(MAGICK, args, { stdio: ["ignore", "ignore", "pipe"] });
const iso = minAgo => new Date(Date.now() - minAgo * 60000).toISOString();
const write = (file, glob, v) => fs.writeFileSync(path.join(HUB, file), `window.${glob} = ${JSON.stringify(v, null, 1)};\n`);

const TITLES = { A1: "Store saved searches per user", A2: "Limit each user to 20 saved searches", A3: "Expose saved searches over the API", A4: "Show saved searches in the sidebar" };
const pr = { A1: 12, A2: 13, A3: 14, A4: 15 };
const item = (id, status, phases, more = {}) => ({ id, title: TITLES[id], status, phases,
  ...(phases >= 6 ? { pr: pr[id], prUrl: `https://github.com/acme/app/pull/${pr[id]}` } : {}),
  ...(phases >= 4 || status === "walk" ? { walkthrough: `${id}-w1` } : {}),
  ...(phases >= 5 ? { walkApproved: `${id}-w1` } : {}), ...more });
const Q1 = { id: "Q1", text: "Should a saved search send an email when new results appear? A4's settings screen depends on it.",
  options: ["No email in this feature", "Weekly email"], recommend: "No email in this feature", items: ["A4"] };
const base = (frame) => ({
  title: "Saved searches", owner: "Alex", baseSha: "3f9c2e1", workerCap: 2, repo: "acme/app", v: 2, hashForm: 2, autonomy: "low", lang: "en",
  flowSummary: "storage lane → API lane → UI lane",
  refs: [{ label: "Repo rules", href: "https://github.com/acme/app/blob/main/AGENTS.md" }], needs: [], ...frame
});
const lanes = (a1, a2, a3, a4) => [
  { name: "Storage lane", countsAsPr: true, items: [a1, a2] },
  { name: "API lane", countsAsPr: true, items: [a3] },
  { name: "UI lane", countsAsPr: true, items: [a4] }
];
const w = (id, lane, tone) => ({ lane, item: id, worktree: `app-saved-${id.toLowerCase()}`, state: "", tone });

// The dashboard over one feature, from the first workers to the last merge.
const FRAMES = [
  { at: "10:00", s: { ask: "", summary: ["A1 and A3 start first: A2 is stacked on A1, and A4 needs A3's API."],
      lanes: lanes(item("A1", "active", 1, { done: "The saved_searches table tests are written and fail as expected.", base: "main", ext: "First in the storage lane." }),
        item("A2", "todo", 0, { ext: "Stacked on A1." }), item("A3", "active", 0, { base: "main", ext: "Uses A1's table through a stub until A1 merges." }),
        item("A4", "todo", 0, { after: ["A3"], ext: "Starts after A3 merges." })),
      workers: [w("A1", "Storage", "active"), w("A3", "API", "active")], decisions: [{ ...Q1, status: "open" }],
      log: ["10:00 · Started the workers for A1 and A3"] },
    live: { A1: { say: "Writing the failing tests for the table", tool: "Bash: node --test" }, A3: { say: "Reading the API rules", tool: "Read: docs/api-rules.md" } } },
  { at: "10:15", s: { ask: "",
      lanes: lanes(item("A1", "review", 3, { done: "Adds the saved_searches table; 5 tests pass.", base: "main", ext: "The independent reviewer is reading it." }),
        item("A2", "todo", 0, { ext: "Stacked on A1." }), item("A3", "active", 2, { done: "List and create endpoints pass 6 tests.", base: "main" }),
        item("A4", "todo", 0, { after: ["A3"], ext: "Starts after A3 merges." })),
      workers: [w("A1", "Storage", "active"), w("A3", "API", "active")], decisions: [{ ...Q1, status: "open" }],
      log: ["10:15 · A1 passed its full check, and the review started", "10:00 · Started the workers for A1 and A3"] },
    live: { A3: { say: "Running the full test suite", tool: "Bash: npm test" } } },
  { at: "10:25", s: { ask: "Read A1's walkthrough first. A2 waits for it.",
      lanes: lanes(item("A1", "walk", 4, { done: "Adds the saved_searches table; 5 tests pass.", base: "main", risk: ["migration"], ext: "Review passed; waiting for your walkthrough." }),
        item("A2", "todo", 0, { ext: "Stacked on A1." }), item("A3", "review", 3, { done: "Adds list, create, and delete endpoints; 9 tests pass.", base: "main" }),
        item("A4", "todo", 0, { after: ["A3"], ext: "Starts after A3 merges." })),
      workers: [w("A1", "Storage", "support"), w("A3", "API", "active")], decisions: [{ ...Q1, status: "open" }],
      log: ["10:25 · A1 passed round 1 of the independent review, and I explained its walkthrough", "10:15 · A1 passed its full check, and the review started"] },
    live: {} },
  { at: "10:40", s: { ask: "Read A3's walkthrough first. A4 waits for A3.",
      lanes: lanes(item("A1", "pr", 6, { done: "Adds the saved_searches table; 5 tests pass.", base: "main", risk: ["migration"] }),
        item("A2", "active", 1, { done: "The limit tests are written and fail as expected.", base: "feat/saved-a1", ext: "Stacked on A1." }),
        item("A3", "walk", 4, { done: "Adds list, create, and delete endpoints; 9 tests pass.", base: "main", ext: "Review passed; waiting for your walkthrough." }),
        item("A4", "todo", 0, { after: ["A3"], ext: "Starts after A3 merges." })),
      workers: [w("A2", "Storage", "active"), w("A1", "Storage", "support"), w("A3", "API", "support")],
      decisions: [{ ...Q1, status: "open" }],
      log: ["10:40 · You approved the A1 walkthrough, and PR #12 is open", "10:38 · Started the worker for A2"] },
    live: { A2: { say: "Writing the failing limit tests", tool: "Edit: test/limit.test.ts" } }, prs: { A1: { ci: "pending", pass: 3, fail: 0, pending: 2 } } },
  { at: "10:55", s: { ask: "Approve the merge of A1 first. A2 is stacked on it.",
      lanes: lanes(item("A1", "ready", 7, { done: "Adds the saved_searches table; 5 tests pass.", base: "main", risk: ["migration"], ext: "Merges when you approve it." }),
        item("A2", "active", 2, { done: "The limit check is written and 4 tests pass.", base: "feat/saved-a1", ext: "Stacked on A1." }),
        item("A3", "pr", 6, { done: "Adds list, create, and delete endpoints; 9 tests pass.", base: "main" }),
        item("A4", "todo", 0, { after: ["A3"], ext: "Starts after A3 merges." })),
      workers: [w("A2", "Storage", "active"), w("A1", "Storage", "support"), w("A3", "API", "support")],
      decisions: [{ ...Q1, status: "answered", answer: "No email in this feature" }],
      log: ["10:55 · You approved the A3 walkthrough, and PR #14 is open", "10:50 · CI passed on A1 (#12), so I asked for the merge approval"] },
    live: { A2: { say: "Running the full test suite", tool: "Bash: node --test" } }, prs: { A1: { ci: "pass", pass: 5 }, A3: { ci: "pending", pass: 2, fail: 0, pending: 3 } } },
  { at: "11:20", s: { ask: "Approve the merge of A3 first. A4 starts after it.",
      lanes: lanes(item("A1", "merged", 8, { done: "Adds the saved_searches table.", base: "main" }),
        item("A2", "review", 3, { done: "Limits each user to 20 saved searches; 7 tests pass.", base: "main", ext: "Rebased onto main after A1 merged." }),
        item("A3", "ready", 7, { done: "Adds list, create, and delete endpoints; 9 tests pass.", base: "main", ext: "Merges when you approve it." }),
        item("A4", "todo", 0, { after: ["A3"], ext: "Starts after A3 merges." })),
      workers: [w("A2", "Storage", "active"), w("A3", "API", "support"), w("A1", "Storage", "done")],
      decisions: [{ ...Q1, status: "answered", answer: "No email in this feature" }],
      log: ["11:20 · CI passed on A3 (#14), so I asked for the merge approval", "11:05 · Merged A1 (#12) and rebased A2 onto main"] },
    live: {}, prs: { A3: { ci: "pass", pass: 5 } } },
  { at: "12:40", s: { ask: "", closed: true,
      lanes: lanes(item("A1", "merged", 8, { done: "Adds the saved_searches table." }), item("A2", "merged", 8, { done: "Limits each user to 20 saved searches." }),
        item("A3", "merged", 8, { done: "Adds list, create, and delete endpoints." }), item("A4", "merged", 8, { done: "Shows saved searches in the sidebar." })),
      workers: ["A1", "A2", "A3", "A4"].map(id => w(id, "", "done")),
      decisions: [{ ...Q1, status: "answered", answer: "No email in this feature" }],
      log: ["12:40 · Merged A4 (#15). All four PRs are merged", "12:10 · Merged A2 (#13)", "11:30 · Merged A3 (#14) and started the worker for A4"] },
    live: {} }
];

// The walkthrough the developer reads before A3's PR opens.
const WALK = {
  item: "A3", round: 1, title: "Expose saved searches over the API", owner: "Alex", worker: "Worker A3", date: "2026-11-13",
  head: "7c2d9e4", base: "main", baseSha: "3f9c2e1", branch: "feat/saved-a3", kind: "behaviour", afterApproval: false, changes: [],
  purpose: {
    why: "A1 stores saved searches per user, but nothing outside the server can read or change them yet.",
    after: "A signed-in user can list, create, and delete their own saved searches at /api/saved-searches.",
    spec: [{ id: "C3", text: "GET returns only the signed-in user's searches, newest first." },
      { id: "C4", text: "POST creates a search and answers 409 when the user already has 20." },
      { id: "C5", text: "DELETE removes the user's own search and answers 404 for anyone else's." }],
    notHere: [{ item: "A2", what: "The 20-search limit itself" }, { item: "A4", what: "The sidebar that shows the searches" }]
  },
  map: { layers: ["route", "service", "store"], nodes: [
    { id: "routes", label: "saved search routes", layer: "route", file: "src/api/savedSearches.ts", state: "new" },
    { id: "auth", label: "requireUser", layer: "route", file: "src/api/auth.ts", state: "existing" },
    { id: "svc", label: "SavedSearchService", layer: "service", file: "src/services/savedSearch.ts", state: "changed" },
    { id: "limit", label: "checkLimit", layer: "service", file: "src/services/limit.ts", state: "existing" },
    { id: "table", label: "saved_searches table", layer: "store", state: "existing" }],
    links: [{ from: "routes", to: "auth", label: "guards" }, { from: "routes", to: "svc", label: "calls" },
      { from: "svc", to: "limit", label: "asks" }, { from: "svc", to: "table", label: "reads, writes" }] },
  flow: [
    { title: "The route checks who is asking", file: "src/api/savedSearches.ts", line: 12,
      code: "router.get(\"/\", requireUser, async (req, res) => {\n  res.json(await searches.listFor(req.user.id));\n});", note: "requireUser answers 401 before the handler runs." },
    { title: "The service reads only this user's rows", file: "src/services/savedSearch.ts", line: 20,
      code: "return db.savedSearches\n  .where({ userId })\n  .orderBy(\"createdAt\", \"desc\");" },
    { title: "Create asks the limit first", file: "src/services/savedSearch.ts", line: 34,
      code: "if (!(await checkLimit(userId))) throw new LimitReached();", note: "The route turns LimitReached into a 409." }],
  edges: [{ name: "Deleting someone else's search", steps: [
    { title: "The delete filters by owner and finds no row", file: "src/services/savedSearch.ts", line: 48 },
    { title: "The route answers 404, so a caller cannot tell which ids exist", file: "src/api/savedSearches.ts", line: 40 }] }],
  design: [{ decision: "404 for another user's search", why: "A 403 would confirm that the id exists", rejected: "403 Forbidden: tells a caller which ids are real", rule: "docs/api-rules.md" }],
  data: [],
  tests: [
    { spec: "C3", test: "lists only the caller's searches, newest first", file: "test/api/savedSearches.test.ts", line: 14, asserts: "ids are [s3, s1]", red: "expected [s3, s1], got [s3, s2, s1]" },
    { spec: "C4", test: "answers 409 at the 21st search", file: "test/api/savedSearches.test.ts", line: 41, asserts: "status is 409", red: "expected 409, got 201" },
    { spec: "C5", test: "answers 404 for another user's search", file: "test/api/savedSearches.test.ts", line: 63, asserts: "status is 404", red: "expected 404, got 204" }],
  injections: [{ broke: "removed the userId filter from listFor", red: ["lists only the caller's searches, newest first"] }],
  verify: { command: "npm test", summary: "142 tests pass, 9 of them new" },
  risks: [{ area: "privacy", guard: "every query filters by the signed-in user's id" }],
  unverified: ["Speed with thousands of searches per user"], followups: ["Paginate the list if the limit is ever raised"],
  files: [{ path: "src/api/savedSearches.ts", added: 58, removed: 0, role: "routes" },
    { path: "src/services/savedSearch.ts", added: 31, removed: 4, role: "service" },
    { path: "test/api/savedSearches.test.ts", added: 96, removed: 0, role: "tests" }],
  qa: [{ q: "Why 404 and not 403?", a: "A 403 tells the caller that the id exists. The repo's API rules ask for 404.", refs: ["docs/api-rules.md"] }],
  review: [{ round: 1, verdict: "CHANGES", head: "5b1a0c3", findings: [{ level: "blocking", file: "src/api/savedSearches.ts", line: 40, what: "DELETE answered 204 for another user's id", fix: "Filters by owner and answers 404" }] },
    { round: 2, verdict: "PASS", head: "7c2d9e4", findings: [] }]
};
const DIFF = { head: "7c2d9e4", base: "main", files: [
  { path: "src/api/savedSearches.ts", lines: ["@@ -0,0 +1,8 @@", "+import { Router } from \"express\";", "+import { requireUser } from \"./auth\";",
    "+import { searches } from \"../services/savedSearch\";", "+", "+export const router = Router();", "+router.get(\"/\", requireUser, async (req, res) => {",
    "+  res.json(await searches.listFor(req.user.id));", "+});"] },
  { path: "src/services/savedSearch.ts", lines: ["@@ -18,6 +18,9 @@ export class SavedSearchService {", "   listFor(userId: string) {",
    "-    return db.savedSearches.all();", "+    return db.savedSearches", "+      .where({ userId })", "+      .orderBy(\"createdAt\", \"desc\");", "   }"] }] };


// The still for docs/dashboard.png: a decision, a walkthrough, and a merge to approve, all at once.
const STILL = { at: "10:50", s: { ask: "Approve the merge of A1 first. A2 is stacked on it.", summary: ["A1 only adds a table, so no deploy order is needed.", "A4 starts after A3 merges."],
    lanes: lanes(item("A1", "ready", 7, { done: "Adds the saved_searches table; 5 tests pass.", base: "main", risk: ["migration"], ext: "Merges when you approve it." }),
      item("A2", "active", 2, { done: "The limit check is written and 4 tests pass.", base: "feat/saved-a1", ext: "Stacked on A1." }),
      item("A3", "walk", 4, { done: "Adds list, create, and delete endpoints; 9 tests pass.", base: "main", ext: "Review passed; waiting for your walkthrough." }),
      item("A4", "todo", 0, { after: ["A3"], ext: "Starts after A3 merges." })),
    workers: [w("A2", "Storage", "active"), w("A1", "Storage", "support"), w("A3", "API", "support")], decisions: [{ ...Q1, status: "open" }],
    log: ["10:50 · CI passed on A1 (#12), so I asked for the merge approval", "10:40 · You approved the A1 walkthrough, and PR #12 is open", "10:30 · A3 passed round 2 of the independent review, and I explained its walkthrough"] },
  live: { A2: { say: "Running the full test suite", tool: "Bash: node --test" } }, prs: { A1: { ci: "pass", pass: 5 } } };

// The diagrams: plain pages in the dashboard's own colours, fonts, and English labels, read from dashboard.html so they
// follow it. Each read throws when the template no longer has what it looks for, rather than drawing a stale picture.
const DASH = fs.readFileSync(path.join(TEMPLATES, "dashboard.html"), "utf8");
const need = (m, what) => { if (!m) throw new Error(`dashboard.html no longer has ${what}: update docs/render.cjs`); return m; };
const TOKENS = need(DASH.match(/:root \{[\s\S]*?\n\}/), "its :root colour tokens")[0];
const FONT = need(DASH.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/), "its Google Fonts link")[0];
const EN = need(DASH.match(/\n  en: \{[\s\S]*?\n  \}/), "an `en` label table")[0];
const literal = (key, what) => vm.runInNewContext("(" + need(EN.match(new RegExp(`\\n    ${key}: (\\[[^\\]]*\\]|\\{[^}]*\\})`)), what)[1] + ")");
const PHASE = literal("phases", "the `en` phases list");   // the eight checkpoint names
const ST = literal("st", "the `en` status labels");          // the status pills on the cards
need(PHASE.length === 8 || null, "eight phases");
need(DASH.includes('<section class="grid2">') || null, 'the <section class="grid2"> the still hides');
const page = (css, body, script = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link href="${FONT}" rel="stylesheet"><style>${TOKENS}
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: var(--text); font: 15px/1.45 var(--sans); }
.wrap { width: 900px; padding: 24px; position: relative; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.pill { display: inline-block; border-radius: 999px; padding: 1px 9px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.good { color: var(--good); background: var(--good-bg); } .bad { color: var(--bad); background: var(--bad-bg); }
.clay { color: var(--clay-strong); background: var(--clay-bg); } .idle { color: var(--text-2); background: var(--idle-bg); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); padding: 14px 16px; }
${css}</style></head><body><div class="wrap">${body}</div>${script}</body></html>`;

const ARROW = dir => `<svg width="76" height="12" viewBox="0 0 76 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${
  dir === "right" ? '<path d="M2 6h70M66 1l6 5-6 5"/>' : '<path d="M74 6H4M10 1L4 6l6 5"/>'}</svg>`;
const node = (id, title, tone, status, ext = "") => `<div class="node ${tone}"><div class="id">${id}</div><div class="t">${title}</div>
  <span class="pill ${tone}">${status}</span>${ext ? `<div class="ext">${ext}</div>` : ""}</div>`;

const HUB_FLOW = page(`
.flow { display: grid; grid-template-columns: 196px 92px 236px 92px 1fr; }
.col { display: flex; flex-direction: column; gap: 10px; }
.who { font-family: var(--serif); font-size: 21px; line-height: 1.2; min-height: 44px; }
.who small { display: block; font-family: var(--sans); font-size: 12px; color: var(--text-2); margin-top: 3px; }
.card.you { border-color: var(--bad); box-shadow: 0 0 0 2px var(--bad-bg); }
.card.you-soft { background: var(--bad-bg); border-color: transparent; box-shadow: none; }
.card.hub { border-color: var(--clay); box-shadow: 0 0 0 2px var(--clay-bg); }
.do { display: flex; gap: 10px; font-size: 14px; line-height: 1.4; } .do + .do { margin-top: 12px; }
.n { flex: 0 0 22px; height: 22px; border-radius: 999px; background: var(--bad); color: #fff; font-size: 12px; font-weight: 600; display: grid; place-items: center; }
.k { font-size: 12px; font-weight: 600; color: var(--bad); margin-bottom: 6px; }
ul.l { margin: 0; padding-left: 18px; font-size: 14px; } ul.l li { margin: 2px 0; }
ol.steps { list-style: none; margin: 0; padding: 0; counter-reset: s; }
ol.steps li { counter-increment: s; position: relative; padding: 9px 0 9px 32px; font-size: 14px; line-height: 1.4; border-top: 1px solid var(--line); }
ol.steps li:first-child { border-top: 0; padding-top: 0; }
ol.steps li::before { content: counter(s); position: absolute; left: 0; top: 9px; width: 22px; height: 22px; border-radius: 999px; background: var(--clay-strong); color: #fff; font-size: 12px; font-weight: 600; display: grid; place-items: center; }
ol.steps li:first-child::before { top: 0; }
.gut { display: flex; flex-direction: column; justify-content: center; gap: 56px; padding: 44px 8px 0; }
.arr { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 12px; line-height: 1.3; color: var(--text-2); text-align: center; }
.arr svg { color: var(--text-3); }
.lane-h { font-size: 12px; font-weight: 600; color: var(--text-2); }
.node { border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; background: var(--card); }
.node.good { border-color: var(--good); box-shadow: 0 0 0 2px var(--good-bg); background: var(--card); }
.node.clay { border-color: var(--clay); box-shadow: 0 0 0 2px var(--clay-bg); background: var(--card); }
.node.bad { border-color: var(--bad); box-shadow: 0 0 0 2px var(--bad-bg); background: var(--card); }
.node.idle { background: var(--card); }
.node .id { font-size: 12px; color: var(--text-3); font-weight: 600; } .node .t { font-size: 13px; line-height: 1.3; margin: 2px 0 6px; color: var(--text); }
.node .ext { font-size: 12px; color: var(--text-3); margin-top: 4px; }
`, `<div class="flow">
  <div class="col">
    <div class="who">You</div>
    <div class="card you">
      <div class="do"><span class="n">1</span><div><b>Discuss a feature</b> with Claude Code or Codex until you agree on what to build</div></div>
      <div class="do"><span class="n">2</span><div><b>Invoke the hub</b><div class="mono">/vera:hub</div></div></div>
    </div>
    <div class="card you-soft">
      <div class="k">Then answer what only you can</div>
      <ul class="l"><li>Confirm the spec</li><li>Product decisions</li><li>A walkthrough per PR</li><li>Each merge approval</li><li>Permission prompts in worker terminals</li></ul>
    </div>
  </div>
  <div class="gut">
    <div class="arr"><span>the feature</span>${ARROW("right")}</div>
    <div class="arr">${ARROW("left")}<span>to-dos on the dashboard</span></div>
  </div>
  <div class="col">
    <div class="who">Hub<small>your session</small></div>
    <div class="card hub"><ol class="steps">
      <li>Writes the spec from your discussion</li>
      <li>Splits it into small PRs, in lanes</li>
      <li>Starts one worker per PR, up to your limit</li>
      <li>Has an independent reviewer check each PR</li>
      <li>Walks you through each PR before it opens</li>
      <li>Merges each PR you approve</li>
    </ol></div>
  </div>
  <div class="gut">
    <div class="arr"><span>a task spec each</span>${ARROW("right")}</div>
    <div class="arr">${ARROW("left")}<span>progress and questions</span></div>
  </div>
  <div class="col">
    <div class="who">Workers<small>one per PR, each in its own worktree</small></div>
    <div class="lane-h">Storage lane</div>
    ${node("A1", TITLES.A1, "good", ST.ready)}
    ${node("A2", TITLES.A2, "clay", ST.active, "Stacked on A1")}
    <div class="lane-h">API lane</div>
    ${node("A3", TITLES.A3, "bad", ST.walk)}
    <div class="lane-h">UI lane</div>
    ${node("A4", TITLES.A4, "idle", ST.todo, "Starts after A3 merges")}
  </div>
</div>`);

// Who reaches each checkpoint, at Low. The names are the dashboard's own; the return arrow is drawn once the page has
// laid the steps out.
const GROUPS = [
  { who: "Worker", sub: "in its own worktree", tone: "worker", steps: [[PHASE[0], "written before the code"], [PHASE[1], "the test turns green"], [PHASE[2], "every test on the final code"]] },
  { who: "Independent reviewer", tone: "reviewer", steps: [[PHASE[3], "a fresh agent reads the code"]] },
  { who: "You", tone: "you", steps: [[PHASE[4], "before the PR opens"]] },
  { who: "On GitHub", tone: "github", steps: [[PHASE[5], "from the reviewed code"], [PHASE[6], "on the PR's head"], [PHASE[7], "once you approve"]] }
];
let stepNo = 0;
const CHECKPOINTS = page(`
.cp { position: relative; padding-bottom: 64px; }
.groups, .row { display: grid; grid-template-columns: repeat(8, 1fr); gap: 10px; }
.g { font-size: 13px; font-weight: 600; padding: 0 0 6px 2px; border-bottom: 3px solid; }
.g small { font-weight: 400; color: var(--text-2); }
.row { position: relative; margin-top: 14px; }
.row::before { content: ""; position: absolute; left: 6%; right: 6%; top: 25px; border-top: 2px solid var(--line); }
.step { position: relative; border: 1px solid var(--line); border-radius: 12px; background: var(--card); padding: 12px 8px 10px; text-align: center; }
.step .c { width: 28px; height: 28px; margin: 0 auto 8px; border-radius: 999px; color: #fff; font-size: 13px; font-weight: 600; display: grid; place-items: center; }
.step .lbl { font-size: 14px; font-weight: 600; line-height: 1.25; }
.step .sub { font-size: 12px; color: var(--text-2); line-height: 1.3; margin-top: 4px; }
.worker { --tone: var(--clay-strong); --tone-bg: var(--clay-bg); }
.reviewer { --tone: var(--watch); --tone-bg: var(--watch-bg); }
.you { --tone: var(--bad); --tone-bg: var(--bad-bg); }
.github { --tone: var(--good); --tone-bg: var(--good-bg); }
.g { color: var(--tone); border-color: var(--tone); }
.step { border-color: var(--tone); box-shadow: 0 0 0 2px var(--tone-bg); } .step .c { background: var(--tone); }
#back { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; color: var(--watch); }
#back text { font: 600 12px var(--sans); fill: var(--watch); }
`, `<div class="cp">
  <div class="groups">${GROUPS.map(g => `<div class="g ${g.tone}" style="grid-column: span ${g.steps.length}">${g.who}${g.sub ? ` <small>${g.sub}</small>` : ""}</div>`).join("")}</div>
  <div class="row">${GROUPS.flatMap(g => g.steps.map(([lbl, sub]) => `<div class="step ${g.tone}" id="s${++stepNo}"><div class="c">${stepNo}</div><div class="lbl">${lbl}</div><div class="sub">${sub}</div></div>`)).join("")}</div>
  <svg id="back"></svg>
</div>`, `<script>
const host = document.querySelector(".cp").getBoundingClientRect();
const box = id => document.getElementById(id).getBoundingClientRect();
const a = box("s4"), b = box("s2");
const y0 = Math.max(a.bottom, b.bottom) - host.top + 4, y1 = y0 + 26;
const xa = a.left + a.width / 2 - host.left, xb = b.left + b.width / 2 - host.left;
const svg = document.getElementById("back");
svg.setAttribute("width", host.width); svg.setAttribute("height", y1 + 30);
svg.innerHTML = '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M' + xa + ' ' + y0 + ' V' + (y1 - 8) + ' Q' + xa + ' ' + y1 + ' ' + (xa - 8) + ' ' + y1 + ' H' + (xb + 8) + ' Q' + xb + ' ' + y1 + ' ' + xb + ' ' + (y1 - 8) + ' V' + (y0 + 1) + ' M' + (xb - 5) + ' ' + (y0 + 7) + ' L' + xb + ' ' + (y0 + 1) + ' L' + (xb + 5) + ' ' + (y0 + 7) + '"/>'
  + '<text x="' + (xb + 14) + '" y="' + (y1 + 18) + '">Changes requested: the worker fixes them, and the review runs again</text>';
</script>`);

// Run: dashboard frames, the still, the walkthrough steps, the diagrams. All five go to OUT first.
function showDashboard(frame, out, extraCss = "") {
  write("state.js", "HUB_STATE", base({ updatedAt: `2026-11-13 ${frame.at}`, ...frame.s }));
  const workers = Object.fromEntries(Object.entries(frame.live || {}).map(([id, v]) => [id, { at: iso(1), state: "working", ...v }]));
  const prs = Object.fromEntries(Object.entries(frame.prs || {}).map(([id, v]) => [pr[id], v])); // live.js keys PRs by number
  write("live.js", "HUB_LIVE", { at: iso(0.5), workers, prs, hub: { count: 0, items: {} } });
  let file = path.join(HUB, "dashboard.html");
  if (extraCss) {
    file = path.join(HUB, "dashboard-still.html");
    fs.writeFileSync(file, fs.readFileSync(path.join(HUB, "dashboard.html"), "utf8").replace("</style>", `${extraCss}\n</style>`));
  }
  shot(file, out, { w: 1280, h: 2600 });
}
const frame = name => path.join(FRAMES_DIR, name);
const gif = (frames, out, delay) => magick(["-delay", String(delay), "-loop", "0", ...frames.slice(0, -1), "-delay", "450", frames[frames.length - 1],
  "+dither", "-colors", "96", "-layers", "OptimizePlus", out]);
const fit = (src, h, out) => magick([src, "-crop", `1280x${h}+0+0`, "+repage", "-resize", "960x", out]);
const trim = (src, out) => magick([src, "-fuzz", "1%", "-trim", "+repage", "-bordercolor", "white", "-border", "40", "-strip", out]);

const out = name => path.join(OUT, name);
for (const dir of [path.join(HUB, "walkthroughs"), FRAMES_DIR, OUT]) fs.mkdirSync(dir, { recursive: true });
for (const f of ["dashboard.html", "walkthrough.html"]) fs.copyFileSync(path.join(TEMPLATES, f), path.join(HUB, f));

FRAMES.forEach((f, i) => { showDashboard(f, frame(`dash-${i}.png`)); fit(frame(`dash-${i}.png`), 1080, frame(`dash-${i}-s.png`)); });
gif(FRAMES.map((_, i) => frame(`dash-${i}-s.png`)), out("dashboard.gif"), 260);
showDashboard(STILL, frame("still.png"), "section.grid2 { display: none; }"); // the still ends at the checkpoint table
magick([frame("still.png"), "-fuzz", "1%", "-trim", "+repage", "-background", "white", "-gravity", "north", "-extent", "1280x", "-bordercolor", "white", "-border", "0x24", "-strip", out("dashboard.png")]);

write("state.js", "HUB_STATE", base({ updatedAt: `2026-11-13 ${STILL.at}`, ...STILL.s }));
write("walkthroughs/A3-w1.js", "HUB_WALK", WALK);
write("walkthroughs/A3-w1.diff.js", "HUB_DIFF", DIFF);
const steps = [1, 2, 3, 4, 5, 6, 7];
for (const s of steps) {
  shot(path.join(HUB, "walkthrough.html"), frame(`walk-${s}.png`), { w: 1280, h: 1100, query: `?w=A3-w1#${s}` });
  fit(frame(`walk-${s}.png`), 1100, frame(`walk-${s}-s.png`));
}
gif(steps.map(s => frame(`walk-${s}-s.png`)), out("walkthrough.gif"), 300);

for (const [name, html] of [["hub-flow", HUB_FLOW], ["checkpoints", CHECKPOINTS]]) {
  const file = path.join(WORK, `${name}.html`);
  fs.writeFileSync(file, html);
  shot(file, frame(`${name}.png`), { w: 948, h: 2000, scale: 2 }); // tall on purpose: the trim removes the white below
  trim(frame(`${name}.png`), out(`${name}.png`));
}

for (const name of IMAGES) fs.copyFileSync(out(name), path.join(DOCS, name));
console.log(`wrote ${IMAGES.map(n => `docs/${n}`).join(", ")}`);

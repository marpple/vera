// Keeps true: trimlog.cjs moves only the log lines after the 30th out of state.js into log.md, leaves every other byte alone, changes nothing on a second run, and refuses without touching either file when it cannot be sure.
const { test, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "skills", "hub", "scripts", "trimlog.cjs");
const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

const entries = n => Array.from({ length: n }, (_, i) => `${i + 1} · line ${i + 1}`);
const quote = [
  s => JSON.stringify(s),
  s => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
  s => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`",
];
const render = (e, i, mixed) => typeof e !== "string" ? JSON.stringify(e) : (mixed ? quote[i % 3] : quote[0])(e);

// A state.js in the template's style. opts: crlf, quoteKeys, mixed (three quote styles), perLine, comments, laneLog.
function stateText(list, opts = {}) {
  const k = name => (opts.quoteKeys ? `"${name}"` : name);
  const rows = [];
  for (let i = 0; i < list.length; i += opts.perLine || 1) {
    const group = list.slice(i, i + (opts.perLine || 1)).map((e, j) => render(e, i + j, opts.mixed));
    rows.push("    " + group.join(", "));
  }
  let body = rows.map((r, i) => r + (i < rows.length - 1 || opts.trailingComma ? "," : ""));
  if (opts.afterThirtieth && body.length > 29) body[29] += "   // end of the 30th";
  if (opts.lastComment) body.push("    // the last line before the bracket");
  if (opts.comments && body.length > 40) {
    body[9] += "\n    // a note, with ] and \"quotes\" and 'these'\n    /* and a block ] , */";
    body[39] += "\n    /* tail note ] , */";
  }
  const lines = [
    "/* Hub state. log: [ is mentioned here, in a comment. */",
    "window.HUB_STATE = {",
    `  ${k("title")}: "Notification settings",   // a trailing comment, ] ,`,
    `  ${k("lanes")}: [`,
    `    { id: "N1", ${opts.laneLog ? "log: [\"x\", \"y\"], " : ""}title: "T" }`,
    "  ],",
    `  ${k("decisions")}: [{ id: "Q1", text: "Why, then?" }],`,
    `  ${k("log")}: [`,
    ...body,
    "  ]",
    "};",
    "",
  ];
  return lines.join(opts.crlf ? "\r\n" : "\n");
}

function hub(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trimlog-"));
  dirs.push(dir);
  if (text !== null) fs.writeFileSync(path.join(dir, "state.js"), text);
  return dir;
}
const run = dir => {
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8", timeout: 20000 });
  return { status: r.status, stdout: r.stdout };
};
const load = dir => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dir, "state.js"), "utf8"), ctx, { timeout: 1000 });
  return JSON.parse(JSON.stringify(ctx.window.HUB_STATE));
};
const read = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");
const logLines = dir => read(dir, "log.md").split("\n").filter(Boolean);
const asLine = e => "- " + (typeof e === "string" ? e : JSON.stringify(e));

// The assertions of the first test, for a state built from `list`.
function checkTrim(text, list, extra = {}) {
  const dir = hub(text);
  const before = load(dir);
  const r = run(dir);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.ok(r.stdout.startsWith(`ok: moved ${list.length - 30} log lines to log.md, kept 30`), r.stdout);
  const after = load(dir);
  assert.deepStrictEqual(after.log, before.log.slice(0, 30));
  const restAfter = { ...after };
  const restBefore = { ...before };
  delete restAfter.log;
  delete restBefore.log;
  assert.deepStrictEqual(restAfter, restBefore);
  assert.deepStrictEqual(logLines(dir), list.slice(30).map(asLine));
  return { dir, ...extra };
}

test("moves the lines after the 30th to log.md and changes nothing else", () => {
  const list = entries(45);
  const { dir } = checkTrim(stateText(list), list);
  assert.strictEqual(load(dir).title, "Notification settings");
  assert.strictEqual(load(dir).lanes[0].id, "N1");
  assert.strictEqual(load(dir).decisions[0].text, "Why, then?");
  assert.strictEqual(logLines(dir)[0], "- 31 · line 31");
  assert.strictEqual(logLines(dir).length, 15);
});

test("the new state.js is the old one with one span removed", () => {
  const list = entries(45);
  const old = stateText(list);
  const dir = hub(old);
  assert.strictEqual(run(dir).status, 0);
  const now = read(dir, "state.js");
  let p = 0;
  while (p < old.length && p < now.length && old[p] === now[p]) p++;
  assert.ok(old.endsWith(now.slice(p)));
  assert.ok(now.length < old.length);
  assert.ok(old.slice(0, p).includes(JSON.stringify(list[29])));
  assert.match(now.slice(p), /^\s*\]/);
  assert.ok(!now.includes(JSON.stringify(list[30])));
});

test("a second run changes nothing", () => {
  const dir = hub(stateText(entries(45)));
  assert.strictEqual(run(dir).status, 0);
  const state = fs.readFileSync(path.join(dir, "state.js"));
  const md = fs.readFileSync(path.join(dir, "log.md"));
  const r = run(dir);
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.startsWith("ok: nothing to move, 30 log lines"), r.stdout);
  assert.ok(fs.readFileSync(path.join(dir, "state.js")).equals(state));
  assert.ok(fs.readFileSync(path.join(dir, "log.md")).equals(md));
});

test("a log of 30 lines or fewer is left alone", () => {
  for (const n of [30, 0]) {
    const text = stateText(entries(n));
    const dir = hub(text);
    const r = run(dir);
    assert.strictEqual(r.status, 0, r.stdout);
    assert.ok(r.stdout.startsWith(`ok: nothing to move, ${n} log lines`), r.stdout);
    assert.strictEqual(read(dir, "state.js"), text);
    assert.ok(!fs.existsSync(path.join(dir, "log.md")));
  }
});

test("text that looks like structure inside an entry does not move the cut", () => {
  const list = entries(45);
  list[2] = "a ] b";
  list[3] = "c , d";
  list[4] = 'say "hi"';
  list[5] = "it's";
  list[6] = "http://x // y";
  list[7] = "/* not a comment";
  list[8] = "back`tick";
  list[28] = "] , ] // /*";
  list[29] = "last kept ], ";
  list[30] = "first moved ] , \" ' ` // /* ";
  list[32] = "}]) , [{(";
  list[44] = "last, ] ";
  const variants = [
    {},
    { quoteKeys: true },
    { mixed: true },
    { perLine: 3 },
    { comments: true },
    { laneLog: true },
    { crlf: true },
    { trailingComma: true },
    { lastComment: true },
    { afterThirtieth: true },
    { trailingComma: true, lastComment: true, afterThirtieth: true, crlf: true },
    { crlf: true, quoteKeys: true, mixed: true, perLine: 3, comments: true, laneLog: true },
  ];
  for (const opts of variants) {
    const text = stateText(list, opts);
    const { dir } = checkTrim(text, list);
    assert.ok(read(dir, "state.js").includes(opts.crlf ? "\r\n" : "\n"));
    if (opts.laneLog) assert.deepStrictEqual(load(dir).lanes[0].log, ["x", "y"]);
  }
});

test("an entry that is not a string is written as JSON", () => {
  const list = entries(45);
  list[30] = { at: "09:00", text: "x" };
  const { dir } = checkTrim(stateText(list), list);
  assert.strictEqual(logLines(dir)[0], '- {"at":"09:00","text":"x"}');
});

test("a later run puts the newer lines on top of log.md", () => {
  const list = entries(45);
  const dir = hub(stateText(list));
  assert.strictEqual(run(dir).status, 0);
  const fresh = ["new 1", "new 2", "new 3", "new 4", "new 5"];
  const grown = fresh.concat(load(dir).log);
  assert.strictEqual(grown.length, 35);
  fs.writeFileSync(path.join(dir, "state.js"), stateText(grown));
  const r = run(dir);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.ok(r.stdout.startsWith("ok: moved 5 log lines to log.md, kept 30"), r.stdout);
  assert.deepStrictEqual(logLines(dir), list.slice(25, 30).map(asLine).concat(list.slice(30).map(asLine)));
  assert.strictEqual(logLines(dir).length, 20);
  assert.deepStrictEqual(load(dir).log, grown.slice(0, 30));
});

test("a run cut short after log.md was written loses nothing", () => {
  const list = entries(45);
  const dir = hub(stateText(list));
  const moved = list.slice(30).map(asLine);
  fs.writeFileSync(path.join(dir, "log.md"), moved.join("\n") + "\n");
  const r = run(dir);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.deepStrictEqual(logLines(dir), moved.concat(moved));
  assert.strictEqual(load(dir).log.length, 30);
});

test("lines that repeat the top of log.md are still moved", () => {
  const list = entries(30).concat(Array(5).fill("same"));
  const dir = hub(stateText(list));
  fs.writeFileSync(path.join(dir, "log.md"), "- same\n".repeat(5) + "- old\n");
  const r = run(dir);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.deepStrictEqual(logLines(dir), Array(10).fill("- same").concat(["- old"]));
  assert.strictEqual(logLines(dir).length, 11);
  assert.strictEqual(load(dir).log.length, 30);
});

test("a log.md with no newline at its end still gets the new lines above the old ones", () => {
  const list = entries(33);
  const dir = hub(stateText(list));
  fs.writeFileSync(path.join(dir, "log.md"), "- old 1\n- old 2");
  assert.strictEqual(run(dir).status, 0);
  assert.deepStrictEqual(logLines(dir), list.slice(30).map(asLine).concat(["- old 1", "- old 2"]));
});

test("it refuses and leaves both files when it cannot be sure", () => {
  const forty = JSON.stringify(entries(40));
  const cases = [
    { name: "no state.js", text: null },
    { name: "syntax error", text: "window.HUB_STATE = {\n  log: [\n" },
    { name: "no HUB_STATE", text: "window.OTHER = { log: [] };\n" },
    { name: "log missing", text: 'window.HUB_STATE = { title: "x" };\n' },
    { name: "log not an array", text: 'window.HUB_STATE = { log: "x" };\n' },
    { name: "log built by an expression", text: `var MORE = ${forty};\nwindow.HUB_STATE = {\n  log: ["a"].concat(MORE)\n};\n` },
    { name: "log is a variable", text: `var L = ${forty};\nwindow.HUB_STATE = {\n  log: L\n};\n` },
    { name: "a circular value", text: 'window.HUB_STATE = { self: null, log: ' + forty + ' };\nwindow.HUB_STATE.self = window.HUB_STATE;\n' },
    { name: "log.md is a directory", text: stateText(entries(45)), md: "dir" },
    { name: "log.md exists and the log is built", text: `var MORE = ${forty};\nwindow.HUB_STATE = { log: ["a"].concat(MORE) };\n`, md: "- old\n" },
  ];
  for (const c of cases) {
    const dir = hub(c.text);
    if (c.md === "dir") fs.mkdirSync(path.join(dir, "log.md"));
    else if (c.md) fs.writeFileSync(path.join(dir, "log.md"), c.md);
    const r = run(dir);
    assert.strictEqual(r.status, 2, `${c.name}: ${r.stdout}`);
    assert.ok(r.stdout.startsWith("refused: "), `${c.name}: ${r.stdout}`);
    if (c.text !== null) assert.strictEqual(read(dir, "state.js"), c.text, c.name);
    else assert.ok(!fs.existsSync(path.join(dir, "state.js")), c.name);
    const md = path.join(dir, "log.md");
    if (c.md === "dir") assert.ok(fs.statSync(md).isDirectory(), c.name);
    else if (c.md) assert.strictEqual(fs.readFileSync(md, "utf8"), c.md, c.name);
    else assert.ok(!fs.existsSync(md), c.name);
    assert.deepStrictEqual(fs.readdirSync(dir).filter(f => f.endsWith(".tmp")), [], c.name);
  }
});

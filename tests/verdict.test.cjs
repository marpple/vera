// Keeps true: verdict.cjs reads only a well-formed reviewer verdict, records its round in the walkthrough without losing earlier rounds or the fixes the hub wrote, prints the blocking findings for the worker, and refuses without touching any file when it cannot be sure.
const { test, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "skills", "hub", "scripts", "verdict.cjs");
const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

const CHANGES = [
  "VERDICT: CHANGES",
  "[blocking] src/a.js:12 — the retry loop never stops — a failing upstream hangs the request — cap it at 3 tries",
  "[non-blocking] src/a.js:40-44 — the name `tmp` says nothing — the next reader has to trace it — call it `pending`",
  "[blocking] test/a.test.js:7 — the test passes without the fix — it proves nothing — assert the third call throws",
].join("\n");
const PASS = "VERDICT: PASS\n[non-blocking] src/a.js:3 — unused import — noise — remove it\n";
const LINE1 = "1. src/a.js:12 — the retry loop never stops — a failing upstream hangs the request — cap it at 3 tries";
const LINE2 = "2. test/a.test.js:7 — the test passes without the fix — it proves nothing — assert the third call throws";

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verdict-"));
  dirs.push(dir);
  return dir;
}
function verdictFile(text) {
  const file = path.join(tmp(), "verdict.txt");
  fs.writeFileSync(file, text);
  return file;
}
function walkFile(obj) {
  const file = path.join(tmp(), "walk.js");
  fs.writeFileSync(file, "window.HUB_WALK = " + JSON.stringify(obj, null, 1) + ";\n");
  return file;
}
const readWalk = file => JSON.parse(fs.readFileSync(file, "utf8").match(/^window\.HUB_WALK = ([\s\S]*);\n$/)[1]);
const run = (...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: r.status, out: r.stdout, lines: r.stdout.split("\n").filter(l => l !== ""), err: r.stderr };
};
const base = () => ({ item: "N1", round: 1, title: "t", qa: [{ q: "q", a: "a" }], review: [] });
const rounds = w => w.review.map(r => r.round);

test("check prints the verdict, the counts, and every blocking finding in full", () => {
  const c = run("check", verdictFile(CHANGES));
  assert.strictEqual(c.status, 0);
  assert.strictEqual(c.lines[0], "ok: CHANGES, 2 blocking, 1 non-blocking");
  assert.strictEqual(c.lines[1], LINE1);
  assert.ok(c.lines[2].startsWith("2. test/a.test.js:7 — "));
  assert.strictEqual(c.lines.length, 3);
  const p = run("check", verdictFile(PASS));
  assert.strictEqual(p.status, 0);
  assert.strictEqual(p.out, "ok: PASS, 0 blocking, 1 non-blocking\n");
});

test("record writes the round into the walkthrough's review and keeps the rest of the file", () => {
  const file = walkFile(base());
  const c = run("record", verdictFile(CHANGES), file, "--round", "1", "--head", "d4e5f6a");
  assert.strictEqual(c.status, 0);
  assert.strictEqual(c.out, run("check", verdictFile(CHANGES)).out);
  const w = readWalk(file);
  assert.deepStrictEqual(w.review, [{ round: 1, verdict: "CHANGES", head: "d4e5f6a", findings: [
    { level: "blocking", file: "src/a.js", line: 12, what: "the retry loop never stops — a failing upstream hangs the request", fix: "" },
    { level: "non-blocking", file: "src/a.js", line: 40, what: "the name `tmp` says nothing — the next reader has to trace it", fix: "" },
    { level: "blocking", file: "test/a.test.js", line: 7, what: "the test passes without the fix — it proves nothing", fix: "" },
  ] }]);
  const { review, ...rest } = w;
  assert.deepStrictEqual(rest, { item: "N1", round: 1, title: "t", qa: [{ q: "q", a: "a" }] });
  assert.match(fs.readFileSync(file, "utf8"), /^window\.HUB_WALK = \{[\s\S]*\};\n$/);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ["walk.js"]);
});

test("a second round is added after the first, and a fix the hub wrote stays", () => {
  const file = walkFile(base());
  run("record", verdictFile(CHANGES), file, "--round", "1", "--head", "d4e5f6a");
  const w = readWalk(file);
  w.review[0].findings[0].fix = "Capped at 3 tries in 9c1d2e3";
  fs.writeFileSync(file, "window.HUB_WALK = " + JSON.stringify(w, null, 1) + ";\n");
  const c = run("record", verdictFile(PASS), file, "--round", "2", "--head", "9c1d2e3");
  assert.strictEqual(c.status, 0);
  const after = readWalk(file);
  assert.deepStrictEqual(rounds(after), [1, 2]);
  assert.strictEqual(after.review[0].findings[0].fix, "Capped at 3 tries in 9c1d2e3");
  assert.strictEqual(after.review[1].verdict, "PASS");
});

test("recording the same round again changes nothing, and keeps its fix", () => {
  const file = walkFile(base());
  const v = verdictFile(CHANGES);
  run("record", v, file, "--round", "1", "--head", "d4e5f6a");
  const once = fs.readFileSync(file);
  run("record", v, file, "--round", "1", "--head", "d4e5f6a");
  assert.ok(fs.readFileSync(file).equals(once));
  const w = readWalk(file);
  w.review[0].findings[0].fix = "Capped at 3 tries";
  fs.writeFileSync(file, "window.HUB_WALK = " + JSON.stringify(w, null, 1) + ";\n");
  const c = run("record", v, file, "--round", "1", "--head", "d4e5f6a");
  assert.strictEqual(c.status, 0);
  const after = readWalk(file);
  assert.deepStrictEqual(rounds(after), [1]);
  assert.strictEqual(after.review[0].findings[0].fix, "Capped at 3 tries");
  assert.strictEqual(after.review[0].findings[2].fix, "");
});

test("--from brings the earlier rounds into a new walkthrough round", () => {
  const w1 = walkFile(base());
  run("record", verdictFile(CHANGES), w1, "--round", "1", "--head", "d4e5f6a");
  const first = readWalk(w1);
  first.review[0].findings[0].fix = "Capped at 3 tries in 9c1d2e3";
  fs.writeFileSync(w1, "window.HUB_WALK = " + JSON.stringify(first, null, 1) + ";\n");
  run("record", verdictFile(CHANGES), w1, "--round", "2", "--head", "9c1d2e3");
  const w1Bytes = fs.readFileSync(w1);

  const w2 = walkFile({ item: "N1", round: 2, review: [] });
  const c = run("record", verdictFile(PASS), w2, "--round", "3", "--head", "abc1234", "--from", w1);
  assert.strictEqual(c.status, 0);
  const got = readWalk(w2);
  assert.deepStrictEqual(rounds(got), [1, 2, 3]);
  assert.strictEqual(got.review[0].findings[0].fix, "Capped at 3 tries in 9c1d2e3");
  assert.ok(fs.readFileSync(w1).equals(w1Bytes));

  // a round the target already holds is not overwritten by --from
  const w3 = walkFile({ item: "N1", round: 2, review: [{ round: 1, verdict: "PASS", head: "1111111", findings: [] }] });
  run("record", verdictFile(PASS), w3, "--round", "3", "--head", "abc1234", "--from", w1);
  const kept = readWalk(w3);
  assert.deepStrictEqual(rounds(kept), [1, 2, 3]);
  assert.strictEqual(kept.review[0].head, "1111111");
  assert.deepStrictEqual(kept.review[0].findings, []);
});

test("a walkthrough with no review field, or a null one, gets one; a review that is not a list is refused", () => {
  for (const review of [undefined, null]) {
    const w = { item: "N1", round: 1 };
    if (review !== undefined) w.review = review;
    const file = walkFile(w);
    assert.strictEqual(run("record", verdictFile(PASS), file, "--round", "1", "--head", "d4e5f6a").status, 0);
    assert.deepStrictEqual(rounds(readWalk(file)), [1]);
  }
  const v = verdictFile(PASS);
  for (const review of [{ verdict: "PASS", rounds: 2, head: "abc1234", summary: "s", files: [] }, "none", 3]) {
    const file = walkFile({ item: "N1", round: 1, review });
    const bytes = fs.readFileSync(file);
    const c = run("record", v, file, "--round", "1", "--head", "d4e5f6a");
    assert.strictEqual(c.status, 2);
    assert.strictEqual(c.out, "cannot parse: the walkthrough's review is not a list\n");
    assert.ok(fs.readFileSync(file).equals(bytes));
    const target = walkFile(base());
    const tbytes = fs.readFileSync(target);
    const f = run("record", v, target, "--round", "1", "--head", "d4e5f6a", "--from", file);
    assert.strictEqual(f.status, 2);
    assert.strictEqual(f.out, "cannot parse: the walkthrough's review is not a list\n");
    assert.ok(fs.readFileSync(target).equals(tbytes));
  }
});

test("rounds of any other shape are kept as they are, and recording over one does not crash", () => {
  const r1 = { round: 1, verdict: "REQUEST CHANGES", findings: 9, resolved: "x" };
  const r2 = { round: 2, verdict: "PASS", text: "y" };
  const file = walkFile({ item: "N1", review: [r1, r2] });
  assert.strictEqual(run("record", verdictFile(PASS), file, "--round", "3", "--head", "d4e5f6a").status, 0);
  let w = readWalk(file);
  assert.deepStrictEqual(rounds(w), [1, 2, 3]);
  assert.deepStrictEqual(w.review[0], r1);
  assert.deepStrictEqual(w.review[1], r2);
  assert.strictEqual(JSON.stringify(w.review[0]), JSON.stringify(r1));
  assert.strictEqual(JSON.stringify(w.review[1]), JSON.stringify(r2));
  assert.strictEqual(run("record", verdictFile(CHANGES), file, "--round", "1", "--head", "d4e5f6a").status, 0);
  w = readWalk(file);
  assert.deepStrictEqual(rounds(w), [1, 2, 3]);
  assert.strictEqual(w.review[0].verdict, "CHANGES");
  assert.strictEqual(w.review[0].findings.length, 3);
  assert.deepStrictEqual(w.review[1], r2);
  assert.strictEqual(JSON.stringify(w.review[1]), JSON.stringify(r2));
  // a round without a numeric round sorts after the numbered ones
  const odd = walkFile({ item: "N1", review: [{ verdict: "PASS", text: "no number" }, r2] });
  assert.strictEqual(run("record", verdictFile(PASS), odd, "--round", "3", "--head", "d4e5f6a").status, 0);
  assert.deepStrictEqual(readWalk(odd).review.map(r => r.round), [2, 3, undefined]);
});

test("CRLF, a BOM, blank lines, and an en dash are read; anything else is refused", () => {
  const accepted = [
    CHANGES.replace(/\n/g, "\r\n"),
    "﻿" + CHANGES,
    CHANGES.replace(/\n/g, "\n\n  \n"),
    CHANGES.replace(/ — /g, " – "),
  ];
  for (const text of accepted) {
    const c = run("check", verdictFile(text));
    assert.strictEqual(c.status, 0, text);
    assert.strictEqual(c.lines[0], "ok: CHANGES, 2 blocking, 1 non-blocking");
  }
  const refused = [
    "Here is my review:\n" + CHANGES,
    "**VERDICT: PASS**", "VERDICT: pass", "VERDICT: PASS with notes",
    CHANGES + "\n## Notes", CHANGES + "\n```",
    CHANGES.replace(/ — /g, " - "),
    "VERDICT: CHANGES\n[blocking] src/a.js:12 — the loop — never stops",
    "VERDICT: CHANGES\n[blocking] src/a.js — the loop — never stops — cap it",
    "VERDICT: CHANGES\n[major] src/a.js:1 — a — b — c",
    "VERDICT: PASS\n[blocking] src/a.js:1 — a — b — c",
    "VERDICT: CHANGES\n[non-blocking] src/a.js:1 — a — b — c",
    "",
  ];
  for (const text of refused) {
    const walk = walkFile(base());
    const bytes = fs.readFileSync(walk);
    const c = run("record", verdictFile(text), walk, "--round", "1", "--head", "d4e5f6a");
    assert.strictEqual(c.status, 2, text);
    assert.ok(c.out.startsWith("cannot parse: "), text);
    assert.ok(fs.readFileSync(walk).equals(bytes), text);
    assert.strictEqual(run("check", verdictFile(text)).status, 2, text);
  }
  const missing = run("check", path.join(tmp(), "nope.txt"));
  assert.strictEqual(missing.status, 2);
  assert.ok(missing.out.startsWith("cannot parse: "));
});

test("record refuses a walkthrough that is not plain data, a bad round, and a bad head", () => {
  const v = verdictFile(PASS);
  const notJson = path.join(tmp(), "walk.js");
  fs.writeFileSync(notJson, "window.HUB_WALK = { item: 'N1' };");
  const good = walkFile(base());
  const goodBytes = fs.readFileSync(good);
  const nope = path.join(tmp(), "nope.js");
  const cases = [
    [v, notJson, "--round", "1", "--head", "d4e5f6a"],
    [v, nope, "--round", "1", "--head", "d4e5f6a"],
    [v, good, "--round", "0", "--head", "d4e5f6a"],
    [v, good, "--round", "x", "--head", "d4e5f6a"],
    [v, good, "--head", "d4e5f6a"],
    [v, good, "--round", "1"],
    [v, good, "--round", "1", "--head", "HEAD"],
    [v, good, "--round", "1", "--head", "d4e5f6a", "--from", nope],
    [v, good, "--round", "1", "--head", "d4e5f6a", "--from", notJson],
  ];
  for (const args of cases) {
    const c = run("record", ...args);
    assert.strictEqual(c.status, 2, args.join(" "));
    assert.ok(c.out.startsWith("cannot parse: "), args.join(" "));
    assert.ok(fs.readFileSync(good).equals(goodBytes), args.join(" "));
  }
  assert.strictEqual(fs.readFileSync(notJson, "utf8"), "window.HUB_WALK = { item: 'N1' };");
  assert.deepStrictEqual(fs.readdirSync(path.dirname(good)), ["walk.js"]);
});

test("reply prints REVIEW: and the blocking findings, minus the ones named in --except", () => {
  const v = verdictFile(CHANGES);
  assert.strictEqual(run("reply", v).out, `REVIEW:\n${LINE1}\n${LINE2}\n`);
  assert.strictEqual(run("reply", v, "--except", "1").out, `REVIEW:\n${LINE2}\n`);
  assert.strictEqual(run("reply", v, "--except", "1,1").out, `REVIEW:\n${LINE2}\n`);
  for (const args of [["--except", "1,2"], ["--except", "3"], ["--except", "x"], ["--except", "0"]]) {
    const c = run("reply", v, ...args);
    assert.strictEqual(c.status, 2, args.join(" "));
    assert.ok(c.out.startsWith("cannot parse: "), args.join(" "));
  }
  const p = run("reply", verdictFile(PASS));
  assert.strictEqual(p.status, 2);
  assert.ok(p.out.startsWith("cannot parse: "));
});

test("an unknown command, or a missing argument, is refused", () => {
  const v = verdictFile(PASS);
  for (const args of [[], ["show", v], ["check"], ["reply"], ["record", v], ["check", v, "extra"]]) {
    const c = run(...args);
    assert.strictEqual(c.status, 2, args.join(" "));
    assert.ok(c.out.startsWith("cannot parse: "), args.join(" "));
    assert.strictEqual(c.err, "");
  }
});

const EARLIER = [
  { verdict: "a" }, { verdict: "b" },
  { round: 1, verdict: "REQUEST CHANGES", findings: 9, resolved: "x" },
  { round: 1, verdict: "PASS", text: "dup" },
  { round: 2, verdict: "PASS", text: "y" },
];

test("--from copies every earlier entry as it is, and a second run adds nothing", () => {
  const src = walkFile({ item: "N1", review: EARLIER });
  const srcBytes = fs.readFileSync(src);
  const target = walkFile({ item: "N1", review: [] });
  const args = ["record", verdictFile(PASS), target, "--round", "3", "--head", "d4e5f6a", "--from", src];
  assert.strictEqual(run(...args).status, 0);
  const w = readWalk(target);
  assert.strictEqual(w.review.length, 6);
  const texts = w.review.map(r => JSON.stringify(r));
  for (const e of EARLIER) assert.ok(texts.includes(JSON.stringify(e)), JSON.stringify(e));
  assert.strictEqual(w.review.filter(r => r.round === 3).length, 1);
  assert.ok(fs.readFileSync(src).equals(srcBytes));
  const bytes = fs.readFileSync(target);
  assert.strictEqual(run(...args).status, 0);
  assert.ok(fs.readFileSync(target).equals(bytes));
});

test("--from does not copy a round number the target already holds", () => {
  const src = walkFile({ item: "N1", review: EARLIER });
  const mine = { round: 2, verdict: "PASS", text: "mine" };
  const target = walkFile({ item: "N1", review: [mine] });
  assert.strictEqual(run("record", verdictFile(PASS), target, "--round", "3", "--head", "d4e5f6a", "--from", src).status, 0);
  const texts = readWalk(target).review.map(r => JSON.stringify(r));
  assert.ok(texts.includes(JSON.stringify(mine)));
  assert.ok(!texts.includes(JSON.stringify(EARLIER[4])));
  for (const e of EARLIER.slice(0, 4)) assert.ok(texts.includes(JSON.stringify(e)), JSON.stringify(e));
  assert.strictEqual(texts.length, 6);
});

test("non-object entries in review and in findings do not stop a record, and the fix is kept", () => {
  const finding = { level: "blocking", file: "src/a.js", line: 12, what: "the retry loop never stops — a failing upstream hangs the request", fix: "kept" };
  const file = walkFile({ item: "N1", review: [null, "note", { round: 1, verdict: "CHANGES", head: "d4e5f6a", findings: [1, null, finding] }] });
  const c = run("record", verdictFile(CHANGES), file, "--round", "1", "--head", "d4e5f6a");
  assert.strictEqual(c.status, 0);
  const w = readWalk(file);
  assert.ok(w.review.includes(null));
  assert.ok(w.review.includes("note"));
  const r1 = w.review.find(r => r && r.round === 1);
  assert.strictEqual(r1.findings[0].fix, "kept");
});

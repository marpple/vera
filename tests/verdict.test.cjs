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

test("check prints the verdict, the counts, and the place and the first words of every blocking finding", () => {
  const c = run("check", verdictFile(CHANGES));
  assert.strictEqual(c.status, 0);
  assert.strictEqual(c.lines[0], "ok: CHANGES, 2 blocking, 1 non-blocking");
  assert.strictEqual(c.lines[1], "1. src/a.js:12 — the retry loop never stops");
  assert.strictEqual(c.lines[2], "2. test/a.test.js:7 — the test passes without the fix");
  assert.strictEqual(c.lines.length, 3);
  const p = run("check", verdictFile(PASS));
  assert.strictEqual(p.status, 0);
  assert.strictEqual(p.out, "ok: PASS, 0 blocking, 1 non-blocking\n");
});

test("record writes the round into the walkthrough's review and keeps the rest of the file", () => {
  const file = walkFile(base());
  const c = run("record", verdictFile(CHANGES), file, "--round", "1", "--head", "d4e5f6a");
  assert.strictEqual(c.status, 0);
  assert.strictEqual(c.out, run("check", verdictFile(CHANGES)).out.replace("\n", "; rounds 1\n"));
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
    "VERDICT: CHANGES\n[blocking] src/a.js:1 — only this",
    "VERDICT: CHANGES\n[blocking] src/a.js:1 only this",
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

test("a message joined with && is sent only when reply printed one, and is not evaluated by the shell", () => {
  const nasty = "[blocking] src/a.js:1 — the `echo BACKTICK` and $(echo PWNED) and $HOME and 'single' and \"double\" and ; stay text — why — fix it; now";
  const v = verdictFile(CHANGES + "\n" + nasty);
  const go = (...extra) => spawnSync("sh", ["-c", 'a="$1"; b="$2"; c="$3"; shift 3; body=$("$a" "$b" reply "$c" "$@") && printf \'%s\' "$body"', "sh", process.execPath, SCRIPT, v, ...extra], { encoding: "utf8" });
  const direct = run("reply", v).out;
  assert.ok(direct.includes("$(echo PWNED)") && direct.includes("`echo BACKTICK`") && direct.includes("$HOME"));
  const sent = go();
  assert.strictEqual(sent.status, 0);
  assert.strictEqual(sent.stdout, direct.replace(/\n$/, ""));
  const refused = go("--except", "1,2,3");
  assert.notStrictEqual(refused.status, 0);
  assert.strictEqual(refused.stdout, "");
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

test("recording a round replaces only the first entry with that number and keeps the others", () => {
  const second = { round: 1, verdict: "PASS", text: "second reviewer" };
  const r2 = { round: 2, verdict: "PASS", text: "y" };
  const finding = { level: "blocking", file: "src/a.js", line: 12, what: "the retry loop never stops — a failing upstream hangs the request", fix: "kept" };
  const file = walkFile({ item: "N1", review: [{ round: 1, verdict: "CHANGES", head: "d4e5f6a", findings: [finding] }, second, r2] });
  const args = ["record", verdictFile(CHANGES), file, "--round", "1", "--head", "d4e5f6a"];
  assert.strictEqual(run(...args).status, 0);
  const w = readWalk(file);
  assert.strictEqual(w.review.length, 3);
  const texts = w.review.map(r => JSON.stringify(r));
  assert.ok(texts.includes(JSON.stringify(second)));
  assert.ok(texts.includes(JSON.stringify(r2)));
  const fresh = w.review.filter(r => r.verdict === "CHANGES");
  assert.strictEqual(fresh.length, 1);
  assert.strictEqual(fresh[0].findings[0].fix, "kept");
  const bytes = fs.readFileSync(file);
  assert.strictEqual(run(...args).status, 0);
  assert.ok(fs.readFileSync(file).equals(bytes));
});

const readSkill = rel => fs.readFileSync(path.join(__dirname, "..", "skills", "hub", rel), "utf8");

test("the six checks and the answer form live in reviewer.md, and the brief only points to it", () => {
  const reviewer = readSkill("references/reviewer.md"), review = readSkill("references/review.md");
  for (const name of ["Spec fidelity", "Correctness", "Tests (TDD)", "Risk", "Shape", "Walkthrough"]) {
    const re = new RegExp(`^\\d\\. ${name.replace(/[()]/g, "\\$&")}:`, "m");
    assert.match(reviewer, re);
    assert.ok(!re.test(review), `${name} is still in review.md`);
  }
  assert.match(reviewer, /`\[blocking\|non-blocking\] <file>:<line> — <what is wrong> — <why it matters> — <suggested fix>`/);
  assert.match(reviewer, /A script reads your answer/);
  assert.match(reviewer, /That is three ` — ` in every finding: before what is wrong, before why it matters, and before the fix\./);
  assert.match(reviewer, /the script takes the first three as the separators/);
  assert.match(reviewer, /stay exactly as written, in every language/);
  const brief = review.split("## Brief")[1].split("## After the verdict")[0];
  assert.match(brief, /previous blocking findings: the `\[blocking\]` lines of <hub>\/reviews\/<id>-r<the previous review round>\.md<, except the ones the hub set aside: <their places>>\. Since the last review:/);
  assert.match(brief, /Follow <this skill's folder>\/references\/reviewer\.md/);
  assert.match(brief, /answer only `CANNOT READ reviewer\.md`/);
  assert.match(brief, /the verdict line and the tags stay in English, exactly as the form writes them/);
  assert.match(brief, /Read-only: do not commit, push, comment, approve, or edit files\./);
});

test("the form reviewer.md asks for is the form verdict.cjs reads", () => {
  const reviewer = readSkill("references/reviewer.md");
  const block = reviewer.split("## Example")[1].match(/```text\n([\s\S]*?)```/);
  assert.ok(block, "reviewer.md has no text block under Example");
  const r = run("check", verdictFile(block[1]));
  assert.strictEqual(r.status, 0, r.out + r.err);
  assert.strictEqual(r.lines[0], "ok: CHANGES, 1 blocking, 1 non-blocking");
});

test("after the verdict the hub saves it as it came, runs verdict.cjs, and sends what it prints", () => {
  const after = readSkill("references/review.md").split("## After the verdict")[1];
  assert.match(after, /Save the reviewer's answer as it came/);
  assert.match(after, /Never change the saved file afterwards: the script reads it\./);
  assert.ok(after.includes("body=$(cat \"<that file>\") && printf '## %s\\n\\n%s\\n' \"<heading>\" \"$body\" | gh pr comment <n> --body-file -`"));
  assert.match(after, /From the second walkthrough round on \(`k` above 1\), always add `--from <hub>\/walkthroughs\/<id>-w<k-1>\.js`: it copies the earlier rounds the new file lacks and changes nothing when they are there\./);
  assert.match(after, /`record` adds the rounds the file now holds, `; rounds 1, 2`: when a review round before this one is missing from that list, write it back by hand from its saved verdict in `<hub>\/reviews\/`/);
  assert.match(after, /the command is Orca's `orca orchestration reply --id <askId>` \(protocol rule 6c\); with the PR open it is Orca's `send` to the worker \(it reopens a closed worker; protocol rule 11\)/);
  assert.match(after, /nothing blocks the item any more, so go on as in step 3 \(PASS\) and not as below\. Record every overrule as step 5 says, and in the same heredoc set that round's `verdict` in the walkthrough's `review` to `"PASS"`: the page shows a round as being fixed until its verdict is that word, and the overruled findings stay on it with your reasons\. Do not run `record` for that round again, because it would write `"CHANGES"` back\. The saved verdict file stays as it came\./);
  assert.ok(after.includes("set that round's `verdict` in the walkthrough's `review` to `\"PASS\"`"));
  assert.ok(after.includes("Do not run `record` for that round again"));
  assert.match(after, /scripts\/verdict\.cjs record <hub>\/reviews\/<id>-r<n>\.md <hub>\/walkthroughs\/<id>-w<k>\.js --round <n> --head <reviewHead>/);
  assert.match(after, /A `cannot parse:` line gives its reason: read it first\. When it is about the command \(a path, `--round`, `--head`\), correct the command and run it again\./);
  assert.match(after, /use a `node - <<'RV'` heredoc: load the file,/);
  assert.match(after, /scripts\/verdict\.cjs check/);
  assert.match(after, /scripts\/verdict\.cjs reply <hub>\/reviews\/<id>-r<n>\.md/);
  assert.match(after, /`--except`/);
  assert.match(after, /body=\$\(node <this skill's folder>\/scripts\/verdict\.cjs reply <hub>\/reviews\/<id>-r<n>\.md\) && <the reply or send command> --body "\$body"/);
  assert.match(after, /The `&&` sends only when the script printed a `REVIEW:` message/);
  assert.strictEqual(after.split("$(").length - 1, after.split("body=$(").length - 1, "every command substitution is a body=$(...) assignment");
  for (const part of after.split("body=$(").slice(1)) assert.ok(part.includes(") && "), part.slice(0, 80));
  assert.match(after, /A `cannot parse:` line is not a message, so never send it/);
  assert.match(after, /The non-blocking findings stay in the saved verdict, `<hub>\/reviews\/<id>-r<n>\.md`/);
  assert.match(readSkill("references/cleanup.md"), /the non-blocking findings in the saved verdicts under `<hub>\/reviews\/`/);
  assert.match(after, /Both commands print `ok:` with the verdict and the counts \(`record` adds the rounds the file now holds, `; rounds 1, 2`: when a review round before this one is missing from that list, write it back by hand from its saved verdict in `<hub>\/reviews\/`\), then the number, the place and the first words of every blocking finding \(`1\. <file>:<line> — <first words>…`\): the whole text is in the answer you just read, so the script does not print it again\./);
  const gate = after.indexOf("First see whether the developer's language is the PR language");
  assert.ok(gate > 0 && gate < after.indexOf("verdict.cjs record"), "the language condition comes before the record command");
  assert.ok(after.includes("do not run `record`"));
  assert.match(after, /the numbers are the ones `record` or `check` printed, which count only the blocking findings\. The `&&` sends only when the script printed a `REVIEW:` message\. When the script refused, nothing was sent: run it alone and read its line\./);
  assert.match(after, /with `verdict` exactly `"PASS"` or `"CHANGES"` and `level` exactly `"blocking"` or `"non-blocking"`: the page compares these words/);
  assert.match(after, /You read them in the reviewer's answer, and `record` or `check` numbered them, so do not write them again: let the script write the message\./);
  assert.match(after, /`fix` is always yours to write, in the same kind of heredoc, and it is never the reviewer's suggested fix: the page shows it as how the finding was handled\. On a new finding it stays `""`, in a round you write yourself too; the script leaves it empty there and keeps the ones already written/);
});

const TWO = "tests/trimlog.test.cjs:191 — the interrupted-run test enforces the exact-dedup behaviour above and no test covers a legitimate batch that matches the head of log.md, so the C4 loss goes undetected — add a test where a second batch has the same text as the first and assert that no line is missing from log.md";

test("a finding that joins what is wrong and why is read as what and fix", () => {
  const text = `VERDICT: CHANGES\n[blocking] ${TWO}\n[non-blocking] src/a.js:40-44 — the name says nothing — the next reader has to trace it — call it pending\n`;
  const v = verdictFile(text);
  const c = run("check", v);
  assert.strictEqual(c.status, 0);
  assert.strictEqual(c.lines[0], "ok: CHANGES, 1 blocking, 1 non-blocking");
  assert.strictEqual(c.lines[1], "1. tests/trimlog.test.cjs:191 — " + Array.from(TWO.split(" — ")[1]).slice(0, 60).join("") + "…");
  assert.strictEqual(c.lines.length, 2);
  assert.strictEqual(run("reply", v).out, "REVIEW:\n1. " + TWO + "\n");
  const file = walkFile({ item: "N1", round: 1, review: [] });
  const r = run("record", v, file, "--round", "1", "--head", "d4e5f6a");
  assert.strictEqual(r.out, c.out.replace("\n", "; rounds 1\n"));
  const w = readWalk(file);
  assert.deepStrictEqual(w.review[0].findings[0], { level: "blocking", file: "tests/trimlog.test.cjs", line: 191, what: "the interrupted-run test enforces the exact-dedup behaviour above and no test covers a legitimate batch that matches the head of log.md, so the C4 loss goes undetected", fix: "" });
  assert.strictEqual(w.review[0].findings[1].what, "the name says nothing — the next reader has to trace it");
  const bytes = fs.readFileSync(file);
  assert.strictEqual(run("record", v, file, "--round", "1", "--head", "d4e5f6a").status, 0);
  assert.ok(fs.readFileSync(file).equals(bytes));
  w.review[0].findings[0].fix = "Added in 9c1d2e3";
  fs.writeFileSync(file, "window.HUB_WALK = " + JSON.stringify(w, null, 1) + ";\n");
  assert.strictEqual(run("record", v, file, "--round", "1", "--head", "d4e5f6a").status, 0);
  assert.strictEqual(readWalk(file).review[0].findings[0].fix, "Added in 9c1d2e3");
});

test("from the fourth separator on, the rest belongs to the fix", () => {
  const v = verdictFile("VERDICT: CHANGES\n[blocking] src/a.js:1 — a — b — c — d — e\n");
  assert.strictEqual(run("check", v).lines[1], "1. src/a.js:1 — a");
  assert.strictEqual(run("reply", v).out, "REVIEW:\n1. src/a.js:1 — a — b — c — d — e\n");
  const file = walkFile({ item: "N1", round: 1, review: [] });
  assert.strictEqual(run("record", v, file, "--round", "1", "--head", "d4e5f6a").status, 0);
  assert.strictEqual(readWalk(file).review[0].findings[0].what, "a — b");
});

test("check and record print the place and the first words of each blocking finding, and reply prints its text", () => {
  const w60 = "w".repeat(60), w61 = "w".repeat(61);
  const emoji = "a".repeat(59) + "😀😀tail";
  const korean = "가".repeat(61);
  const text = [
    "VERDICT: CHANGES",
    "[blocking] src/a.js:12 — the retry loop never stops — a failing upstream hangs the request — cap it at 3 tries",
    "[blocking] src/a.js:40-44 — the name `tmp` says nothing — the next reader has to trace it — call it `pending`",
    `[blocking] b.js:1 — ${w60} — why — fix`,
    `[blocking] b.js:2 — ${w61} — why — fix`,
    `[blocking] b.js:3 — ${emoji} — why — fix`,
    `[blocking] b.js:4 — ${korean} — why — fix`,
    "[non-blocking] src/b.js:3 — unused import — noise — remove it",
  ].join("\n");
  const v = verdictFile(text);
  const want = [
    "ok: CHANGES, 6 blocking, 1 non-blocking",
    "1. src/a.js:12 — the retry loop never stops",
    "2. src/a.js:40-44 — the name `tmp` says nothing",
    `3. b.js:1 — ${w60}`,
    `4. b.js:2 — ${w60}…`,
    `5. b.js:3 — ${"a".repeat(59)}😀…`,
    `6. b.js:4 — ${"가".repeat(60)}…`,
  ].join("\n") + "\n";
  assert.strictEqual(run("check", v).out, want);
  assert.strictEqual(run("record", v, walkFile(base()), "--round", "1", "--head", "d4e5f6a").out, want.replace("\n", "; rounds 1\n"));
  const r = run("reply", v);
  assert.strictEqual(r.lines[0], "REVIEW:");
  assert.ok(r.lines[1].startsWith("1. src/a.js:12 — the retry loop never stops — "));
  assert.ok(r.lines[2].startsWith("2. src/a.js:40-44 — the name `tmp` says nothing — "));
  assert.ok(r.lines[5].includes(emoji));
  assert.strictEqual(r.lines.length, 7);
});

test("a number names the blocking findings only, in the file's order", () => {
  const v = verdictFile("VERDICT: CHANGES\n[blocking] a.js:5 — first thing — w — f\n[non-blocking] a.js:9 — x — y — z\n[blocking] a.js:5 — second thing — w — f\n");
  assert.deepStrictEqual(run("check", v).lines.slice(1), ["1. a.js:5 — first thing", "2. a.js:5 — second thing"]);
  assert.strictEqual(run("reply", v, "--except", "1").out, "REVIEW:\n2. a.js:5 — second thing — w — f\n");
});

test("the page compares the words the hub is told to write by hand", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "skills", "hub", "templates", "walkthrough.html"), "utf8");
  assert.ok(page.includes('r.verdict === "PASS"'));
  assert.ok(page.includes('f.level === "blocking"'));
});

test("record prints the rounds the walkthrough now holds", () => {
  const v = verdictFile(PASS);
  const args = (file, n, ...x) => ["record", v, file, "--round", String(n), "--head", "d4e5f6a", ...x];
  const first = line => run(...line).lines[0];
  const empty = walkFile(base());
  assert.strictEqual(first(args(empty, 2)), "ok: PASS, 0 blocking, 1 non-blocking; rounds 2");
  const one = walkFile({ item: "N1", review: [{ round: 1, verdict: "PASS", head: "1111111", findings: [] }] });
  assert.strictEqual(first(args(one, 2)), "ok: PASS, 0 blocking, 1 non-blocking; rounds 1, 2");
  assert.strictEqual(first(args(one, 2)), "ok: PASS, 0 blocking, 1 non-blocking; rounds 1, 2");
  const src = walkFile({ item: "N1", review: [{ round: 1, verdict: "PASS", head: "1111111", findings: [] }] });
  const target = walkFile(base());
  assert.strictEqual(first(args(target, 2, "--from", src)), "ok: PASS, 0 blocking, 1 non-blocking; rounds 1, 2");
  assert.strictEqual(first(args(target, 2, "--from", src)), "ok: PASS, 0 blocking, 1 non-blocking; rounds 1, 2");
  assert.ok(!run("check", v).out.includes("rounds"));
  const dup = walkFile({ item: "N1", review: [{ round: 1, verdict: "PASS" }, { round: 1, verdict: "CHANGES" }, { verdict: "PASS", text: "no number" }] });
  assert.strictEqual(first(args(dup, 2)), "ok: PASS, 0 blocking, 1 non-blocking; rounds 1, 1, 2");
});

test("a saved verdict is posted under a heading only when it can be read", () => {
  const file = path.join(tmp(), "r2.md");
  fs.writeFileSync(file, "VERDICT: PASS\n[non-blocking] a.js:1 — 100% — `x` — $(echo NO)\n");
  const cmd = 'body=$(cat "$1") && printf "## %s\\n\\n%s\\n" "$2" "$body"';
  const ok = spawnSync("sh", ["-c", cmd, "sh", file, "Round 2: passed"], { encoding: "utf8" });
  assert.strictEqual(ok.stdout, "## Round 2: passed\n\n" + fs.readFileSync(file, "utf8"));
  const bad = spawnSync("sh", ["-c", cmd, "sh", path.join(path.dirname(file), "nope.md"), "Round 2: passed"], { encoding: "utf8" });
  assert.strictEqual(bad.stdout, "");
  assert.notStrictEqual(bad.status, 0);
});

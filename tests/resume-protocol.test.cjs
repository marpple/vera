"use strict";
// A hub resumed after the worker protocol changed in this skill writes protocol.md again and sends the new text to its
// running workers, so they stop following rules the skill no longer has. scripts/protocolhash.cjs hashes only the parts
// of the skill that protocol.md is written from; state.js records that hash as protocolFrom, so a resume after a change
// elsewhere sends nothing.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const skillDir = path.join(__dirname, "..", "skills", "hub");
const read = f => fs.readFileSync(path.join(skillDir, f), "utf8");
const skill = read("SKILL.md");

// A copy of the skill's scripts and references, so a test can edit a reference and hash again.
function copy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "protohash-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const sub of ["scripts", "references"]) fs.cpSync(path.join(skillDir, sub), path.join(dir, sub), { recursive: true });
  const hash = (...args) => {
    const r = spawnSync(process.execPath, [path.join(dir, "scripts", "protocolhash.cjs"), ...args], { encoding: "utf8" });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const edit = (f, from, to) => {
    const p = path.join(dir, "references", f), text = fs.readFileSync(p, "utf8");
    assert.ok(text.includes(from), `${f} contains ${from}`);
    fs.writeFileSync(p, text.replace(from, to));
  };
  return { dir, hash, edit };
}

const ok = r => { assert.strictEqual(r.code, 0, r.out + r.err); assert.match(r.out, /^[0-9a-f]{40}\n$/); return r.out.trim(); };
const cannot = (r, reason) => {
  assert.strictEqual(r.code, 2, r.out + r.err);
  assert.match(r.out, /^cannot hash: [^\n]+\n$/);
  assert.match(r.out, reason);
  assert.strictEqual(r.err, "");
};

test("protocolhash prints one hash, the same each run, and another one for the Claude app", t => {
  const { hash } = copy(t);
  const orca = ok(hash());
  assert.strictEqual(ok(hash()), orca);
  assert.notStrictEqual(ok(hash("--runtime", "claude-app")), orca);
});

test("protocolhash changes when the protocol block, its instructions, or the walkthrough template changes", t => {
  const { hash, edit } = copy(t);
  let before = ok(hash());
  edit("worker-spec.md", "1. ONE PR.", "1. ONE PR ONLY.");
  assert.notStrictEqual(ok(hash()), before, "the protocol block");
  before = ok(hash());
  edit("worker-spec.md", "Keep it in English; it is agent-to-agent text.", "Keep it in English.");
  assert.notStrictEqual(ok(hash()), before, "the instructions for writing it");
  before = ok(hash());
  edit("walkthrough.md", "  flow: [", "  flow: [ // edited");
  assert.notStrictEqual(ok(hash()), before, "the walkthrough template");
});

test("protocolhash stays the same when only text workers never get changes", t => {
  const { hash, edit } = copy(t);
  const orca = ok(hash()), app = ok(hash("--runtime", "claude-app"));
  edit("worker-spec.md", "## Task part (one per worker)\n", "## Task part (one per worker)\n\nEdited.\n");
  edit("walkthrough.md", "## Check it, then have it reviewed\n", "## Check it, then have it reviewed\n\nEdited.\n");
  edit("claude-app.md", "## Escalations\n", "## Escalations\n\nEdited.\n");
  assert.strictEqual(ok(hash()), orca);
  assert.strictEqual(ok(hash("--runtime", "claude-app")), app);
  edit("claude-app.md", "## Protocol on the Claude app\n", "## Protocol on the Claude app\n\nEdited.\n");
  assert.strictEqual(ok(hash()), orca, "the Orca hash leaves claude-app.md out");
  assert.notStrictEqual(ok(hash("--runtime", "claude-app")), app, "the Claude app hash takes its protocol changes");
});

test("protocolhash prints no hash when a part it hashes is missing or the arguments are wrong", t => {
  const { dir, hash, edit } = copy(t);
  edit("claude-app.md", "## Protocol on the Claude app\n", "## Protocol in the app\n");
  cannot(hash("--runtime", "claude-app"), /Protocol on the Claude app/);
  ok(hash());
  edit("walkthrough.md", "```js\n", "```\n");
  cannot(hash(), /walkthrough\.md/);
  fs.rmSync(path.join(dir, "references", "worker-spec.md"));
  cannot(hash(), /worker-spec\.md/);
  cannot(hash("--runtime", "codex"), /usage/);
  cannot(hash("--runtime"), /usage/);
});

test("state.js carries protocolFrom, empty by default", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read("templates/state.js"), sandbox);
  assert.strictEqual(sandbox.window.HUB_STATE.protocolFrom, "");
});

test("building the folder records protocolFrom from protocolhash.cjs", () => {
  const step5 = skill.match(/\n5\. \*\*Build the folder\.\*\*[^\n]*/);
  assert.ok(step5, "SKILL.md has no step 5");
  assert.ok(step5[0].includes("set `protocolFrom` in `state.js` to the line `node <this skill's folder>/scripts/protocolhash.cjs` prints (with `--runtime claude-app` on the Claude app"), "step 5 sets protocolFrom");
  assert.match(skill, /\| `protocol\.md` \| you, from \[references\/worker-spec\.md\]\(references\/worker-spec\.md\): at step 5, and again on a resume after the protocol changed \|/);
});

test("resume sends a changed protocol before it records it, with the live slots from state.js", () => {
  const m = skill.match(/\n {3}\*\*Resume\*\* an existing hub:\n([\s\S]*?)\n2\. \*\*Read the repo/);
  assert.ok(m, "SKILL.md has no Resume bullets in Start or resume step 1");
  const lines = m[1].split("\n");
  const start = lines.findIndex(l => l.startsWith("   - Protocol"));
  assert.ok(start > lines.findIndex(l => l.includes("orca orchestration worker-list")), "the protocol bullet follows the worker list reconcile");
  const bullet = lines.slice(start, lines.findIndex((l, i) => i > start && l.startsWith("   - "))).join("\n");
  assert.match(bullet, /When it prints the `protocolFrom` in `state\.js`, go on/);
  assert.match(bullet, /a `cannot hash:` line is not a hash/);
  // The Claude app protocol no longer names the hub's session (workers write their messages into their own transcripts).
  assert.match(bullet, /except the autonomy level, which comes from `state\.js`/);
  // Live workers include support workers waiting with an open PR: they follow rule 6f when the hub reopens them.
  assert.match(bullet, /each live worker: a `workers` row whose tone is not `done` and whose dispatch is not `released` \(on the Claude app, whose session is not archived\), including a `support` worker waiting with its PR open/);
  const order = ["`<hub>/protocol.new.md`", "`cmp -s <hub>/protocol.new.md <hub>/protocol.md`", "`send` each live worker",
    "No reply needed", "replace the protocol part of every live worker's `specs/<id>.md`", "`mv <hub>/protocol.new.md <hub>/protocol.md`", "set `protocolFrom` to the hash it printed"];
  const at = order.map(s => bullet.indexOf(s));
  at.forEach((n, i) => assert.ok(n >= 0, `the protocol bullet says ${order[i]}`));
  assert.deepStrictEqual([...at].sort((a, b) => a - b), at, "send, then replace, then record: a resume cut short sends again");
});

// A plugin update followed by /reload-plugins changes the skill under a running hub. A compaction is when the hub reads
// the skill again, so it is where the hub can notice: one command when nothing changed, the resume steps when it did.
test("after a compaction the hub checks the protocol hash, and resumes fully only when the skill changed or a resume was cut short", () => {
  const m = skill.match(/\*\*After a compaction\.\*\*[^\n]*/);
  assert.ok(m, "SKILL.md has no After a compaction paragraph");
  const order = ["run the inbox reconcile", "Then run `protocolhash.cjs` as step 5 does",
    // hashForm too: protocolhash.cjs does not see templates/, so a resume cut short after it copied a new diffhash.cjs would otherwise be skipped.
    "When it prints the `protocolFrom` in `state.js`, `state.js` has `hashForm: 2`, and `<hub>/protocol.new.md` does not exist, skip the rest of step 1",
    "Otherwise the skill changed, or a resume was cut short: do the Resume bullets of step 1 now, except the one about a review that ran in the old session",
    "Do not restart a review"];
  const at = order.map(s => m[0].indexOf(s));
  at.forEach((n, i) => assert.ok(n >= 0, `the paragraph says: ${order[i]}`));
  assert.deepStrictEqual([...at].sort((a, b) => a - b), at);
  // The paragraph must stay within what a compaction keeps of this file.
  assert.ok(skill.indexOf("Otherwise the skill changed") < skill.indexOf("## Loop"));
});

// A worktree written by an older version of this skill lacks the rules added since (the gh pr merge refusal). write
// takes out what the earlier write added before it writes, so running it again at the same level brings them up to date.
test("resume writes each live worker's allow list again", () => {
  const m = skill.match(/\n {3}\*\*Resume\*\* an existing hub:\n([\s\S]*?)\n2\. \*\*Read the repo/);
  const lines = m[1].split("\n");
  const bullet = lines.find(l => l.startsWith("   - Allow list"));
  assert.ok(bullet, "Resume has no allow list bullet");
  assert.ok(lines.indexOf(bullet) > lines.findIndex(l => l.includes("orca orchestration worker-list")), "it follows the worker list reconcile");
  assert.match(bullet, /At `medium` or `high`, run `allow\.cjs write <its path> <level>` again for each live worker/);
  assert.match(bullet, /`not written:`/);
  assert.match(bullet, /live worker \(the protocol bullet says which\) whose worktree still exists/);
  // write removes the old rules first, so a write that then fails leaves a running worker without them.
  assert.match(bullet, /When it exits 1, or prints `refused:` or `not valid JSON settings`[^\n]*tell the developer, and go on to the next worker/);
});

test("protocol.md keeps the live autonomy level and hub session", () => {
  assert.match(skill, /set `autonomy`, set the level in rule 13 of `protocol\.md` and of each live worker's `specs\/<id>\.md` \(a worker re-reads its spec after its own compaction\)/);
  // Workers write their VERA messages into their own transcripts, so a new hub session only records its id.
  assert.match(read("references/claude-app.md"), /set `hubSession` \(workers write their messages into their own transcripts, so they need no new id\)/);
});

test("the old-layout upgrade records protocolFrom when it replaces protocol.md", () => {
  assert.match(read("references/upgrade.md"), /3\. \*\*protocol\.md\.\*\* Replace it [^\n]*set `protocolFrom` as SKILL\.md step 5 does/);
});

// Keeps the hub instructions portable: every path they name exists, nothing
// in them holds only on the author's machine, and the language rules stay in place.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const skillDir = path.join(root, "skills", "hub");
const refDir = path.join(skillDir, "references");
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const EXAMPLE_NOTE = "Quoted strings in this file are examples, in English";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function docs() {
  const refs = fs.readdirSync(refDir).filter((n) => n.endsWith(".md")).map((n) => path.join(refDir, n));
  return [path.join(skillDir, "SKILL.md"), ...refs];
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

function frontmatter() {
  const m = read(path.join(skillDir, "SKILL.md")).match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "SKILL.md has no frontmatter");
  const fields = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z-]+): (.+)$/);
    assert.ok(kv, `frontmatter line does not parse: ${line}`);
    fields[kv[1]] = kv[2];
  }
  return fields;
}

test("every path the instructions name exists", () => {
  const missing = [];
  for (const file of docs()) {
    const text = read(file);
    for (const [, target] of text.matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(target)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(file), target))) missing.push(`${path.relative(root, file)}: ${target}`);
    }
    for (const [, target] of text.matchAll(/(?<![\w/<.-])((?:references|templates|scripts)\/[\w.-]+\.[a-z]+)/g)) {
      if (!fs.existsSync(path.join(skillDir, target))) missing.push(`${path.relative(root, file)}: ${target}`);
    }
  }
  assert.deepStrictEqual(missing, []);
});

test("nothing under skills/ holds only on the author's machine", () => {
  const found = [];
  for (const file of walk(path.join(root, "skills"))) {
    const rel = path.relative(root, file);
    read(file).split("\n").forEach((line, i) => {
      for (const [p] of line.matchAll(/\/(?:Users|home)\/[^\s"'`)]+/g)) {
        if (rel === "skills/hub/templates/state.js" && p.startsWith("/Users/me/")) continue;
        found.push(`${rel}:${i + 1}: ${p}`);
      }
      for (const [p] of line.matchAll(/(?:~|\$HOME|\$\{HOME\})\/[^\s"'`)]*/g)) {
        if (rel === "skills/hub/SKILL.md" && p === "~/orca/workspaces/<repo>") continue; // Orca's documented default
        found.push(`${rel}:${i + 1}: ${p}`);
      }
      for (const [w] of line.matchAll(/noslop|ddevkim|jaemin/gi)) found.push(`${rel}:${i + 1}: ${w}`);
    });
  }
  assert.deepStrictEqual(found, []);
});

test("SKILL.md has the language section and it names lang", () => {
  const text = read(path.join(skillDir, "SKILL.md"));
  const section = text.match(/\n## Language\n([\s\S]*?)(?=\n## |$)/);
  assert.ok(section, "SKILL.md has no '## Language' section");
  assert.match(section[1], /`lang`/);
  assert.match(section[1], /"ko"/);
  assert.match(section[1], /"en"/);
});

// The skill is written for developers everywhere: its examples are English, and Korean lives only in the pages' ko tables.
test("SKILL.md and the references hold no Hangul, and say their quoted strings are English examples", () => {
  const withHangul = docs().filter((f) => HANGUL.test(read(f))).map((f) => path.relative(root, f));
  assert.deepStrictEqual(withHangul, []);
  const language = read(path.join(skillDir, "SKILL.md")).match(/\n## Language\n([\s\S]*?)(?=\n## )/)[1];
  assert.ok(language.includes(EXAMPLE_NOTE), "the Language section does not say the quoted strings are English examples");
  assert.match(language, /`ko` tables/, "the Language section does not say where the Korean labels are");
  const quoting = fs.readdirSync(refDir).filter((n) => n.endsWith(".md")).filter((n) => !read(path.join(refDir, n)).includes(EXAMPLE_NOTE));
  assert.deepStrictEqual(quoting, [], "every reference carries the note on its example strings");
});

test("a new hub's sample state.js is in English", () => {
  const src = read(path.join(skillDir, "templates", "state.js"));
  assert.doesNotMatch(src, HANGUL, "Hangul in templates/state.js");
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(src, sandbox);
  assert.strictEqual(sandbox.window.HUB_STATE.lang, "en");
});

test("a state.js without lang still renders in Korean, and the hub writes ko for a Korean-speaking developer", () => {
  const language = read(path.join(skillDir, "SKILL.md")).match(/\n## Language\n([\s\S]*?)(?=\n## )/)[1];
  assert.match(language, /`"ko"` when the developer writes Korean, `"en"` for any other language/);
  assert.match(language, /a `state\.js` without it renders in Korean/);
  for (const page of ["dashboard.html", "walkthrough.html"]) {
    assert.match(read(path.join(skillDir, "templates", page)), /HUB_STATE\.lang picks one \("ko" when absent or unknown\)/, page);
  }
});

test("the frontmatter parses, keeps the skill direct-invocation only, and is language-neutral", () => {
  const f = frontmatter();
  assert.strictEqual(f.name, "hub");
  assert.match(f.description, /^Use when the developer invokes \/vera:hub or \$vera:hub /);
  assert.match(read(path.join(skillDir, "SKILL.md")), /^# Vera hub$/m);
  assert.ok(f.description && f.description.trim(), "description is empty");
  assert.strictEqual(f["disable-model-invocation"], "true");
  assert.doesNotMatch(f.description, HANGUL, "description relies on Korean trigger words");
});

test("the protocol slots the language section names exist in worker-spec.md", () => {
  const section = read(path.join(skillDir, "SKILL.md")).match(/\n## Language\n([\s\S]*?)(?=\n## )/)[1];
  const spec = read(path.join(refDir, "worker-spec.md"));
  const slots = [...section.matchAll(/`(<[^`>]*language[^`>]*>)`/g)].map((m) => m[1]);
  assert.ok(slots.length > 0, "the language section names no protocol slot");
  assert.deepStrictEqual(slots.filter((s) => !spec.includes(s)), []);
});

test("dashboard.md's stage words are the page's en phase and stage labels", () => {
  const html = read(path.join(skillDir, "templates", "dashboard.html"));
  const doc = read(path.join(refDir, "dashboard.md"));
  const en = html.slice(html.indexOf("\n  en: {"));
  const phases = JSON.parse(en.match(/phases: (\[[^\]]*\])/)[1]);
  assert.ok(doc.includes(`stages**: ${phases.join(", ")} (the \`ko\` table`), "the phase labels");
  const stage = [...en.match(/stage: \{([^}]*)\}/)[1].matchAll(/: "([^"]*)"/g)].map((m) => m[1]);
  assert.ok(doc.includes(`${stage.join(" → ")} (the \`ko\` table`), "the stage strip labels");
});

const STOP_LIST = ["drops a column or table", "spending money", "secrets or permission scopes",
  "unconditional force push", "`--admin`", "three rounds"];

test("SKILL.md has the autonomy section with its three levels and the six stops", () => {
  const section = read(path.join(skillDir, "SKILL.md")).match(/\n## Autonomy levels\n([\s\S]*?)(?=\n## )/);
  assert.ok(section, "SKILL.md has no '## Autonomy levels' section");
  for (const level of ["`low`", "`medium`", "`high`"]) assert.ok(section[1].includes(level), `no ${level}`);
  assert.deepStrictEqual(STOP_LIST.filter((s) => !section[1].includes(s)), [], "stop list entries missing");
});

test("the worker protocol has the autonomy level slot", () => {
  const protocol = read(path.join(refDir, "worker-spec.md")).match(/## Hub protocol[\s\S]*?\n```/)[0];
  assert.match(protocol, /AUTONOMY: <low \| medium \| high>/);
});

test("cleanup removes and checks the allow list", () => {
  const text = read(path.join(refDir, "cleanup.md"));
  assert.match(text, /allow\.cjs remove/);
  assert.match(text, /allow\.cjs check/);
});

test("the docs name the English labels of both pages", () => {
  const html = read(path.join(skillDir, "templates", "walkthrough.html"));
  const en = JSON.parse(html.match(/en: \{[\s\S]*?steps: (\[[^\]]*\])/)[1]);
  assert.ok(read(path.join(refDir, "walkthrough.md")).includes(en.join(" → ")), "walkthrough.md lacks the en step labels");
  const language = read(path.join(skillDir, "SKILL.md")).match(/\n## Language\n([\s\S]*?)(?=\n## )/)[1];
  assert.match(language, /`templates\/dashboard\.html`[\s\S]*`templates\/walkthrough\.html`/);
});

test("dashboard.md's to-do, ask, and needs rows say how the list differs by autonomy level", () => {
  const rows = read(path.join(refDir, "dashboard.md")).split("\n");
  for (const start of ["| **To-do list**", "| `ask` |", "| `needs` |"]) {
    const row = rows.find((l) => l.startsWith(start));
    assert.ok(row, `no row ${start}`);
    assert.match(row, /`medium`[\s\S]*`high`/, `${start} row does not name the levels`);
  }
});

const section = (text, heading) => (text.match(new RegExp(`\\n## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`)) || [])[1] || "";

test("SKILL.md builds one sidebar tree: a parent recorded with its old name, workers re-parented under it", () => {
  const start = section(read(path.join(skillDir, "SKILL.md")), "Start or resume");
  assert.match(start, /`hubWorktreeOldName`/, "no hubWorktreeOldName in Start or resume");
  assert.match(start, /`isMainWorktree: true`/, "does not say how the main workspace is found");
  assert.match(start, /orca worktree set --worktree path:<worker path> --parent-worktree path:<hubWorktree>/,
    "no re-parent command for a top-level worker");
  assert.doesNotMatch(start, /use `new-top-level` and log it/, "accepts top-level workers as the final state");
});

test("resume never records the hub's own name as the parent's old name", () => {
  const start = section(read(path.join(skillDir, "SKILL.md")), "Start or resume");
  assert.match(start, /a resume never records/, "step 5 records the old name on every pass");
  assert.match(start, /`hubWorktree` set: only re-parent its live workers/, "resume re-runs step 5 on a renamed parent");
  assert.doesNotMatch(start, /set the parent as in step 5 and re-parent/, "resume re-records the parent's current name");
  assert.match(start, /name already has a hub's `<Hub> · <feature>` form/, "a second hub would record the first hub's name");
});

test("cleanup restores the parent's old name when the hub closes, and upgrade sets the parent", () => {
  const closing = section(read(path.join(refDir, "cleanup.md")), "Closing the hub");
  assert.match(closing, /`hubWorktreeOldName`/, "Closing the hub does not restore the old name");
  assert.match(closing, /when the developer closes the hub early/, "the early-close path is not covered");
  assert.match(read(path.join(refDir, "upgrade.md")), /`hubWorktreeOldName`/, "upgrade.md lacks the line for an older hub");
});

test("state.js carries hubWorktreeOldName beside hubWorktree, empty by default", () => {
  const vm = require("node:vm");
  const sandbox = { window: {} };
  vm.runInNewContext(read(path.join(skillDir, "templates", "state.js")), sandbox);
  assert.strictEqual(sandbox.window.HUB_STATE.hubWorktreeOldName, "");
  const keys = Object.keys(sandbox.window.HUB_STATE);
  assert.strictEqual(keys.indexOf("hubWorktreeOldName"), keys.indexOf("hubWorktree") + 1);
});

const autonomy0 = () => section(read(path.join(skillDir, "SKILL.md")), "Autonomy levels");

test("the push rules name their exact forms and the allow list names its limits", () => {
  const protocol = read(path.join(refDir, "worker-spec.md"));
  const rule = (n) => protocol.split("\n").find((l) => l.startsWith(`${n}. `)) || "";
  assert.match(rule(11), /Push \(`git push`\)/, "rule 11 does not name the push form");
  assert.match(rule(13), /upstream/, "rule 13 does not say the bare push needs the upstream set first");
  assert.match(rule(13), /`\+<ref>` are asked or refused/, "rule 13 must say other push forms are asked or refused");
  assert.match(rule(13), /unless <the developer>'s own settings ask/, "rule 13 must not promise no prompt unconditionally");
  assert.match(autonomy0(), /ask and deny rules outrank allow from any settings file/, "the allow list must say user ask or deny rules still prompt");
  assert.match(autonomy0(), /never edits user settings/);
  const autonomy = section(read(path.join(skillDir, "SKILL.md")), "Autonomy levels");
  assert.match(autonomy, /`\+<ref>` are asked or refused/);
  assert.doesNotMatch(autonomy, /`\+<ref>` are refused/);
  assert.match(autonomy, /"don't ask again" answer in a worker terminal is stored by Claude Code for the main checkout and outlives the worktree/,
    "the allow-list paragraph does not warn about a stored answer");
});

test("the hub records whether the parent's name was automatic and asks when it cannot give a name back", () => {
  const vm = require("node:vm");
  const sandbox = { window: {} };
  vm.runInNewContext(read(path.join(skillDir, "templates", "state.js")), sandbox);
  const keys = Object.keys(sandbox.window.HUB_STATE);
  assert.strictEqual(sandbox.window.HUB_STATE.hubWorktreeOldNameMode, "");
  assert.strictEqual(keys.indexOf("hubWorktreeOldNameMode"), keys.indexOf("hubWorktreeOldName") + 1);
  const start = section(read(path.join(skillDir, "SKILL.md")), "Start or resume");
  assert.match(start, /`hubWorktreeOldNameMode` \(the mode\)/, "step 5 does not record the name mode");
  assert.match(start, /rename it again when its name differs from the hub's/, "resume leaves an unrenamed parent");
  const closing = section(read(path.join(refDir, "cleanup.md")), "Closing the hub");
  assert.match(closing, /no command returns a workspace to its automatic name/, "the close hides that an automatic name comes back fixed");
  assert.match(closing, /Otherwise, if the parent still carries the hub's name: ask the developer which name to give back/);
  assert.match(closing, /`--workspace-status`/, "the close does not say what happens to the parent's board status");
  assert.match(read(path.join(refDir, "upgrade.md")), /an existing `hubWorktree` is kept/);
});

test("step 5 reads and records the parent's name in one edit before it renames, once per hub folder", () => {
  const start = section(read(path.join(skillDir, "SKILL.md")), "Start or resume");
  const steps = ["1. Find the parent:", "2. Read that row's `displayName` and `displayNameMode`", "3. A parent whose name already has a hub's",
    "4. Write `hubWorktree`", "5. Only then rename:"].map((s) => start.indexOf(s));
  assert.ok(steps.every((i) => i >= 0), `a sub-step is missing: ${steps}`);
  assert.deepStrictEqual([...steps].sort((a, b) => a - b), steps, "the sub-steps are out of order");
  assert.match(start, /Write `hubWorktree` \(the path\), `hubWorktreeOldName` \(the name\), and `hubWorktreeOldNameMode` \(the mode\) into `state\.js` in one edit/);
  assert.match(start, /This recording happens exactly once per hub folder: on a new hub, or on an upgrade whose `hubWorktree` was ""; a resume never records\./);
  assert.doesNotMatch(start, /only while `hubWorktree` is still ""/, "the guard follows the store");
  const vm = require("node:vm");
  const sandbox = { window: {} };
  vm.runInNewContext(read(path.join(skillDir, "templates", "state.js")), sandbox);
  assert.strictEqual(sandbox.window.HUB_STATE.hubWorktree, "", "a fresh hub folder must start with an empty hubWorktree");
});

test("the close leaves a parent another open hub still shows under", () => {
  const closing = section(read(path.join(refDir, "cleanup.md")), "Closing the hub");
  assert.match(closing, /another open hub records the same `hubWorktree`/, "the close must check other hubs on the same parent");
  assert.match(closing, /Otherwise, if the parent still carries the hub's name: ask/);
  const up = read(path.join(refDir, "upgrade.md"));
  assert.match(up, /`hubWorktree`, `hubWorktreeOldName`, and `hubWorktreeOldNameMode`/, "upgrade step 5 must name all three fields");
  assert.match(up, /sub-steps 1-4 are skipped/);
});

test("Codex workers get the allow list, push only in the forms their prefix rules can name, and report refusals", () => {
  const autonomy = section(read(path.join(skillDir, "SKILL.md")), "Autonomy levels");
  assert.doesNotMatch(autonomy, /Codex workers keep prompting/, "the allow list still says Codex gets nothing");
  assert.match(autonomy, /`<worktree>\/\.codex\/rules\/vera-hub\.rules`/);
  assert.match(autonomy, /Codex refuses a `prompt` command instead of asking/);
  assert.doesNotMatch(section(read(path.join(skillDir, "SKILL.md")), "Start or resume"), /with a Claude worker, create the worktree first/,
    "step 6 writes the allow list for Claude workers only");
  const rule13 = read(path.join(refDir, "worker-spec.md")).split("\n").find((l) => l.startsWith("13. ")) || "";
  assert.match(rule13, /As a Codex worker[^.]*`git push -u origin HEAD` in place of the bare `git push` in rules 6d, 6e and 11, and `git push --force-with-lease` after a rebase/);
  assert.match(read(path.join(refDir, "cleanup.md")), /':!\.codex\/rules\/vera-hub\.rules'/);
});

test("the Codex rules are described as prefixes that also allow what follows, and refusals go to the developer", () => {
  const autonomy = section(read(path.join(skillDir, "SKILL.md")), "Autonomy levels");
  const row = autonomy.split("\n").find((l) => l.startsWith("| Worker permission prompts")) || "";
  assert.match(row, /Codex[^|]*allow rules also cover anything appended to these forms/, "the table promises exact forms to Codex workers");
  assert.match(row, /guard rules cover fewer forms than Claude's/);
  assert.match(row, /the bare `git push` is not pre-allowed for a Codex worker/, "the table lists the bare push as pre-allowed for Codex");
  assert.match(row, /Codex[^|]*a relative `rm` runs because the sandbox or the bypass lets it, not because of an allow rule/,
    "the table says Codex pre-allows rm");
  const rule13 = read(path.join(refDir, "worker-spec.md")).split("\n").find((l) => l.startsWith("13. ")) || "";
  assert.match(rule13, /Codex[^.]*a relative `rm` runs because the sandbox or the bypass lets it, not because of an allow rule/,
    "rule 13 says Codex pre-allows rm");
  assert.doesNotMatch(rule13, /Every other push form asks <the developer>/, "rule 13 says every push form asks, which a Codex worker under bypass does not get");
  assert.match(rule13, /Codex[^.]*allow rules also cover anything appended to these forms/);
  assert.match(rule13, /`git push origin feat\/x`/, "rule 13 does not show a push form that runs unasked under bypass");
  const question = read(path.join(skillDir, "SKILL.md")).split("\n").find((l) => l.startsWith("| `question` from a worker")) || "";
  assert.match(question, /Codex policy refusal[^|]*the command and why/);
  assert.match(question, /never replies with another form of the refused command/);
});

test("the allow list says each half is written on its own", () => {
  const autonomy = section(read(path.join(skillDir, "SKILL.md")), "Autonomy levels");
  assert.doesNotMatch(autonomy, /nothing was written, and that worker keeps its prompts/, "the old all-or-nothing refusal is still documented");
  assert.match(autonomy, /writes each half on its own/);
  assert.match(autonomy, /tracks `\.claude\/settings\.local\.json`/);
  assert.match(autonomy, /exits 1 only when it wrote neither half/);
  assert.match(autonomy, /a symlink in one of its paths/, "the per-half skip does not name a symlink");
  assert.match(autonomy, /settings file that is not valid JSON/, "the per-half skip does not name broken JSON");
});

test("the page owner is the gh login of whoever runs the hub, never the repo owner", () => {
  const skill = read(path.join(skillDir, "SKILL.md"));
  const step5 = skill.match(/\n5\. \*\*Build the folder\.\*\*[^\n]*/);
  assert.ok(step5, "SKILL.md has no step 5");
  assert.match(step5[0], /`owner` from `gh api user -q \.login`/);
  assert.match(step5[0], /never the repo's owner/);
  assert.match(read(path.join(refDir, "dashboard.md")), /`owner`: the `gh api user -q \.login` of whoever runs the hub/);
  assert.match(read(path.join(refDir, "walkthrough.md")), /owner: "<state\.js owner>"/);
});

// After an auto-compaction Claude Code re-attaches only the first 5,000 tokens of a skill: https://code.claude.com/docs/en/skills
test("the hub is told to read the whole skill again after a compaction, in the part a compaction keeps", () => {
  const skill = read(path.join(skillDir, "SKILL.md"));
  const at = skill.indexOf("**After a compaction.**");
  assert.ok(at >= 0, "SKILL.md has no '**After a compaction.**' paragraph");
  const loop = skill.indexOf("\n## Loop");
  assert.ok(loop >= 0, "SKILL.md has no '## Loop' heading");
  assert.ok(at < 4000, `the compaction paragraph starts at ${at}, beyond the first 4,000 characters a compaction keeps`);
  assert.ok(at < loop, "the compaction paragraph comes after the Loop heading");
  const paragraph = skill.slice(at).split("\n\n")[0];
  // 5,000 re-attached tokens are at least 15,000 characters at 3 characters per token, so 6,000 leaves a wide margin.
  assert.ok(at + paragraph.length < 6000, `the compaction paragraph ends at ${at + paragraph.length}, beyond the first 6,000 characters a compaction keeps`);
  assert.match(paragraph, /`state\.js`/, "the paragraph does not name state.js");
  assert.match(paragraph, /`lastMsgId`/, "the paragraph does not name lastMsgId");
  assert.match(paragraph, /this skill's folder/, "the paragraph does not say where to read the file from");
  assert.match(paragraph, /\breview\b/, "the paragraph does not mention the review");
  assert.match(paragraph, /not restart/, "the paragraph does not tell the hub to leave a running review alone");
  // 5,000 tokens at up to 4.5 characters per token (plain English): the safe bound is the larger one.
  assert.ok(loop > 22500, `the Loop heading starts at ${loop}, within 22,500 characters (5,000 tokens at 4.5 characters per token), so a compaction may keep it: the compaction note can be reconsidered`);
});

// "Approve, but rename it" is the answer a hub most easily reads as a plain approval: it merges and the comment is lost.
test("an approval that carries a comment is read by what the comment asks for", () => {
  const merging = fs.readFileSync(path.join(__dirname, "..", "skills", "hub", "references", "merging.md"), "utf8");
  const walk = fs.readFileSync(path.join(__dirname, "..", "skills", "hub", "references", "walkthrough.md"), "utf8");
  const approval = merging.slice(merging.indexOf("## Approval"), merging.indexOf("## At High"));
  assert.match(approval, /An approval that carries a comment[^\n]*the comment is never dropped/);
  assert.match(approval, /or you cannot tell whether they mean now or later: it is not an approval/);
  assert.match(approval, /Work for later[^\n]*the approval counts\. Log the comment in their words and list it under follow-ups/);
  assert.match(approval, /A question: answer it from the code, then ask for the approval again/);
  assert.match(walk, /An approval that carries a comment is read as in \[merging\.md\]\(merging\.md\), "Approval": a change they want now is \*\*Changes\*\* below, not \*\*Approved\*\*/);
});

// Measured with live workers on Orca 1.4.271. After `allow.cjs write` in a running worker's worktree, a Claude Code worker
// was refused `gh pr merge --help` on its next try, while a Codex worker still ran it; a Codex worker started after the
// write was refused. And `send` to a settled or stopped worker answered with a new dispatch id, whose old id
// `worker-release` would not close.
test("the skill says when rewritten rules reach a running worker, and to record the dispatch id a send returns", () => {
  const skill = fs.readFileSync(path.join(__dirname, "..", "skills", "hub", "SKILL.md"), "utf8");
  const cleanup = fs.readFileSync(path.join(__dirname, "..", "skills", "hub", "references", "cleanup.md"), "utf8");
  assert.match(skill, /reaches a Claude Code worker at once, and a Codex worker only when its session next starts/);
  const bullet = skill.split("\n").find(l => l.startsWith("- `send` to a worker that already sent `worker_done`"));
  assert.ok(bullet, "the Loop has no bullet about the dispatch id a send returns");
  assert.ok(skill.indexOf(bullet) > skill.indexOf("## Loop"));
  assert.match(bullet, /`delivery` `follow_up` \(the same terminal\) or `reopened` \(a new one\) and gives a new `dispatchId`\. Write that id into the worker's `dispatch` in `state\.js` right away/);
  assert.match(bullet, /`worker-release` of it answers `retained`, `ownership_transferred` and closes nothing/);
  assert.match(bullet, /`ok: false` \(`start_failed`\) means the worker did not reopen/);
  assert.match(cleanup, /`retained` with `ownership_transferred` means the row holds an id a later `send` replaced/);
});

// From an independent audit of the instructions and the guards.
test("the merge preflight hashes, checks and merges one commit, taken from git and not from a worker", () => {
  const merging = fs.readFileSync(path.join(__dirname, "..", "skills", "hub", "references", "merging.md"), "utf8");
  assert.match(merging, /git -C <repo path> rev-parse origin\/<head-branch>\s+# S: must equal headRefOid above/);
  assert.match(merging, /<the changed-lines hash at S, review\.md>/);
  assert.match(merging, /Take it from `git rev-parse` here, never from a worker's message/);
  assert.match(merging, /--match-head-commit <S>/);
  assert.doesNotMatch(merging, /<approved head>/);
});

test("the hub runs the hash and the walkthrough check from the skill's folder, not from the folder workers write in", () => {
  const dir = path.join(__dirname, "..", "skills", "hub", "references");
  const review = fs.readFileSync(path.join(dir, "review.md"), "utf8"), walk = fs.readFileSync(path.join(dir, "walkthrough.md"), "utf8");
  assert.match(review, /node <this skill's folder>\/templates\/diffhash\.cjs <dir> origin\/<base> <head>/);
  assert.match(review, /Run this skill's copy, never `<hub>\/diffhash\.cjs`/);
  assert.match(walk, /then `node <this skill's folder>\/templates\/walkcheck\.cjs <hub>\/walkthroughs/);
});

test("a developer's change to an approved PR has a message, a worker rule, and an item state", () => {
  const dir = path.join(__dirname, "..", "skills", "hub", "references");
  const merging = fs.readFileSync(path.join(dir, "merging.md"), "utf8"), spec = fs.readFileSync(path.join(dir, "worker-spec.md"), "utf8");
  assert.match(merging, /Set the item `pr`, phases 6, and `send` the worker `CHANGES: <each change, with file:line>` \(protocol rule 6c\)/);
  assert.match(spec, /`CHANGES: <list>`[^\n]*After `APPROVED` it comes by `send`: make each change test-first, push \(`git push`\), wait for green CI, write the after-approval round \(f\), and send worker_done with "follow-up: changes"/);
  // The worker's baseline moves with each after-approval round, as the hub's reviewedDiff does.
  assert.match(spec, /After each round you write under this rule, keep the hash at that round's head in its place/);
});

test("a hash the resume could not convert is reviewed, not sent back for a round", () => {
  const skill = fs.readFileSync(path.join(__dirname, "..", "skills", "hub", "SKILL.md"), "utf8");
  const bullet = skill.split("\n").find(l => l.startsWith("   - Hash form"));
  assert.match(bullet, /leave the item's hashes and set its `reviewPending: true`/);
  assert.match(bullet, /If the hash you kept after APPROVED already equals what the command without --v1 prints, there is nothing to do/);
  assert.match(skill, /7\. A PR that changes what guards the run or the repo: CI workflows/);
});

// A hub once asked "start the batch merge?" and merged into a branch that deploys to production by itself, before the
// check that repo requires. The question never said what the merge would set off. Each repo requires something
// different before a merge, and many nothing, so the hub says only what the repo's own documents say.
test("a merge question opens with what the merge sets off and the steps the repo requires that are not yet done", () => {
  const skill = read(path.join(skillDir, "SKILL.md"));
  const merging = read(path.join(refDir, "merging.md"));
  const dashboard = read(path.join(refDir, "dashboard.md"));
  const step2 = skill.split("\n").find((l) => l.startsWith("2. **Read the repo, then capture the spec.**"));
  assert.match(step2, /what a merge into the base branch sets off[^\n]*what the repo requires before a merge/);
  assert.match(step2, /write `unknown`, never a guess/);
  const step3 = skill.slice(skill.indexOf("3. **Confirm the spec and the standing choices.**"), skill.indexOf("4. **Plan items**"));
  assert.match(step3, /does a merge into `<base>` deploy by itself, and what must be done before one/);
  assert.match(section(skill, "Autonomy levels"), /8\. A merge while a step the repo requires before a merge is one the developer has not said is done/);
  const sets = section(merging, "What a merge sets off");
  assert.ok(sets, "merging.md has no '## What a merge sets off' section");
  assert.match(sets, /Every message that asks for a merge or offers one, for one item or many, opens with both/);
  assert.match(sets, /the question is about that step first and the merge second/);
  assert.match(sets, /say only what this repo's documents and the developer's answer say, in their words, and never add a step of your own/);
  assert.match(sets, /A repo that requires nothing gets no such line and no question about one/);
  assert.match(sets, /A step is done only when the developer says so/);
  assert.match(sets, /the step is open again/);
  assert.match(step3, /An answer of nothing is written as `none`/);
  const approval = merging.slice(merging.indexOf("## Approval"), merging.indexOf("## At High"));
  assert.match(approval, /or before what the merge sets off and the required steps not yet done were said/);
  assert.match(approval, /An answer to an offer of yours that left them out[^\n]*is not approval either/);
  const ask = dashboard.split("\n").find((l) => l.startsWith("| `ask` |"));
  assert.match(ask, /a merge approval with a required step not done/);
});

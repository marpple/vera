"use strict";
// AGENTS.md is the contributors' guide that both Claude Code (through CLAUDE.md) and Codex read. These tests keep the
// paths it names real, so it does not send an agent to a file that moved.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");

test("CLAUDE.md only imports AGENTS.md", () => {
  assert.strictEqual(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
});

test("every repo path AGENTS.md names exists", () => {
  const paths = [...agents.matchAll(/`([^`\s]+)`/g)].map(m => m[1])
    .filter(p => /^(\.claude-plugin|skills|tests|README\.md)(\/|$)/.test(p));
  assert.ok(paths.length >= 5, `AGENTS.md names repo paths: ${paths.join(", ")}`);
  for (const p of paths) assert.ok(fs.existsSync(path.join(root, p)), `AGENTS.md names ${p}, which does not exist`);
});

test("AGENTS.md names the check command and the Node versions CI uses", () => {
  const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  const runs = [...ci.matchAll(/- run: (.+)/g)].map(m => m[1].trim());
  assert.deepStrictEqual(runs, ["node --test"], "ci.yml runs one command; AGENTS.md says which");
  assert.ok(agents.includes("`node --test`"), "AGENTS.md names node --test");
  const matrix = ci.match(/node: \[([^\]]+)\]/);
  assert.ok(matrix && ci.includes("node-version: ${{ matrix.node }}"), "ci.yml runs a matrix of Node versions");
  const nodes = [...matrix[1].matchAll(/"(\d+)"/g)].map(m => m[1]);
  assert.ok(nodes.length >= 2, "ci.yml runs the oldest allowed Node and a current one");
  for (const n of nodes) assert.ok(agents.includes(`Node ${n}`), `AGENTS.md says CI runs Node ${n}`);
  // The oldest Node in CI is the one README.md promises and preflight.cjs enforces.
  const oldest = String(Math.min(...nodes.map(Number)));
  assert.ok(fs.readFileSync(path.join(root, "README.md"), "utf8").includes(`\`node\` ${oldest} or newer`), `README.md allows node ${oldest} or newer`);
  assert.ok(fs.readFileSync(path.join(root, "skills", "hub", "scripts", "preflight.cjs"), "utf8").includes(`major >= ${oldest}`), `preflight.cjs refuses a node older than ${oldest}`);
});

// The directory guides: skills/AGENTS.md and tests/AGENTS.md describe every file in their folder.
const guides = ["skills", "tests"];

test("each directory guide points to its parent and is named in the root AGENTS.md", () => {
  for (const dir of guides) {
    const text = fs.readFileSync(path.join(root, dir, "AGENTS.md"), "utf8");
    const parent = text.match(/^\*\*Parent context:\*\* `([^`]+)`$/m);
    assert.ok(parent, `${dir}/AGENTS.md has no visible Parent context line`);
    assert.strictEqual(path.resolve(root, dir, parent[1]), path.join(root, "AGENTS.md"), `${dir}/AGENTS.md names a parent that is not the root guide`);
    assert.ok(agents.includes("`" + dir + "/AGENTS.md`"), `the root AGENTS.md does not name ${dir}/AGENTS.md`);
    assert.ok(!/<!--/.test(text), `${dir}/AGENTS.md hides text in an HTML comment`);
    assert.match(text, /^## Manual Notes$/m, `${dir}/AGENTS.md has no Manual Notes heading`);
  }
});

test("a directory guide names every file in its folder, and only files that exist", () => {
  const listed = (text, dir) => [...text.matchAll(/^\| `([^`|]+)` \|/gm)].map((m) => m[1]).filter((n) => !n.endsWith("/"));
  const tests = fs.readFileSync(path.join(root, "tests", "AGENTS.md"), "utf8");
  const testFiles = fs.readdirSync(path.join(root, "tests")).filter((n) => n.endsWith(".cjs")).sort();
  assert.deepStrictEqual(listed(tests).sort(), testFiles, "tests/AGENTS.md lists the test files");

  const skills = fs.readFileSync(path.join(root, "skills", "AGENTS.md"), "utf8");
  const hub = path.join(root, "skills", "hub");
  const expected = ["hub/SKILL.md", "hub/agents/openai.yaml",
    ...["references", "scripts", "templates"].flatMap((d) => fs.readdirSync(path.join(hub, d)))].sort();
  assert.deepStrictEqual(listed(skills).sort(), expected, "skills/AGENTS.md lists every file of the hub skill");
});

test("no guide is shipped inside the hub skill", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const found = walk(path.join(root, "skills", "hub")).filter((f) => path.basename(f) === "AGENTS.md");
  assert.deepStrictEqual(found, [], "an AGENTS.md inside skills/hub would be installed and copied as part of the skill");
});

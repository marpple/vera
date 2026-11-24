// Keeps the files that run the repo itself in step with the rules AGENTS.md and CONTRIBUTING.md state:
// the issue forms, the pull request template, the main ruleset on record, and the two workflows.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("the files AGENTS.md sends a contributor to exist", () => {
  const agents = read("AGENTS.md");
  for (const rel of ["CONTRIBUTING.md", "SECURITY.md", ".github/ISSUE_TEMPLATE/", ".github/PULL_REQUEST_TEMPLATE.md", ".github/rulesets/main.json", ".github/workflows/release.yml"]) {
    assert.ok(agents.includes("`" + rel + "`"), `AGENTS.md does not name ${rel}`);
    assert.ok(fs.existsSync(path.join(root, rel)), `${rel} does not exist`);
  }
});

test("issues start from a form, and a vulnerability is sent to a private report", () => {
  const config = read(".github/ISSUE_TEMPLATE/config.yml");
  assert.match(config, /^blank_issues_enabled: false$/m);
  assert.ok(config.includes("https://github.com/marpple/vera/security/advisories/new"));
  assert.ok(read("SECURITY.md").includes("https://github.com/marpple/vera/security/advisories/new"));
  for (const form of ["bug.yml", "feature.yml"]) {
    const text = read(`.github/ISSUE_TEMPLATE/${form}`);
    assert.match(text, /^name: \S/m, `${form} has no name`);
    assert.match(text, /^description: \S/m, `${form} has no description`);
    assert.match(text, /required: true/, `${form} requires nothing`);
  }
});

test("the pull request template asks for what AGENTS.md says a body holds", () => {
  const template = read(".github/PULL_REQUEST_TEMPLATE.md");
  for (const needle of ["## 무엇을, 왜", "## 관련 이슈", "## 검증", "## 확인 사항", "Closes #", "`node --test`"]) {
    assert.ok(template.includes(needle), `the template lacks ${needle}`);
  }
});

test("the main ruleset on record is the one AGENTS.md describes", () => {
  const ruleset = JSON.parse(read(".github/rulesets/main.json"));
  assert.strictEqual(ruleset.enforcement, "active");
  assert.deepStrictEqual(ruleset.bypass_actors, [], "nobody bypasses the main ruleset");
  const rule = (type) => ruleset.rules.find((r) => r.type === type);
  for (const type of ["deletion", "non_fast_forward", "required_linear_history"]) assert.ok(rule(type), `no ${type} rule`);
  const pr = rule("pull_request").parameters;
  assert.strictEqual(pr.required_approving_review_count, 1);
  assert.strictEqual(pr.dismiss_stale_reviews_on_push, true);
  assert.strictEqual(pr.required_review_thread_resolution, true);
  assert.deepStrictEqual(pr.allowed_merge_methods, ["squash"]);
  const checks = rule("required_status_checks").parameters;
  assert.strictEqual(checks.strict_required_status_checks_policy, true);
  const agents = read("AGENTS.md");
  const ci = read(".github/workflows/ci.yml");
  const nodes = [...ci.match(/node: \[([^\]]+)\]/)[1].matchAll(/"(\d+)"/g)].map((m) => `test (${m[1]})`);
  assert.deepStrictEqual(checks.required_status_checks.map((c) => c.context), nodes, "the required checks are the CI matrix jobs");
  for (const name of nodes) assert.ok(agents.includes("`" + name + "`"), `AGENTS.md does not name ${name}`);
});

test("CI reads the repo only, and the release workflow runs when the version file changes", () => {
  assert.match(read(".github/workflows/ci.yml"), /^permissions:\n  contents: read$/m);
  const release = read(".github/workflows/release.yml");
  assert.match(release, /^permissions:\n  contents: write$/m);
  assert.ok(release.includes('paths: [".claude-plugin/plugin.json"]'));
  assert.ok(release.includes("gh release create"));
  assert.ok(release.includes("already exists"), "the release workflow skips a version that is already tagged");
});

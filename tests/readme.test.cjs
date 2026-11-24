// README.md tells an Orca user, in English, how to install, run, update, and remove the skills, and a maintainer how to release.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const readme = () => fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

const INSTALL = [
  "claude plugin marketplace add marpple/vera",
  "claude plugin install vera@mco",
  "/plugin marketplace add marpple/vera",
  "/plugin install vera@mco",
  "codex plugin marketplace add marpple/vera",
  "codex plugin add vera@mco",
  "npx skills add marpple/vera --skill hub"
];

const RUN_UPDATE_REMOVE = [
  "/vera:hub",
  "$vera:hub",
  "claude plugin marketplace update mco",
  "claude plugin update vera@mco",
  "**Enable auto-update**",
  "/reload-plugins",
  "Codex has no auto-update",
  "codex plugin marketplace upgrade mco",
  "npx skills update hub",
  "claude plugin uninstall vera@mco",
  "claude plugin marketplace remove mco",
  "codex plugin remove vera@mco",
  "codex plugin marketplace remove mco",
  "npx skills remove hub"
];

test("README contains each install command", () => {
  const text = readme();
  for (const cmd of INSTALL) assert.ok(text.includes(cmd), `missing install command: ${cmd}`);
});

test("README is titled Vera and gives the invoke, update, and uninstall commands", () => {
  const text = readme();
  assert.match(text, /^# Vera$/m);
  for (const cmd of RUN_UPDATE_REMOVE) assert.ok(text.includes(cmd), `missing command: ${cmd}`);
});

test("README tells a user of the deprecated ddevkim/vera marketplace how to remove it", () => {
  const text = readme();
  const start = text.indexOf("\n### Moving from ddevkim/vera\n");
  assert.ok(start > 0, "README has no Moving from ddevkim/vera section");
  // The section ends at the next heading of either level: it is the last one under "## hub".
  const rest = text.slice(start + 1);
  const end = rest.search(/\n#{2,3} /);
  const section = end < 0 ? rest : rest.slice(0, end);
  for (const cmd of [
    "claude plugin uninstall vera@vera",
    "claude plugin marketplace remove vera",
    "codex plugin remove vera@vera",
    "codex plugin marketplace remove vera",
    "npx skills remove hub"
  ]) {
    assert.ok(section.includes(cmd), `Moving section does not give: ${cmd}`);
  }
  assert.match(section, /deprecated/);
});

test("every relative link and image path in README exists", () => {
  const text = readme();
  const targets = [...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1])
    .filter(t => !/^[a-z]+:/i.test(t) && !t.startsWith("#"));
  assert.ok(targets.length > 0, "README has no relative links");
  for (const t of targets) {
    const file = t.split("#")[0];
    assert.ok(fs.existsSync(path.join(ROOT, file)), `broken link: ${t}`);
  }
});

// The anchors GitHub gives README's headings: lower case, punctuation other than - and _ dropped, each space a hyphen,
// and -1, -2 on a repeat. Lines inside code fences are not headings.
function anchors(md) {
  const out = new Set();
  const seen = new Map();
  let fence = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    const m = !fence && line.match(/^#{1,6} +(.+?) *$/);
    if (!m) continue;
    const slug = m[1].toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");
    const n = seen.get(slug) || 0;
    seen.set(slug, n + 1);
    out.add(n ? `${slug}-${n}` : slug);
  }
  return out;
}

test("every #anchor into README, from README and from the other docs, names a heading", () => {
  const text = readme();
  const names = anchors(text);
  const links = [...text.matchAll(/\]\(#([^)\s]+)\)/g)].map(m => ["README.md", m[1]]);
  for (const doc of ["CONTRIBUTING.md", "SECURITY.md"]) {
    const other = fs.readFileSync(path.join(ROOT, doc), "utf8");
    links.push(...[...other.matchAll(/\]\(README\.md#([^)\s]+)\)/g)].map(m => [doc, m[1]]));
  }
  assert.ok(links.length > 0, "no anchor links found");
  for (const [doc, a] of links) assert.ok(names.has(a), `${doc} links to README.md#${a}, which no heading has`);
});

test("README shows the dashboard screenshot", () => {
  assert.match(readme(), /!\[[^\]]*\]\(docs\/dashboard\.png\)/);
});

test("README contains no Hangul", () => {
  const line = readme().split("\n").find(l => HANGUL.test(l));
  assert.strictEqual(line, undefined, `Hangul in README: ${line}`);
});

test("LICENSE exists and README links it", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "LICENSE")), "LICENSE missing");
  assert.match(readme(), /\]\(LICENSE\)/, "README does not link LICENSE");
});

test("README names the three autonomy levels and that the walkthrough page follows lang", () => {
  const text = readme();
  for (const level of ["Low", "Medium", "High"]) assert.match(text, new RegExp(`\\*\\*${level}\\*\\*`));
  assert.match(text, /walkthrough page[^.\n]*`lang`|`lang`[^.\n]*walkthrough page/);
});

test("README tells a maintainer how to release: the version file, the PR title, the tag, and the per-scope update", () => {
  const text = readme();
  const start = text.indexOf("\n## Releasing\n");
  assert.ok(start > 0, "README has no Releasing section");
  const section = text.slice(start, text.indexOf("\n## ", start + 1));
  for (const needle of [".claude-plugin/plugin.json", "`Release X.Y.Z`", "--scope user", "--scope project", "CODEX_HOME", "gh release create vX.Y.Z"]) {
    assert.ok(section.includes(needle), `Releasing section does not mention ${needle}`);
  }
});

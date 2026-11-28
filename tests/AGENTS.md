# tests

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-24 · **Updated:** 2026-11-24

## Purpose

The whole check for this repo: `node --test` from the root runs every file here on Node's built-in test runner. There is no build, no package, and no test framework. Two kinds of test live side by side: tests that read the instruction text and the manifests, and tests that run the scripts and the page scripts.

## Key Files

| File | Description |
|------|-------------|
| `agents-md.test.cjs` | The root `AGENTS.md` and the directory guides: the paths they name exist, and they name the check command and CI's Node versions |
| `repo-setup.test.cjs` | The issue forms, the pull request template, the rulesets on record, the workflows, and the Language rule |
| `manifests.test.cjs` | `.claude-plugin/marketplace.json` and `plugin.json`, the license, and the Codex interface file |
| `readme.test.cjs` | `README.md`: every install, update, and uninstall command, the release steps, links, and no Hangul |
| `skill-text.test.cjs` | The hub instructions: every path they name exists, nothing holds only on one machine, the language rules stay |
| `template-copies.test.cjs` | The four template copy lists match the `templates` folder |
| `worker-model.test.cjs` | The instructions name no model, and the model rule in `worker-model.md` stays |
| `resume-protocol.test.cjs` | `protocolhash.cjs` and the resume step that sends a changed protocol to live workers |
| `claude-app.test.cjs` | The Claude desktop app runtime: preflight, and `sync.cjs` reading transcripts |
| `preflight.test.cjs` | `preflight.cjs`: one `ok:` line, or a `missing:` line per missing prerequisite |
| `allow.test.cjs` | `allow.cjs`: the rules written into a worker's worktree, and their removal |
| `diffhash.test.cjs` | `diffhash.cjs`: the changed-lines hash across rebases, edits, and file kinds |
| `walkcheck.test.cjs` | `walkcheck.cjs`: a walkthrough data file checked against the committed head |
| `trimlog.test.cjs` | `trimlog.cjs`: only the tail of the log leaves `state.js`, a second run changes nothing, and it refuses when it cannot be sure |
| `verdict.test.cjs` | `verdict.cjs`: the verdict form it accepts, the round it records without losing earlier rounds or fixes, and the message for the worker |
| `sync-loop.test.cjs` | `sync.cjs` as a loop: the pid guard, a missing `state.js`, `closed: true`, the page server |
| `sync-notes.test.cjs` | `sync.cjs` as a module: the notes it takes from worker messages |
| `dashboard-lang.test.cjs` | `dashboard.html` renders its labels in the language `state.js` names |
| `walkthrough-lang.test.cjs` | `walkthrough.html` renders its labels in the language `state.js` names |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `fixtures/` | Expected Korean renderings of the two pages (`dashboard-ko.json`, `walkthrough-ko.json`), compared by the two `-lang` tests |

## For AI Agents

### Working In This Directory

- A test that quotes a sentence fails when the sentence is reworded. Change the test in the same pull request and say why in its body; do not loosen the quote to make it pass.
- A new rule in the instructions gets a test that reads it; a new script gets tests that run it.
- A test that needs a repo or a hub folder builds one in a temp folder and removes it; none writes into this repo or reads the machine's own settings.
- The fixtures are the Korean locale on purpose. Regenerate one only when the page's Korean labels change.
- When you add or remove a test file, update the table above: `agents-md.test.cjs` compares it with this folder.

### Testing Requirements

```sh
node --test
```

Every test must pass on Node 18 and on Node 26, which is what CI runs. To run one file: `node --test tests/<name>.test.cjs`.

### Common Patterns

- Files are CommonJS and use only `node:test`, `node:assert`, `node:fs`, `node:path`, `node:child_process`, and `node:vm`.
- A file opens with a comment that says what it keeps true.
- Scripts are tested by running them as a child process and reading what they print and how they exit.
- The page scripts run in `node:vm` with a small `document` stub: no browser.

## Dependencies

### Internal

- Everything under `skills/hub/`, the manifests in `.claude-plugin/`, `README.md`, and `AGENTS.md`.

### External

- Node 18 or newer and `git`. No packages.

## Manual Notes

Notes under this heading are written by people and kept when this file is regenerated.

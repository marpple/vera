# skills

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-24 · **Updated:** 2026-11-24

## Purpose

The skills the Vera plugin ships. Each folder with a `SKILL.md` is one skill; today there is one, `hub/`. Everything under this folder is installed on a user's machine, so this file is the only guide here: a guide inside `hub/` would be copied by `npx skills`, and one inside `hub/templates/` or `hub/references/` would be counted as a template or a reference by the tests.

## Key Files

| File | Description |
|------|-------------|
| `hub/SKILL.md` | What the hub agent follows: the five rules for every PR, the runtime, autonomy levels, the hub folder, start or resume, and the loop |
| `hub/agents/openai.yaml` | How Codex shows the skill, and the policy that keeps it direct-invocation only |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `hub/references/` | One file per situation, read when `SKILL.md` says so (table below) |
| `hub/scripts/` | Scripts the hub runs from the skill's own folder; never copied |
| `hub/templates/` | Files the hub copies into each hub folder |
| `hub/agents/` | Codex's interface file |

### `hub/references/`

| File | The hub reads it when |
|------|-----------------------|
| `claude-app.md` | it runs in the Claude desktop app: replaces every Orca command with the app's tools |
| `splitting.md` | it plans items, or a worker reports a diff over its budget |
| `worker-spec.md` | it writes a worker's spec; holds the worker protocol |
| `worker-model.md` | it starts a worker: chooses the model and the effort |
| `review.md` | an item needs its independent review |
| `reviewer.md` | never: the reviewer reads it, for the six checks and the form of its answer |
| `walkthrough.md` | a worker is ready for review, a review passes, or lines change after an approval |
| `dashboard.md` | it fills `state.js`: every sentence on the dashboard |
| `merging.md` | it asks for a merge approval, and before it merges |
| `cleanup.md` | a PR merged, or the developer parks or drops an item |
| `upgrade.md` | it resumes a hub folder built by an older version |

### `hub/scripts/`

| File | Description |
|------|-------------|
| `preflight.cjs` | Checks what a new hub needs and prints one `missing:` line per problem; installs nothing |
| `allow.cjs` | Writes a worker's permission rules for an autonomy level into its worktree, and takes them back |
| `protocolhash.cjs` | Hashes the text a hub's `protocol.md` is written from, so a resumed hub can tell the worker protocol changed |
| `trimlog.cjs` | Moves the log lines after the 30th out of a hub's `state.js` into `log.md`, and changes nothing else |
| `verdict.cjs` | Reads a saved review verdict: records the round in the walkthrough's `review`, prints the blocking findings, and prints the `REVIEW:` message for the worker |

### `hub/templates/`

| File | Description |
|------|-------------|
| `dashboard.html` | The dashboard page; draws `state.js` and `live.js` |
| `walkthrough.html` | The walkthrough page for one round of one item |
| `state.js` | The sample state; the only template the hub fills and then edits |
| `sync.cjs` | The live sync: worker activity, prompt waits, and CI into `live.js` |
| `walkcheck.cjs` | Checks a walkthrough data file against the worker's committed head |
| `diffhash.cjs` | The changed-lines hash of a PR that the review and the merge compare |

## For AI Agents

### Working In This Directory

- Write to the hub agent as "you", in English, and state each rule once: a section that owns a rule says so, and the others point to it.
- A template is listed in four places (the hub folder table, "Resume", and step 5 in `hub/SKILL.md`, and step 1 of the second part of `hub/references/upgrade.md`). Add, rename, or remove one in all four.
- The worker protocol is the text `hub/scripts/protocolhash.cjs` hashes. A running hub sends a changed protocol to its live workers, so write each rule to hold for a worker that started under the old one.
- Nothing here may hold only on your machine: no absolute paths, user names, or tools beyond the prerequisites in the README.
- Name no model in the instructions: the hub looks up what the agent offers.
- Add no `AGENTS.md` below this folder.

### Testing Requirements

Run `node --test` from the repo root. The tests that read these files are listed in `tests/AGENTS.md`; most quote sentences, so a reworded sentence needs its test changed in the same pull request.

### Common Patterns

- Scripts are CommonJS (`.cjs`), use only Node's standard library, and run on Node 18.
- A script prints a fixed first word the hub acts on (`ok:`, `missing:`, `cannot hash:`, `refused:`); keep those words when you change a message.
- Page labels live in per-language tables inside the two HTML templates (`ko`, `en`); a new label goes into both.

## Dependencies

### Internal

- `.claude-plugin/` names this folder's skills to Claude Code and Codex.
- `README.md` documents the prerequisites `hub/scripts/preflight.cjs` checks.

### External

- Node 18 or newer, `git`, `gh`, and either the Orca app with its `orca` CLI or the Claude desktop app. No packages.

## Manual Notes

Notes under this heading are written by people and kept when this file is regenerated.

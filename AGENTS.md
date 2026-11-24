# Working in this repo

Vera is a set of agent skills shipped as one plugin for Claude Code and Codex. Today it holds one skill, the hub, in `skills/hub/`. Users get a change only through a release: see "Releasing" in `README.md`.

## Check

- Run `node --test` from the repo root before you push. CI runs the same command on Node 18 (the oldest `README.md` allows) and Node 26, and there is no build step.
- Many tests read the instruction text itself (`tests/skill-text.test.cjs`, `tests/readme.test.cjs`). When you reword a sentence a test quotes, change the test in the same commit and say why in the PR.

## Where things live

Two folders have their own guide, with a table of every file in them: `skills/AGENTS.md` and `tests/AGENTS.md`. Read the one for the folder you work in. There is none below `skills/hub/`, because what is in that folder is installed on users' machines.

- `skills/hub/SKILL.md` and `skills/hub/references/`: what the hub agent follows. Write them in English; a Korean string in a reference is an example, and that file says so.
- `skills/hub/templates/`: files the hub copies into each hub folder. It never edits them there, except `state.js`, which it fills once and then edits after every event. When you add, rename, or remove a template, update all four copy lists: the hub folder table, "Resume", and step 5 "Build the folder" in `skills/hub/SKILL.md`, and step 1 of the second part of `skills/hub/references/upgrade.md`. Only step 5 copies `state.js`: copying it on a resume would overwrite the hub's live state. A list that misses a template leaves resumed hubs on the old copy. `tests/template-copies.test.cjs` fails when a list differs from the folder.
- `skills/hub/scripts/`: scripts the hub runs from this skill's folder, never copied.
- The worker protocol: the parts of `skills/hub/references/` that `skills/hub/scripts/protocolhash.cjs` hashes. A hub that resumes after one of them changed sends the new text to its live workers, so write each rule to hold for a worker that started under the old one.
- `.claude-plugin/`: the plugin and marketplace manifests. Change `version` in `.claude-plugin/plugin.json` only in a release pull request.
- `skills/hub/agents/openai.yaml`: how Codex shows the skill. It keeps the hub direct-invocation only, as the frontmatter of `skills/hub/SKILL.md` does on Claude Code.

## Portability

Everything under `skills/` runs on someone else's machine: no absolute paths, user names, or local tools beyond the prerequisites in `README.md`. `tests/skill-text.test.cjs` checks for the common cases. `README.md` holds no Hangul.

## Commits and pull requests

- One concern per pull request, branched from `origin/main`. Pull requests are normally squash-merged, so the title becomes the commit subject on `main`.
- Titles and commit subjects are English sentences in the imperative mood with no type prefix, such as "Refuse gh pr merge in a Claude worker's worktree". The commit body says what changed and why.
- The pull request body has `## What` (the change and the reason, with a table when cases differ) and `## Verification` (the commands you ran and what they printed, such as the `node --test` count).
- Name no AI agent in commits or pull requests: no `Co-Authored-By` trailer for an agent and no "Generated with" line.

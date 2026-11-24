# Working in this repo

Vera is a set of agent skills shipped as one plugin for Claude Code and Codex. Today it holds one skill, the hub, in `skills/hub/`. Users get a change only through a release: see "Releasing" in `README.md`.

## Check

- Run `node --test` from the repo root before you push. CI runs the same command on Node 18 (the oldest `README.md` allows) and Node 26, and there is no build step.
- Many tests read the instruction text itself (`tests/skill-text.test.cjs`, `tests/readme.test.cjs`). When you reword a sentence a test quotes, change the test in the same commit and say why in the PR.

## Where things live

- `skills/hub/SKILL.md` and `skills/hub/references/`: what the hub agent follows. Write them in English; a Korean string in a reference is an example, and that file says so.
- `skills/hub/templates/`: files the hub copies into each hub folder. It never edits them there, except `state.js`, which it fills once and then edits after every event. When you add, rename, or remove a template, update all four copy lists: the hub folder table, "Resume", and step 5 "Build the folder" in `skills/hub/SKILL.md`, and step 1 of the second part of `skills/hub/references/upgrade.md`. Only step 5 copies `state.js`: copying it on a resume would overwrite the hub's live state. A list that misses a template leaves resumed hubs on the old copy. `tests/template-copies.test.cjs` fails when a list differs from the folder.
- `skills/hub/scripts/`: scripts the hub runs from this skill's folder, never copied.
- The worker protocol: the parts of `skills/hub/references/` that `skills/hub/scripts/protocolhash.cjs` hashes. A hub that resumes after one of them changed sends the new text to its live workers, so write each rule to hold for a worker that started under the old one.
- `.claude-plugin/`: the plugin and marketplace manifests. Change `version` in `.claude-plugin/plugin.json` only in a release pull request.
- `skills/hub/agents/openai.yaml`: how Codex shows the skill. It keeps the hub direct-invocation only, as the frontmatter of `skills/hub/SKILL.md` does on Claude Code.

## Portability

Everything under `skills/` runs on someone else's machine: no absolute paths, user names, or local tools beyond the prerequisites in `README.md`. `tests/skill-text.test.cjs` checks for the common cases. `README.md` holds no Hangul.

## Issues, branches, and review

The steps a person follows are in `CONTRIBUTING.md`. These are the rules, and GitHub enforces the ones about `main` with the ruleset recorded in `.github/rulesets/main.json`.

- **An issue first.** A bug, a wrong instruction, or a check that fails on `main` gets an issue from the bug form in `.github/ISSUE_TEMPLATE/` before the fix, and a new behaviour gets one from the feature form before the work. A change that needs no explaining, such as a typo, may go straight to a pull request that says so under its issue heading.
- **A security problem is never a public issue.** Follow `SECURITY.md`.
- **`main` takes no direct push.** Every change reaches it through a pull request from a branch.
- **A pull request merges by squash only**, after one approval from a maintainer who is not its author, with `test (18)` and `test (26)` green, the branch up to date with `main`, and every review conversation resolved. A push after the approval dismisses it. Nobody bypasses this, admins included.
- **As an agent, never approve a pull request, and never merge one unless the developer asks you to in this conversation.** When a rule blocks a merge, say which one and stop: do not use `--admin`, change the ruleset, or push to `main` another way.
- **Only a maintainer merges**: an MCO developer with write access. Anyone else opens a pull request from a fork.

## Commits and pull requests

- One concern per pull request, branched from `origin/main`. The title becomes the commit subject on `main`.
- Titles and commit subjects are English sentences in the imperative mood with no type prefix, such as "Refuse gh pr merge in a Claude worker's worktree". The commit body says what changed and why.
- Vera is for users everywhere: write issues, pull request bodies, commits, and review comments in English.
- The pull request body fills `.github/PULL_REQUEST_TEMPLATE.md`: `## What` (the change and the reason, with a table when cases differ), `## Issue` (`Closes #<n>`), `## Verification` (the commands you ran and what they printed, such as the `node --test` count), and the checklist.
- Name no AI agent in commits or pull requests: no `Co-Authored-By` trailer for an agent and no "Generated with" line.
- A merged release pull request is tagged and published by `.github/workflows/release.yml`: do not create the tag by hand.

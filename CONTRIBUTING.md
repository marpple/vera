# Contributing to Vera

Vera is maintained by the development team at Marpple Corporation (MCO) and is open to everyone: issues and pull requests are welcome from any user. This page takes you from finding a problem to a change merged into `main`. The rules an agent follows are in [AGENTS.md](AGENTS.md); where the two differ, `AGENTS.md` holds.

Write issues, pull requests, commits, and review comments in English.

## The steps at a glance

| Step | What you do | What it takes to pass |
|---|---|---|
| 1. Issue | Open an [issue](https://github.com/marpple/vera/issues/new/choose) for the problem or the proposal | Every required field of the form is filled |
| 2. Branch | Branch from `origin/main`, or from your fork | One concern per pull request |
| 3. Change and test | Make the change and run `node --test` | Every test passes |
| 4. Pull request | Open it with the template filled | The `test (18)` and `test (26)` checks pass |
| 5. Review | Ask for one when the change is risky or you want a second reader | Every review conversation is resolved |
| 6. Merge | A maintainer squash-merges it | The branch is up to date with `main` |

## 1. Open an issue first

- A bug, a wrong instruction, or a check that fails on `main`: the **Bug report** form.
- A new behaviour or a change to one: the **Feature request** form, before you start the work.
- A security vulnerability: never a public issue. Follow [SECURITY.md](SECURITY.md).
- A change that needs no explaining, such as a typo, may go straight to a pull request. Say so under its "Issue" heading.

## 2. Work on a branch

`main` is protected and takes no direct push. Every change goes through a branch and a pull request.

```sh
git fetch origin
git switch -c <branch name> origin/main
```

Without write access, fork the repo and open the pull request from a branch of your fork.

## 3. Change and test

```sh
node --test
```

- There is no build step. CI runs the same command on Node 18 and Node 26.
- Many tests read the instruction text itself. When you reword a sentence a test quotes, change the test in the same pull request.
- Everything under `skills/` runs on someone else's machine: no absolute paths, user names, or tools beyond the prerequisites in the README.
- `version` in `.claude-plugin/plugin.json` changes only in a release pull request.

## 4. Open the pull request

- The title is an English sentence in the imperative mood, with no type prefix such as `feat:`. After the squash merge it is the commit subject on `main`.
- Fill the four headings of the template: What, Issue, Verification, Checklist.
- A pull request that fixes an issue says `Closes #<number>` under "Issue".
- Name no AI agent in commits or in the pull request.

## 5. Review

- An approval is not required to merge. Ask for a review when the change is risky or you want a second reader; the maintainer is requested automatically on every pull request.
- Every review conversation must be resolved before the merge.
- The checks and the other rules apply to everyone, admins included.

## 6. Merge

- Only a maintainer merges: an MCO developer with write access to this repo.
- Squash is the only merge method, and the branch is deleted after the merge.
- A merge alone does not reach anyone's install. Users get a change through a release: see [Releasing](README.md#releasing) in the README.

## Repo settings

The rules for `main` and for release tags are GitHub rulesets, recorded as they are applied in `.github/rulesets/`. To change a rule, merge a pull request that changes that file, then apply it in the GitHub settings.

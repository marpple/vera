<!-- The title is an English sentence in the imperative mood. After the squash merge it is the commit subject on main. Example: Refuse gh pr merge in a Claude worker's worktree -->

## What

<!-- The change and the reason for it. Use a table when cases differ. -->

## Issue

<!-- The issue this closes, such as: Closes #12. When there is none (a release, a typo), say why in one line. -->

## Verification

<!-- The commands you ran and what they printed. Example: `node --test` → tests 236, pass 236, fail 0 -->

## Checklist

- [ ] This pull request has one concern.
- [ ] I ran `node --test` from the repo root and every test passed.
- [ ] Where I reworded a sentence a test quotes, I changed the test here and said why above.
- [ ] Where I added, renamed, or removed a template, I updated all four copy lists.
- [ ] `version` in `.claude-plugin/plugin.json` changes only in a release pull request.
- [ ] No commit and no text here names an AI agent.

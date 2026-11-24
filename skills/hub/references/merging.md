# Merging: preflight, stacked PRs, CI that will not start

Read this before you ask the developer to approve a merge, and again before you run the merge. The hub runs every merge; workers never do. No merge uses `--delete-branch`: the branch is still checked out in the worker's worktree, so gh's local delete fails and can skip the remote delete. Branches go in the cleanup ([cleanup.md](cleanup.md)).

Quoted strings in this file are examples, in English: write the same meaning in the developer's language ([SKILL.md](../SKILL.md), "Language").

## Preflight before asking for approval

Ask for approval only for an item that is `ready` (green CI on code the reviewer passed; `walkApproved` is set, by the developer at `low` and by you at `medium` and `high`, and anything changed since is listed in this message), whose PR's base is `main`, and that has no `walkPending` or `reviewPending` (those come first: [walkthrough.md](walkthrough.md)), and only with these facts in the same message:

```bash
gh pr view <n> --json url,baseRefName,headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup
gh repo view --json deleteBranchOnMerge,squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed
git -C <repo path> fetch origin
git -C <repo path> rev-parse origin/<head-branch>                    # S: must equal headRefOid above
<the changed-lines hash at S, review.md>                             # must equal the item's reviewedDiff
git -C <repo path> merge-tree --write-tree origin/main S             # exit 0 = no conflict
```

S is the one commit the whole preflight is about: the commit GitHub shows as the PR's head, the commit you hash, and the commit you merge (`--match-head-commit S` below). Take it from `git rev-parse` here, never from a worker's message. If `headRefOid` is not S, fetch and start the preflight again; `--match-head-commit` then refuses a head pushed after it.

- Hash differs from `reviewedDiff`: the PR's own lines changed after the review. It gets a new walkthrough round and a review first ([walkthrough.md](walkthrough.md), "Changes after the approval").
- `mergeStateStatus: BEHIND`: say so. After approval, run `gh pr update-branch <n>`, wait for green CI, and run the preflight again for its new S: hash unchanged, merge S without asking again; changed (the update touched the PR's own lines), treat it as a change after the approval and ask again.
- `merge-tree` exits non-zero: name the conflicting files and send the rebase to the PR's worker.
- `reviewDecision` is not `APPROVED` while the repo requires review: name the reviewer to ask. A force-push after an approval dismisses it; say it needs approval again ("Needs approval again").
- A required check shown as `CANCELLED` blocks the merge even when another run of the same check passed (CI ran twice and one run was cancelled). Re-run it: `gh run rerun <run-id>`.
- `deleteBranchOnMerge: true`: GitHub deletes the head branch at merge time no matter which flags you pass, so the stack steps below cannot keep it. Tell the developer before the first stacked merge and offer to have the setting turned off while the stack exists. If it stays on, check every child right after the merge with `gh pr view <child> --json state,baseRefName`; a child that closed is rebased as in step 3 and reopened as a new PR from the same branch (`gh pr create --base main`), with the new number in `state.js` and on its sidebar card.

The approval message opens with what the merge sets off and the required steps not yet confirmed ("What a merge sets off" below), then gives the PR link and the walkthrough link (`file://<hub>/walkthrough.html?w=<item's walkthrough>`), then lists under a heading for code changed after the walkthrough approval ("Code changed after the walkthrough approval") the `changes` of every walkthrough round after `walkApproved` (CI fixes, conflict resolutions, review fixes, each with its `file:line`: [walkthrough.md](walkthrough.md), "Changes after the approval"; "None" when `walkthrough` equals `walkApproved`), any `sinceWalk` entries an upgraded item still carries, and every `overruled` finding with your reason. The dashboard lists the item under "Merge" by itself once it is `ready` on `main`.

## What a merge sets off

A PR that passed its review on green CI is ready for the question, not for the merge: what the merge does outside the repo is the developer's to weigh, and they can weigh only what you tell them. `spec.md` holds two constraint lines the developer confirmed at the start ([SKILL.md](../SKILL.md), steps 2-3): what a merge into this base branch sets off (for example a production deploy that starts by itself), and what the repo requires before a merge (for example a check on a stage deploy). Read them again before each merge question; a hub whose `spec.md` lacks them (it started before this rule) asks the developer both once, before its next merge question, and adds the lines. Every message that asks for a merge or offers one, for one item or many, opens with both, before the PR link:

- What the merge sets off, in one sentence ("Merging puts this on `main`, and the production deploy starts at once."). One still `unknown` is said as unknown and asked, never left out.
- Each required step and whether the developer has confirmed it for these items ("The stage check has not been done yet.").

While a required step is not confirmed, the question is about that step first and the merge second ("Deploy to stage first, or merge as it is?"), in the message and in `ask`; never "merge?" alone. Merging without the step is the developer's choice, and only theirs: when they choose it after reading both lines, it is an approval like any other ("Approval").

A step is confirmed only when the developer says so ("I checked it on stage"). Green CI, a passed review, a worker's report, or your own reading of a deploy never confirms one. Record it as an `answered` decision with their words and the items it covers, and a choice to merge without the step the same way. A confirmation covers the code as it was: an item whose lines change afterwards (it gains a walkthrough round) is unconfirmed again, and the next message says so.

## Approval

Only an explicit approval that names the items counts: "merge W1", choosing W1 in a question, or "merge all" in answer to a message that listed the items; the same intent in any language counts. "merge all" covers exactly the items listed in the approval message it answers, never an item that became ready after it. "looks good", silence, or approval given before the preflight facts were shown, or before what the merge sets off and the steps not yet confirmed were said ("What a merge sets off"), is not approval: ask. An answer to an offer of yours that left them out ("Start the batch merge?" answered "start merging") is not approval either: say them, then ask again. An item whose hash changed after the approval (an `update-branch` that touched its own lines, a new review fix), or that gained a walkthrough round the approval message did not list, needs a new approval.

An approval that carries a comment ("merge W1, but rename the function") is read by what the comment asks for, and the comment is never dropped:

- A change to this PR before it merges, or you cannot tell whether they mean now or later: it is not an approval. Set the item `pr`, phases 6, and `send` the worker `CHANGES: <each change, with file:line>` (protocol rule 6c); the changed lines get a walkthrough round and a review ([walkthrough.md](walkthrough.md), "Changes after the approval"), and you ask again.
- Work for later ("in the next PR", "later"): the approval counts. Log the comment in their words and list it under follow-ups in the final report ([cleanup.md](cleanup.md)).
- A question: answer it from the code, then ask for the approval again.

## At High

At `high` ([SKILL.md](../SKILL.md), "Autonomy levels") check the stop list first: a hit becomes a to-do with its reason, and nothing below runs for that item; a required step the developer has not confirmed is such a hit (stop 8), so its to-do opens as "What a merge sets off" says. Otherwise the preflight passing on green CI is the approval: merge as below without asking, log it, then run the deploy steps the repo documents (its rule documents or a deploy document the spec names), checking the stop list before each; never invent a step. The developer reads about it in the final report.

## Merge method

Use the method the repo's PR rules name. Otherwise `--squash` when `squashMergeAllowed` is true, else `--merge` when `mergeCommitAllowed` is true, else `--rebase`. Write it below as `--<method>`. The stack recipe below works with any of them, because each child rebases only its own commits onto the recorded old parent head.

## Merging a PR with nothing stacked on it

`gh pr list --base <its branch> --state open` is empty and no active worker builds on its branch: `gh pr merge <n> --<method> --match-head-commit <S>` (the preflight's S). Record `mergeSha` from `gh pr view <n> --json mergeCommit -q .mergeCommit.oid`, then clean up the item.

## Merging the bottom of a stack

A PR whose base is another PR's branch is **stacked**. If the parent's branch is deleted at merge time, GitHub closes every PR based on it, and a closed PR cannot change its base: it can only be replaced by a new PR from the same branch. So the parent's branch stays until its children are retargeted.

For a stack `main ← A ← B ← C`, plus `A ← D` where D's worker has not opened a PR yet:

1. Record the head SHA of every branch built on A, directly or not, with or without a PR: `old-A`, `old-B`, `old-C`, `old-D`.
2. `gh pr merge A --<method> --match-head-commit <old-A>`, where `old-A` is the S of A's preflight.
3. A squash or rebase merge gives A's commits new hashes, so a plain rebase would replay them as duplicates. Each child rebases only its own commits. Send each worker its command, with the SHA you recorded:
   - Direct child with a PR (B): `git fetch origin && git rebase --onto origin/main <old-A> <B-branch>`, re-verify, `git push --force-with-lease`; then you run `gh pr edit <B> --base main` and set B's `base` to `main` in `state.js`.
   - Grandchild (C), after B's force-push lands: `git rebase --onto origin/<B-branch> <old-B> <C-branch>`, `git push --force-with-lease`. Its PR base stays `<B-branch>`.
   - Direct child without a PR yet (D): the same rebase as B, re-verify, and no push (protocol rule 9); its task's PR base becomes `main`, and it opens the PR only after its walkthrough is approved (protocol rule 6).
   - Any child in `review` or `walk`, with or without a PR: hold its command, because a rebase would move the head under the reviewer or the developer. Write the full command with its SHAs into the item's `pendingRebase` now, so it survives a compaction, and send it with your `APPROVED` reply, or with the PASS verdict of a review after the approval ([review.md](review.md), "After the verdict").
   A worker that already closed reopens when you `send` to it.
4. Clean up A once its children have their instructions ([cleanup.md](cleanup.md); its step 5 deletes A's remote branch once no open PR is based on it).
5. Set each rebased child that has a PR to phases 6 and status `pr` until its follow-up `worker_done`. A rebase that resolved conflicts may have changed the child's own lines: its hash (against its new base) then differs from `reviewedDiff`, and it gets a new walkthrough round and a review ([walkthrough.md](walkthrough.md), "Changes after the approval"). Then run the preflight for B before asking to merge it.

When a parent gains commits before it merges (review fixes, `update-branch`), its children rebase the same way onto the parent's new head: `git rebase --onto origin/<parent-branch> <parent's previous head> <child-branch>`. A child without a PR does not push (protocol rule 9).

## CI did not start after a force-push

When `gh pr checks <n>` shows nothing for the new head a few minutes after a force-push or base change, close and reopen the PR (`gh pr close <n> && gh pr reopen <n>`). That triggers the `pull_request` workflows for the current head.

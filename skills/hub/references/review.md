# Independent review

Every item passes an independent review before the developer is walked through it, so the developer reads code a second pair of eyes already passed and no PR opens on unreviewed code. Independent means a fresh context that did not write, plan, or split this code: never you, never the item's worker.

Quoted strings in this file are examples, in English: write the same meaning in the developer's language ([SKILL.md](../SKILL.md), "Language").

## When

- After a "ready for review" ask whose walkthrough passed walkcheck ([walkthrough.md](walkthrough.md), "Check it, then have it reviewed"). The code is still local: the reviewer reads the worker's worktree.
- Again whenever the item's own lines change afterwards: a developer's change request, or after the PR is open a CI fix, a conflict resolved during a rebase, a review fix. Compare the changed-lines hash (below) with the item's `reviewedDiff`.

At the start of each round set the item `review`, `reviewRound` + 1 (a round restarted after a resume keeps its number), an `ext` saying review round <n> is running ("Independent review round <n> is running"), and record the head you send to the reviewer as the item's `reviewHead` (`git -C <worktree path> rev-parse HEAD`).

## Changed-lines hash

One hash of the file names, the added and removed lines, the one unchanged line on each side of every change, and mode changes, nothing else. Every file is read as text, so a binary file's bytes count like any other line. A rebase that git applies without a conflict keeps it, so a review and a walkthrough still hold; adding, removing, or changing any of the item's own lines changes it, and so does moving one past an unchanged line, because its neighbours then differ. One neighbour on each side is the most a clean rebase allows: git reports a conflict when the base changed a line that touches one of the PR's changes, and lines further away can change freely. (`git patch-id` is not used: it hashes three unchanged lines on each side, so a clean rebase can change it.) What it cannot see: a change moved between two places whose neighbouring lines are the same. Store all 40 characters.

```bash
git -C <dir> fetch origin
node <this skill's folder>/templates/diffhash.cjs <dir> origin/<base> <head>
```

Run this skill's copy, never `<hub>/diffhash.cjs`: workers write in the hub folder (their walkthrough files), so a script there is not one to trust with the merge guard. The hub folder's copy is the one the protocol gives workers. For the same reason `state.js` is yours alone: a hash you did not record yourself is not a hash.

`templates/diffhash.cjs` runs `git diff` on `origin/<base>...<head>` with fixed prefixes, no colour, no renames, unquoted paths, and pinned submodule format, algorithm, file order, path root, and textconv, and one line of context, so the git settings that change those cannot change it, keeps the lines that start with `diff --git`, `+`, `-`, a space (the neighbours), `\`, `old mode`, `new mode`, `new file mode`, or `deleted file mode`, leaves the hunk headers out (their line numbers, function names, and the places where one hunk ends and the next begins all move with the base), and hashes the result. `--text` makes git read every file as text whatever `.gitattributes` or its content says: without it a binary file, or any file a `-diff` attribute names, would show as one `Binary files differ` line whatever changed in it. `--v1` before `<dir>` prints the hash in the form hubs recorded before the neighbours were part of it; only "Resume" in [SKILL.md](../SKILL.md) uses it. A `cannot hash:` line (exit 2) is not a hash: never record or compare it; fix the ref (`git fetch origin`) or the path and run it again. The old pipeline printed the hash of empty input when `git diff` failed, so two failures compared equal.

- Before the push: `<dir>` is the worker's worktree and `<head>` is `HEAD`.
- After the push: `<head>` is `origin/<branch>`, from the worktree or the repo path, so the hash is of what GitHub will merge.
- `<base>` is the item's current base: its parent's branch while it is stacked, `main` once it is retargeted.

`reviewedDiff` is the hash the reviewer last passed; `walkDiff` is the hash the developer approved in the walkthrough.

## Who

The reviewer the developer chose in the standing choices. Default: a subagent you start in the background with your agent tool, using a code-review agent type when the session has one (for example `code-reviewer`), else a general-purpose one. Alternative: an Orca worker of a different agent (`worker-start --agent codex`, the brief below as its spec, told not to change any file, with the model and effort from [worker-model.md](worker-model.md), "The reviewer") when the developer wants a second model to look.

## Brief

Fill every slot. The reviewer sees nothing but this text.

```text
Review item <id> of <repo owner/name>: the commits in the worktree <path> (head <sha>) against origin/<base>.<PR open: It is PR <url>.> Read-only: do not commit, push, comment, approve, or edit files.
Read `git -C <path> diff origin/<base>...HEAD`, the changed files in that worktree, the task spec <hub>/specs/<id>.md (Spec, Outcome, Scope, Not in this PR, Evidence required), the walkthrough the developer will read <hub>/walkthroughs/<id>-w<n>.js, and these repo rules: <paths>.
<Round 2 or later: previous blocking findings: <list>. Since the last review: <fixes in commits <shas> | the developer's change request <list> | a rebase that resolved conflicts in <files>>. Check each finding is fixed, then review the whole diff again.>
<After the developer's approval: The developer approved walkthrough round <k>. Since then: <the new round's `changes`>.>
Follow <this skill's folder>/references/reviewer.md: it holds the six checks, in order, and the form of your answer. If you cannot read that file, answer only `CANNOT READ reviewer.md` and stop.
Write in <the PR language: SKILL.md, "Language">.
```

A reviewer that answers `CANNOT READ reviewer.md` could not open this skill's folder: start the round again with the text of [reviewer.md](reviewer.md) from "Check, in this order" to its end in place of the line that names it, do the same for the rest of this run, and log it.

## After the verdict

1. Save the reviewer's answer as it came, not a summary or a translation of it, as `<hub>/reviews/<id>-r<n>.md`. Once the PR exists, post each saved round on it: `gh pr comment <n> --body-file <that file>`, under a heading in the PR language naming the round and its verdict ("Independent review round <n>: passed", "Independent review round <n>: changes requested") (rounds from before the PR are posted when it opens: SKILL.md, `pr-open`).
2. Record it in the walkthrough's `review`, so the developer sees it on the page (step 6): `node <this skill's folder>/scripts/verdict.cjs record <hub>/reviews/<id>-r<n>.md <hub>/walkthroughs/<id>-w<k>.js --round <n> --head <reviewHead>`, where `w<k>` is the walkthrough round the brief named. Add `--from <hub>/walkthroughs/<id>-w<k-1>.js` when that round's `review` does not hold the earlier rounds yet. It prints `ok:` with the verdict and the counts, then every blocking finding with its number: that is all you need to read. When the developer's language is not the PR language, run `node <this skill's folder>/scripts/verdict.cjs check <hub>/reviews/<id>-r<n>.md` instead, which prints the same and writes nothing, and write the round yourself in the developer's language as below. A `cannot parse:` line means the answer is not in the form: read the file and write the round yourself, in a `node - <<'RV'` heredoc as in the walkthrough template: load the file, set `review` to every round so far (`{ round, verdict, head, findings: [{ level, file, line, what, fix }] }`), write it back with `JSON.stringify`. Either way you write each `fix` yourself the same way: how an earlier round's finding was resolved, from the worker's "finding → commit" or your overrule.
3. **PASS**: first check that the head still equals `reviewHead` (`git -C <path> rev-parse HEAD`); if it moved during the review, review again. Record `reviewedDiff` from the hash. Keep the non-blocking findings for the final report's follow-ups. Then:
   - No `walkDiff` yet (the developer has not approved this item's code): clear `reviewPending`; phases 4 if they are lower; check the page and set the item `walk` right away, then walk the developer through it ([walkthrough.md](walkthrough.md), "Show it to the developer").
   - `walkDiff` set: clear `reviewPending`, send the item's held `pendingRebase` if any (merging.md; clear it once sent), and set status and phases from what has happened: no PR yet → `active`, phases 5 (send the held `APPROVED` if the developer approved meanwhile); PR open without a green `worker_done` since → `pr`, phases 6; a green `worker_done` at this head → `ready`, phases 7, and for base `main` run the preflight in [merging.md](merging.md) and ask for merge approval with the new round's `changes` in the message (stacked: it waits for its parent).
4. **CHANGES**: give the blocking findings to the item's worker. The message is what `node <this skill's folder>/scripts/verdict.cjs reply <hub>/reviews/<id>-r<n>.md` prints (`--except` with their numbers leaves out the findings you overruled), so do not write the findings again: before the PR, `reply --id <askId> --body "$(…)"` (protocol rule 6c); with the PR open, `send` it; on the Claude app, send the text it prints. After a `cannot parse:`, write `REVIEW: <findings>` yourself. (`send` reopens a closed worker; protocol rule 11). Item `active`, an `ext` saying the worker is fixing the k blocking findings ("Fixing the <k> findings from the review"). When the worker asks "ready for review" again, or sends its "follow-up: review fixes", check the walkthrough again and start the next round.
5. You may overrule a finding you judge wrong on technical grounds: log why, add it to the item's `overruled` ("<finding> — <why>"), write the reason into that finding's `fix`, and say it in a PR comment once the PR exists. The walkthrough page and the merge approval message show it, so the developer sees what you set aside. A finding that is really a product question goes to the developer.
6. When the third round is still blocked on the same finding, stop the loop. Decide it yourself if it is technical and log the reason, or ask the developer.

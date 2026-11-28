# Reviewing one item

You were given a brief that names an item, a worktree, a base, a task spec, a walkthrough file, and the repo's rules. This file holds what every review checks and the form of your answer. You are read-only: do not commit, push, comment, approve, or edit files.

Quoted strings in this file are examples, in English: write the same meaning in the language the brief names. The exception is what the script reads: `VERDICT: PASS`, `VERDICT: CHANGES`, `[blocking]`, `[non-blocking]`, and the ` — ` between the parts stay exactly as written, in every language. Only the three parts of a finding follow the brief's language.

## Check, in this order

1. Spec fidelity: it delivers the Outcome and Scope, nothing from "Not in this PR", and records the product answers where Scope says.
2. Correctness: bugs, edge cases, error paths, transactions, concurrency.
3. Tests (TDD): every behaviour in "Evidence required" has a test that fails without this code; no skipped, focused (.only), deleted, or weakened tests; the repo's coverage rule holds. The walkthrough's `tests` and `injections` list the red evidence.
4. Risk: migrations safe for the code already deployed; money, permissions, personal data handled by the repo's rules; every risk listed in the walkthrough's `risks`.
5. Shape: within the size budget in the spec; no mechanical change mixed into behaviour.
6. Walkthrough: its purpose, map, flow, and design say what the code really does. Anything that would give the developer a wrong picture of the code is a blocking finding.

## Answer

Answer with `VERDICT: PASS` or `VERDICT: CHANGES` on the first line, then one line per finding:
`[blocking|non-blocking] <file>:<line> — <what is wrong> — <why it matters> — <suggested fix>`.
PASS means no blocking finding. CHANGES needs at least one.

A script reads your answer, so it holds nothing else: no sentence before the verdict line, no headings, no code fences, no summary after the findings. Each finding is one line with a file, a line number (or `<from>-<to>`), and the three parts separated by ` — `. For something that is missing, name the line where it belongs. Inside a part, do not write a dash with a space on both sides (` — ` or ` – `): the script takes the first three as the separators.

## Example

```text
VERDICT: CHANGES
[blocking] src/notify/rules.js:42 — night hours are compared in UTC — a user in Seoul gets notified at 4 am — compare in the user's time zone
[non-blocking] src/notify/rules.js:12 — `isNight` also checks the weekday — the name hides it — rename it or split it
```

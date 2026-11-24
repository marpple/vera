# Choosing a worker's model and effort

Read this before you start a worker: in step 6, for each later item, and for a worker that replaces another.

You choose the model and the reasoning effort for each item yourself, when you start its worker. Do not ask the developer, and do not leave the choice to the worker. If the developer names a model or an effort, for the run or for one item, use what they named and record it as an `answered` decision (and in `spec.md` when it is for the run); that is the only thing that overrides this file. A model that an older hub's standing choices listed as a default and the developer only kept is not one they named: choose by this file.

Quoted strings in this file are examples, in English: write the same meaning in the developer's language ([SKILL.md](../SKILL.md), "Language").

## What the agent offers

Look it up once in each hub session (a new hub, and again on every resume), and again whenever you no longer hold the result (after a compaction), so a model released since the last session is used without any change to this skill. Never take a model name from memory, from this file, or from an older `state.js`: a name you pass is one the lookup printed.

| Agent | Where to look | What to pass |
|---|---|---|
| Claude | `claude --help`: the `--model` line names aliases (its examples may not be all of them), and the `--effort` line lists the levels | An alias, never a full model name: an alias always starts the newest model of its family |
| Codex | `codex debug models`: each entry has `slug`, `description`, `visibility`, and `supported_reasoning_levels` | A `slug` whose `visibility` is `list` and whose description does not call it a previous generation or legacy model. Codex has no alias, so keep only the newest generation: the entries whose slug carries the highest version number in the list. Drop an entry whose description names a specialty other than coding |

Order the families from the lightest to the most capable. The names come from the lookup; the order comes from the descriptions, and where they do not say (Claude's help gives none), from what you know about the families. A name whose place you do not know counts as the most capable: a new family is usually the top one, and this mistake costs money, not quality. When the lookup fails, or the agent is another one, start the worker with neither `--model` nor `--effort` (it runs on the agent's own settings) and log that once.

## Baseline

The baseline is what an ordinary item gets, and every doubt resolves to it or above it.

- **Model**: the family one below the most capable one the agent offers. The most capable family is kept for the items that need it. When the agent offers a single family (Codex, when only one model carries the newest version), that one is the baseline and every step is an effort step.
- **Effort**: `high`.

## One step up or down

Judge each item as a whole from its spec: what it touches, what depends on it, and how its result is checked. Then move at most one step from the baseline, on one axis only: the model one family, or the effort one level (`xhigh` above `high`, `medium` below it). Never move both, never two steps, and so never the lightest effort or `max`.

| Choice | When | What changes |
|---|---|---|
| Up | Any of: a risky area ([splitting.md](splitting.md), check 4); a contract, schema, or shared design that other items build on; concurrency, transactions, or a state machine; code no test covers yet | The effort, when the item needs more care on a known path (a migration, a money write). The model, when it needs more capability (a design other items build on, subtle concurrency, a wide unfamiliar area) |
| Baseline | Everything else | Nothing |
| Down | All of: mechanical (a move, rename, or format), docs-only, or a small configuration or wording change; no risky area; nothing stacks on its design; the existing suite or one new test checks the whole outcome | The effort. The model instead only for a mechanical or docs-only item, and only when the agent offers a family lighter than the baseline |

When you cannot decide between the baseline and down, use the baseline. When you cannot decide between the baseline and up, go up. When both reasons to go up fit one item (a migration on a schema other items build on), move the model.

These do not change the choice: the item's size (an item over the size target is split, not given a stronger model), how many items are left, the wish to finish sooner, and the autonomy level.

## A replacement worker

A running worker keeps the model and effort it started with: a `send` continues the same session. When an item gets a new worker because the first one failed at the work itself (not at the environment or a missing input), start it one step above what the first one had, still within one step of the baseline: an item that ran a step down gets the baseline, and an item at the baseline goes up. An item that was already one step up, or whose replacement also fails at the work, gets no further worker: set it `blocked` and tell the developer.

## The reviewer

A reviewer you start as an Orca worker ([review.md](review.md), "Who") gets a model and effort too: the baseline, or one step up when the item itself ran a step up: a step on the reviewer's own agent, on the axis the item used. Never a step down.

## Starting and recording

- Pass both flags to `worker-start`: `--model <model> --effort <effort>`. Orca refuses `--effort` without `--model`, and refuses a level the model does not support; when it refuses the level, use the nearest level it accepts toward `high`.
- On the Claude app, set `model` in `start_session`, and the effort only when the tool has a field for it. Without one the worker runs at the app's effort, a step up is a model step, and a step down is a model step for a mechanical or docs-only item and the baseline for any other.
- Write `model` and `effort` into the item's `workers` row in `state.js`, with the receipt.
- Log a choice that is not the baseline with its reason, in the worker-start line: "Started the N1 worker one effort level up (xhigh): migration". List these choices in the final report ([cleanup.md](cleanup.md)).

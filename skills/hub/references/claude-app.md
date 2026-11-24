# Running the hub in the Claude desktop app

Read this first when the hub runs in the Claude desktop app (`runtime: "claude-app"`, [SKILL.md](../SKILL.md), "Runtime"). The rest of the skill is written for Orca. In the app, every rule, step, and check in it holds unchanged; only the Orca commands are replaced by the app's own tools, as this file says. Where this file names a step or a section, do what it says instead of the Orca command there.

Quoted strings in this file are examples, in English: write the same meaning in the developer's language ([SKILL.md](../SKILL.md), "Language").

## What differs, at a glance

| Orca | Claude app |
|---|---|
| `orca skills get orchestration` | nothing to load: this file is the command mechanics |
| `orca orchestration run-create`, `run-use`, `runId` | the hub's own session id, `hubSession` |
| `orca orchestration worker-start` | `mcp__ccd_session__start_session` ("Starting a worker") |
| `send`, `reply --id <askId>` | `SendMessage` to the worker's session ("Hub to worker") |
| a worker's `ask`, `question`, `status`, `worker_done` | a `SendMessage` to the hub whose first line starts with `VERA` ("Worker to hub") |
| `escalation` with `stopReason` | a worker that went idle without `ask`, `question`, or `done` ("Escalations") |
| `orca orchestration worker-read` | `mcp__ccd_session_mgmt__list_events` on its session |
| `orca orchestration worker-stop` | `mcp__ccd_session_mgmt__stop_session` |
| `worker-release` and `orca worktree rm` | `mcp__ccd_session_mgmt__archive_session` ("Cleaning up a worker") |
| `orca orchestration inbox`, `lastMsgId` | the workers' transcripts, read by `sync.cjs`, and `lastMsgAt` |
| `orca worktree set` (parent, name, comment, status, unread) | session titles and the unread dot ("Sidebar") |
| `orca tab create --url "file://<hub>/<page>"` | the browser pane on `http://127.0.0.1:<port>/<page>` ("Pages") |
| Codex workers | not available: every worker is a Claude Code session |

## Hub folder

`<home>/.vera/workspaces/<repo>/_hub/<feature-slug>/`, where `<home>` is the home directory (`echo $HOME`) and `<repo>` is the name of the repo's main checkout folder. Everything SKILL.md, "Hub folder", says about it holds. `sync.cjs` also writes `sync.port` there ("Pages").

## The hub's identity

`mcp__ccd_session_mgmt__get_session` with `session_id: "self"` gives this session's id (`local_…`) and title. In SKILL.md step 5, in place of `run-create`, store them in `state.js` as `hubSession` and `hubOldTitle`, with `runtime: "claude-app"`. Every worker sends its messages to `hubSession`.

## Starting a worker

In SKILL.md step 6, in place of `orca orchestration worker-start` and the `orca worktree` commands around it, call `mcp__ccd_session__start_session` once per item:

| Field | Value |
|---|---|
| `initiation` | `"user_asked"`: the developer invoked the hub, which is the request to start its workers |
| `context` | `"fresh"` |
| `use_worktree` | `true` (one worktree per item) |
| `branch_name` | `<branch-slug>` (the app adds its prefix and a suffix; the worker renames it: "Protocol on the Claude app") |
| `title` | `<id> · <short title>` |
| `name` | `<id>-<slug>` in lowercase, `[a-z0-9-]`, at most 24 characters |
| `prompt` | `You are the Vera worker for <id>. Read <hub>/specs/<id>.md in full before anything else and follow it exactly. Send every hub message with SendMessage to <hubSession>.` |
| `background` | the feature's goal in two or three sentences from `spec.md` (at least 80 characters) |
| `model` | the alias you choose for this item ([worker-model.md](worker-model.md)); omit it only when the lookup there failed, to use the hub's model. The tool has no effort field here: that file says what a step is without one |
| `permission_mode` | omit it: the worker inherits the hub's mode. A worker in another mode holds the hub's messages for approval |

**Which turns can start a worker.** The app refuses `start_session` in a turn that another session's message started (a worker's VERA message, or a `<side-sessions-event>` that does not follow the developer's own turn) and offers a proposal card instead. So start workers only in a turn the developer started: step 6 on a new hub, a resume, or any turn where the developer answered or asked something. When a worker's message frees a slot (a `worker_done`, a merge approval you handled in that turn), do not call `start_session` and do not propose a card: set each item that can now start to `ext` "Starts at your next message", add one to-do to `ask` saying that any reply to the hub starts it ("Reply anything to the hub and N3 starts"), and start it in the developer's next turn. A refusal in a turn you thought was the developer's means the same: leave the item waiting as above, never retry in a loop.

The result gives the worker's session id. `mcp__ccd_session_mgmt__get_session` on that id gives its worktree path. Write `session`, `path`, and the item's `branch` into its `workers` row before you start the next worker. At `medium` or `high`, run `allow.cjs write <its path> <level>` right after the receipt: the app creates the worktree as the session starts, so the list cannot exist before it, and a worker that still prompts is answered by the developer as at `low`.

## Worker to hub

Every worker message is one `SendMessage` call with `to: <hubSession>`. Its first line is:

```
VERA <kind> <item-id>[ phase=<phase>][ outcome=<succeeded|failed>]: <subject>
```

The body follows on the next lines. A worker's message starts a hub turn, or waits until the current turn ends.

| Orca | Claude app | After sending |
|---|---|---|
| `send --type status --phase <p>` | `VERA status <id> phase=<p>: <subject>` | the worker keeps working |
| `ask --question "<q>"` | `VERA ask <id>: <q>` | the worker ends its turn |
| a product `question` | `VERA question <id>: <q>` | the worker ends its turn |
| `worker_done --outcome <o>` | `VERA done <id> outcome=<o>: <subject>` | the worker ends its turn |

## Hub to worker

`reply --id <askId>` and `send` are both `SendMessage` with `to: <the worker's session id>`. The message arrives in the worker as a new turn and wakes it when it is idle. `askId` holds the `at` time of the ask being answered, from live.js `hub` (run `node <hub>/sync.cjs --once` first when it is not listed yet); clear it when you reply. A session keeps its id however often you write to it, so the Loop's rule about the new dispatch id a `send` returns does not apply here.

## Protocol on the Claude app

When you write `protocol.md` and each task part from [worker-spec.md](worker-spec.md), make these changes, and keep every other word:

- Add this rule before rule 1: `0. MESSAGES. Every message to the hub is one SendMessage call with to: <hubSession>. Its first line is VERA <kind> <item-id>[ phase=<phase>][ outcome=<succeeded|failed>]: <subject>, the body follows on the next lines. Kinds: status (keep working after it), ask and question (end your turn after it; the hub's reply wakes you), done (your worker_done; end your turn after it). When the hub sends HUB MOVED: send every VERA message to <id>, use that id from then on. Ending a turn without ask, question, or done tells the hub you are stuck.`
- Write each `orca orchestration ask --question "<q>"` as `VERA ask <item-id>: <q>`, and the product question in rule 8 as `VERA question <item-id>: <q>`, with "the hub's reply wakes you" for "Orca wakes you".
- Write each `orca orchestration send --type status --phase <p> --subject "<item-id>: <s>" --body "<b>"` as `VERA status <item-id> phase=<p>: <s>` (the id once, in the prefix) with `<b>` as the body, and `send --phase approval` as `VERA status <item-id> phase=approval: <the command it waits on>`.
- Write each worker_done with `--outcome <o>`, and "the worker_done command from your Orca preamble", as `VERA done <item-id> outcome=<o>: <subject>`.
- Rule 12: "its sync reads your session's transcript" for "Orca shows your current activity".
- Rule 13: leave out every sentence and clause about Codex.
- Task part, "Base": in place of the worktree line, write: `The app created this worktree with its own branch name and base. Before any other work, and only while the branch has no commit of yours: git fetch origin && git branch -m <branch> && git reset --hard <base ref> (<sha>).` Keep the PR base and the rest.

## Escalations

The app tells the hub when the sessions it started have all ended their turns (a `<side-sessions-event>` message), not when one of several does. So at every wake, check `mcp__ccd_session_mgmt__list_sessions` with `linked: true`. A worker that is idle and whose last VERA message is a `status` (or that sent none) stopped without `ask`, `question`, or `done`: handle it as the loop's `escalation` row, reading it with `list_events`. The dashboard shows the same: its card says the worker stopped.

## Sidebar

- In SKILL.md step 5, in place of the five sidebar sub-steps: rename this session to `<Hub> · <feature>` with `mcp__ccd_session_mgmt__set_session_title` (`"self"`), after recording `hubOldTitle`. If the old title already has a hub's `<Hub> · <feature>` form, ask the developer which title to give back and store their answer. Workers you start nest under this session by themselves, so the run is already one tree; `hubWorktree`, `hubWorktreeOldName`, and `hubWorktreeOldNameMode` stay "".
- On resume, in place of the sidebar bullet: rename this session again when its title differs from `<Hub> · <feature>`; record nothing.
- After every event, in place of the two `orca worktree set` bullets: set each live worker's title to `<id> · <short title> · <stage word>` (Working, In review, Walkthrough waiting, PR open, Ready to merge, Merged) with `set_session_title`, and mark the hub's session unread with `mcp__ccd_sidebar__set_unread` (`"self"`, `true`) when `ask` is not empty, read (`false`) when it is.

## Pages

The app's browser pane shows a `file://` page outside the project only as a static snapshot, which never re-reads `state.js`. So on the Claude app `sync.cjs` also serves the hub folder read-only on `127.0.0.1` and writes the port to `<hub>/sync.port`. Wherever the skill opens or links `file://<hub>/<page>`, use `http://127.0.0.1:<port>/<page>` instead, and open it with `mcp__Claude_Browser__preview_start` (`url`). Wait a second for `sync.port` after starting the sync; a restarted sync picks a new port, so open the pages again from the new one.

## Cleaning up a worker

In [cleanup.md](cleanup.md), "Cleaning up an item":

- Step 1: `stop_session` on its session if it is still working. Do not archive it yet.
- Step 4: only after step 3 saved the changes, `mcp__ccd_session_mgmt__archive_session` on its session (with a reason such as "PR #41 merged"); it stops the session and removes its worktree. Read its result: when it says the session was not archived (still working, pinned, open on screen, or declined), leave the worktree, log the reason, and tell the developer; never remove the worktree of a session that is still live. Only when it archived and `git -C <repo path> worktree list` still shows the path, run `git -C <repo path> worktree remove <path>`.
- Step 5: archiving keeps the local branch, as `orca worktree rm` does. `<repo path>` is the main checkout: `dirname "$(git -C <any worktree> rev-parse --path-format=absolute --git-common-dir)"`.

In "Closing the hub", step 1 checks `list_sessions` and `git worktree list` in place of the Orca lists, and step 3 gives this session `hubOldTitle` back with `set_session_title` and marks it read, in place of the `orca worktree set` commands. Never archive the hub's own session.

## Resume

In SKILL.md, "Start or resume", in place of the `run-use`, `worker-list`, and `inbox` bullet:

1. `mcp__ccd_session_mgmt__get_session` with `self`. When its id differs from `hubSession`, this is a new hub session: set `hubSession`, write the new id into rule 0 of `protocol.md` and of each live worker's `specs/<id>.md`, and send every live worker `HUB MOVED: send every VERA message to <your session id> from now on.` Workers started by the old session stay nested under it in the sidebar.
2. `mcp__ccd_session_mgmt__list_sessions` with `linked: true` (empty in a new session: use the `session` ids in `workers`), `gh pr list --author @me --state open`, and `node <hub>/sync.cjs --once`, then read `<hub>/live.js`: its `hub` lists every VERA message workers sent after `lastMsgAt`. Reconcile them as the Orca bullet says.

After a compaction (SKILL.md, "After a compaction"), the inbox reconcile is step 2 alone; skip step 1 unless `get_session` shows a new session id.

After every event, in place of `lastMsgId`, set `lastMsgAt` to the `at` of the newest message you handled, from live.js `hub`. When live.js does not list that message yet, run `node <hub>/sync.cjs --once` and read live.js again; never use the current time, which would mark messages that arrived meanwhile from other workers as handled.

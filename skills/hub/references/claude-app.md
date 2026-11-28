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
| a worker's `ask`, `question`, `status`, `worker_done` | a text in the worker's own turn whose first line starts with `VERA`, which `sync.cjs --wait` hands to the hub ("Worker to hub") |
| `escalation` with `stopReason` | a worker that went idle without `ask`, `question`, or `done` ("Escalations") |
| `orca orchestration worker-read` | `mcp__ccd_session_mgmt__list_events` on its session |
| `orca orchestration worker-stop` | `mcp__ccd_session_mgmt__stop_session` |
| `worker-release` and `orca worktree rm` | `mcp__ccd_session_mgmt__archive_session` ("Cleaning up a worker") |
| `orca orchestration inbox`, `lastMsgId` | the workers' transcripts, read by `sync.cjs`, and `lastMsgAt` |
| `orca worktree set` (parent, name, comment, status, unread) | session titles and the unread dot ("Sidebar") |
| `orca tab create --url "file://<hub>/<page>"` | the browser pane on `http://127.0.0.1:<port>/<page>` ("Pages") |
| Codex workers | not available: every worker is a Claude Code session |

## Hub folder

`<home>/.vera/workspaces/<repo>/_hub/<feature-slug>/`, where `<home>` is the home directory (`echo $HOME`) and `<repo>` is the name of the repo's main checkout folder. Everything SKILL.md, "Hub folder", says about it holds. `sync.cjs` also writes `sync.port` there ("Pages"), and `sync.cjs --wait` writes `wait.pid` ("Waking the hub").

## The hub's identity

`mcp__ccd_session_mgmt__get_session` with `session_id: "self"` gives this session's id (`local_…`) and title. In SKILL.md step 5, in place of `run-create`, store them in `state.js` as `hubSession` and `hubOldTitle`, with `runtime: "claude-app"`. Workers never message `hubSession`: they write their VERA messages into their own transcripts ("Worker to hub").

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
| `prompt` | `You are the Vera worker for <id>. Read <hub>/specs/<id>.md in full before anything else and follow it exactly. Write every hub message as your own text, never with SendMessage.` |
| `background` | the feature's goal in two or three sentences from `spec.md` (at least 80 characters) |
| `model` | the alias you choose for this item ([worker-model.md](worker-model.md)); omit it only when the lookup there failed, to use the hub's model. The tool has no effort field here: that file says what a step is without one |
| `permission_mode` | omit it: the worker inherits the hub's mode. A worker in another mode holds the hub's messages for approval |

**Which turns can start a worker.** The app refuses `start_session` in a turn that another session's message or an automated event started (the exit of `sync.cjs --wait`, a message from a worker, or a `<side-sessions-event>` that does not follow the developer's own turn) and offers a proposal card instead. So start workers only in a turn the developer started: step 6 on a new hub, a resume, or any turn where the developer answered or asked something. When a worker's message frees a slot (a `worker_done`, a merge approval you handled in that turn), do not call `start_session` and do not propose a card: set each item that can now start to `ext` "Starts at your next message", add one to-do to `ask` saying that any reply to the hub starts it ("Reply anything to the hub and N3 starts"), and start it in the developer's next turn. A refusal in a turn you thought was the developer's means the same: leave the item waiting as above, never retry in a loop.

The result gives the worker's session id. `mcp__ccd_session_mgmt__get_session` on that id gives its worktree path. Write `session`, `path`, and the item's `branch` into its `workers` row before you start the next worker. At `medium` or `high`, run `allow.cjs write <its path> <level>` right after the receipt: the app creates the worktree as the session starts, so the list cannot exist before it, and a worker that still prompts is answered by the developer as at `low`.

## Worker to hub

A worker never calls `SendMessage`. In the app that tool always stops on a prompt the developer must allow, whatever the permission rules say (measured on 2026-11-23: an allow rule for it in the worktree's settings changed nothing, while a Bash allow rule written the same way took effect at once), and the prompt shows the worker's question with only Deny and Allow, where the developer cannot choose an answer. So every worker message is a text the worker writes in its own turn, alone in its text block. Its first line is:

```
VERA <kind> <item-id>[ phase=<phase>][ outcome=<succeeded|failed>]: <subject>
```

The body follows on the next lines. `sync.cjs` reads it from the worker's transcript.

**Waking the hub.** End every hub turn with `node <hub>/sync.cjs --wait` run in the background (Bash with `run_in_background`). One runs per hub folder: a new wait replaces the running one, which exits 3 and prints nothing, so after a compaction or in a new session start it again without checking. When the loop's `question` row has you ask the developer, start from the (a), (b), (c) options in the body, keeping their words, add impact and your recommendation as that row says, and never offer an option the body does not give; at `high`, or for a technical question, decide as that row says. Any exit but 0 with lines, 3, and 2, such as 143 when something outside ended the wait, leaves no wait running: start it again. A wait that exits 3 was replaced by a newer one, which is running: it needs nothing, and a turn that only its exit started ends without starting another wait (that would replace the running one, whose exit would wake you again). A turn that also brought lines to handle, or the developer's message, ends with the wait as usual. It exits once a worker has something for you, printing one line each, after the line's time, and under a VERA line the message's body, each line indented by four spaces (the options and recommendation of a question, a `SUMMARY:`): a VERA message newer than `lastMsgAt`, or `stopped <id>: <its last text>` for a worker whose turn ended after `lastMsgAt` without `ask`, `question`, or `done`, whenever it ended ("Escalations"). Its exit starts your next turn. A line whose time is not after `lastMsgAt` was handled already (an earlier wait printed it too): skip it. Handle every other line as the loop says (the developer's answers to product questions go through AskUserQuestion, with options), set `lastMsgAt` to the newest time among the lines you handled, so a handled stop does not wake you again, and start the wait again before you end the turn. A wait that exits 1 could not read `state.js`: fix it, then start the wait again. A wait that prints `closed`, or exits 2 (this hub's `runtime` is not `claude-app`), is not started again.

| Orca | Claude app | After writing it |
|---|---|---|
| `send --type status --phase <p>` | `VERA status <id> phase=<p>: <subject>` | the worker keeps working |
| `ask --question "<q>"` | `VERA ask <id>: <q>` | the worker ends its turn |
| a product `question` | `VERA question <id>: <q>` | the worker ends its turn |
| `worker_done --outcome <o>` | `VERA done <id> outcome=<o>: <subject>` | the worker ends its turn |

## Hub to worker

`reply --id <askId>` and `send` are both `SendMessage` with `to: <the worker's session id>`. The app asks the developer to allow each one in the hub's session; the prompt carries an answer already given, so it needs no choice, only Allow. The message arrives in the worker as a new turn and wakes it when it is idle. `askId` holds the time of the ask being answered, the time that starts its `sync.cjs --wait` line; clear it when you reply. A session keeps its id however often you write to it, so the Loop's rule about the new dispatch id a `send` returns does not apply here.

## Protocol on the Claude app

When you write `protocol.md` and each task part from [worker-spec.md](worker-spec.md), make these changes, and keep every other word:

- Add this rule before rule 1: `0. MESSAGES. Never call SendMessage: in the app it stops on a prompt the developer cannot answer. Every message to the hub is a text you write, alone in its text block, whose first line is VERA <kind> <item-id>[ phase=<phase>][ outcome=<succeeded|failed>]: <subject>; the body follows on the next lines, and the hub reads it from your transcript. Kinds: status (keep working after it), ask and question (end your turn with it as your last text; the hub's reply wakes you), done (your worker_done; end your turn with it as your last text). For a question, list the options in the body as (a), (b), (c) with your recommendation; the hub asks the developer with them. Ending a turn without ask, question, or done tells the hub you are stuck.`
- Write each `orca orchestration ask --question "<q>"` as `VERA ask <item-id>: <q>`, and the product question in rule 8 as `VERA question <item-id>: <q>`, with "the hub's reply wakes you" for "Orca wakes you".
- Write each `orca orchestration send --type status --phase <p> --subject "<item-id>: <s>" --body "<b>"` as `VERA status <item-id> phase=<p>: <s>` (the id once, in the prefix) with `<b>` as the body, and `send --phase approval` as `VERA status <item-id> phase=approval: <the command it waits on>`.
- Write each worker_done with `--outcome <o>`, and "the worker_done command from your Orca preamble", as `VERA done <item-id> outcome=<o>: <subject>`.
- Rule 12: "its sync reads your session's transcript" for "Orca shows your current activity".
- Rule 13: leave out every sentence and clause about Codex.
- Task part, "Base": in place of the worktree line, write: `The app created this worktree with its own branch name and base. Before any other work, and only while the branch has no commit of yours: git fetch origin && git branch -m <branch> && git reset --hard <base ref> (<sha>).` Keep the PR base and the rest.

## Escalations

`sync.cjs --wait` prints `stopped <id>` for a worker whose turn ended after `lastMsgAt` without `ask`, `question`, or `done`: handle that line as the loop's `escalation` row, reading the worker with `list_events`. Handle a stop only from that line, which carries the time to set `lastMsgAt` to. The app's own notes that a session you started finished a turn, or a `<side-sessions-event>`, carry nothing to handle by themselves: the wait prints the same worker's message or stop. The dashboard judges by time instead: its card says the worker stopped once it has been idle for five minutes on an active item you have not marked `waiting`, so mark the item `waiting` while its question waits on the developer.

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

1. `mcp__ccd_session_mgmt__get_session` with `self`. When its id differs from `hubSession`, this is a new hub session: set `hubSession` (workers write their messages into their own transcripts, so they need no new id). Workers started by the old session stay nested under it in the sidebar.
2. `mcp__ccd_session_mgmt__list_sessions` with `linked: true` (empty in a new session: use the `session` ids in `workers`), `gh pr list --author @me --state open`, and `node <hub>/sync.cjs --wait --now`, which prints at once, as `--wait` does, every VERA message and every stop after `lastMsgAt` (nothing when none). Reconcile them as the Orca bullet says, then start the wait ("Waking the hub").

After a compaction (SKILL.md, "After a compaction"), the inbox reconcile is step 2 alone; skip step 1 unless `get_session` shows a new session id.

After every event, in place of `lastMsgId`, set `lastMsgAt` to the newest time among the `sync.cjs --wait` lines you handled ("Waking the hub"). Before you move it, run `node <hub>/sync.cjs --wait --now` and handle every line it prints that you have not handled, so a message or a stop that came meanwhile, from any worker, is not skipped. Never use the current time, which would mark those as handled.

/* Hub dashboard state. The hub edits ONLY this file; dashboard.html re-reads it every 5 s, and sync.cjs reads it
   to know which workers and PRs to watch (it writes their live activity and CI to live.js, never here).
   After each edit run `node --check state.js`: a syntax error makes the page keep its last good screen with a warning.
   The renderer ignores fields it does not know, so hub bookkeeping can live here too. */
window.HUB_STATE = {
  title: "Notification settings",
  owner: "Alex",
  updatedAt: "2026-11-09 14:20",
  baseSha: "a1b2c3d",
  workerCap: 2,
  flowSummary: "Base lane → UI lane",   // optional: shown after the Work flow heading
  repo: "acme/app",          // GitHub owner/name: sync.cjs runs `gh pr view --repo` with it
  runId: "run_xxxxxxxx",     // bookkeeping for resume
  hubWorktree: "",           // the parent workspace in Orca's sidebar, the hub's own or the repo's main one ("" until SKILL.md step 5): workers are its children
  hubWorktreeOldName: "",    // the parent's display name before the hub renamed it ("" when the hub renamed nothing): restored at close
  hubWorktreeOldNameMode: "", // the parent's displayNameMode before the rename ("" when the hub renamed nothing)
  lastMsgId: "",             // id of the last Orca message handled: resume handles the inbox messages after it
  runtime: "orca",           // "orca" | "claude-app" (SKILL.md, "Runtime"); absent = "orca". The next three are claude-app only:
  hubSession: "",            // the hub's Claude app session id: workers send their VERA messages to it (references/claude-app.md)
  hubOldTitle: "",           // the hub session's title before the hub renamed it: restored at close
  lastMsgAt: "",             // ISO time of the newest worker message handled: sync.cjs marks later ones as not handled yet
  v: 2,                      // layout version: review before walkthrough. A state.js without it is upgraded first (references/upgrade.md)
  protocolFrom: "",          // what scripts/protocolhash.cjs printed when protocol.md was written (SKILL.md step 5): a resume writes it again when this changes
  hashForm: 2,               // the form of reviewedDiff and walkDiff: 2 = templates/diffhash.cjs with the neighbouring lines. A state.js without it holds older hashes: a resume converts them (SKILL.md, "Resume")
  autonomy: "low",          // "low" | "medium" | "high": what the hub leaves to the developer (SKILL.md); absent or unknown = "low"
  lang: "en",                // "ko" or "en": the page's own labels; the hub's sentences follow SKILL.md, "Language"
  closed: false,             // true after the final sweep: sync.cjs exits, the page shows the run as finished
  // Every sentence in this file is read by the developer: write it by references/dashboard.md.
  // ask: one sentence saying which of the developer's to-dos comes first and why. Empty with no to-do or only one.
  //   The page lists the to-dos under it by itself: open decisions, walkthroughs, merge approvals, prompt waits, blocked items.
  ask: "Approve the merge of N1 first. N2 is stacked on it.",
  // needs: what only a human can do and no status shows (a login, a secret). Each becomes a to-do row. Usually empty.
  needs: [],   // e.g. [{ text: "Put the staging DB secret into the N3 worker's terminal.", how: "Open N3 in the Orca sidebar." }]
  // summary: at most 3 sentences the developer should know now and the cards do not show. Replace them; do not pile them up.
  summary: [
    "The N1 migration only adds a table, so no deploy order is needed.",
    "N3 and N4 start after N2's PR is open."
  ],
  // refs: the documents this run follows, beyond spec.md and protocol.md (the page links those itself).
  //   href: https, or a path inside the hub folder. At most 6.
  refs: [
    { label: "Repo rules", href: "https://github.com/acme/app/blob/main/AGENTS.md" },
    { label: "Notification plan", href: "https://github.com/acme/app/blob/main/docs/notify.md" }
  ],
  workers: [
    // tone: active (item work up to its worker_done, counts toward workerCap) | support (PR open after worker_done: waits for merge,
    //       or is reopened for a rebase or review fixes; does not count) | done (cleaned up; keep the row, the final sweep reads its path)
    { lane: "Base", item: "N2", worktree: "app-notify-n2-rules", state: "Writing the code", tone: "active",
      dispatch: "ctx_xxxxxxxx", path: "/Users/me/orca/workspaces/app/app-notify-n2-rules" },  // dispatch, path: sync.cjs and cleanup use them (claude-app: session in place of dispatch)
    // model, effort (bookkeeping, not rendered): what the hub chose for this worker when it started it (references/worker-model.md)
    { lane: "Base", item: "N1", worktree: "app-notify-n1-table", state: "Waiting for merge OK", tone: "support",
      dispatch: "ctx_yyyyyyyy", path: "/Users/me/orca/workspaces/app/app-notify-n1-table" }
  ],
  lanes: [
    // A lane is a dependency chain: the page draws an arrow from each item to the next.
    // countsAsPr: true for lanes whose items are the owner's PRs (the headline, the stage strip and the checkpoint table count only these).
    { name: "Earlier (another owner, merged)", countsAsPr: false, items: [
      { id: "P30", title: "Tidy the user settings table", status: "merged", phases: 8, pr: 30, prUrl: "https://github.com/acme/app/pull/30" }
    ]},
    { name: "Base lane", countsAsPr: true, items: [
      // id: ASCII letters, digits, - and _ only. title: the one-sentence outcome from the plan.
      // status: todo (waiting, normal) | active (worker coding, fixing review findings, or opening the PR)
      //         | review (independent review running) | walk (walkthrough waiting for the developer)
      //         | pr (PR open, CI running) | ready (CI green on the reviewed and approved code: on main it waits for merge approval)
      //         | merged | blocked (something stops the work)
      // phases: checkpoints reached, 0-8 (red, green, verified, reviewed, walkthrough approved, pr-open, ci-green, merged)
      // done: what this PR does so far, one sentence (from the worker's SUMMARY line; at the merge, what the PR delivered).
      // pr, prUrl (https only, rendered as a link), risk, mergeSha (on a merged card): rendered. base: not shown; an item on "main" waits for merge approval. ext: one short sentence on why the item is where it is.
      // after: ids of items in other lanes that must finish first (rendered as links to their cards).
      // waiting: set while the item's worker waits on the hub or the developer ("Decision: <short question>");
      //   rendered as a pill, and the page then does not mark the worker as stopped. Remove it when answered.
      // walkthrough: the latest walkthrough round, "<id>-w<n>". The card and the checkpoint row link to it in every status.
      // walkApproved: the round the developer approved. A later `walkthrough` renders "Changed after OK" until the merge.
      // walkPending / reviewPending: true for an upgraded hub's item that passed that checkpoint's place without it
      //   (rendered: the box late, no merge approval).
      // repo: only when the item's PR lives in another repo than the hub's (sync.cjs looks it up there).
      // Bookkeeping (not rendered): askId (id of the worker's pending ask or question: reply --id), reviewRound, reviewHead (head sent
      //   to the reviewer), reviewedDiff (changed-lines hash the reviewer passed), walkDiff (changed-lines hash the developer approved),
      //   overruled (["finding — why"]), pendingRebase (a rebase command held until the walkthrough is answered), branch, head.
      { id: "N1", title: "Add the notification settings table", status: "ready", phases: 7, done: "The table that stores each user's night notification choice is added and 4 tests pass.", base: "main", risk: ["migration"],
        branch: "feat/notify-n1-table", pr: 41, prUrl: "https://github.com/acme/app/pull/41", head: "d4e5f6a",
        reviewRound: 1, reviewHead: "d4e5f6a", reviewedDiff: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c", walkDiff: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c", ext: "The hub merges it when you approve",
        walkthrough: "N1-w1", walkApproved: "N1-w1" },
      { id: "N2", title: "Build the notification rules as a service", status: "active", phases: 2, done: "The function that decides night hours is written and 6 tests pass.", base: "feat/notify-n1-table",
        branch: "feat/notify-n2-rules", waiting: "Decision: night notification default", ext: "Stacked on N1" },
      { id: "N3", title: "Expose the notification settings API", status: "todo", phases: 0, ext: "Starts once N2's PR is open" }
    ]},
    { name: "UI lane", countsAsPr: true, items: [
      { id: "N4", title: "Add the notification settings screen", status: "todo", phases: 0, after: ["N3"], ext: "Starts once N3 is merged" }
    ]}
  ],
  decisions: [
    // status: open (the developer must answer: shown in the to-do list on top) | watching (the hub is checking) | answered
    // id: the spec.md handle. text: the question as you would ask a colleague, then what depends on it.
    // options (2-4) and recommend (one of them): rendered under an open decision. items: ids waiting for the answer.
    // answer: the developer's choice, once answered. by: "hub" marks one the hub decided alone (listed apart), e.g.
    // { id: "P3", by: "hub", status: "answered", text: "Should the notification text be short?", answer: "Keep it short" }
    { id: "Q1", status: "open", text: "Should notifications be off by default from 10 pm to 8 am? N2's default and N4's help text follow this answer.",
      options: ["Off by default", "On by default"], recommend: "Off by default", items: ["N2", "N4"] },
    { id: "P2", status: "answered", text: "Who merges?", answer: "The hub merges once the developer approves" }
  ],
  // Newest first. The page shows the first 8. On a resume and after a compaction, scripts/trimlog.cjs moves the lines after the 30th to log.md.
  log: [
    "14:20 · CI passed on N1 (#41), so I asked for the merge approval",
    "14:05 · N2 saw its 6 tests fail and started the code",
    "13:55 · The developer approved the N1 walkthrough, and PR #41 is open",
    "13:40 · N1 passed round 1 of the independent review, and I explained its walkthrough",
    "13:30 · Started the workers for N1 and N2"
  ]
};

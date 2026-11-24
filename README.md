# Vera

Vera is a set of agent skills by ddevkim for work that is verified before it is called done: built test-first, reviewed independently, and checked on its final state. *Vera* is Latin for "true things", as in verify and verdict. `hub` is the first skill; more may be added.

| Skill | What it does |
|---|---|
| [hub](skills/hub) | Builds a feature you discussed with your agent as small PRs through worker sessions in Orca or the Claude desktop app, with an independent review, a walkthrough of each PR, and a live dashboard. |

## hub

### What it does

You discuss a feature with Claude Code or Codex, then invoke the hub. Your session becomes the hub: it writes the spec, splits the work into small PRs, and starts one Orca worker per PR in its own worktree. Each worker builds its PR test-first, an independent reviewer checks it, and the hub walks you through the code before the PR opens. A dashboard in an Orca tab shows every PR, its status, and what you need to do next.

![The Vera hub dashboard with to-dos, the stage strip, and PR cards](docs/dashboard.png)

### When a hub is worth it

- Use a hub when the work is two or more PRs (more than one outcome, or over the size target of ≤ 15 files / 300 changed lines, counting hand-written code and tests), and at least two of them can run at the same time or stack.
- Skip it for one small PR, or for work that cannot be split into PRs that merge alone. The hub says so and offers to do the work in your session instead.

### Prerequisites

- One place to run workers: the Orca app with its `orca` CLI and its `orchestration` skill, or the Claude desktop app (Code tab)
- `git`
- `gh`, logged in
- `node` 18 or newer

The skill installs nothing. It checks these itself before a hub starts, with one command you can also run:

```sh
node <skill folder>/scripts/preflight.cjs
```

It prints one `missing:` line per problem. A missing `orchestration` skill comes with the command that installs it: `orca skills install --skill orchestration`. In the Claude desktop app the hub adds `--runtime claude-app`, which checks the app instead of Orca.

The hub runs POSIX shell commands, so it needs macOS or Linux; the check does not look at the system.

### What the checks cover

The independent review, the changed-lines hash the merge compares, and the allow list at Medium and High catch mistakes: a PR that changed after its review, a merge of a commit nobody read, a push to the wrong place. They are not a sandbox.

- A worker is an agent session that runs as you. It can reach what your account can: files outside its worktree, the hub folder with the hashes the review recorded, and your `gh` login.
- The allow list matches command text. A command it does not name, or one wrapped in a script, is decided by the session's own permission mode.
- CI runs every push, including a fix pushed before the next review round reads it. Keep secrets that such a run must not use behind what your repo already protects, such as environments or protected branches.

Run a hub on a repo, and with instructions, you would give an agent session anyway.

### Install

Claude Code:

```sh
claude plugin marketplace add marpple/vera
claude plugin install vera@mco
```

Inside a Claude Code session: `/plugin marketplace add marpple/vera`, then `/plugin install vera@mco`.

Codex:

```sh
codex plugin marketplace add marpple/vera
codex plugin add vera@mco
```

Other agents, with the `skills` CLI:

```sh
npx skills add marpple/vera --skill hub
```

### Moving from ddevkim/vera

Vera was first published in a marketplace named `vera` at `ddevkim/vera`. That marketplace is deprecated and gets no more releases. Remove the old install, then install as above. The skill keeps its name, `/vera:hub`, and a hub folder you already have is not touched.

Claude Code:

```sh
claude plugin uninstall vera@vera
claude plugin marketplace remove vera
```

Codex:

```sh
codex plugin remove vera@vera
codex plugin marketplace remove vera
```

An install made with `npx skills` has no marketplace: run `npx skills remove hub`, then add the skill again as above.

### Start a hub

1. In an Orca terminal, discuss the feature with your agent until you agree on what to build.
2. Invoke the skill: `/vera:hub` in Claude Code (`/hub` when installed with `npx skills`), `$vera:hub` in Codex (`$hub` when installed with `npx skills`). In another agent, ask it to use the hub skill.

Run it from any Orca terminal: Orca's sidebar shows the hub's workspace, or the repo's main workspace when the terminal belongs to none, as one entry named after the feature with every worker beneath it, and the hub gives that workspace its old name back when it closes.

The hub then asks you for:

- confirmation of the spec it wrote from your discussion,
- once, whether to keep its run defaults (the worker agent, how many workers run at a time, the PR assignee),
- product decisions it should not guess,
- a walkthrough of each PR before the PR opens,
- approval of each merge,
- permission prompts in worker terminals.

That list is the **Low** autonomy level, the default. Tell the hub at the start or at any time to run at **Medium** (PRs open after the independent review, workers may push, open PRs, and delete files in their worktree without a prompt; you still answer product decisions and approve merges) or **High** (the hub also decides product questions, merges on green CI, and runs the repo's documented deploy steps, stopping only for risky steps such as dropping data, spending money, or changing secrets).

The hub picks each worker's model and reasoning effort itself and does not ask you. It looks up what the agent offers at each start, so a newly released model is used without a new version of this plugin. An ordinary item runs one family below the most capable model at `high` effort. A risky or foundational item goes one step up and a mechanical or docs-only one goes one step down, never more than one step. Name a model or an effort to the hub to override it.

### In the Claude desktop app

The hub also runs in a Claude desktop app session (Code tab), without Orca. It finds out where it runs by itself: when its session can start other app sessions, each worker is an app session in its own worktree, nested under the hub's session in the sidebar; otherwise it uses Orca as above. Everything else is the same: the spec, the split, TDD, the independent review, the walkthrough, the autonomy levels, and the dashboard.

- Install the plugin as for Claude Code, run `/reload-plugins` in the app session, then invoke `/vera:hub`.
- The dashboard opens in the app's browser pane from a local address the hub's sync serves, because the pane shows local files outside the project only as snapshots.
- Workers inherit the hub session's permission mode, and every worker is a Claude Code session: Codex workers need Orca.
- The hub folder is `.vera/workspaces/<repo>/_hub/<feature>/` in your home directory.

[skills/hub/references/claude-app.md](skills/hub/references/claude-app.md) lists how each Orca command maps to the app.

### Language

The dashboard and the walkthrough page show their labels in Korean or English, from `lang` (`"ko"` or `"en"`) in the hub's `state.js`. The skill creates that file in its hub folder, `<workspaces root>/_hub/<feature>/state.js` (by default `$HOME/orca/workspaces/<repo>/_hub/<feature>/`).

### Update

Claude Code can update Vera on its own. Third-party marketplaces such as this one start with auto-update off, so turn it on once on each machine: in a Claude Code session run `/plugin`, open the **Marketplaces** tab, select `mco`, then **Enable auto-update**. Claude Code then checks for a new version in the background after a session starts; the running session keeps its version until you run `/reload-plugins`, and the next session loads the new one. If `DISABLE_AUTOUPDATER=1` or `DISABLE_UPDATES=1` is set, the toggle is hidden; set `FORCE_AUTOUPDATE_PLUGINS=1` as well to keep plugin updates.

To update by hand instead (restart the session after):

```sh
claude plugin marketplace update mco
claude plugin update vera@mco
```

Codex has no auto-update: run these after each release, once in each `CODEX_HOME` you use:

```sh
codex plugin marketplace upgrade mco
codex plugin add vera@mco
```

npx skills:

```sh
npx skills update hub
```

### Uninstall

Claude Code:

```sh
claude plugin uninstall vera@mco
claude plugin marketplace remove mco
```

Codex:

```sh
codex plugin remove vera@mco
codex plugin marketplace remove mco
```

npx skills:

```sh
npx skills remove hub
```

## Releasing

For maintainers, and for an agent asked to release. A merge to `main` does not reach anyone's install: Claude Code and Codex keep the plugin in a cache named by its version, so installs stay on the old copy until the version changes.

1. Open a pull request that changes only `version` in `.claude-plugin/plugin.json`, titled `Release X.Y.Z`, and list in its body the pull requests merged since the last release. Use a patch version for fixes and a minor version when the skill gains something (a script, a rule, a place it runs).
2. Merge it once CI passes and a reviewer has approved. `.github/workflows/release.yml` then tags the merge commit and publishes the GitHub release, as this would by hand:

   ```sh
   gh release create vX.Y.Z --target <full hash of the merge commit> --title "X.Y.Z" --generate-notes
   ```

   The generated notes list the merged pull requests. Rewrite them to say what changed for a user: `gh release edit vX.Y.Z --notes-file <notes.md>`. Installs do not read the tag: they read the version in `main`. The tag and the release are the history people see on GitHub. Releases before 0.3.0 have neither.
3. Update your own installs as in [Update](#update), then check that each one shows the new version (`claude plugin list`, `codex plugin list`):
   - Claude Code updates one scope per run. With the plugin installed in both, run `claude plugin update vera@mco --scope user` and `claude plugin update vera@mco --scope project`.
   - Codex: once in each `CODEX_HOME` you use.
4. A session that was already running keeps the old version until `/reload-plugins` or a restart.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) describes the steps from an issue to a merge, and [SECURITY.md](SECURITY.md) says how to report a vulnerability.

## License

[MIT](LICENSE)

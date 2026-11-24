# .github

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-24 · **Updated:** 2026-11-24

## Purpose

How the repo itself is run on GitHub: the forms an issue starts from, the pull request template, who is asked to review, the checks, the release, and a record of the rulesets. Nothing here is part of what users install.

## Key Files

| File | Description |
|------|-------------|
| `PULL_REQUEST_TEMPLATE.md` | The body of every pull request: What, Issue, Verification, Checklist |
| `CODEOWNERS` | Who is asked to review each pull request |
| `dependabot.yml` | A weekly check of the actions the workflows use |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `ISSUE_TEMPLATE/` | `bug.yml` and `feature.yml`, the two forms; `config.yml` turns blank issues off and sends a vulnerability to a private report |
| `workflows/` | `ci.yml` runs `node --test` on Node 18 and 26; `release.yml` tags and publishes a release when `version` in the plugin manifest changes on `main` |
| `rulesets/` | `main.json` and `release-tags.json`, the rulesets as they are applied in the GitHub settings |

## For AI Agents

### Working In This Directory

- The files in `rulesets/` are a record, not what GitHub reads. A rule changes in two steps: a pull request that changes the file, then the same change in the GitHub settings. Do not change the settings alone.
- The checks `rulesets/main.json` requires are the jobs of `workflows/ci.yml`. When the Node matrix changes, change both.
- `workflows/ci.yml` runs exactly one command, and reads the repo only. A workflow that needs to write declares its own `permissions`.
- Do not tag a release by hand: `workflows/release.yml` does it, and skips a version that already has a tag.
- Write the forms and the template in English.

### Testing Requirements

`tests/repo-setup.test.cjs` reads these files: run `node --test` from the repo root.

## Dependencies

### Internal

- `AGENTS.md` and `CONTRIBUTING.md` state the rules these files carry out.
- `.claude-plugin/plugin.json` holds the `version` the release workflow reads.

## Manual Notes

Notes under this heading are written by people and kept when this file is regenerated.

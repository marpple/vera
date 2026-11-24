# Security policy

## Supported versions

Security fixes go into the latest release on `main` only. If you run an older version, update first.

## Reporting a vulnerability

**Do not open a public issue for a vulnerability.** Use GitHub's private vulnerability reporting.

1. Open the [private report form](https://github.com/marpple/vera/security/advisories/new).
2. Say which file or script is affected, how to reproduce it, and what it lets someone do.
3. A maintainer answers in that private thread, and the report stays private until a fix is released.

## What counts as a vulnerability

Vera's allow list, independent review, and changed-lines hash catch mistakes. They are not a sandbox: a worker session runs with your account's access. ["What the checks cover"](README.md#what-the-checks-cover) in the README states this limit.

| | Examples |
|---|---|
| Report it privately | A script or page reads or writes files outside what the docs say; the dashboard or the walkthrough page runs code it should not; the allow list lets a command through that the docs say it asks about |
| Open a normal issue | Behaviour that matches a documented limit; a bug with no security effect |

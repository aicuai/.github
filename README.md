# aicuai/.github

Reusable GitHub Actions workflows and the conventions behind them, shared by every repository in the
[AICU](https://aicu.ai/) organization. The repository is public so that any repository — public or
private, inside AICU or not — can call the workflows with a single `uses:` line, at no cost.

## Quick start

Add one file to the calling repository:

```yaml
# .github/workflows/org-checks.yml
name: org checks
on: [push, pull_request]
jobs:
  surface:
    uses: aicuai/.github/.github/workflows/surface-manifest.yml@main
  leak:
    uses: aicuai/.github/.github/workflows/leak-audit.yml@main
    secrets: inherit
```

Both jobs finish in under a minute and need no setup to start. Each one has optional inputs and
secrets, listed in its guide.

## Workflows

| Workflow | Fails when | Needs | Guide |
|---|---|---|---|
| [surface-manifest.yml](.github/workflows/surface-manifest.yml) | The repository serves a public host but `.aicu/surface.yml` does not say who owns it or when it may be retired | nothing | [docs/surface-manifest.md](docs/surface-manifest.md) |
| [leak-audit.yml](.github/workflows/leak-audit.yml) | A secret, an internal name, or (optionally) text an LLM judges internal is about to land in a public repository | `LEAK_DENYLIST`, `AICU_LEAK_AUDIT_API_KEY` (both optional) | [docs/leak-audit.md](docs/leak-audit.md) |

### Surface manifest in one screen

```yaml
# .aicu/surface.yml
entity: inc                      # inc | jp
role: Contest entry, judging, and results
owner: "@AICUai"                 # a handle or team alias, not a personal email
hosts: [contest.example.com]     # [] if nothing is served
deploy: cloudflare-workers
status: live
review:
  next: 2027-03-31               # next review date
  retire_when: After the 2026 contest closes and entries are archived
```

Five fields are required: `entity`, `role`, `owner`, `status`, `review`.
A JSON Schema for editor completion is at [schema/surface.schema.json](schema/surface.schema.json).

## Principles

**Declare only what cannot be discovered.** The hosting provider already knows every route, domain,
database, and bucket. It does not know who owns them or when they may be removed. The surface manifest
asks for exactly those two things, the same way AICU already records an expiry condition and a review
date for every API token it issues.

**Public is a feature, leaks are the cost.** Public workflows are free to call from anywhere and need no
organization setting. The leak audit is what keeps that trade safe, in this repository and in every
other public one.

**The denylist is itself a secret.** A list of internal names would leak what it protects, so it is passed
at run time from an organization secret, and matches are reported by index, never by term.

**Contacts are roles, not people.** `owner` is a handle, team alias, or URL that keeps working after
someone leaves. Personal email addresses are rejected by convention and harvested by bots.

## Pinning

`@main` always gets the latest check. Pin to a commit SHA for a fully reproducible run:

```yaml
uses: aicuai/.github/.github/workflows/surface-manifest.yml@<sha>
```

Changes to the workflows are backwards compatible with every manifest that passed before; a breaking
change would be announced in the pull request and this README.

## Layout

```
.github/workflows/   the reusable workflows, plus self-test.yml which runs both on this repository
docs/                one guide per workflow
schema/              JSON Schema for .aicu/surface.yml
scripts/             the checks themselves, runnable locally with Node 22+
```

## Contact

- X: [@AICUai](https://x.com/AICUai)
- Web: [aicu.ai](https://aicu.ai/)
- Issues and pull requests on this repository are welcome.

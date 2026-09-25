# aicuai/.github — shared conventions and reusable workflows

Conventions and CI checks shared by every repository in the AICU organization.
Both workflows are generic and can be called from any GitHub repository.

| Workflow | What it checks | Guide |
|---|---|---|
| [surface-manifest.yml](.github/workflows/surface-manifest.yml) | A repository that serves a public host declares its owner and when it should be retired | [docs/surface-manifest.md](docs/surface-manifest.md) |
| [leak-audit.yml](.github/workflows/leak-audit.yml) | Nothing that should stay internal is about to be published | [docs/leak-audit.md](docs/leak-audit.md) |

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

## Why

**The hosting provider knows where something runs. Only people know whether it should still be running.**

Automatic discovery answers "is it up?". It cannot answer "who owns this, and when may it be removed?".
Unused services and databases pile up precisely because nobody wrote that down.
The surface manifest makes those two answers mandatory, the same way we already require an
expiry condition and a review date for every API token we issue.

**Being public is a feature, as long as nothing internal leaks.** This repository is public so that any
repository can call these workflows for free. The leak audit is how we keep that safe, here and in
every other public repository.

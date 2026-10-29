# Leak audit

A CI check that stops content that should stay internal from reaching a public repository.

```yaml
# .github/workflows/leak-audit.yml
name: leak audit
on: [push, pull_request]
jobs:
  leak:
    uses: aicuai/.github/.github/workflows/leak-audit.yml@main
    secrets: inherit
```

Pull requests audit the files they change. Pushes and manual runs audit every tracked file.
The job is skipped while the repository is private (`only_public: false` to run it anyway).

## Three layers

| Layer | Finds | Needs | Result |
|---|---|---|---|
| Secret patterns | API keys and tokens (AICU, Stripe, GitHub, OpenAI, Anthropic, Google, AWS, Slack), webhooks, private keys, hard-coded credentials | nothing | error |
| Denylist | Names that are internal to your organization: private repositories, internal hosts, codenames | `LEAK_DENYLIST` secret | error |
| LLM review | What a pattern cannot see: internal inventory or business numbers, internal architecture, personal data, unreleased plans | `AICU_API_KEY` secret | warning (error with `fail_on_llm: true` for high severity) |

### Why the denylist is a secret

A list of your private repository names is itself internal information. Committing it to a public
repository would leak exactly what it is meant to protect. So the list is passed at run time from an
organization secret, and a match is reported as "denylist entry #3" — the term itself is never printed.

`LEAK_DENYLIST` holds one term per line (or comma-separated). Matching is case-insensitive and on whole
names: `nimbus` matches `org/nimbus/issues` but not `nimbusflow`. Leave out names that are also common
words (a repository called `harbor` would fire on every harbor view), and terms shorter than three
characters are ignored.

### Why an LLM

Patterns catch keys. They do not catch a sentence that counts your internal resources, or a diagram of
which internal service calls which. Those are the leaks that actually happen in documentation.
The LLM layer sends the changed text to an OpenAI-compatible endpoint — [AICU API](https://api.aicu.ai/docs)
by default — and asks for exactly those categories. It reports warnings by default because a model can be
wrong; a person decides.

Only text that is about to be published is sent. Lockfiles and binaries are skipped, and the total is
capped (`LEAK_AUDIT_MAX_CHARS`, default 60,000 characters).

## Inputs

| Input | Default | |
|---|---|---|
| `llm` | `true` | Run the LLM review when `AICU_API_KEY` is available |
| `fail_on_llm` | `false` | Fail on high-severity LLM findings |
| `model` | `gpt-4o-mini` | Any chat model the endpoint serves |
| `only_public` | `true` | Skip while the repository is private |

## False positives

Add `leak-audit: allow` to the line (in a comment) to skip it in the pattern and denylist layers.

## What it does not do

- **It does not clean history.** A secret removed in a later commit is still in git history.
  Rotate the credential first; rewriting history is a separate decision.
- **Fork pull requests** receive no secrets, so only the pattern layer runs for them.
- It is a safety net, not a review. Anything it flags, and anything it doesn't, is still read by a person.

## Running it locally

```bash
git ls-files > /tmp/files.txt
LEAK_DENYLIST="$(cat ~/denylist.txt)" AICU_API_KEY=... \
  node scripts/leak-audit.mjs --files-from /tmp/files.txt --llm
```

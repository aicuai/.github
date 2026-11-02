# AGENTS.md — working rules for this repository

For people and coding agents changing this repository. It is public and called by other repositories'
CI through `@main`, so two things matter more than usual: nothing internal may land here, and `main`
must never break a caller.

## Nothing internal, ever

- **Write in English.** The audience is anyone who calls the workflows.
- **Examples use invented names** (`nimbus`, `harbor`, `example.com`). Never use a real private
  repository, internal host, or codename as an example, even in a comment or test fixture.
- **No internal figures.** Counts of repositories or resources, costs, usage numbers, and internal Issue
  URLs stay out of files, commit messages, PR bodies, and comments.
- **Editing does not erase.** The edit history of PR/Issue bodies and comments stays readable, and old
  commits stay reachable through `refs/pull/*` after a force push. Check before you post, not after.
- Run the audit locally before pushing: `LEAK_DENYLIST=... node scripts/leak-audit.mjs` (the denylist
  comes from the organization secret; never commit it).

## Do not break callers of `@main`

- Changes must stay backwards compatible with every manifest that passed before. A breaking change is
  announced in the PR and the README.
- `self-test.yml` runs both reusable workflows on this repository with `tools_ref` set to the commit under
  test, so a PR checks its own scripts. Keep that working when adding a workflow.
- A green check can mean no check ran. Confirm the check suite exists on the head commit.
- Squash merge. The squash message is what stays on `main`; keep it English and free of internal links.

## Secrets

- Secret names are specific to their use (`AICU_LEAK_AUDIT_API_KEY`, not `AICU_API_KEY`): an organization
  secret reaches every repository that inherits secrets, and a generic name gets picked up by other
  workflows.
- Scripts never print matched values. Denylist hits are reported by index only.

## Design decisions to keep

- **Leak audit layers:** secret patterns and the denylist fail the job; the LLM layer warns by default
  (`fail_on_llm` opts in). Measured on `gpt-4o-mini`: it catches planted disclosures well but still
  raises a few false alarms per run, so it is not a gate.
- **Denylist matches whole names**, so a term inside a longer word does not fire. A name that is also a
  common word will fire on that word; leave such names out of the list.
- **Surface manifest declares only what discovery cannot know**: owner and retirement condition.
- Tools are fetched with `actions/checkout`, not raw URLs, so the workflows keep working if this
  repository ever goes private.

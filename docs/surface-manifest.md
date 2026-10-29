# Surface manifest — `.aicu/surface.yml`

A declaration of the **production surfaces** (public hosts) a repository serves, and the
**conditions for retiring them**.

## Why it exists

Where something runs is already known: the hosting provider's API lists every route, custom domain,
database, and bucket. **This file records only what cannot be derived from that** — intent, ownership,
and the retirement condition.

When we compared repositories against what was actually deployed, two things stood out:

- Repository config alone misses many hosts. Custom domains on Cloudflare Pages, for example, are set in
  the dashboard and never appear in the repository. The provider's API, on the other hand, maps nearly
  every host back to a repository. **"Where does it run?" can be discovered automatically.**
- A noticeable share of Workers, databases, and buckets had not been used for a week or more, and nobody
  could say whether they were safe to delete — **no owner and no retirement condition had been written down.**

Discovery tells you whether something is running. **Whether it should still be running has to be declared
by a person.** That is this file's only job.

We already apply this rule to API tokens: every issued token records when and why it should be revoked,
and when it is next reviewed. The surface manifest extends that rule to services and resources.

## Format

```yaml
# .aicu/surface.yml
entity: inc                      # inc | jp — AICU Inc. and AICU Japan K.K. are separate companies
role: Contest entry, judging, and results
owner: "@AICUai"                # a handle or team alias that outlives any one person — not a personal email
hosts:
  - contest.example.com          # [] if there is no production surface (books, libraries, experiments)
paths:                           # only needed when several repositories share one host
  - example.com/study
deploy: cloudflare-workers       # cloudflare-pages | vercel | github-pages | gas | none | other
resources:                       # Cloudflare resources used only by this surface
  d1: [contest-db]
  r2: []
status: live                     # planned | live | maintenance | retiring | retired
health:                          # expectations for uptime monitoring
  contains: "Entries open"
review:                          # ← the point of the file
  next: 2027-03-31               # next review date
  retire_when: After the 2026 contest closes and entries are archived
```

Required: `entity`, `role`, `owner`, `status`, `review`.

### `owner` is a handle, not a person

Any contact that still works after people change roles: an X or GitHub handle (`"@AICUai"`),
a team alias, or a URL. Avoid personal email addresses — they stop working when the person leaves,
and in a public repository they are harvested. Quote a handle that starts with `@`; YAML reserves it.
A JSON Schema for editor completion is in [schema/surface.schema.json](../schema/surface.schema.json).

### Never leave `review` blank

If there is no retirement condition yet, write **"Undecided (revisit 2027-03)"**.
Blank is rejected, so that "not decided yet" can be told apart from "nobody thought about it".

### `paths` on shared hosts

When several repositories serve one host, each should list the paths it owns.
Without them, traffic cannot be attributed and the same page views get counted more than once.

### `hosts` are bare hostnames

No `https://`, no path. Paths go in `paths`.

## Checking it in CI

```yaml
# .github/workflows/surface.yml
name: surface
on: [push, pull_request]
jobs:
  surface:
    uses: aicuai/.github/.github/workflows/surface-manifest.yml@main
    # with:
    #   required: true                    # require the manifest even if no host is detected
    #   shared_hosts: example.com,api.example.com
```

- If the repository **says it serves a public host** (wrangler `routes` / `custom_domain`, or a `CNAME`
  file) and has no `.aicu/surface.yml`, the job **fails**.
- Repositories without a public host pass. Use `required: true` to require the manifest anyway.
- If the manifest exists, its content is validated. A host served by wrangler but missing from `hosts`
  produces a warning — the usual case of changing a route and forgetting the declaration.
- If `shared_hosts` is given, declaring one of those hosts without `paths` produces a warning.

Cloudflare Pages custom domains are invisible from the repository, so CI cannot detect them.
Pages repositories should set `required: true`, or get the manifest from a project template.

## What the declaration makes possible

Comparing the manifest with what is actually deployed, every week, surfaces four lists:

- **Declared but idle** — `status: live`, yet no traffic or requests for seven days
- **Running but undeclared** — the provider serves a host that no manifest mentions
- **Review overdue** — `review.next` is in the past
- **Ready to retire** — unused, and `retire_when` has been met

None of the four can be produced from the declaration alone, or from the deployment alone.

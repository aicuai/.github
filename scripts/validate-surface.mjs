#!/usr/bin/env node
// Validates .aicu/surface.yml.
//
// Why hand-written instead of a JSON Schema library:
//   Schema validators report things like "must have required property". That turns CI red
//   without telling anyone how to fix it. This script says what to change, in plain words.
//   The schema itself lives in schema/surface.schema.json for editor completion.
//
// Usage: node validate-surface.mjs <surface.json> [--wrangler-hosts a,b] [--shared-hosts x,y]
//   The caller (the workflow) converts YAML to JSON with js-yaml.

import { readFileSync } from 'node:fs';

const ENTITIES = ['inc', 'jp'];
const STATUSES = ['planned', 'live', 'maintenance', 'retiring', 'retired'];
const DEPLOYS = ['cloudflare-workers', 'cloudflare-pages', 'vercel', 'github-pages', 'gas', 'none', 'other'];
// A bare hostname: no scheme, no path, no port.
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const warns = [];
const fail = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const argList = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? (process.argv[i + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : [];
};

const file = process.argv[2];
const wranglerHosts = argList('--wrangler-hosts');
const sharedHosts = new Set(argList('--shared-hosts'));

let m;
try {
  m = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`✗ Could not read .aicu/surface.yml: ${e.message}`);
  process.exit(1);
}
if (!m || typeof m !== 'object' || Array.isArray(m)) {
  console.error('✗ .aicu/surface.yml must be a mapping');
  process.exit(1);
}

if (!ENTITIES.includes(m.entity)) {
  fail(`entity must be one of ${ENTITIES.join(' | ')}. AICU Inc. (inc) and AICU Japan K.K. (jp) are separate companies, so pick one`);
}
if (typeof m.role !== 'string' || m.role.trim().length < 4) {
  fail('role: one line on what this surface does and who it is for');
}
if (typeof m.owner !== 'string' || m.owner.trim().length < 3) {
  fail('owner: a business contact that still works when people change roles (a team address is best)');
}
if (!STATUSES.includes(m.status)) {
  fail(`status must be one of ${STATUSES.join(' | ')}`);
}
if (m.deploy !== undefined && !DEPLOYS.includes(m.deploy)) {
  fail(`deploy must be one of ${DEPLOYS.join(' | ')}`);
}

const hosts = m.hosts ?? [];
if (!Array.isArray(hosts)) fail('hosts must be a list. Write [] if there is no production surface');
else {
  for (const h of hosts) {
    if (typeof h !== 'string' || !HOST_RE.test(h)) fail(`hosts: "${h}" is not a bare hostname (no https://, no path)`);
  }
}

// review is what makes retirement possible. Without it, nobody can tell whether an unused
// resource may be deleted. Same discipline as token issuance: expiry condition + next review.
const r = m.review;
// Unquoted 2027-03-31 in YAML is read as a date and becomes "2027-03-31T00:00:00.000Z" in JSON.
// Accept both that and a plain string.
const asDate = (v) => (typeof v === 'string' ? v.slice(0, 10) : '');
if (!r || typeof r !== 'object') {
  fail('review: { next, retire_when } is required. Without it, nobody can decide whether to retire this when it goes unused');
} else {
  const next = asDate(r.next);
  if (!DATE_RE.test(next)) fail('review.next: next review date as YYYY-MM-DD');
  else if (new Date(next) < new Date()) warn(`review.next (${next}) is in the past. Review this surface and move the date`);
  if (typeof r.retire_when !== 'string' || r.retire_when.trim().length < 4) {
    fail('review.retire_when: what has to happen for this to be retired. "Undecided (revisit YYYY-MM)" is fine; blank is not');
  }
}

// When several repositories serve one host, traffic cannot be attributed without paths.
if (hosts.some((h) => sharedHosts.has(h)) && !(Array.isArray(m.paths) && m.paths.length)) {
  warn('This manifest declares a shared host but no paths. Without paths, traffic cannot be split between the repositories sharing it');
}

// A host that the repository's own wrangler config serves but the manifest omits = a forgotten update.
// The reverse (in the manifest, not in wrangler) is normal for Pages and other routes, so no warning.
for (const h of wranglerHosts) {
  if (!hosts.includes(h)) warn(`wrangler serves ${h}, but it is not listed in hosts`);
}

if (m.status === 'live' && hosts.length === 0 && m.deploy !== 'none') {
  warn('status is live but hosts is empty. If there is no public surface, set deploy: none');
}

for (const w of warns) console.log(`⚠ ${w}`);
if (errors.length) {
  console.error(`\n✗ .aicu/surface.yml has ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nHow to write it: https://github.com/aicuai/.github/blob/main/docs/surface-manifest.md');
  process.exit(1);
}
console.log(`✓ .aicu/surface.yml OK (entity=${m.entity} status=${m.status} hosts=${hosts.length ? hosts.join(',') : 'none'})`);

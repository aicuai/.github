#!/usr/bin/env node
// Leak audit: finds things that should not be in a public repository.
//
// Three layers, from cheapest to smartest:
//   1. Secret patterns   — API keys, tokens, private keys. Always an error.
//   2. Denylist          — internal names (private repositories, internal hosts, codenames)
//                          supplied at run time through LEAK_DENYLIST. The list itself is a secret,
//                          so it is never stored in this repository and matches never print the term.
//   3. LLM review        — optional. Sends the changed text to an OpenAI-compatible endpoint
//                          (api.aicu.ai by default) and asks for disclosures a regex cannot see:
//                          internal inventory numbers, architecture, personal data, cost figures.
//
// Findings are printed as GitHub annotations and a job summary. Matched values are never echoed.
//
// Usage: node leak-audit.mjs [--files-from list.txt] [--llm] [--fail-on-llm]
// Env:   LEAK_DENYLIST       newline- or comma-separated terms (case-insensitive)
//        AICU_API_KEY        enables the LLM layer
//        LEAK_AUDIT_MODEL    default gpt-4o-mini
//        LEAK_AUDIT_API_BASE default https://api.aicu.ai/v1
//        LEAK_AUDIT_MAX_CHARS total text sent to the LLM, default 60000
//
// A line containing "leak-audit: allow" is skipped by layers 1 and 2.

import { readFileSync, existsSync, statSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const SECRET_RULES = [
  ['AICU API key', /\baicu_(?:live|test|ent)_[A-Za-z0-9]{16,}/],
  ['Stripe live key', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{24,}/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Slack webhook', /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/],
  ['Discord webhook', /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['Hard-coded credential', /\b(?:api[_-]?key|secret|token|password|passwd)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{20,}["']/i],
];

const SKIP_PATH = /(^|\/)(node_modules|dist|build|\.next|vendor)\/|\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp[34]|wav|mov)$/i;
const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|Cargo\.lock|poetry\.lock)$/;
const MAX_FILE_BYTES = 1_000_000;

const listFiles = () => {
  const from = opt('--files-from');
  const raw = from ? readFileSync(from, 'utf8') : execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return raw.split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !SKIP_PATH.test(f) && existsSync(f) && statSync(f).isFile() && statSync(f).size <= MAX_FILE_BYTES);
};

const readText = (f) => {
  const buf = readFileSync(f);
  return buf.includes(0) ? null : buf.toString('utf8');
};

const denylist = (process.env.LEAK_DENYLIST || '')
  .split(/[\n,]/).map((s) => s.trim()).filter((s) => s.length >= 3);
// Match whole names only: "nimbus" fires on "org/nimbus/issues" but not inside "nimbusflow".
// A letter or digit on either side means the term is part of a longer word.
// A name that is also a common word ("harbor") still fires on that word; leave such names out.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const denyRes = denylist.map((t) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(t)}(?![A-Za-z0-9])`, 'i'));

const findings = []; // { level: 'error'|'warning', file, line, title, message }
const add = (f) => findings.push(f);

const files = listFiles();
const texts = new Map();
for (const file of files) {
  const text = readText(file);
  if (text === null) continue;
  texts.set(file, text);
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('leak-audit: allow')) return;
    for (const [name, re] of SECRET_RULES) {
      if (re.test(line)) add({ level: 'error', file, line: i + 1, title: 'Secret', message: `Looks like a ${name}. Remove it and rotate the credential; deleting it in a later commit does not remove it from history.` });
    }
    denyRes.forEach((re, idx) => {
      if (re.test(line)) add({ level: 'error', file, line: i + 1, title: 'Internal name', message: `Matches denylist entry #${idx + 1}. Internal names should not appear in a public repository.` });
    });
  });
}

// ---- LLM layer ----
const PROMPT = `You audit text that is about to be published in a PUBLIC GitHub repository of a company.
Flag only content that the company would likely not want public:
- secrets or credentials of any kind
- names of private/internal repositories, internal hostnames, internal dashboards or admin URLs
- internal architecture details: which internal service talks to which, where internal data lives
- internal inventory or business numbers (counts of internal repos/resources, costs, margins, revenue, usage of internal systems)
- personal data of individuals other than public company contacts
- unreleased plans, legal disputes, or customer-specific information
Do NOT flag: public product names, public domains, public documentation, generic code, example values like example.com.
Reply with JSON only: {"findings":[{"file":"path","line":123,"category":"short-slug","severity":"high|medium|low","reason":"one sentence, do not quote secret values"}]}
If nothing should be flagged, reply {"findings":[]}.`;

async function llmReview() {
  const key = process.env.AICU_API_KEY;
  if (!key) return { skipped: 'AICU_API_KEY is not set' };
  const base = (process.env.LEAK_AUDIT_API_BASE || 'https://api.aicu.ai/v1').replace(/\/$/, '');
  const model = process.env.LEAK_AUDIT_MODEL || 'gpt-4o-mini';
  const budget = Number(process.env.LEAK_AUDIT_MAX_CHARS || 60000);
  const CHUNK = 12000;

  const chunks = [];
  let cur = '';
  let used = 0;
  let truncated = false;
  for (const [file, text] of texts) {
    if (LOCKFILE.test(file)) continue;
    const numbered = text.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    const block = `=== FILE: ${file}\n${numbered}\n`;
    if (used + block.length > budget) { truncated = true; break; }
    used += block.length;
    for (let p = 0; p < block.length; p += CHUNK) {
      const part = block.slice(p, p + CHUNK);
      if (cur.length + part.length > CHUNK && cur) { chunks.push(cur); cur = ''; }
      cur += (p > 0 ? `=== FILE: ${file} (continued)\n` : '') + part;
    }
  }
  if (cur) chunks.push(cur);

  let count = 0;
  for (const chunk of chunks) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: chunk }],
      }),
    });
    if (!res.ok) return { skipped: `LLM request failed: HTTP ${res.status}` };
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content || '';
    const json = content.match(/\{[\s\S]*\}/);
    let parsed;
    try { parsed = JSON.parse(json ? json[0] : content); } catch { continue; }
    for (const f of parsed.findings || []) {
      if (!f || typeof f.file !== 'string' || !texts.has(f.file)) continue;
      const sev = ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium';
      if (sev === 'low') continue;
      count++;
      add({
        level: sev === 'high' && flag('--fail-on-llm') ? 'error' : 'warning',
        file: f.file, line: Number(f.line) || 1,
        title: `LLM review: ${String(f.category || 'disclosure').slice(0, 40)} (${sev})`,
        message: String(f.reason || '').slice(0, 300),
      });
    }
  }
  return { model, chunks: chunks.length, count, truncated };
}

const llm = flag('--llm') ? await llmReview() : { skipped: 'disabled' };

// ---- Report ----
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
for (const f of findings) {
  console.log(`::${f.level} file=${esc(f.file)},line=${f.line},title=${esc(f.title)}::${esc(f.message)}`);
}
const errors = findings.filter((f) => f.level === 'error');
const summary = [
  '## Leak audit',
  '',
  `Scanned ${texts.size} file(s). Denylist: ${denylist.length ? `${denylist.length} term(s)` : 'not configured'}.`,
  `LLM review: ${llm.skipped ? `skipped (${llm.skipped})` : `${llm.model}, ${llm.chunks} request(s), ${llm.count} finding(s)${llm.truncated ? ', input truncated' : ''}`}.`,
  '',
  findings.length
    ? ['| Level | File | Line | Finding |', '|---|---|---|---|', ...findings.map((f) => `| ${f.level} | \`${f.file}\` | ${f.line} | ${f.title}: ${f.message.replace(/\|/g, '\\|')} |`)].join('\n')
    : 'No findings.',
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
else console.log(summary);

process.exit(errors.length ? 1 : 0);

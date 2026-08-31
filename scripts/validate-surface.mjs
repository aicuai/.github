#!/usr/bin/env node
// .aicu/surface.yml の検査。
//
// なぜ手書きの検査か:
//   JSON Schema ライブラリを入れると「required が足りない」のような機械的な文言しか出ず、
//   直し方が分からないまま CI が赤いだけになる。ここは**何をどう直すか**を日本語で返す。
//   スキーマ本体は schema/surface.schema.json に置いてエディタ補完用に残す。
//
// 使い方: node validate-surface.mjs <surface.json> [--wrangler-hosts a,b]
//   YAML → JSON の変換は呼び出し側（workflow）が js-yaml で行う。

import { readFileSync } from 'node:fs';

const ENTITIES = ['inc', 'jp'];
const STATUSES = ['planned', 'live', 'maintenance', 'retiring', 'retired'];
const DEPLOYS = ['cloudflare-workers', 'cloudflare-pages', 'vercel', 'github-pages', 'gas', 'none', 'other'];
const HOST_RE = /^(?:[a-z0-9-]+\.)*(?:aicu\.(?:ai|jp)|nehan\.ai|scmf\.ai)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const warns = [];
const fail = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const file = process.argv[2];
const wranglerArg = process.argv.indexOf('--wrangler-hosts');
const wranglerHosts = wranglerArg > 0 ? (process.argv[wranglerArg + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : [];

let m;
try {
  m = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`✗ .aicu/surface.yml を読めませんでした: ${e.message}`);
  process.exit(1);
}
if (!m || typeof m !== 'object' || Array.isArray(m)) {
  console.error('✗ .aicu/surface.yml の中身がマッピングではありません');
  process.exit(1);
}

if (!ENTITIES.includes(m.entity)) {
  fail(`entity は ${ENTITIES.join(' | ')} のどれか。AICU Inc.(inc) と AICU Japan K.K.(jp) は別法人・別戦略なので必ず選ぶ`);
}
if (typeof m.role !== 'string' || m.role.trim().length < 4) {
  fail('role: 何をする面か・誰向けかを一行で書く');
}
if (typeof m.owner !== 'string' || m.owner.trim().length < 3) {
  fail('owner: 事業上の連絡先。担当者が変わっても追える宛先にする（例 aki@aicu.ai）');
}
if (!STATUSES.includes(m.status)) {
  fail(`status は ${STATUSES.join(' | ')} のどれか`);
}
if (m.deploy !== undefined && !DEPLOYS.includes(m.deploy)) {
  fail(`deploy は ${DEPLOYS.join(' | ')} のどれか`);
}

const hosts = m.hosts ?? [];
if (!Array.isArray(hosts)) fail('hosts は配列。本番面が無いなら [] と書く');
else {
  for (const h of hosts) {
    if (typeof h !== 'string' || !HOST_RE.test(h)) fail(`hosts の "${h}" がホスト名として不正（パスや https:// を含めない）`);
  }
}

// review は圧縮のための欄。ここが空だと「使われていないリソースを消してよいか」を
// 誰も判断できない。トークン発行で既に確立している規律（失効条件＋棚卸し時期）と同じ。
const r = m.review;
// YAML の無クォートな 2027-03-31 は**日付型**として読まれ、JSON では
// "2027-03-31T00:00:00.000Z" になる。文字列で書いた場合と両方を受ける。
const asDate = (v) => (typeof v === 'string' ? v.slice(0, 10) : '');
if (!r || typeof r !== 'object') {
  fail('review: { next, retire_when } が必須。これが無いと未使用時に畳んでよいか判断できない');
} else {
  const next = asDate(r.next);
  if (!DATE_RE.test(next)) fail('review.next: 次回棚卸し日を YYYY-MM-DD で書く');
  else if (new Date(next) < new Date()) warn(`review.next (${next}) が過去です。棚卸しして日付を更新してください`);
  if (typeof r.retire_when !== 'string' || r.retire_when.trim().length < 4) {
    fail('review.retire_when: 何が起きたら畳むかを書く。決まっていないなら「未定（YYYY-MM に再検討）」でよいが空欄は不可');
  }
}

// 同一ホストを複数リポが共有する場合、paths が無いとアクセス数を按分できない。
// aicu.ai / api.aicu.ai / aicu.jp は複数リポで共有されている。
const SHARED = new Set(['aicu.ai', 'aicu.jp', 'api.aicu.ai']);
if (hosts.some((h) => SHARED.has(h)) && !(Array.isArray(m.paths) && m.paths.length)) {
  warn('共有ホスト（aicu.ai / aicu.jp / api.aicu.ai）を宣言しているのに paths がありません。担当パスを書かないとアクセス数を他リポと按分できません');
}

// リポジトリ自身の wrangler が配信すると言っているホストが manifest に無い＝宣言漏れ。
// 逆向き（manifest にあって wrangler に無い）は Pages / 別経路がありうるので警告にしない。
for (const h of wranglerHosts) {
  if (!hosts.includes(h)) warn(`wrangler が ${h} を配信すると宣言していますが hosts にありません`);
}

if (m.status === 'live' && hosts.length === 0 && m.deploy !== 'none') {
  warn('status: live なのに hosts が空です。公開面を持たないなら deploy: none にしてください');
}

for (const w of warns) console.log(`⚠ ${w}`);
if (errors.length) {
  console.error(`\n✗ .aicu/surface.yml に ${errors.length} 件の問題があります:\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\n書き方: https://github.com/aicuai/.github/blob/main/docs/surface-manifest.md');
  process.exit(1);
}
console.log(`✓ .aicu/surface.yml OK (entity=${m.entity} status=${m.status} hosts=${hosts.length ? hosts.join(',') : 'なし'})`);

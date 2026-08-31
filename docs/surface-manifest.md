# surface manifest — `.aicu/surface.yml`

リポジトリが持つ**本番面（公開ホスト）**と、それを**畳む条件**の宣言。

## なぜ要るか

実態は Cloudflare が全部知っている。**ここに書くのは実態から導けないものだけ** —
意図・所有・失効条件。

2026-08-31 に org 全体を実測してこうなった。

- GitHub の全162リポの設定ファイル（wrangler / CNAME / package.json）を走査して、
  配信ホストが取れたのは **21リポだけ**。Cloudflare Pages のカスタムドメインは
  ダッシュボードで設定され、リポジトリには一切書かれない
- Cloudflare 側（Pages の `domains[]` と Worker の routes）を見ると
  **35ホスト中33が repo に結びついた**。つまり「どこで動いているか」は自動で分かる
- 一方で **Worker 23本・D1 13個・R2 6バケットが7日間ゼロ利用**のまま残っていた。
  消せるかどうかは誰にも分からなかった。**オーナーと失効条件がどこにも書かれていない**から

自動探索で分かるのは「動いているか」まで。**「生きているべきか」は人が宣言するしかない。**
それがこのファイルの唯一の仕事である。

同じ規律を AICU は既にトークンで採用している —
「発行 Issue と ledger には失効条件（いつ・何が起きたら消すか）と次回棚卸し時期を必ず書く。
これが無いと管理期限が判断できない」。それを**面とリソース**に広げたものがこれ。

## 書き方

```yaml
# .aicu/surface.yml
entity: jp                       # inc | jp。AICU Inc. と AICU Japan K.K. は別法人・別戦略
role: AICU Contest の応募・審査・結果発表
owner: aki@aicu.ai               # 担当者が変わっても追える宛先
hosts:
  - c.aicu.jp                    # 本番面が無いなら [] （書籍・ライブラリ・実験）
paths:                           # 同じホストを複数リポで共有するときだけ必要
  - aicu.jp/study
deploy: cloudflare-workers       # cloudflare-pages | vercel | github-pages | gas | none | other
resources:                       # この面が専有する Cloudflare リソース
  d1: [contest-db]
  r2: []
status: live                     # planned | live | maintenance | retiring | retired
health:                          # 死活監視の期待値（staff-aicu-jp の監視が読む）
  contains: "応募受付中"
review:                          # ← ここが本題
  next: 2027-03-31               # 次回棚卸し日
  retire_when: 2026年度コンテスト終了かつ応募データ移行完了後
```

必須は `entity` `role` `owner` `status` `review`。

### `review` を空欄にしない

`retire_when` が決まっていないなら **「未定（2027-03 に再検討）」と書く**。
空欄は不可。「決まっていない」と「誰も考えていない」を区別できるようにするため。

### `paths` は共有ホストで必要

`aicu.ai` は実測で **6リポが共有**している（`api.aicu.ai` と `aicu.jp` は2リポずつ）。
`paths` が無いと週次のアクセス数を按分できず、同じ PV を何度も数えることになる。

### `hosts` はホスト名だけ

`https://` やパスを含めない。パスは `paths` に書く。

## CI で検査する

各リポジトリに次を置く。

```yaml
# .github/workflows/surface.yml
name: surface
on: [push, pull_request]
jobs:
  surface:
    uses: aicuai/.github/.github/workflows/surface-manifest.yml@main
```

- リポジトリが**公開ホストを配信すると宣言している**（wrangler の routes / custom_domain、
  または CNAME がある）のに `.aicu/surface.yml` が無ければ**落ちる**
- 公開面が無いリポジトリは素通りする。面の有無に関わらず必須にしたい場合は
  `with: { required: true }`
- manifest があれば内容を検査する。wrangler が配信すると言っているホストが
  `hosts` に無ければ警告する（**ルートを変えて宣言を直し忘れた**ケース）

Cloudflare Pages のカスタムドメインはリポジトリから見えないため、CI では検出できない。
Pages のリポジトリは `required: true` を付けるか、新規作成時にテンプレートから入れる。

## 週次「AIDX Lab 開発週報」との関係

`staff.aicu.jp/repos` が毎週月曜に、この manifest と Cloudflare の実態を突き合わせる。

- **宣言はあるが動いていない** … `status: live` なのに7日間アクセスもリクエストも無い
- **動いているが宣言が無い** … Cloudflare にホストがあるのに manifest が無い
- **棚卸し期限切れ** … `review.next` を過ぎている
- **畳める** … 使われておらず、`retire_when` の条件を満たしている

宣言と実態のどちらか片方だけでは、この4つはどれも出せない。

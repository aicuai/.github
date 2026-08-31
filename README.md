# aicuai/.github — org 共通の規約と再利用ワークフロー

AICU の全リポジトリが共有する仕組みを置く場所。

## surface manifest（`.aicu/surface.yml`）

リポジトリが持つ**本番面**と、それを**畳む条件**の宣言。

- 仕様と書き方: [docs/surface-manifest.md](docs/surface-manifest.md)
- スキーマ: [schema/surface.schema.json](schema/surface.schema.json)
- 検査（再利用ワークフロー）: [.github/workflows/surface-manifest.yml](.github/workflows/surface-manifest.yml)

各リポジトリからはこう呼ぶ。

```yaml
# .github/workflows/surface.yml
name: surface
on: [push, pull_request]
jobs:
  surface:
    uses: aicuai/.github/.github/workflows/surface-manifest.yml@main
```

### なぜ宣言させるのか

**どこで動いているかは Cloudflare が知っている。生きているべきかは人しか知らない。**

実測（2026-08-31）で Worker 23本・D1 13個・R2 6バケットが7日間ゼロ利用のまま残っていたが、
オーナーと失効条件がどこにも書かれておらず、消してよいか誰も判断できなかった。
`review.next`（次回棚卸し）と `review.retire_when`（何が起きたら畳むか）が
必須なのはこのため。AICU が既にトークン発行で採用している規律を、面とリソースに広げたもの。

## 関連

- 週次「AIDX Lab 開発週報」— 宣言と実態のズレを毎週出す: [staff-aicu-jp#272](https://github.com/aicuai/staff-aicu-jp/issues/272)
- ルート/サービス登録申請（人間の承認フロー）: [top-aicuai の Issue テンプレート](https://github.com/aicuai/top-aicuai/issues/new?template=route-registration.yml)
- アプリ台帳（役割・意図の宣言）: [top-aicuai/public/registry.json](https://github.com/aicuai/top-aicuai/blob/main/public/registry.json)

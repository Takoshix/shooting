# sprite/ — 差し替え用の画像

ここに画像を置くと、対応する絵が自動的に差し替わります。
**置かなかったものはコードで描いたベクタ絵のまま**動くので、
一部だけ用意する、あとから足す、という使い方ができます。

- 形式: `.png`（`.webp` / `.jpg` も可）。この順に探します
- 背景は透過にしてください
- **向き: 右向き**（自機も敵も右を正面として描いてください。
  このゲームは横スクロールで、自機は左から右へ撃ちます）
- 大きさは自由です。縦の長さを基準に自動で縮尺を合わせ、
  縦横比は保ったまま中心に描きます。推奨は下の「目安の高さ」

## 自機（4 機・選択式）

| ファイル名 | 用途 | 目安の高さ |
|---|---|---|
| `ship-balance.png` | バランス型 TYPE-B | 26px |
| `ship-assault.png` | 強襲型 TYPE-A | 26px |
| `ship-heavy.png`   | 重装型 TYPE-H | 30px |
| `ship-support.png` | 支援型 TYPE-S | 26px |
| `option.png`       | オプション（分身） | 16px |

## 敵

| ファイル名 | 敵 | 目安の高さ |
|---|---|---|
| `enemy-zako.png`    | ザコ（直進） | 22px |
| `enemy-waver.png`   | 波打ち | 22px |
| `enemy-diver.png`   | 突っ込み | 24px |
| `enemy-turret.png`  | 砲台 | 28px |
| `enemy-cloud.png`   | 雲（ベルが出る） | 32px |
| `enemy-pod.png`     | ポッド | 30px |
| `enemy-sentry.png`  | 連射砲台 | 30px |
| `enemy-sniper.png`  | 狙撃機 | 26px |
| `enemy-gunship.png` | 砲艦 | 38px |
| `enemy-bulwark.png` | 重装 | 46px |
| `enemy-weaver.png`  | 回り込み | 26px |
| `enemy-splitter.png`| 分裂体（倒すと 2 体に割れる） | 32px |
| `enemy-shielder.png`| 盾持ち（前面が硬い） | 34px |
| `enemy-mine.png`    | 機雷（近づくと破裂） | 26px |
| `enemy-carrier.png` | 大型艦 | 58px |
| `enemy-core.png`    | 巨大戦艦（ボス） | 96px |

## アイテム

| ファイル名 | 用途 | 目安の高さ |
|---|---|---|
| `item-capsule.png` | パワーカプセル | 20px |
| `bell-score.png`   | ベル・黄（得点） | 24px |
| `bell-speed.png`   | ベル・青（スピード） | 24px |
| `bell-vulcan.png`  | ベル・白（VULCAN） | 24px |
| `bell-homing.png`  | ベル・桃（HOMING） | 24px |
| `bell-option.png`  | ベル・緑（オプション） | 24px |
| `bell-force.png`   | ベル・赤（バリア） | 24px |

## 注意

- **弾には画像を使いません。** 弾は数が多く、形と色で
  「丸＝敵弾 / 菱形＝追尾弾 / 四角＝アイテム」と区別しているため、
  ここを画像にすると見分けがつかなくなります
- ファイル名が違うと、黙ってベクタ絵のままになります。
  反映されないときは名前を確認してください
- **用意していない画像について、ブラウザの開発者コンソールに
  404 が並びますが、これは正常です。** ゲームは「とりあえず全部の名前を
  探しに行き、見つかったものだけ使う」方式なので、
  置いていないファイルのぶんだけ 404 が出ます。動作には影響しません

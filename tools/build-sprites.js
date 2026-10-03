/* =========================================================
   tools/build-sprites.js — 素材画像をゲーム用に整える
   ---------------------------------------------------------
   実行: node tools/build-sprites.js

   元の素材は 1344x768 の大きなキャンバスに、絵が小さく
   中央付近へ置かれている（周りはすべて透明）。
   そのまま読み込むと、
     ・1 枚 200〜360KB、46 枚で約 12MB という転送量
     ・1344x768 を展開するので 1 枚あたり約 4MB のメモリ
     ・「高さ 22px で描く」と指定しても、透明の余白ごと縮むので
       肝心の絵は数ピクセルにしかならない
   という 3 つの問題が出る。

   そこでここで
     1. 不透明な部分の外接矩形へ切り詰める（余白を落とす）
     2. 向きを揃える（下記）
     3. ゲームで使う最大寸法へ縮小する
     4. sprite/opt/ へ書き出し、manifest.json に寸法と向きを残す
   までを済ませておく。元の素材は触らない。

   向きについて：素材は右向きと左向きが混ざっている。
   このゲームは横スクロールで、自機は右を向き、敵は左へ進む。
   そこで「機首（細いほう）がどちら側にあるか」を画素から測り、
   自機は右向き、敵は左向きへ自動で揃える。
   機体は普通、先端が細く後部が太いので、
   左右の端 15% の平均の高さを比べれば機首の側が分かる。
   判定を誤ったものは FLIP_OVERRIDE に番号を書いて手で直す。

   画像処理用のネイティブ依存を足したくないので、
   ヘッドレス Chromium の canvas を計算機として使っている。
   ========================================================= */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.NPM_GLOBAL_ROOT || '/opt/node22/lib/node_modules', 'playwright'));

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'sprite');
const OUT = path.join(SRC, 'opt');
const SHEET_DIR = path.join(ROOT, 'docs');

/* ゲーム内での最大表示高さ。実機の高解像度表示を考えて 2 倍の余裕を持たせる */
const MAX_H = 128;
const MAX_W = 256;

/* 自動判定が外れたものを手で上書きする。
   docs/sheet-enemy-*.png を見て、向きがそろっていない番号をここへ足す。
   自動判定は 40 枚中 27 枚が正解だった。外れたものはほぼ全部
   「エンジンの炎で後部が細く見え、機首と取り違えた」もの。 */
const FLIP_OVERRIDE = {
  '010': 1,
  '021': 1, '024': 1, '027': 1, '028': 1, '039': 1,
  '046': 1, '048': 1, '050': 1, '054': 1, '055': 1,
  '056': 1, '058': 1, '059': 1
};

(async () => {
  const files = fs.readdirSync(SRC).filter((f) => /\.(png|webp|jpg)$/i.test(f)).sort();
  if (!files.length) { console.log('sprite/ に画像がありません'); return; }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas id="c"></canvas>');

  const results = [];
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(SRC, f)).toString('base64');
    const mime = f.endsWith('.jpg') ? 'image/jpeg' : (f.endsWith('.webp') ? 'image/webp' : 'image/png');
    /* 自機は右向き、敵は左向きに揃えたい */
    const wantLeft = /enemy/i.test(f);
    const num = (f.match(/_(\d+)_/) || [, ''])[1];
    const r = await page.evaluate(async ({ b64, mime, MAX_H, MAX_W, wantLeft, override }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:' + mime + ';base64,' + b64; });
      const w = img.naturalWidth, h = img.naturalHeight;

      // 元画像をいったん描いて、不透明な画素の範囲を調べる
      const c0 = document.createElement('canvas');
      c0.width = w; c0.height = h;
      const g0 = c0.getContext('2d', { willReadFrequently: true });
      g0.drawImage(img, 0, 0);
      const d = g0.getImageData(0, 0, w, h).data;

      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      const A = 12;                       // この値以下の薄い画素は余白とみなす
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (d[(y * w + x) * 4 + 3] > A) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return null;            // 全部透明

      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

      /* 機首の向きを測る。
         列ごとに「不透明な画素の縦の広がり」を出し、
         左右それぞれ端から 15% の平均を比べる。細いほうが機首 */
      function endThickness(from, to) {
        let sum = 0, n = 0;
        for (let x = from; x < to; x++) {
          let top = -1, bot = -1;
          for (let y = y0; y <= y1; y++) {
            if (d[(y * w + x) * 4 + 3] > A) { if (top < 0) top = y; bot = y; }
          }
          if (top >= 0) { sum += (bot - top + 1); n++; }
        }
        return n ? sum / n : 0;
      }
      const span = Math.max(1, Math.round(cw * 0.15));
      const thickL = endThickness(x0, x0 + span);
      const thickR = endThickness(x1 - span + 1, x1 + 1);
      /* 細い側が機首。thickL < thickR なら機首は左＝左向き */
      let facesLeft = thickL < thickR;
      let flip = (facesLeft !== wantLeft);
      if (override) flip = !flip;
      const scale = Math.min(1, MAX_H / ch, MAX_W / cw);
      const ow = Math.max(1, Math.round(cw * scale));
      const oh = Math.max(1, Math.round(ch * scale));

      const c1 = document.createElement('canvas');
      c1.width = ow; c1.height = oh;
      const g1 = c1.getContext('2d');
      g1.imageSmoothingQuality = 'high';
      if (flip) { g1.translate(ow, 0); g1.scale(-1, 1); }
      g1.drawImage(img, x0, y0, cw, ch, 0, 0, ow, oh);
      return { src: [w, h], crop: [cw, ch], out: [ow, oh], facesLeft: facesLeft,
               flipped: flip, url: c1.toDataURL('image/png') };
    }, { b64, mime, MAX_H, MAX_W, wantLeft, override: !!FLIP_OVERRIDE[num] });

    if (!r) { console.log(f, '→ 全面透明。読み飛ばし'); continue; }
    const buf = Buffer.from(r.url.split(',')[1], 'base64');
    const outName = f.replace(/\.(webp|jpg)$/i, '.png');
    fs.writeFileSync(path.join(OUT, outName), buf);
    results.push({ f, out_name: outName, num, ...r, bytes: buf.length });
  }

  /* 一覧を JS として書き出す。
     JSON を fetch する方式だと file:// で開いたときに読めないので、
     script タグで読める形にしてある（index.html を直接開いても動く） */
  const entries = results.map((r) => ({
    id: (/player/i.test(r.f) ? 'p' : 'e') + r.num,
    file: r.out_name,
    w: r.out[0], h: r.out[1], flipped: r.flipped
  }));
  fs.writeFileSync(path.join(OUT, 'manifest.js'),
    '/* 自動生成。tools/build-sprites.js が書き出す。手で編集しない */\n' +
    'window.SPRITE_MANIFEST = ' + JSON.stringify({ dir: 'sprite/opt/', items: entries }, null, 1) + ';\n');

  /* ---- 一覧表（どの番号がどの絵かを人が見て決めるため） ---- */
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  const groups = {
    player: results.filter((r) => /player/i.test(r.f)),
    enemy: results.filter((r) => /enemy/i.test(r.f))
  };
  for (const key in groups) {
    const list = groups[key];
    for (let page0 = 0; page0 * 20 < list.length; page0++) {
      const slice = list.slice(page0 * 20, page0 * 20 + 20);
      const sheet = await page.evaluate(async ({ items }) => {
        const COLS = 5, CW = 230, CH = 180;
        const c = document.createElement('canvas');
        c.width = COLS * CW; c.height = Math.ceil(items.length / COLS) * CH;
        const g = c.getContext('2d');
        g.fillStyle = '#10141c'; g.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < items.length; i++) {
          const im = new Image();
          await new Promise((res) => { im.onload = res; im.src = items[i].url; });
          const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
          g.strokeStyle = '#2b3850'; g.strokeRect(cx + 0.5, cy + 0.5, CW - 1, CH - 1);
          const s = Math.min((CW - 24) / im.width, (CH - 46) / im.height);
          g.drawImage(im, cx + (CW - im.width * s) / 2, cy + 10 + (CH - 40 - im.height * s) / 2,
            im.width * s, im.height * s);
          g.fillStyle = '#9fd0ff';
          g.font = 'bold 20px monospace';
          g.textAlign = 'center';
          g.fillText(items[i].label, cx + CW / 2, cy + CH - 12);
        }
        return c.toDataURL('image/png');
      }, { items: slice.map((r) => ({ url: r.url, label: (r.f.match(/_(\d+)_/) || [, r.f])[1] })) });
      const name = `sheet-${key}-${page0 + 1}.png`;
      fs.writeFileSync(path.join(SHEET_DIR, name), Buffer.from(sheet.split(',')[1], 'base64'));
      console.log('一覧表:', 'docs/' + name);
    }
  }

  await browser.close();

  const before = results.reduce((a, r) => a + fs.statSync(path.join(SRC, r.f)).size, 0);
  const after = results.reduce((a, r) => a + r.bytes, 0);
  console.log('\n枚数:', results.length);
  console.log('元の寸法 :', results[0].src.join('x'), '（全部同じ）');
  console.log('切り詰め後の寸法の例:', results.slice(0, 3).map((r) => r.crop.join('x')).join(', '));
  console.log('出力の寸法の例      :', results.slice(0, 3).map((r) => r.out.join('x')).join(', '));
  console.log('合計サイズ:', (before / 1048576).toFixed(1) + 'MB', '→', (after / 1048576).toFixed(2) + 'MB',
    '(' + (100 - after / before * 100).toFixed(1) + '% 削減)');
})();

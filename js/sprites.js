/* =========================================================
   sprites.js — 画像の読み込みと、無いときの自動フォールバック
   ---------------------------------------------------------
   読み込む対象は sprite/opt/manifest.js に書かれたものだけ。
   この一覧は tools/build-sprites.js が sprite/ の素材から
   自動生成する（余白の切り詰め・向きの統一・縮小まで済ませたもの）。

   一覧が無ければ何も読み込まず、コードで描いたベクタ絵のまま動く。
   「画像を用意しないと動かない」状態にはしない。

   一覧を JSON ではなく JS にしてあるのは、
   index.html をそのままダブルクリックで開いたとき（file:// プロトコル）
   でも読めるようにするため。fetch だと file:// では弾かれる。

   絵は横長なので、指定するのは「高さ」ではなく「横幅」。
   戦闘機の絵を高さ基準で合わせると、横幅が画面を埋めてしまう。
   ========================================================= */
(function (w) {
  'use strict';

  var Sprites = {
    imgs: Object.create(null),   // id -> HTMLImageElement
    meta: Object.create(null),   // id -> { w, h }
    found: 0, total: 0,
    onChange: null               // 1 枚読み込むたびに呼ばれる（キャッシュ再構築用）
  };

  Sprites.get = function (id) {
    var im = Sprites.imgs[id];
    return (im && im.complete && im.naturalWidth > 0) ? im : null;
  };

  Sprites.has = function (id) { return !!Sprites.get(id); };

  /* 一覧に載っているものをすべて読みに行く。戻りを待つ必要はない
     （読み込めた時点で onChange が呼ばれ、描画側が差し替わる） */
  Sprites.load = function () {
    var man = w.SPRITE_MANIFEST;
    if (!man || !man.items) return 0;
    Sprites.total = man.items.length;
    for (var i = 0; i < man.items.length; i++) {
      (function (it) {
        var im = new Image();
        im.onload = function () {
          Sprites.imgs[it.id] = im;
          Sprites.meta[it.id] = { w: im.naturalWidth, h: im.naturalHeight };
          Sprites.found++;
          if (Sprites.onChange) Sprites.onChange(it.id);
        };
        im.onerror = function () { /* 無ければベクタ絵のまま */ };
        im.src = man.dir + it.file;
      })(man.items[i]);
    }
    return Sprites.total;
  };

  /* 横幅を指定して中心に描く。縦横比は保つ */
  Sprites.drawW = function (g, id, x, y, width, angle) {
    var im = Sprites.get(id);
    if (!im) return false;
    var scale = width / im.naturalWidth;
    var ww = width, hh = im.naturalHeight * scale;
    if (angle) {
      g.save();
      g.translate(x, y); g.rotate(angle);
      g.drawImage(im, -ww / 2, -hh / 2, ww, hh);
      g.restore();
    } else {
      g.drawImage(im, x - ww / 2, y - hh / 2, ww, hh);
    }
    return true;
  };

  w.Sprites = Sprites;
})(window);

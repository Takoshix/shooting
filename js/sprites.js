/* =========================================================
   sprites.js — 画像の読み込みと、無いときの自動フォールバック
   ---------------------------------------------------------
   sprite/ フォルダに画像を置くと、その名前に対応する絵が
   自動的に画像へ差し替わる。置かなければ、これまで通り
   コードで描いたベクタ絵のまま動く。

   画像が無くてもエラーにしない（onerror で握りつぶす）のが要点。
   「画像を用意しないと動かない」状態にすると、
   ファイルを 1 つ足すたびに全体が壊れうるため。

   期待するファイル名は sprite/README.md にまとめてある。
   ========================================================= */
(function (w) {
  'use strict';

  var Sprites = {
    dir: 'sprite/',
    imgs: Object.create(null),   // id -> HTMLImageElement（読み込み成功したものだけ）
    tried: Object.create(null),
    found: 0, missing: 0,
    onChange: null               // 1 枚読み込むたびに呼ばれる（キャッシュ再構築用）
  };

  /* id に対応する画像。無ければ null */
  Sprites.get = function (id) {
    var im = Sprites.imgs[id];
    return (im && im.complete && im.naturalWidth > 0) ? im : null;
  };

  Sprites.has = function (id) { return !!Sprites.get(id); };

  /* 1 枚読み込む。拡張子は png → webp → jpg の順に試す */
  function tryLoad(id, exts, i) {
    if (i >= exts.length) {
      Sprites.missing++;
      return;
    }
    var im = new Image();
    im.onload = function () {
      Sprites.imgs[id] = im;
      Sprites.found++;
      if (Sprites.onChange) Sprites.onChange(id);
    };
    im.onerror = function () { tryLoad(id, exts, i + 1); };
    im.src = Sprites.dir + id + '.' + exts[i];
  }

  /* 名前の配列を読みに行く。戻りを待つ必要はない
     （読み込めた時点で onChange が呼ばれ、描画側が差し替わる） */
  Sprites.preload = function (ids) {
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (Sprites.tried[id]) continue;
      Sprites.tried[id] = true;
      tryLoad(id, ['png', 'webp', 'jpg'], 0);
    }
  };

  /* 画像を「指定した高さ」に収めて中心に描く。
     元画像の縦横比は保つので、素材の大きさがまちまちでも破綻しない */
  Sprites.draw = function (g, id, x, y, h, angle) {
    var im = Sprites.get(id);
    if (!im) return false;
    var scale = h / im.naturalHeight;
    var ww = im.naturalWidth * scale, hh = h;
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

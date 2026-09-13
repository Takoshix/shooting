/* =========================================================
   effects.js — 爽快感を担当する演出系
   パーティクル / 衝撃波 / 画面揺れ / ヒットストップ / 星空
   ---------------------------------------------------------
   パーティクルは毎回 new せず、あらかじめ確保した配列を使い回す
   （オブジェクトプール）。GC による一瞬のカクつきを防ぐため。
   ========================================================= */
(function (w) {
  'use strict';

  var MAXP = 2600, MAXR = 90, MAXT = 60;

  /* ---------------------------------------------------------
     色文字列のキャッシュ。
     パーティクルは毎フレーム最大 2600 個描くので、そのたびに
     'hsla(...)' という文字列を作ると生成と GC だけで重くなる。
     色を粗く量子化して使い回す（見た目の差はほぼ分からない）。
     --------------------------------------------------------- */
  var PCOL = [];
  function pcol(h, l, a) {
    h = ((h % 360) + 360) % 360;
    var hi = (h / 15) | 0;                 // 24 段階
    var li = U.clamp((l / 12) | 0, 0, 8);  // 9 段階
    var ai = U.clamp((a * 5) | 0, 0, 5);   // 6 段階
    var k = (hi * 9 + li) * 6 + ai;
    var c = PCOL[k];
    if (!c) c = PCOL[k] = 'hsla(' + (hi * 15) + ',95%,' + (li * 12) + '%,' + (ai / 5) + ')';
    return c;
  }

  function mk(n, f) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = f(); return a; }

  var FX = {
    parts: mk(MAXP, function () { return { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2, h: 200, add: true }; }),
    rings: mk(MAXR, function () { return { on: false, x: 0, y: 0, r: 0, vr: 0, life: 0, max: 1, h: 200, wide: 2 }; }),
    texts: mk(MAXT, function () { return { on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, s: '', col: '#fff', size: 12 }; }),
    pi: 0, ri: 0, ti: 0,
    shake: 0, shakeX: 0, shakeY: 0,
    /* 描画負荷に応じて 1.0〜0.3 の範囲で自動的に下がる演出品質。
       敵が 200 匹同時に爆発しても 60fps を守るための調整弁。
       見た目の派手さより「操作が重くならない」ことを優先する。 */
    quality: 1,
    hitStop: 0,
    flash: 0, flashHue: 200,
    stars: null
  };

  /* ---------- 星空（3 層パララックス） ---------- */
  FX.initStars = function () {
    FX.stars = [];
    for (var L = 0; L < CFG.fx.starLayers; L++) {
      var n = 46 + L * 16;
      var layer = { speed: 26 + L * 52, size: 1 + L * 0.6, alpha: 0.25 + L * 0.25, pts: [] };
      for (var i = 0; i < n; i++) {
        var hue = U.rand(180, 260);
        layer.pts.push({ x: Math.random() * CFG.W, y: Math.random() * CFG.H, col: U.hsl(hue, 80, 78) });
      }
      FX.stars.push(layer);
    }
  };

  FX.updateStars = function (dt, boost) {
    for (var L = 0; L < FX.stars.length; L++) {
      var la = FX.stars[L];
      for (var i = 0; i < la.pts.length; i++) {
        var p = la.pts[i];
        p.x -= la.speed * (1 + boost) * dt;
        if (p.x < -2) { p.x = CFG.W + 2; p.y = Math.random() * CFG.H; }
      }
    }
  };

  FX.drawStars = function (g) {
    for (var L = 0; L < FX.stars.length; L++) {
      var la = FX.stars[L];
      g.globalAlpha = la.alpha;
      for (var i = 0; i < la.pts.length; i++) {
        var p = la.pts[i];
        g.fillStyle = p.col;
        g.fillRect(p.x | 0, p.y | 0, la.size + 0.5, la.size);
      }
    }
    g.globalAlpha = 1;
  };

  /* ---------- パーティクル ---------- */
  FX.spark = function (x, y, vx, vy, life, r, hue, add) {
    var p = FX.parts[FX.pi = (FX.pi + 1) % MAXP];
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = p.max = life; p.r = r; p.h = hue; p.add = add !== false;
  };

  /* 爆発。size が大きいほど派手 */
  FX.boom = function (x, y, size, hue) {
    var n = Math.min(90, Math.round((10 + size * 16) * FX.quality));
    if (n < 4) n = 4;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * U.TAU;
      var sp = U.rand(28, 120) * (0.6 + size * 0.5);
      FX.spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        U.rand(0.22, 0.55) * (0.7 + size * 0.3), U.rand(1.2, 2.6) * (0.8 + size * 0.35),
        hue + U.rand(-18, 18));
    }
    FX.ring(x, y, 4, 210 * size, 0.32, hue, 2 + size);
    FX.addShake(2.2 * size);
  };

  /* 敵に当たったときの小さい火花 */
  FX.spat = function (x, y, hue) {
    var cnt = FX.quality > 0.7 ? 4 : 2;
    for (var i = 0; i < cnt; i++) {
      var a = U.rand(Math.PI * 0.6, Math.PI * 1.4);
      FX.spark(x, y, Math.cos(a) * U.rand(40, 130), Math.sin(a) * U.rand(-60, 60), U.rand(0.1, 0.25), U.rand(1, 2), hue);
    }
  };

  FX.ring = function (x, y, r, vr, life, hue, wide) {
    var o = FX.rings[FX.ri = (FX.ri + 1) % MAXR];
    o.on = true; o.x = x; o.y = y; o.r = r; o.vr = vr;
    o.life = o.max = life; o.h = hue; o.wide = wide || 2;
  };

  FX.text = function (x, y, s, col, size) {
    var o = FX.texts[FX.ti = (FX.ti + 1) % MAXT];
    o.on = true; o.x = x; o.y = y; o.vy = -34; o.life = o.max = 0.85;
    o.s = s; o.col = col || '#fff'; o.size = size || 11;
  };

  FX.addShake = function (v) { FX.shake = Math.min(CFG.fx.shakeMax, FX.shake + v); };
  FX.stop = function (sec) { FX.hitStop = Math.max(FX.hitStop, sec); };
  FX.doFlash = function (a, hue) { FX.flash = Math.max(FX.flash, a); FX.flashHue = hue === undefined ? 200 : hue; };

  FX.update = function (dt) {
    var i, o;
    for (i = 0; i < MAXP; i++) {
      o = FX.parts[i]; if (!o.on) continue;
      o.life -= dt;
      if (o.life <= 0) { o.on = false; continue; }
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.vx *= 0.93; o.vy *= 0.93;
      o.vy += 34 * dt;              // ごく弱い重力。破片が落ちる感じを出す
    }
    for (i = 0; i < MAXR; i++) {
      o = FX.rings[i]; if (!o.on) continue;
      o.life -= dt;
      if (o.life <= 0) { o.on = false; continue; }
      o.r += o.vr * dt;
    }
    for (i = 0; i < MAXT; i++) {
      o = FX.texts[i]; if (!o.on) continue;
      o.life -= dt;
      if (o.life <= 0) { o.on = false; continue; }
      o.y += o.vy * dt; o.vy *= 0.90;
    }
    FX.shake = Math.max(0, FX.shake - dt * 34);
    FX.flash = Math.max(0, FX.flash - dt * 3.2);
    var s = FX.shake;
    FX.shakeX = U.rand(-s, s); FX.shakeY = U.rand(-s, s);
  };

  FX.draw = function (g) {
    var i, o, t;
    /* 加算合成（lighter）で光が重なるほど白く飛ぶ＝爆発が派手に見える */
    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < MAXP; i++) {
      o = FX.parts[i]; if (!o.on) continue;
      t = o.life / o.max;
      g.fillStyle = pcol(o.h, 50 + 40 * t, Math.min(1, t * 1.5));
      var r = o.r * (0.4 + t * 0.8);
      g.fillRect(o.x - r, o.y - r, r * 2, r * 2);
    }
    for (i = 0; i < MAXR; i++) {
      o = FX.rings[i]; if (!o.on) continue;
      t = o.life / o.max;
      g.strokeStyle = pcol(o.h, 65, t * 0.75);
      g.lineWidth = o.wide * t;
      g.beginPath(); g.arc(o.x, o.y, o.r, 0, U.TAU); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  };

  FX.drawTexts = function (g) {
    g.textAlign = 'center';
    for (var i = 0; i < MAXT; i++) {
      var o = FX.texts[i]; if (!o.on) continue;
      var t = o.life / o.max;
      g.globalAlpha = Math.min(1, t * 1.8);
      g.font = 'bold ' + o.size + 'px monospace';
      g.fillStyle = o.col;
      g.fillText(o.s, o.x, o.y);
    }
    g.globalAlpha = 1;
    g.textAlign = 'left';
  };

  FX.reset = function () {
    for (var i = 0; i < MAXP; i++) FX.parts[i].on = false;
    for (i = 0; i < MAXR; i++) FX.rings[i].on = false;
    for (i = 0; i < MAXT; i++) FX.texts[i].on = false;
    FX.shake = FX.hitStop = FX.flash = 0;
  };

  w.FX = FX;
})(window);

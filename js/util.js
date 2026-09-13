/* =========================================================
   util.js — 汎用ヘルパ
   ========================================================= */
(function (w) {
  'use strict';
  var U = {};

  U.TAU = Math.PI * 2;

  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.lerp  = function (a, b, t) { return a + (b - a) * t; };
  U.rand  = function (lo, hi) { return lo + Math.random() * (hi - lo); };
  U.randInt = function (lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); };
  U.pick  = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  U.chance = function (p) { return Math.random() < p; };

  /* 現在値を目標値へ一定速度で近づける（急な変化を避ける） */
  U.approach = function (v, target, step) {
    return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
  };

  /* 円と円の当たり判定。ルートを取らず二乗のまま比較（高速） */
  U.hit = function (a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, r = a.r + b.r;
    return dx * dx + dy * dy < r * r;
  };

  /* dead フラグの立った要素を配列から詰め直す（splice より速い） */
  U.prune = function (arr) {
    var j = 0;
    for (var i = 0; i < arr.length; i++) { if (!arr[i].dead) arr[j++] = arr[i]; }
    arr.length = j;
  };

  U.angleTo = function (ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); };

  /* 12345678 -> "12,345,678" */
  U.comma = function (n) {
    var s = String(Math.floor(n)), out = '', c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s[i] + out;
      if (++c % 3 === 0 && i > 0) out = ',' + out;
    }
    return out;
  };

  /* HSL を CSS 文字列に。エフェクトの色相回しで使う */
  U.hsl = function (h, s, l, a) {
    return 'hsla(' + (h % 360) + ',' + s + '%,' + l + '%,' + (a === undefined ? 1 : a) + ')';
  };

  w.U = U;
})(window);

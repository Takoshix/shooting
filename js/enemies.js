/* =========================================================
   enemies.js — 敵の種類・動き・攻撃
   ---------------------------------------------------------
   重要：HP も弾速も、ゲームが進んでも一切変えない。
   増えるのは「数」だけ。強くなるのは自機だけ。
   ========================================================= */
(function (w) {
  'use strict';

  var TH = CFG.threat;
  var Enemies = {};
  var uid = 1;

  /* 敵の定義表。hp はここで固定。時間経過で強化されることはない */
  var TYPES = {
    zako:    { hp: 1,  r: 10, score: 120,   hue: 195, shape: 'wedge',   pat: 'straight', spd: 140 },
    waver:   { hp: 1,  r: 10, score: 160,   hue: 325, shape: 'lozenge', pat: 'sine',     spd: 120 },
    diver:   { hp: 2,  r: 11, score: 240,   hue: 45,  shape: 'dart',    pat: 'dive',     spd: 165 },
    turret:  { hp: 5,  r: 13, score: 520,   hue: 105, shape: 'turret',  pat: 'ground',   spd: 52, fires: 'aim' },
    cloud:   { hp: 3,  r: 15, score: 300,   hue: 210, shape: 'cloud',   pat: 'drift',    spd: 42, bell: true, harmless: true },
    pod:     { hp: 7,  r: 14, score: 900,   hue: 275, shape: 'pod',     pat: 'hover',    spd: 78, fires: 'spread' },
    carrier: { hp: 46, r: 27, score: 6000,  hue: 18,  shape: 'carrier', pat: 'slow',     spd: 46, fires: 'aim', caps: 3 },
    core:    { hp: 300,r: 46, score: 50000, hue: 350, shape: 'core',    pat: 'boss',     spd: 60, fires: 'boss', caps: 6, boss: true }
  };
  Enemies.TYPES = TYPES;

  /* 自機を破壊しうる敵か？ HP が低い雑魚と雲は「無害な的」 */
  Enemies.isArmored = function (d) {
    if (d.harmless) return false;
    return d.hp > TH.harmlessHp;
  };

  /* 画面内の武装敵の数 */
  Enemies.armoredCount = function (G) {
    var n = 0;
    for (var i = 0; i < G.en.length; i++) {
      var e = G.en[i];
      if (!e.dead && Enemies.isArmored(e.def)) n++;
    }
    return n;
  };

  Enemies.spawn = function (G, type, x, y, opt) {
    if (G.en.length >= CFG.director.aliveMax && !TYPES[type].boss) return null;

    /* ---------------------------------------------------------
       (1b) 危険な敵の総量を固定する。
       武装敵が上限に達していたら、同じ数だけザコに差し替える。
       「敵の数」は減らさず「危険の量」だけ一定に保つのがポイント。
       --------------------------------------------------------- */
    if (!TYPES[type].boss && Enemies.isArmored(TYPES[type]) &&
        Enemies.armoredCount(G) >= TH.armoredMax) {
      type = U.chance(0.5) ? 'zako' : 'waver';
    }

    var d = TYPES[type];
    var e = {
      id: uid++, type: type, def: d,
      x: x, y: y, y0: y, r: d.r,
      hp: d.hp, maxhp: d.hp,
      hue: d.hue, shape: d.shape, pat: d.pat,
      vx: -d.spd, vy: 0,
      t: 0, ph: Math.random() * U.TAU, amp: U.rand(26, 62),
      fireT: U.rand(0.8, 2.6),
      flash: 0, dead: false, fid: 0, side: 1, dropCap: false
    };
    if (opt) for (var k in opt) e[k] = opt[k];
    if (type === 'core') e.hp = e.maxhp = d.hp + G.wave * 45;  // 撃ち込み時間を稼ぐだけ。危険度は上げない
    G.en.push(e);
    if (e.fid) {
      G.forms[e.fid] = G.forms[e.fid] || { total: 0, alive: 0 };
      G.forms[e.fid].total++; G.forms[e.fid].alive++;
    }
    return e;
  };

  /* ---------------------------------------------------------
     (1) 弾幕予算：画面上の敵弾が上限に近づくほど発射を渋る。
     敵が何匹いても “空中の弾の数” がほぼ一定に保たれる中核処理。
     --------------------------------------------------------- */
  Enemies.canFire = function (G) {
    var n = G.eb.length;
    if (n >= TH.bulletBudget) return false;
    var ratio = n / TH.bulletBudget;
    if (ratio <= TH.softCapRatio) return true;
    var p = 1 - (ratio - TH.softCapRatio) / (1 - TH.softCapRatio);
    return Math.random() < p;
  };

  function eBullet(G, x, y, ang, spdMul) {
    var s = TH.bulletSpeed * (spdMul || 1);
    G.eb.push({
      x: x, y: y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s,
      r: 4.2, life: 7, dead: false, t: 0
    });
  }
  Enemies.eBullet = eBullet;

  function aimAt(G, e) {
    var pl = G.player;
    var a = Math.atan2(pl.y - e.y, pl.x - e.x);
    /* (2) 狙いのブレは最後まで一定。精度が上がらない＝難しくならない */
    return a + U.rand(-TH.aimError, TH.aimError);
  }

  function doFire(G, e) {
    if (!G.player.alive) return;
    if (!Enemies.canFire(G)) return;
    var kind = e.def.fires;
    if (kind === 'aim') {
      eBullet(G, e.x, e.y, aimAt(G, e));
    } else if (kind === 'spread') {
      var base = aimAt(G, e);
      for (var i = -1; i <= 1; i++) {
        if (!Enemies.canFire(G)) break;   // 1 発ごとに予算を確認する
        eBullet(G, e.x, e.y, base + i * 0.26);
      }
    } else if (kind === 'boss') {
      var b = aimAt(G, e);
      for (var j = -2; j <= 2; j++) {
        if (!Enemies.canFire(G)) break;
        eBullet(G, e.x - 20, e.y + j * 9, b + j * 0.17);
      }
    }
    FX.spark(e.x, e.y, -40, 0, 0.12, 2, e.hue);
  }

  /* ---------- 動きのパターン ---------- */
  var PAT = {
    straight: function (e, dt) { e.x += e.vx * dt; },
    sine: function (e, dt, G) {
      e.x += e.vx * dt;
      e.y = e.y0 + Math.sin(e.t * 2.6 + e.ph) * e.amp;
    },
    dive: function (e, dt, G) {
      /* 出現後 0.4 秒だけ自機の高さへ向き、あとは直進（読みやすい動き） */
      if (e.t < 0.4 && G.player.alive) {
        e.vy = U.approach(e.vy, U.clamp((G.player.y - e.y) * 1.6, -150, 150), 500 * dt);
      } else {
        e.vy = U.approach(e.vy, 0, 260 * dt);
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
    },
    ground: function (e, dt) { e.x += e.vx * dt; },
    drift: function (e, dt) {
      e.x += e.vx * dt;
      e.y = e.y0 + Math.sin(e.t * 1.2 + e.ph) * 12;
    },
    hover: function (e, dt) {
      /* 画面右 1/3 で止まってしばらく居座る */
      var stopX = CFG.W * 0.72;
      if (e.x > stopX) e.x += e.vx * dt;
      else { e.x -= 10 * dt; e.y = e.y0 + Math.sin(e.t * 1.9 + e.ph) * e.amp; }
    },
    slow: function (e, dt) {
      var stopX = CFG.W * 0.78;
      if (e.x > stopX) e.x += e.vx * dt;
      else { e.x -= 14 * dt; e.y = e.y0 + Math.sin(e.t * 0.9) * 38; }
    },
    boss: function (e, dt) {
      var stopX = CFG.W - 110;
      if (e.x > stopX) e.x += e.vx * dt;
      else { e.y = e.y0 + Math.sin(e.t * 0.8) * 92; }
    }
  };

  Enemies.update = function (G, dt) {
    var arr = G.en;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      (PAT[e.pat] || PAT.straight)(e, dt, G);

      if (e.def.fires) {
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.fireT = e.def.boss ? U.rand(0.7, 1.3) : U.rand(1.6, 3.4);
          doFire(G, e);
        }
      }
      /* 画面外へ抜けたら消す（倒せなくても危険が増えない） */
      if (e.x < -70 || e.y < -90 || e.y > CFG.H + 90) {
        e.dead = true;
        if (e.fid && G.forms[e.fid]) G.forms[e.fid].alive--;
      }
    }
    U.prune(arr);
  };

  /* 敵弾の更新 */
  Enemies.updateBullets = function (G, dt) {
    var arr = G.eb;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      b.t += dt; b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -30 || b.x > CFG.W + 30 || b.y < -30 || b.y > CFG.H + 30) b.dead = true;
    }
    U.prune(arr);
  };

  /* 敵弾の描画。
     爆発の閃光やレーザーの上でも必ず見えることを最優先する。
     ・黒フチ → 明るい背景でも輪郭が消えない
     ・純白のコア → 一番目立つ色を危険物に割り当てる
     ・丸 → アイテム（四角）と形で区別できる */
  Enemies.drawBullets = function (G, g) {
    for (var i = 0; i < G.eb.length; i++) {
      var b = G.eb[i];
      var p = 0.8 + Math.sin(b.t * 18) * 0.2;
      g.fillStyle = 'rgba(0,0,0,.9)';
      g.beginPath(); g.arc(b.x, b.y, b.r + 3.2, 0, U.TAU); g.fill();
      g.fillStyle = '#ff2f5e';
      g.beginPath(); g.arc(b.x, b.y, b.r + 1.2, 0, U.TAU); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(b.x, b.y, b.r * 0.62 * p, 0, U.TAU); g.fill();
    }
  };

  /* ---------- 敵の描画 ---------- */
  var SHAPE = {
    wedge: function (g, e) {
      g.beginPath(); g.moveTo(-11, 0); g.lineTo(8, -8); g.lineTo(11, 0); g.lineTo(8, 8); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.fillRect(-3, -1.5, 6, 3);
    },
    /* 菱形。丸は敵弾だけに使うので、敵の形は必ず角を持たせる */
    lozenge: function (g, e) {
      g.beginPath();
      g.moveTo(10, 0); g.lineTo(0, -9); g.lineTo(-10, 0); g.lineTo(0, 9);
      g.closePath(); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(3, 0); g.lineTo(0, -3); g.lineTo(-3, 0); g.lineTo(0, 3);
      g.closePath(); g.fill();
    },
    dart: function (g, e) {
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -9); g.lineTo(-3, 0); g.lineTo(-8, 9); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.fillRect(0, -1.5, 5, 3);
    },
    turret: function (g, e) {
      g.fillRect(-12, -4, 24, 12);
      g.beginPath(); g.arc(0, -4, 8, Math.PI, 0); g.fill();
      g.fillStyle = '#fff'; g.fillRect(-2, -12, 4, 8);
    },
    cloud: function (g, e) {
      g.beginPath();
      g.arc(-7, 2, 8, 0, U.TAU); g.arc(3, -3, 10, 0, U.TAU); g.arc(10, 3, 7, 0, U.TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(1, -4, 4.5, 0, U.TAU); g.fill();
    },
    /* 六角形。撃ってくる敵なので、ザコより重装に見せる */
    pod: function (g, e) {
      g.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * U.TAU;
        var px = Math.cos(a) * 13, py = Math.sin(a) * 13;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill();
      g.fillStyle = '#20143a';
      g.fillRect(-9, -5, 12, 10);
      g.fillStyle = '#fff';
      g.fillRect(-7, -3, 5, 6);
    },
    carrier: function (g, e) {
      g.fillRect(-26, -14, 52, 28);
      g.beginPath(); g.moveTo(-26, -14); g.lineTo(-40, 0); g.lineTo(-26, 14); g.closePath(); g.fill();
      g.fillStyle = '#2a1208';
      g.fillRect(-18, -8, 30, 6); g.fillRect(-18, 3, 30, 6);
      g.fillStyle = '#fff';
      g.fillRect(16, -3, 8, 6);
    },
    core: function (g, e) {
      g.fillRect(-46, -44, 78, 88);
      g.beginPath(); g.moveTo(-46, -44); g.lineTo(-72, 0); g.lineTo(-46, 44); g.closePath(); g.fill();
      g.fillStyle = '#2b0510';
      g.fillRect(-38, -34, 60, 12); g.fillRect(-38, 22, 60, 12);
      var pulse = 0.5 + Math.sin(e.t * 5) * 0.5;
      g.fillStyle = U.hsl(180, 100, 40 + pulse * 45);
      g.beginPath(); g.arc(-16, 0, 17, 0, U.TAU); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(-16, 0, 7 * pulse + 3, 0, U.TAU); g.fill();
    }
  };

  /* ---------------------------------------------------------
     スプライトキャッシュ。
     敵は最大 250 匹ほど同時に出るので、毎フレーム
     beginPath/arc でベクタ描画すると重い。
     起動時に 1 回だけ小さなオフスクリーンへ描いておき、
     あとは drawImage 1 回で済ませる。
     （core だけはコアが脈動するので毎回その場で描く）
     --------------------------------------------------------- */
  var SPR = null;

  function buildSprites() {
    SPR = {};
    for (var name in TYPES) {
      if (name === 'core') continue;
      var d = TYPES[name];
      var half = Math.ceil(d.r * 1.7);
      SPR[name] = { half: half, normal: bake(d, half, false), flash: bake(d, half, true) };
    }
  }

  function bake(d, half, white) {
    var c = document.createElement('canvas');
    c.width = c.height = half * 2;
    var g = c.getContext('2d');
    g.translate(half, half);
    g.fillStyle = white ? '#ffffff' : U.hsl(d.hue, 78, 58);
    (SHAPE[d.shape] || SHAPE.wedge)(g, { t: 0 });
    return c;
  }

  Enemies.draw = function (G, g) {
    if (!SPR) buildSprites();
    for (var i = 0; i < G.en.length; i++) {
      var e = G.en[i];
      var sp = SPR[e.type];
      if (sp) {
        g.drawImage(e.flash > 0 ? sp.flash : sp.normal, (e.x - sp.half) | 0, (e.y - sp.half) | 0);
      } else {
        g.save();
        g.translate(e.x, e.y);
        g.fillStyle = e.flash > 0 ? '#fff' : U.hsl(e.hue, 78, 58);
        (SHAPE[e.shape] || SHAPE.wedge)(g, e);
        g.restore();
      }

      /* 体力の多い敵だけ HP バーを出す */
      if (e.maxhp > 8) {
        var wpx = e.def.boss ? 90 : 46;
        var rate = U.clamp(e.hp / e.maxhp, 0, 1);
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.fillRect(e.x - wpx / 2, e.y - e.r - 12, wpx, 4);
        g.fillStyle = U.hsl(U.lerp(0, 130, rate) | 0, 90, 55);
        g.fillRect(e.x - wpx / 2, e.y - e.r - 12, wpx * rate, 4);
      }
    }
  };

  w.Enemies = Enemies;
})(window);

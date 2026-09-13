/* =========================================================
   enemies.js — 敵の種類・動き・攻撃
   ---------------------------------------------------------
   HP は最後まで固定。増えるのは「数」と、CFG.curve に沿ってゆっくり上がる
   「弾の量・弾速・狙いの精度」だけ。硬さは上げない。
   硬くすると武器を強化した手応えがそのまま打ち消されてしまうため。
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
    turret:  { hp: 5,  r: 13, score: 520,   hue: 105, shape: 'turret',  pat: 'ground',   spd: 52, fires: 'aim', capChance: 0.12 },
    cloud:   { hp: 3,  r: 15, score: 300,   hue: 210, shape: 'cloud',   pat: 'drift',    spd: 42, bell: true },
    pod:     { hp: 7,  r: 14, score: 900,   hue: 275, shape: 'pod',     pat: 'hover',    spd: 78, fires: 'spread', capChance: 0.2 },
    /* --- ここから撃ち返してくる／硬い敵。
       ザコを薙ぎ払うだけにならないよう、火力が伸びたら相手も増える --- */
    sentry:  { hp: 14, r: 14, score: 1200,  hue: 160, shape: 'sentry',  pat: 'hover',    spd: 74, fires: 'aim',    burst: 3, gap: [1.5, 2.6], capChance: 0.35 },
    sniper:  { hp: 10, r: 12, score: 1000,  hue: 52,  shape: 'sniper',  pat: 'edge',     spd: 130, fires: 'snipe',  gap: [1.3, 2.2], capChance: 0.30, linger: 7 },
    gunship: { hp: 24, r: 18, score: 2600,  hue: 32,  shape: 'gunship', pat: 'strafe',   spd: 98, fires: 'spread', burst: 2, gap: [1.4, 2.4], capChance: 0.60 },
    bulwark: { hp: 38, r: 22, score: 4200,  hue: 218, shape: 'bulwark', pat: 'push',     spd: 36, fires: 'fan',    gap: [1.8, 2.8], capChance: 0.95 },
    carrier: { hp: 46, r: 27, score: 6000,  hue: 18,  shape: 'carrier', pat: 'slow',     spd: 46, fires: 'aim', caps: 2 },
    core:    { hp: 300,r: 46, score: 50000, hue: 350, shape: 'core',    pat: 'boss',     spd: 60, fires: 'boss', caps: 4, boss: true }
  };
  Enemies.TYPES = TYPES;

  /* 撃ってくる敵か？（体当たりはどの敵でも自機を壊す） */
  Enemies.isArmed = function (d) { return !!d.fires; };

  /* 画面内で撃ってくる敵の数 */
  Enemies.armedCount = function (G) {
    var n = 0;
    for (var i = 0; i < G.en.length; i++) {
      var e = G.en[i];
      if (!e.dead && e.def.fires) n++;
    }
    return n;
  };

  Enemies.spawn = function (G, type, x, y, opt) {
    if (G.en.length >= CFG.director.aliveMax && !TYPES[type].boss) return null;

    /* ---------------------------------------------------------
       撃ってくる敵の数に上限をかける（上限自体は CFG.curve で
       ウェーブごとにゆっくり上がる）。超えた分はザコに差し替える。
       敵の「数」は減らさず、弾の出どころだけを抑えるのが狙い。
       --------------------------------------------------------- */
    if (!TYPES[type].boss && TYPES[type].fires &&
        Enemies.armedCount(G) >= CFG.armedMax(CFG.threatWave(G))) {
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

    /* 重装敵（HP 10 以上）だけ、実効ウェーブに応じて硬くする。
       ザコ（HP 1〜2）は最後まで一撃。
       全体を硬くすると武器強化の手応えが消えるが、
       撃ち込む対象だけを硬くするなら、雑魚を薙ぎ払う快感は残る */
    if (d.hp >= 10 && !d.boss) {
      e.hp = e.maxhp = Math.round(d.hp * CFG.toughness(CFG.threatWave(G)));
    }
    /* 連射する敵の残弾カウンタ */
    e.burstLeft = (d.burst || 1) - 1;

    if (type === 'core') e.hp = e.maxhp = Math.round((d.hp + G.wave * 45) * CFG.toughness(CFG.threatWave(G)));
    G.en.push(e);
    if (e.fid) {
      G.forms[e.fid] = G.forms[e.fid] || { total: 0, alive: 0 };
      G.forms[e.fid].total++; G.forms[e.fid].alive++;
    }
    return e;
  };

  /* ---------------------------------------------------------
     弾幕予算：画面上の敵弾が上限に近づくほど発射を渋る。
     敵が 5 匹でも 200 匹でも空中の弾数が予算内に収まる中核処理。
     予算そのものはウェーブとともにゆっくり増える（16 → 34 発）。
     --------------------------------------------------------- */
  Enemies.canFire = function (G) {
    var budget = CFG.bulletBudget(CFG.threatWave(G));
    var n = G.eb.length;
    if (n >= budget) return false;
    var ratio = n / budget;
    if (ratio <= TH.softCapRatio) return true;
    var p = 1 - (ratio - TH.softCapRatio) / (1 - TH.softCapRatio);
    return Math.random() < p;
  };

  function eBullet(G, x, y, ang, spdMul) {
    var s = CFG.enemyBulletSpeed(CFG.threatWave(G)) * (spdMul || 1);
    G.eb.push({
      x: x, y: y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s,
      r: 4.2, life: 7, dead: false, t: 0
    });
  }
  Enemies.eBullet = eBullet;

  function aimAt(G, e) {
    var pl = G.player;
    var a = Math.atan2(pl.y - e.y, pl.x - e.x);
    /* 狙いのブレ。実効ウェーブとともに精度が上がる（0.20 → 0.06 rad） */
    var err = CFG.aimError(CFG.threatWave(G));
    return a + U.rand(-err, err);
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
    } else if (kind === 'snipe') {
      /* 速い単発。弾速が上がるので反応より先読みが要る */
      eBullet(G, e.x, e.y, aimAt(G, e), 1.35);
    } else if (kind === 'fan') {
      /* 扇状のばらまき。硬いので撃たれ続ける前提の攻撃 */
      var f = aimAt(G, e);
      for (var k = -2; k <= 2; k++) {
        if (!Enemies.canFire(G)) break;
        eBullet(G, e.x - 10, e.y + k * 6, f + k * 0.20, 0.92);
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
    /* 画面右 2/3 まで来て、上下に動きながらじわじわ押してくる */
    strafe: function (e, dt) {
      var stopX = CFG.W * 0.66;
      if (e.x > stopX) e.x += e.vx * dt;
      else {
        e.x -= 12 * dt;
        e.y = e.y0 + Math.sin(e.t * 1.6 + e.ph) * 70;
      }
    },
    /* 右端に陣取って狙撃し、一定時間で切り上げて左へ抜けていく。
       居座り続ける敵は倒されない限り溜まり続け、
       画面端が撃ってくる敵で埋まってしまう（実際に 16 体溜まった）。
       滞留時間を必ず持たせるのはそのため */
    edge: function (e, dt) {
      var stopX = CFG.W - 42;
      if (e.x > stopX) { e.x += e.vx * dt; return; }
      if (e.t < (e.def.linger || 7)) {
        e.y = e.y0 + Math.sin(e.t * 1.1 + e.ph) * 58;
      } else {
        e.x -= 150 * dt;              // 切り上げて左へ抜ける
        e.y += Math.sin(e.t * 2.2) * 30 * dt;
      }
    },
    /* ゆっくり確実に前進してくる重装。放置すると詰められる */
    push: function (e, dt) { e.x += e.vx * dt; },
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
          doFire(G, e);
          if (e.burstLeft > 0) {
            /* 連射の途中。短い間隔で続けて撃つ */
            e.burstLeft--;
            e.fireT = 0.13;
          } else {
            var gap = e.def.gap || [1.6, 3.4];
            e.fireT = e.def.boss ? U.rand(0.6, 1.1) : U.rand(gap[0], gap[1]);
            e.burstLeft = (e.def.burst || 1) - 1;
          }
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
    /* 撃ってくる敵はひと目で分かるよう、砲身と赤いコアを持たせる */
    sentry: function (g, e) {
      g.beginPath();
      g.moveTo(13, 0); g.lineTo(4, -12); g.lineTo(-12, -8);
      g.lineTo(-12, 8); g.lineTo(4, 12); g.closePath(); g.fill();
      g.fillStyle = '#0d2b22'; g.fillRect(-14, -4, 12, 8);
      g.fillStyle = '#ff5a6a';
      g.beginPath(); g.arc(0, 0, 4.5, 0, U.TAU); g.fill();
    },
    sniper: function (g, e) {
      g.beginPath();
      g.moveTo(6, 0); g.lineTo(-4, -10); g.lineTo(-11, 0); g.lineTo(-4, 10);
      g.closePath(); g.fill();
      g.fillStyle = '#2a0d33'; g.fillRect(-16, -2.5, 22, 5);
      g.fillStyle = '#ff5a6a'; g.fillRect(-3, -2, 4, 4);
    },
    gunship: function (g, e) {
      g.beginPath();
      g.moveTo(18, 0); g.lineTo(2, -10); g.lineTo(-14, -14);
      g.lineTo(-8, 0); g.lineTo(-14, 14); g.lineTo(2, 10); g.closePath(); g.fill();
      g.fillStyle = '#3a1a04';
      g.fillRect(-16, -9, 14, 5); g.fillRect(-16, 4, 14, 5);
      g.fillStyle = '#ff5a6a';
      g.beginPath(); g.arc(2, 0, 4, 0, U.TAU); g.fill();
    },
    bulwark: function (g, e) {
      g.fillRect(-20, -20, 40, 40);
      g.beginPath(); g.moveTo(20, -20); g.lineTo(30, 0); g.lineTo(20, 20); g.closePath(); g.fill();
      g.fillStyle = '#0d1730';
      g.fillRect(-14, -14, 22, 8); g.fillRect(-14, -4, 22, 8); g.fillRect(-14, 6, 22, 8);
      g.fillStyle = '#ff5a6a';
      g.beginPath(); g.arc(14, 0, 5, 0, U.TAU); g.fill();
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

  /* 被弾時の色。
     硬い敵は絶えず撃たれ続けるので、真っ白にすると常時白のままになり、
     何の敵か分からなくなる（実際にボスが白い塊に見えていた）。
     HP の多い敵は「白」ではなく「明るい自分の色」で光らせる */
  function hitColor(d) {
    return d.hp >= 20 ? U.hsl(d.hue, 85, 80) : '#ffffff';
  }

  function bake(d, half, white) {
    var c = document.createElement('canvas');
    c.width = c.height = half * 2;
    var g = c.getContext('2d');
    g.translate(half, half);
    g.fillStyle = white ? hitColor(d) : U.hsl(d.hue, 78, 58);
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
        g.fillStyle = e.flash > 0 ? hitColor(e.def) : U.hsl(e.hue, 78, 58);
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

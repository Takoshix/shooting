/* =========================================================
   weapons.js — 自機の武器システム（グラディウス式パワーメーター）
   ---------------------------------------------------------
   カプセルを取る → メーターのカーソルが 1 つ進む → X で発動して消費。
   どの順で何を取るかはプレイヤーの自由（＝武器構成の個性が出る）。

   装備はすべて多段階。1 段ごとに必ず何かが目に見えて変わるよう、
   「弾の本数が増える段」と「威力が上がる段」を交互に並べてある。
   本数だけ増やし続けると画面が自弾で埋まり、
   威力だけ上げ続けると見た目が変わらず強くなった実感が出ないため。

     SPEED   6 段 … 移動速度 195 → 387 px/秒
     MISSILE 5 段 … 1 発 → 2 発 → 威力 → 4 発 → 追尾強化
     DOUBLE  6 段 … 2way → 3way → 威力 → 5way → 威力 → 7way
     LASER   6 段 … 貫通 → 長く → 2 本 → 威力 → 3 本 → 極太
     OPTION  6 段 … 分身が 6 基まで。全弾がそのまま倍化する
     FORCE   5 段 … バリアの耐弾数 3 → 5 → 7 → 9 → 12

   火力の伸び（1 秒あたりの与ダメージ = DPS）の目安：
     初期                 約 10 DPS
     オプション 6 つ       約 70 DPS
     ＋ショット最大        約 130 DPS
     ＋チェイン最大        約 190 DPS
   敵の HP は最後まで 1〜7 のまま上げないので、
   1 匹を倒すのにかかる時間（TTK）は時間とともに短くなり続ける。
   ========================================================= */
(function (w) {
  'use strict';

  var WP = CFG.weapon;
  var Weapons = {};
  var uid = 1;

  /* パワー状態の初期値 */
  Weapons.newPower = function () {
    return {
      cursor: 0,       // パワーメーターのカーソル（0 = 未取得）
      speed: 0,
      missile: 0,
      double: 0,
      laser: 0,
      shot: 'normal',  // 'normal' | 'double' | 'laser'
      options: 0,
      force: 0,        // フォースフィールドの段数
      shield: 0,       // 残り耐弾数
      capsules: 0      // 通算取得数（統計表示用）
    };
  };

  /* 総合的な強さ（0〜1）。BGM のレイヤーや演出の派手さに使う */
  Weapons.powerRatio = function (p) {
    var v = p.speed / CFG.player.speedMax + p.missile / WP.missileMax +
            Math.max(p.double / WP.doubleMax, p.laser / WP.laserMax) +
            p.options / WP.optionMax;
    return U.clamp(v / 4, 0, 1);
  };

  /* カプセル取得 */
  Weapons.gainCapsule = function (p) {
    p.capsules++;
    p.cursor = p.cursor % CFG.slots.length + 1;   // 1..6 を循環
  };

  /* X で発動。成功したらスロット名を返す */
  Weapons.activate = function (p) {
    if (p.cursor === 0) return null;
    var slot = CFG.slots[p.cursor - 1];
    var ok = false, msg = '';
    switch (slot.key) {
      case 'speed':
        if (p.speed < CFG.player.speedMax) { p.speed++; ok = true; msg = 'SPEED UP ' + p.speed; }
        break;
      case 'missile':
        if (p.missile < WP.missileMax) { p.missile++; ok = true; msg = 'MISSILE ' + p.missile; }
        break;
      case 'double':
        if (p.shot !== 'double') { p.shot = 'double'; if (p.double === 0) p.double = 1; ok = true; msg = 'DOUBLE'; }
        else if (p.double < WP.doubleMax) { p.double++; ok = true; msg = 'DOUBLE ' + p.double; }
        break;
      case 'laser':
        if (p.shot !== 'laser') { p.shot = 'laser'; if (p.laser === 0) p.laser = 1; ok = true; msg = 'LASER'; }
        else if (p.laser < WP.laserMax) { p.laser++; ok = true; msg = 'LASER ' + p.laser; }
        break;
      case 'option':
        if (p.options < WP.optionMax) { p.options++; ok = true; msg = 'OPTION ' + p.options; }
        break;
      case 'force':
        /* 段が上がるほど耐弾数が増える。最大段でも取り直せば回復する */
        if (p.force < WP.forceMax) { p.force++; msg = 'FORCE ' + p.force; }
        else { msg = 'FORCE 回復'; }
        p.shield = WP.shieldHits[p.force - 1];
        ok = true;
        break;
    }
    if (ok) p.cursor = 0;
    return ok ? { slot: slot, msg: msg } : null;
  };

  /* ---------- 弾の生成 ---------- */
  function bullet(G, x, y, vx, vy, dmg, r, kind, hue, extra) {
    var b = {
      id: uid++, x: x, y: y, vx: vx, vy: vy, dmg: dmg, r: r,
      kind: kind, hue: hue, life: 2.4, dead: false,
      len: 0, pierce: false, hitIds: null, target: null
    };
    if (extra) for (var k in extra) b[k] = extra[k];
    G.pb.push(b);
    return b;
  }

  /* 現在の連射間隔。チェインが伸びるほど速くなる */
  Weapons.fireInterval = function (G) {
    var t = U.clamp(G.chain / CFG.chain.rateAt, 0, 1);
    return U.lerp(WP.fireInterval, WP.fireIntervalMin, t);
  };

  /* ショット（DOUBLE 系）の段階表。
     angles = 撃つ向き（ラジアン、0 が真正面）、dmg = 1 発の威力 */
  var SHOT_STAGE = [
    { angles: [0],                                  dmg: 1 },  // 未取得
    { angles: [0, -0.62],                           dmg: 1 },  // 1: 2way
    { angles: [0, -0.62, 0.62],                     dmg: 1 },  // 2: 3way
    { angles: [0, -0.62, 0.62],                     dmg: 2 },  // 3: 威力
    { angles: [0, -0.62, 0.62, -0.30, 0.30],        dmg: 2 },  // 4: 5way
    { angles: [0, -0.62, 0.62, -0.30, 0.30],        dmg: 3 },  // 5: 威力
    { angles: [0, -0.90, 0.90, -0.62, 0.62, -0.30, 0.30], dmg: 3 }  // 6: 7way
  ];

  /* レーザーの段階表。lines = 同時に出る本数の縦位置 */
  var LASER_STAGE = [
    null,
    { len: 60,  dmg: 2, lines: [0],        w: 4.0 },  // 1: 貫通 1 本
    { len: 92,  dmg: 2, lines: [0],        w: 4.5 },  // 2: 長く
    { len: 92,  dmg: 3, lines: [-7, 7],    w: 3.6 },  // 3: 2 本
    { len: 118, dmg: 5, lines: [-7, 7],    w: 4.0 },  // 4: 威力
    { len: 118, dmg: 5, lines: [-10, 0, 10], w: 3.6 },// 5: 3 本
    { len: 150, dmg: 8, lines: [-11, 0, 11], w: 5.0 } // 6: 極太
  ];

  /* 1 発分の発射（自機本体とオプションの両方から呼ばれる） */
  Weapons.fireFrom = function (G, x, y, isOption) {
    var p = G.pw, s = WP.bulletSpeed, i;

    if (p.shot === 'laser' && p.laser > 0) {
      var L = LASER_STAGE[Math.min(p.laser, WP.laserMax)];
      /* オプションからは 1 本だけ。6 基 × 3 本だと画面が自弾で埋まる */
      var lines = isOption ? [0] : L.lines;
      for (i = 0; i < lines.length; i++) {
        bullet(G, x + L.len * 0.5, y + lines[i], s * 1.5, 0, L.dmg, L.w, 'laser', 315,
          { len: L.len, pierce: true, hitIds: Object.create(null), life: 1.2 });
      }
      /* レーザー時のチェイン追加ショットは通常弾で撃つ（本体のみ） */
      if (!isOption) {
        var extra = chainAngles(G);
        for (i = 0; i < extra.length; i++) {
          bullet(G, x, y, Math.cos(extra[i]) * s, Math.sin(extra[i]) * s,
            WP.bulletDamage, 3.5, 'shot', 190);
        }
      }
      return;
    }

    var st = SHOT_STAGE[p.shot === 'double' ? Math.min(p.double, WP.doubleMax) : 0];
    var angles = st.angles;
    if (isOption) {
      /* オプションは本数を絞る。本体と同じだけ撃たせると
         6 基で 40 発を超え、敵も敵弾も自弾に隠れて見えなくなる */
      angles = angles.slice(0, CFG.weapon.optionAngles);
    } else {
      angles = angles.concat(chainAngles(G));
    }
    for (i = 0; i < angles.length; i++) {
      var a = angles[i];
      bullet(G, x, y, Math.cos(a) * s, Math.sin(a) * s,
        st.dmg, isOption ? 3.2 : 4, 'shot', a === 0 ? 190 : 150);
    }
  };

  /* チェインによる自動追加ショット（敵が多いほど自然に強くなる） */
  function chainAngles(G) {
    var out = [];
    if (G.chain >= CFG.chain.side1) { out.push(-0.16, 0.16); }
    if (G.chain >= CFG.chain.side2) { out.push(-0.40, 0.40); }
    return out;
  }

  /* ミサイル（別タイマーで発射される追尾兵器）。5 段階 */
  var MISSILE_STAGE = [
    null,
    { count: 1, dmg: 3, turn: 3.2, spd: 340 },  // 1: 下方向へ 1 発
    { count: 2, dmg: 3, turn: 3.6, spd: 360 },  // 2: 上下へ 2 発
    { count: 2, dmg: 5, turn: 4.0, spd: 380 },  // 3: 威力
    { count: 4, dmg: 5, turn: 4.4, spd: 400 },  // 4: 4 発
    { count: 4, dmg: 7, turn: 6.2, spd: 440 }   // 5: 威力と追尾性能
  ];

  Weapons.fireMissile = function (G, x, y) {
    var p = G.pw;
    if (p.missile <= 0) return;
    var M = MISSILE_STAGE[Math.min(p.missile, WP.missileMax)];
    var mk = function (dy, vy) {
      bullet(G, x, y + dy, 210, vy, M.dmg, 6, 'missile', 30,
        { life: 3.2, turn: M.turn, spd: M.spd });
    };
    mk(4, 120);
    if (M.count >= 2) mk(-4, -120);
    if (M.count >= 4) { mk(10, 210); mk(-10, -210); }
  };

  /* ---------- 自機弾の更新 ---------- */
  Weapons.updateBullets = function (G, dt) {
    var arr = G.pb;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }

      if (b.kind === 'missile') {
        /* 一番近い敵へゆっくり向きを変える（ホーミング） */
        var tgt = nearestEnemy(G, b.x, b.y, 260);
        if (tgt) {
          var want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          var cur = Math.atan2(b.vy, b.vx);
          var d = ((want - cur + Math.PI * 3) % U.TAU) - Math.PI;
          cur += U.clamp(d, -b.turn * dt, b.turn * dt);
          b.vx = Math.cos(cur) * b.spd; b.vy = Math.sin(cur) * b.spd;
        } else {
          b.vx = U.approach(b.vx, b.spd, 520 * dt);
          b.vy = U.approach(b.vy, 0, 420 * dt);
        }
        if (Math.random() < 0.7) {
          FX.spark(b.x, b.y, U.rand(-30, 10), U.rand(-20, 20), 0.22, 1.8, 26);
        }
      }

      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x > CFG.W + 80 || b.x < -80 || b.y < -60 || b.y > CFG.H + 60) b.dead = true;
    }
    U.prune(arr);
  };

  function nearestEnemy(G, x, y, maxd) {
    var best = null, bd = maxd * maxd;
    for (var i = 0; i < G.en.length; i++) {
      var e = G.en[i];
      if (e.dead || e.x < x - 30) continue;
      var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  Weapons.nearestEnemy = nearestEnemy;

  /* 弾の色は数種類しかないので最初に作って使い回す */
  var BCOL = {};
  function bcol(h, l, a) {
    var k = h + '_' + l + '_' + a;
    return BCOL[k] || (BCOL[k] = U.hsl(h, 100, l, a));
  }

  Weapons.drawBullets = function (G, g) {
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.pb.length; i++) {
      var b = G.pb[i];
      if (b.kind === 'laser') {
        /* 太く白いと画面全部を覆って敵も敵弾も見えなくなるので、
           外側を色つきの半透明、芯だけを細い白にする */
        var h = b.r * 0.8;
        g.fillStyle = bcol(b.hue, 55, 0.4);
        g.fillRect(b.x - b.len, b.y - h, b.len * 2, h * 2);
        g.fillStyle = bcol(b.hue, 75, 0.85);
        g.fillRect(b.x - b.len, b.y - h * 0.5, b.len * 2, h);
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.fillRect(b.x - b.len, b.y - 1, b.len * 2, 2);
      } else if (b.kind === 'missile') {
        g.fillStyle = bcol(b.hue, 62, 1);
        g.beginPath(); g.arc(b.x, b.y, b.r * 0.7, 0, U.TAU); g.fill();
        g.fillStyle = '#fff';
        g.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      } else {
        g.fillStyle = bcol(b.hue, 65, 0.85);
        g.fillRect(b.x - 8, b.y - b.r * 0.55, 16, b.r * 1.1);
        g.fillStyle = '#eaffff';
        g.fillRect(b.x - 5, b.y - 1, 11, 2);
      }
    }
    g.globalCompositeOperation = 'source-over';
  };

  w.Weapons = Weapons;
})(window);

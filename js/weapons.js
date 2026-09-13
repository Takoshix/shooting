/* =========================================================
   weapons.js — 自機の武器システム（グラディウス式パワーメーター）
   ---------------------------------------------------------
   カプセルを取る → メーターのカーソルが 1 つ進む → X で発動して消費。
   どの順で何を取るかはプレイヤーの自由（＝武器構成の個性が出る）。

   火力の伸び方（1 秒あたりの与ダメージ = DPS）の目安：
     初期           約 10 DPS
     オプション 4 つ 約 50 DPS
     ＋レーザー      約 90 DPS
     ＋チェイン最大  約 150 DPS
   敵の HP は最後まで 1〜6 のまま上げないので、
   1 匹を倒すのにかかる時間（TTK）は時間とともに “短く” なっていく。
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
      shield: 0,       // 残り耐弾数
      capsules: 0      // 通算取得数（統計表示用）
    };
  };

  /* 総合的な強さ（0〜1）。BGM のレイヤーや演出の派手さに使う */
  Weapons.powerRatio = function (p) {
    var v = p.speed / WP.doubleMax + p.missile / WP.missileMax +
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
        p.shield = WP.shieldHits; ok = true; msg = 'FORCE FIELD';
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

  /* 1 発分の発射（自機本体とオプションの両方から呼ばれる） */
  Weapons.fireFrom = function (G, x, y, isOption) {
    var p = G.pw, s = WP.bulletSpeed;
    var angles = [0];

    if (p.shot === 'double') {
      if (p.double >= 1) angles.push(-0.62);
      if (p.double >= 2) angles.push(0.62);
      if (p.double >= 3) { angles.push(-0.3); angles.push(0.3); }
    }
    /* チェインによる自動追加ショット（敵が多いほど自然に強くなる） */
    if (G.chain >= CFG.chain.side1) { angles.push(-0.16); angles.push(0.16); }
    if (G.chain >= CFG.chain.side2) { angles.push(-0.34); angles.push(0.34); }

    if (p.shot === 'laser') {
      var lv = p.laser;
      var len = 52 + lv * 34;
      var dmg = 1 + lv;
      bullet(G, x + len * 0.5, y, s * 1.5, 0, dmg, 4, 'laser', 315,
        { len: len, pierce: true, hitIds: Object.create(null), life: 1.2 });
      if (lv >= 3) {
        bullet(G, x + len * 0.5, y - 7, s * 1.5, 0, dmg, 3, 'laser', 300, { len: len, pierce: true, hitIds: Object.create(null), life: 1.2 });
        bullet(G, x + len * 0.5, y + 7, s * 1.5, 0, dmg, 3, 'laser', 300, { len: len, pierce: true, hitIds: Object.create(null), life: 1.2 });
      }
      /* レーザー時もチェイン追加ショットは通常弾で出す */
      for (var i = 1; i < angles.length; i++) {
        bullet(G, x, y, Math.cos(angles[i]) * s, Math.sin(angles[i]) * s, WP.bulletDamage, 3.5, 'shot', 190);
      }
    } else {
      for (var j = 0; j < angles.length; j++) {
        var a = angles[j];
        bullet(G, x, y, Math.cos(a) * s, Math.sin(a) * s,
          WP.bulletDamage, isOption ? 3.2 : 4, 'shot', a === 0 ? 190 : 150);
      }
    }
  };

  /* ミサイル（別タイマーで発射される追尾兵器） */
  Weapons.fireMissile = function (G, x, y) {
    var p = G.pw;
    if (p.missile <= 0) return;
    var dmg = WP.missileDamage + (p.missile - 1);
    var mk = function (dy, vy) {
      bullet(G, x, y + dy, 210, vy, dmg, 6, 'missile', 30,
        { life: 3.2, turn: 2.2 + p.missile * 1.1, spd: 300 + p.missile * 40 });
    };
    mk(4, 120);
    if (p.missile >= 2) mk(-4, -120);
    if (p.missile >= 3) { mk(10, 210); mk(-10, -210); }
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

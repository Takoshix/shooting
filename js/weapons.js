/* =========================================================
   weapons.js — 自機の武器システム（グラディウス式パワーメーター）
   ---------------------------------------------------------
   カプセルを取る → メーターのカーソルが 1 つ進む → X で発動して消費。
   どの順で何を取るかはプレイヤーの自由（＝武器構成の個性が出る）。

   武器は 3 系統。どれも排他ではなく、取ったぶんだけ同時に撃つ。
   1 系統を伸ばすと尖り、散らすと穴が無くなる、という選び方になる。

     VULCAN  … 正面に広がる拡散弾。手数の土台。目の前の敵に強い
     HOMING  … 曲がって追いかける弾の群れ。画面の隅に散った敵に強い
     CLUSTER … 着弾で爆発し、破片を全方位に撒く。固まった敵に強い

   レーザーは廃止した。貫通する一本の線は、
   並んだ敵をまとめて貫くぶん他の武器より明確に強く、
   しかも画面を覆って敵と敵弾を隠してしまうため。

   装備はすべて多段階。1 段ごとに必ず何かが目に見えて変わるよう、
   「弾の本数が増える段」と「威力が上がる段」を交互に並べてある。
   本数だけ増やすと画面が自弾で埋まり、
   威力だけ上げると見た目が変わらず強くなった実感が出ない。
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
      cluster: 0,
      vulcan: 0,
      homing: 0,
      options: 0,
      force: 0,        // フォースフィールドの段数
      shield: 0,       // 残り耐弾数
      capsules: 0      // 通算取得数（統計表示用）
    };
  };

  /* 総合的な強さ（0〜1）。BGM のレイヤー、演出の派手さ、
     そして「装備に連動した脅威」（CFG.threatWave）の計算に使う */
  Weapons.powerRatio = function (p) {
    var v = p.speed / CFG.player.speedMax +
            p.cluster / WP.clusterMax +
            p.vulcan / WP.vulcanMax +
            p.homing / WP.homingMax +
            p.options / WP.optionMax;
    return U.clamp(v / 5, 0, 1);
  };

  /* カプセル取得 */
  Weapons.gainCapsule = function (p) {
    p.capsules++;
    p.cursor = p.cursor % CFG.slots.length + 1;   // 1..6 を循環
  };

  /* X で発動。成功したらスロットとメッセージを返す */
  Weapons.activate = function (p) {
    if (p.cursor === 0) return null;
    var slot = CFG.slots[p.cursor - 1];
    var ok = false, msg = '';
    switch (slot.key) {
      case 'speed':
        if (p.speed < CFG.player.speedMax) { p.speed++; ok = true; msg = 'SPEED UP ' + p.speed; }
        break;
      case 'cluster':
        if (p.cluster < WP.clusterMax) { p.cluster++; ok = true; msg = 'CLUSTER ' + p.cluster; }
        break;
      case 'vulcan':
        if (p.vulcan < WP.vulcanMax) { p.vulcan++; ok = true; msg = 'VULCAN ' + p.vulcan; }
        break;
      case 'homing':
        if (p.homing < WP.homingMax) { p.homing++; ok = true; msg = 'HOMING ' + p.homing; }
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
      turn: 0, spd: 0, fuse: 0, radius: 0, frags: 0, fragDmg: 0
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

  /* =========================================================
     VULCAN — 主武装の拡散弾
     ========================================================= */
  var VULCAN_STAGE = [
    { angles: [0],                                        dmg: 1 },  // 未取得
    { angles: [0, -0.62],                                 dmg: 1 },  // 1: 2way
    { angles: [0, -0.62, 0.62],                           dmg: 1 },  // 2: 3way
    { angles: [0, -0.62, 0.62],                           dmg: 2 },  // 3: 威力
    { angles: [0, -0.62, 0.62, -0.30, 0.30],              dmg: 2 },  // 4: 5way
    { angles: [0, -0.62, 0.62, -0.30, 0.30],              dmg: 3 },  // 5: 威力
    { angles: [0, -0.90, 0.90, -0.62, 0.62, -0.30, 0.30], dmg: 3 }   // 6: 7way
  ];

  /* チェインによる自動追加ショット（敵が多いほど自然に強くなる） */
  function chainAngles(G) {
    var out = [];
    if (G.chain >= CFG.chain.side1) { out.push(-0.16, 0.16); }
    if (G.chain >= CFG.chain.side2) { out.push(-0.40, 0.40); }
    return out;
  }

  /* 1 発分の発射（自機本体とオプションの両方から呼ばれる） */
  Weapons.fireFrom = function (G, x, y, isOption) {
    var p = G.pw, s = WP.bulletSpeed, i;
    var st = VULCAN_STAGE[Math.min(p.vulcan, WP.vulcanMax)];
    var angles = st.angles;

    if (isOption) {
      /* オプションは本数を絞る。本体と同じだけ撃たせると
         6 基で 40 発を超え、敵も敵弾も自弾に隠れて見えなくなる */
      angles = angles.slice(0, WP.optionAngles);
    } else {
      angles = angles.concat(chainAngles(G));
    }
    for (i = 0; i < angles.length; i++) {
      var a = angles[i];
      bullet(G, x, y, Math.cos(a) * s, Math.sin(a) * s,
        st.dmg, isOption ? 3.2 : 4, 'shot', a === 0 ? 190 : 150);
    }
  };

  /* =========================================================
     HOMING — 追尾弾の群れ
     最初は扇状にばらけて飛び、そこから敵へ曲がっていく。
     まっすぐ敵へ向かわせると見た目が地味なので、
     いったん散らしてから収束させている。
     ========================================================= */
  /* 追尾弾は「必ず当たる」。そのぶん 1 発の威力は低く抑えてある。
     外れない武器に高い威力を持たせると、狙いを付ける必要のある
     他の武器を選ぶ理由が無くなる（廃止したレーザーがまさにそれだった）。 */
  var HOMING_STAGE = [
    null,
    { count: 1, dmg: 2, turn: 3.4, spd: 380 },  // 1
    { count: 2, dmg: 2, turn: 3.8, spd: 400 },  // 2
    { count: 2, dmg: 3, turn: 4.4, spd: 420 },  // 3: 威力
    { count: 4, dmg: 3, turn: 4.8, spd: 440 },  // 4
    { count: 4, dmg: 4, turn: 5.4, spd: 460 },  // 5: 威力
    { count: 6, dmg: 4, turn: 6.4, spd: 500 }   // 6
  ];

  Weapons.fireHoming = function (G, x, y) {
    var p = G.pw;
    if (p.homing <= 0) return;
    var H = HOMING_STAGE[Math.min(p.homing, WP.homingMax)];
    for (var i = 0; i < H.count; i++) {
      /* 扇状に散らす。左右交互に開いていく */
      var spread = (i % 2 === 0 ? 1 : -1) * (0.55 + Math.floor(i / 2) * 0.42);
      bullet(G, x, y, Math.cos(spread) * H.spd * 0.6, Math.sin(spread) * H.spd * 0.6,
        H.dmg, 5, 'homing', 320, { life: 2.6, turn: H.turn, spd: H.spd });
    }
  };

  /* =========================================================
     CLUSTER — 着弾で爆発し、破片を全方位に撒く
     範囲攻撃と弾幕を兼ねる。固まった敵に刺さる
     ========================================================= */
  /* クラスタは「範囲内の全員に当たる」。
     1 体だけを相手にすると弱く、固まった相手には桁違いに効く、
     という差をはっきり付けるため、1 発の威力は低めにしてある。 */
  var CLUSTER_STAGE = [
    null,
    { count: 1, dmg: 3, radius: 42, frags: 6,  fragDmg: 1 },  // 1
    { count: 1, dmg: 3, radius: 56, frags: 9,  fragDmg: 1 },  // 2: 範囲
    { count: 2, dmg: 4, radius: 56, frags: 9,  fragDmg: 2 },  // 3: 2 発
    { count: 2, dmg: 4, radius: 68, frags: 14, fragDmg: 2 },  // 4: 破片増
    { count: 2, dmg: 6, radius: 68, frags: 14, fragDmg: 3 },  // 5: 威力
    { count: 3, dmg: 7, radius: 82, frags: 20, fragDmg: 3 }   // 6: 3 発
  ];

  Weapons.fireCluster = function (G, x, y) {
    var p = G.pw;
    if (p.cluster <= 0) return;
    var C = CLUSTER_STAGE[Math.min(p.cluster, WP.clusterMax)];
    var offs = C.count === 1 ? [0] : (C.count === 2 ? [-9, 9] : [-14, 0, 14]);
    for (var i = 0; i < offs.length; i++) {
      /* 信管は画面を横断できる長さにする。
         短いと敵に届く前に空中で自爆し、まったく当たらない武器になる。
         発射後は加速するので、届く距離と見た目の勢いを両立できる */
      bullet(G, x, y + offs[i], 240, offs[i] * 5, C.dmg, 8, 'cluster', 42, {
        life: 3.0, fuse: 1.5, radius: C.radius, frags: C.frags, fragDmg: C.fragDmg
      });
    }
  };

  /* 爆発で撒かれる破片。短命の小さな弾 */
  Weapons.spawnFrags = function (G, x, y, n, dmg) {
    var base = Math.random() * U.TAU;
    for (var i = 0; i < n; i++) {
      var a = base + i / n * U.TAU;
      var sp = U.rand(240, 340);
      bullet(G, x, y, Math.cos(a) * sp, Math.sin(a) * sp, dmg, 3.4, 'frag', 48,
        { life: 0.42 });
    }
  };

  /* ---------- 一番近い敵を探す（追尾用） ---------- */
  function nearestEnemy(G, x, y, maxd) {
    var best = null, bd = maxd * maxd;
    for (var i = 0; i < G.en.length; i++) {
      var e = G.en[i];
      if (e.dead) continue;
      var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  Weapons.nearestEnemy = nearestEnemy;

  /* ---------- 自機弾の更新 ---------- */
  Weapons.updateBullets = function (G, dt) {
    var arr = G.pb;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.dead = true;
        /* 寿命が尽きたクラスタも、その場で爆発させる */
        if (b.kind === 'cluster' && G.explodeCluster) G.explodeCluster(b);
        continue;
      }

      if (b.kind === 'homing') {
        var tgt = nearestEnemy(G, b.x, b.y, 340);
        if (tgt) {
          var want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          var cur = Math.atan2(b.vy, b.vx);
          /* 角度の差を -π〜π に畳んでから、1 フレームぶんだけ曲げる */
          var d = ((want - cur + Math.PI * 3) % U.TAU) - Math.PI;
          cur += U.clamp(d, -b.turn * dt, b.turn * dt);
          b.vx = Math.cos(cur) * b.spd; b.vy = Math.sin(cur) * b.spd;
        } else {
          /* 狙う相手がいなければ、だんだん正面へ戻る */
          b.vx = U.approach(b.vx, b.spd, 620 * dt);
          b.vy = U.approach(b.vy, 0, 520 * dt);
        }
        if (Math.random() < 0.6) {
          FX.spark(b.x, b.y, U.rand(-40, 10), U.rand(-25, 25), 0.2, 1.6, 320);
        }
      } else if (b.kind === 'cluster') {
        b.fuse -= dt;
        b.vx = U.approach(b.vx, 480, 420 * dt);   // 発射後に加速する
        b.vy *= 0.94;
        if (Math.random() < 0.8) {
          FX.spark(b.x, b.y, U.rand(-50, 0), U.rand(-20, 20), 0.22, 2.2, 42);
        }
        if (b.fuse <= 0) {
          b.dead = true;
          if (G.explodeCluster) G.explodeCluster(b);
          continue;
        }
      }

      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x > CFG.W + 80 || b.x < -80 || b.y < -60 || b.y > CFG.H + 60) b.dead = true;
    }
    U.prune(arr);
  };

  /* ---------- 描画 ----------
     色は数種類しかないので最初に作って使い回す */
  var BCOL = {};
  function bcol(h, l, a) {
    var k = h + '_' + l + '_' + a;
    return BCOL[k] || (BCOL[k] = U.hsl(h, 100, l, a));
  }

  Weapons.drawBullets = function (G, g) {
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.pb.length; i++) {
      var b = G.pb[i];
      if (b.kind === 'homing') {
        /* 菱形。丸は敵弾に割り当ててあるので、自機弾には使わない。
           爆発の光の中でも「これは自分の弾」と一目で分かるようにする */
        var hr = b.r;
        g.fillStyle = bcol(b.hue, 62, 0.85);
        g.beginPath();
        g.moveTo(b.x + hr, b.y); g.lineTo(b.x, b.y - hr);
        g.lineTo(b.x - hr, b.y); g.lineTo(b.x, b.y + hr);
        g.closePath(); g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      } else if (b.kind === 'cluster') {
        var pulse = 1 + Math.sin(b.fuse * 34) * 0.22;
        g.fillStyle = bcol(b.hue, 55, 0.5);
        g.beginPath(); g.arc(b.x, b.y, b.r * 1.3 * pulse, 0, U.TAU); g.fill();
        g.fillStyle = bcol(b.hue, 72, 1);
        g.beginPath(); g.arc(b.x, b.y, b.r * pulse, 0, U.TAU); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(b.x, b.y, b.r * 0.42, 0, U.TAU); g.fill();
      } else if (b.kind === 'frag') {
        g.fillStyle = bcol(b.hue, 68, 0.9);
        g.fillRect(b.x - 2.5, b.y - 2.5, 5, 5);
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

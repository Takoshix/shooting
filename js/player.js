/* =========================================================
   player.js — 自機とオプション（マルチプル）
   ---------------------------------------------------------
   オプションは「自機の軌跡を n フレーム遅れでなぞる」方式。
   グラディウスと同じで、動いた道をそのまま追ってくる。
   ========================================================= */
(function (w) {
  'use strict';

  var P = CFG.player, WP = CFG.weapon;
  var Player = {};
  var HIST = (WP.optionMax + 1) * WP.optionGap + 8;

  Player.create = function () {
    var pl = {
      x: P.x, y: P.y, r: P.r,
      vx: 0, vy: 0,
      cool: 0, hcool: 0, ccool: 0,
      inv: P.invincible,
      alive: true, wait: 0,
      hist: [],
      opts: [],
      tilt: 0,
      engine: 0
    };
    for (var i = 0; i < HIST; i++) pl.hist.push({ x: pl.x, y: pl.y });
    return pl;
  };

  Player.speed = function (G) {
    return P.baseSpeed + G.pw.speed * P.speedStep;
  };

  Player.update = function (G, dt) {
    var pl = G.player;

    /* ミス後の復帰待ち */
    if (!pl.alive) {
      pl.wait -= dt;
      if (pl.wait <= 0) {
        pl.alive = true;
        pl.x = P.x; pl.y = CFG.H / 2;
        pl.inv = P.invincible;
        for (var h = 0; h < pl.hist.length; h++) { pl.hist[h].x = pl.x; pl.hist[h].y = pl.y; }
      }
      return;
    }

    if (pl.inv > 0) pl.inv -= dt;

    /* --- 移動 --- */
    var ax = Input.axis();
    var sp = Player.speed(G) * (Input.down('slow') ? P.slowRate : 1);
    pl.x += ax.x * sp * dt;
    pl.y += ax.y * sp * dt;
    pl.x = U.clamp(pl.x, 14, CFG.W - 18);
    pl.y = U.clamp(pl.y, 16, CFG.H - 42);   // 下は HUD ぶんだけ空ける
    pl.tilt = U.approach(pl.tilt, ax.y * 0.28, dt * 3.2);
    pl.engine += dt * (8 + Math.abs(ax.x) * 6);

    /* --- 軌跡の記録とオプション配置 --- */
    pl.hist.unshift({ x: pl.x, y: pl.y });
    if (pl.hist.length > HIST) pl.hist.pop();
    pl.opts.length = G.pw.options;
    for (var i = 0; i < G.pw.options; i++) {
      var idx = Math.min(pl.hist.length - 1, (i + 1) * WP.optionGap);
      pl.opts[i] = pl.hist[idx];
    }

    /* --- ショット --- */
    pl.cool -= dt;
    if (Input.down('shot') && pl.cool <= 0) {
      pl.cool = Weapons.fireInterval(G);
      Weapons.fireFrom(G, pl.x + 16, pl.y, false);
      for (var o = 0; o < pl.opts.length; o++) {
        Weapons.fireFrom(G, pl.opts[o].x + 10, pl.opts[o].y, true);
      }
      Snd.shot(G.pw.options);
      FX.spark(pl.x + 18, pl.y, U.rand(-90, -30), U.rand(-20, 20), 0.1, 1.6, 190);
    }

    /* --- 追尾弾とクラスタは、それぞれ独立したタイマーで撃つ ---
       主砲と同じ間隔にすると、連射が速くなったときに
       追尾弾とクラスタまで倍増して画面が自弾で埋まるため */
    pl.hcool -= dt;
    if (G.pw.homing > 0 && Input.down('shot') && pl.hcool <= 0) {
      pl.hcool = WP.homingInterval;
      Weapons.fireHoming(G, pl.x + 10, pl.y);
      Snd.homing();
    }

    pl.ccool -= dt;
    if (G.pw.cluster > 0 && Input.down('shot') && pl.ccool <= 0) {
      pl.ccool = WP.clusterInterval;
      Weapons.fireCluster(G, pl.x + 10, pl.y);
      Snd.launch();
    }
  };

  /* 被弾。シールドがあれば吸収する。true を返したらミス */
  Player.damage = function (G) {
    var pl = G.player;
    if (!pl.alive || pl.inv > 0 || G.state !== 'playing') return false;
    if (G.pw.shield > 0) {
      G.pw.shield--;
      /* 吸収のたびに短い無敵を付ける。
         これが無いと敵に重なっている間は 1 フレームに 1 枚ずつ削れ、
         「5 回耐える」はずのバリアが 0.08 秒で消えてしまう */
      pl.inv = P.shieldGrace;
      FX.ring(pl.x, pl.y, 18, 120, 0.28, 30, 3);
      FX.doFlash(0.12, 30);
      Snd.hit();
      return false;
    }
    pl.alive = false;
    pl.wait = P.respawn;
    FX.boom(pl.x, pl.y, 2.4, 30);
    FX.doFlash(0.5, 20);
    FX.addShake(12);
    Snd.death();
    return true;
  };

  /* ---------- 描画 ---------- */
  Player.draw = function (G, g) {
    var pl = G.player;

    /* オプション（先に描いて自機を前面に） */
    for (var i = 0; i < pl.opts.length; i++) {
      var o = pl.opts[i];
      var ph = G.t * 6 + i;
      g.save();
      g.translate(o.x, o.y);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = U.hsl(268, 90, 62, 0.9);
      g.beginPath(); g.arc(0, 0, 6.5 + Math.sin(ph) * 0.7, 0, U.TAU); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, 0, 2.6, 0, U.TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = U.hsl(268, 90, 75, 0.55);
      g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, 9 + Math.sin(ph * 1.3) * 1.2, 0, U.TAU); g.stroke();
      g.restore();
    }

    if (!pl.alive) return;
    /* 無敵中は点滅 */
    if (pl.inv > 0 && ((G.t * 20) | 0) % 2 === 0) return;

    g.save();
    g.translate(pl.x, pl.y);
    g.rotate(pl.tilt);

    /* エンジン炎 */
    var fl = 10 + Math.sin(pl.engine) * 4;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = U.hsl(200, 100, 62, 0.85);
    g.beginPath();
    g.moveTo(-11, -3.5); g.lineTo(-11 - fl, 0); g.lineTo(-11, 3.5); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(-11, -1.6); g.lineTo(-11 - fl * 0.55, 0); g.lineTo(-11, 1.6); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';

    /* 機体 */
    g.fillStyle = '#dbe9ff';
    g.beginPath();
    g.moveTo(19, 0); g.lineTo(2, -6); g.lineTo(-11, -8); g.lineTo(-7, 0);
    g.lineTo(-11, 8); g.lineTo(2, 6); g.closePath(); g.fill();
    g.fillStyle = '#5fa8ff';
    g.beginPath();
    g.moveTo(13, 0); g.lineTo(0, -3.4); g.lineTo(-7, 0); g.lineTo(0, 3.4); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.fillRect(4, -1, 4, 2);
    g.restore();

    /* シールド */
    if (G.pw.shield > 0) {
      var maxHits = WP.shieldHits[Math.max(0, G.pw.force - 1)] || 3;
      var a = 0.22 + 0.13 * (G.pw.shield / maxHits) + Math.sin(G.t * 9) * 0.05;
      g.strokeStyle = U.hsl(24, 100, 66, a + 0.35);
      g.lineWidth = 2;
      g.beginPath(); g.arc(pl.x, pl.y, 22, 0, U.TAU); g.stroke();
      g.fillStyle = U.hsl(24, 100, 60, a * 0.35);
      g.beginPath(); g.arc(pl.x, pl.y, 22, 0, U.TAU); g.fill();
    }
  };

  w.Player = Player;
})(window);

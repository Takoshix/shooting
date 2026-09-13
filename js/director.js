/* =========================================================
   director.js — 敵の出現管理（ウェーブ進行）
   ---------------------------------------------------------
   時間が経つと増えるのは「1 編隊の数」と「編隊を出す頻度」だけ。
   敵の強さ・弾速・弾の量は director からは一切いじらない。
   ========================================================= */
(function (w) {
  'use strict';

  var D = CFG.director;
  var Director = {};
  var fidSeq = 1;

  Director.reset = function (G) {
    G.wave = 0;
    G.waveT = 0;
    G.spawnT = 1.2;
    G.pend = [];
    G.forms = {};
    G.bossActive = false;
    G.nextBossWave = D.bossEvery;
    fidSeq = 1;
  };

  /* delay 秒後に敵を出す予約 */
  function later(G, delay, type, x, y, opt) {
    G.pend.push({ t: delay, type: type, x: x, y: y, opt: opt || null });
  }
  Director.later = later;

  /* 自機のすぐ近くには湧かせない（理不尽な事故を防ぐ） */
  function safeY(G, y) {
    var pl = G.player;
    if (!pl.alive) return y;
    if (Math.abs(y - pl.y) < 40 && CFG.W - pl.x < CFG.threat.spawnSafeR) {
      y += (y < pl.y ? -1 : 1) * 60;
    }
    return U.clamp(y, 24, CFG.H - 50);
  }

  /* ---------- 編隊パターン ---------- */
  var FORMS = {
    /* 同じ高さで縦一列に流れてくる基本編隊。全滅でカプセル確定 */
    train: function (G, n) {
      var fid = fidSeq++;
      var y = safeY(G, U.rand(40, CFG.H - 70));
      for (var i = 0; i < n; i++) {
        later(G, i * 0.16, 'zako', CFG.W + 24, y, { fid: fid });
      }
    },
    /* 波打ちながら来る。縦に散らばるので掃射が気持ちいい */
    wavey: function (G, n) {
      var fid = fidSeq++;
      for (var i = 0; i < n; i++) {
        var y = safeY(G, 40 + (CFG.H - 110) * (i / Math.max(1, n - 1)));
        later(G, i * 0.1, 'waver', CFG.W + 24, y, { fid: fid, ph: i * 0.5 });
      }
    },
    /* V 字。中心から外へ広がる */
    vee: function (G, n) {
      var fid = fidSeq++;
      var cy = safeY(G, U.rand(80, CFG.H - 110));
      for (var i = 0; i < n; i++) {
        var off = (i - (n - 1) / 2) * 26;
        later(G, Math.abs(off) * 0.006, 'zako', CFG.W + 24 + Math.abs(off) * 1.4, cy + off, { fid: fid });
      }
    },
    /* 上から突っ込んでくる */
    divers: function (G, n) {
      var fid = fidSeq++;
      for (var i = 0; i < n; i++) {
        later(G, i * 0.18, 'diver', CFG.W + 24, U.rand(26, 90), { fid: fid });
      }
    },
    /* 上下の壁に張り付いた砲台 */
    turrets: function (G, n) {
      var m = U.clamp(Math.round(n * 0.5), 1, 6);
      for (var i = 0; i < m; i++) {
        var top = U.chance(0.5);
        later(G, i * 0.5, 'turret', CFG.W + 24, top ? 24 : CFG.H - 50, { side: top ? -1 : 1 });
      }
    },
    /* ツインビーの雲。撃つとベルが出る */
    clouds: function (G, n) {
      /* 雲は 1 回に 4 つまで。増やすとベルが画面に溜まって
         肝心の敵と弾が見えなくなる（数を増やす対象はザコだけでいい） */
      var m = U.clamp(Math.round(n * 0.35), 1, 4);
      for (var i = 0; i < m; i++) {
        later(G, i * 0.4, 'cloud', CFG.W + 30, U.rand(40, CFG.H - 80));
      }
    },
    /* 撃ってくるポッド。数は少なめ */
    pods: function (G, n) {
      var m = U.clamp(Math.round(n * 0.3), 1, 5);
      for (var i = 0; i < m; i++) {
        later(G, i * 0.45, 'pod', CFG.W + 30, U.rand(50, CFG.H - 90));
      }
    },
    /* 大型艦＋護衛。撃ち込み感のご褒美 */
    carrier: function (G, n) {
      later(G, 0, 'carrier', CFG.W + 60, U.rand(90, CFG.H - 130));
      var fid = fidSeq++;
      for (var i = 0; i < n; i++) later(G, 0.6 + i * 0.14, 'zako', CFG.W + 24, U.rand(40, CFG.H - 70), { fid: fid });
    },
    /* 格子状の“壁”。画面いっぱいに敵が並んで押し寄せる（後半の見せ場） */
    wall: function (G, n) {
      var fid = fidSeq++;
      var rows = U.clamp(Math.round(n / 4), 3, 9);
      var cols = Math.max(2, Math.round(n / rows));
      for (var c = 0; c < cols; c++) {
        for (var r = 0; r < rows; r++) {
          var y = 40 + (CFG.H - 110) * (r / Math.max(1, rows - 1));
          later(G, c * 0.22, U.chance(0.75) ? 'zako' : 'waver',
            CFG.W + 24 + c * 6, y, { fid: fid });
        }
      }
    },
    /* 雨のように降り続ける細かい敵。数の暴力を作る */
    rain: function (G, n) {
      var fid = fidSeq++;
      for (var i = 0; i < n * 2; i++) {
        later(G, i * 0.035, 'zako', CFG.W + 20, U.rand(28, CFG.H - 56), { fid: fid });
      }
    },
    /* 全方位にばらまく大群 */
    swarm: function (G, n) {
      var fid = fidSeq++;
      for (var i = 0; i < n * 2; i++) {
        later(G, i * 0.055, U.chance(0.5) ? 'zako' : 'waver',
          CFG.W + 20 + U.rand(0, 120), U.rand(30, CFG.H - 60), { fid: fid });
      }
    }
  };

  /* ウェーブが浅いうちは単純なパターン、進むと種類が増える（難しくはならない） */
  function pickForm(G) {
    var pool = ['train', 'wavey', 'vee'];
    if (G.wave >= 1) pool.push('clouds', 'divers');
    if (G.wave >= 2) pool.push('turrets', 'swarm');
    if (G.wave >= 4) pool.push('pods', 'carrier');
    if (G.wave >= 6) pool.push('swarm', 'wavey', 'train');   // 密度重視の再投入
    /* 後半は「数で押す」パターンの比率を上げる。強さではなく密度だけを上げる */
    if (G.wave >= 8) pool.push('wall', 'rain', 'swarm');
    if (G.wave >= 12) pool.push('wall', 'rain', 'wall', 'rain');
    return U.pick(pool);
  }

  Director.update = function (G, dt) {
    /* 予約されたスポーンの消化 */
    for (var i = 0; i < G.pend.length; i++) {
      var p = G.pend[i];
      p.t -= dt;
      if (p.t <= 0) {
        Enemies.spawn(G, p.type, p.x, p.y, p.opt);
        p.dead = true;
      }
    }
    U.prune(G.pend);

    /* ウェーブ進行 */
    G.waveT += dt;
    if (G.waveT >= D.waveSeconds) {
      G.waveT -= D.waveSeconds;
      G.wave++;
      FX.text(CFG.W / 2, 76, 'WAVE ' + (G.wave + 1) + '  敵密度 ↑', '#7fe3ff', 15);
      FX.doFlash(0.18, 200);
    }

    /* ボス（大型戦艦）は倒しきるまで通常編隊を止めない＝待たされない */
    if (!G.bossActive && G.wave >= G.nextBossWave) {
      G.nextBossWave += D.bossEvery;
      G.bossActive = true;
      Enemies.spawn(G, 'core', CFG.W + 90, CFG.H / 2);
      FX.text(CFG.W / 2, 110, 'WARNING - 巨大戦艦', '#ff6a5e', 16);
    }
    if (G.bossActive) {
      var found = false;
      for (var k = 0; k < G.en.length; k++) if (G.en[k].type === 'core') { found = true; break; }
      if (!found) G.bossActive = false;
    }

    /* 通常編隊 */
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = CFG.spawnInterval(G.wave) * U.rand(0.85, 1.15);
      if (G.en.length < D.aliveMax) {
        FORMS[pickForm(G)](G, CFG.spawnCount(G.wave));
      }
    }
  };

  w.Director = Director;
})(window);

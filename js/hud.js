/* =========================================================
   hud.js — スコア表示・パワーメーター・タイトル/リザルト画面
   ========================================================= */
(function (w) {
  'use strict';

  var HUD = {};

  function panel(g, x, y, ww, hh, a) {
    g.fillStyle = 'rgba(6,10,22,' + (a === undefined ? 0.72 : a) + ')';
    g.fillRect(x, y, ww, hh);
    g.strokeStyle = 'rgba(90,150,240,.35)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  }

  /* ---------- グラディウス式パワーメーター ---------- */
  HUD.drawMeter = function (G, g) {
    var slots = CFG.slots;
    var pad = 6, hgt = 20;
    var y = CFG.H - hgt - pad;
    var totalW = CFG.W - pad * 2 - 150;
    var cw = totalW / slots.length;

    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var x = pad + i * cw;
      var active = (G.pw.cursor === i + 1);
      var lit = HUD.slotLevel(G, s.key);

      g.fillStyle = active
        ? 'rgba(255,255,255,' + (0.55 + Math.sin(G.t * 12) * 0.3) + ')'
        : 'rgba(10,16,32,.8)';
      g.fillRect(x, y, cw - 3, hgt);

      g.strokeStyle = active ? '#fff' : (lit > 0 ? s.color : 'rgba(90,140,220,.4)');
      g.lineWidth = active ? 2 : 1;
      g.strokeRect(x + 0.5, y + 0.5, cw - 4, hgt - 1);

      g.font = 'bold 9px monospace';
      g.textAlign = 'center';
      g.fillStyle = active ? '#061018' : (lit > 0 ? s.color : 'rgba(150,180,220,.55)');
      g.fillText(s.label, x + (cw - 3) / 2, y + 9);

      /* 取得段数を小さな四角で表示 */
      var maxv = HUD.slotMax(s.key);
      for (var k = 0; k < maxv; k++) {
        var bx = x + (cw - 3) / 2 - (maxv * 5) / 2 + k * 5;
        g.fillStyle = k < lit ? (active ? '#061018' : s.color) : 'rgba(120,150,190,.25)';
        g.fillRect(bx, y + 13, 4, 3);
      }
    }

    /* 残機・ボム */
    var rx = pad + totalW + 6;
    panel(g, rx, y, CFG.W - pad - rx, hgt);
    g.font = 'bold 10px monospace';
    g.textAlign = 'left';
    g.fillStyle = '#9fd0ff';
    g.fillText('SHIP', rx + 6, y + 13);
    for (var l = 0; l < Math.min(G.lives, 5); l++) {
      g.fillStyle = '#dbe9ff';
      g.beginPath();
      var lx = rx + 38 + l * 11, ly = y + 10;
      g.moveTo(lx + 5, ly); g.lineTo(lx - 4, ly - 4); g.lineTo(lx - 2, ly); g.lineTo(lx - 4, ly + 4);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#ffd45e';
    g.fillText('BOMB ' + G.bombs, rx + 100, y + 13);
  };

  HUD.slotLevel = function (G, key) {
    var p = G.pw;
    switch (key) {
      case 'speed': return p.speed;
      case 'missile': return p.missile;
      case 'double': return p.shot === 'double' ? p.double : 0;
      case 'laser': return p.shot === 'laser' ? p.laser : 0;
      case 'option': return p.options;
      case 'force': return p.shield > 0 ? Math.ceil(p.shield / 2) : 0;
    }
    return 0;
  };
  HUD.slotMax = function (key) {
    switch (key) {
      case 'speed': return CFG.player.speedMax;
      case 'missile': return CFG.weapon.missileMax;
      case 'double': return CFG.weapon.doubleMax;
      case 'laser': return CFG.weapon.laserMax;
      case 'option': return CFG.weapon.optionMax;
      case 'force': return 3;
    }
    return 1;
  };

  /* ---------- 上部：スコア・チェイン ---------- */
  HUD.drawTop = function (G, g) {
    g.font = 'bold 13px monospace';
    g.textAlign = 'left';
    g.fillStyle = '#eaf4ff';
    g.fillText(U.comma(G.score), 8, 18);
    g.font = 'bold 9px monospace';
    g.fillStyle = '#6f95c9';
    g.fillText('HI ' + U.comma(G.hi), 8, 30);

    /* チェインゲージ（敵が多いほど伸び、火力が上がる） */
    var c = G.chain;
    if (c > 0) {
      var rate = U.clamp(c / CFG.chain.rateAt, 0, 1);
      var gw = 150, gx = CFG.W / 2 - gw / 2, gy = 10;
      g.fillStyle = 'rgba(10,16,32,.7)';
      g.fillRect(gx, gy, gw, 7);
      var hue = U.lerp(190, 330, rate);
      g.fillStyle = U.hsl(hue, 95, 60);
      g.fillRect(gx, gy, gw * rate, 7);
      if (rate >= 1) {
        g.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.sin(G.t * 16) * 0.25) + ')';
        g.fillRect(gx, gy, gw, 7);
      }
      g.font = 'bold 11px monospace';
      g.textAlign = 'center';
      g.fillStyle = rate >= 1 ? '#fff' : '#bcd8ff';
      g.fillText(c + ' CHAIN  x' + G.mult(), CFG.W / 2, gy + 20);
    }

    /* 敵は必ず画面右から入ってくるので、右上に情報を置くと必ず重なる。
       左上にまとめる。「弾 n/18」は “危険の量は増えていない” ことを
       プレイヤー自身が確認できる表示でもある */
    g.font = 'bold 10px monospace';
    g.fillStyle = '#7fb4ff';
    g.fillText('WAVE ' + (G.wave + 1), 8, 44);
    g.fillStyle = '#55749f';
    g.fillText('敵 ' + G.en.length, 74, 44);
    g.fillStyle = G.eb.length >= CFG.threat.bulletBudget ? '#ff8f7a' : '#55749f';
    g.fillText('敵弾 ' + G.eb.length + '/' + CFG.threat.bulletBudget, 130, 44);
  };

  /* ---------- タイトル ---------- */
  HUD.drawTitle = function (G, g) {
    g.fillStyle = 'rgba(3,6,16,.72)';
    g.fillRect(0, 0, CFG.W, CFG.H);

    g.textAlign = 'center';
    var t = G.t;
    g.font = 'bold 42px monospace';
    g.fillStyle = U.hsl(200 + Math.sin(t * 1.4) * 40, 95, 70);
    g.fillText('NEO BELLSTAR', CFG.W / 2, 118);
    g.font = 'bold 12px monospace';
    g.fillStyle = '#9fd0ff';
    g.fillText('武器強化型シューティング', CFG.W / 2, 142);

    g.font = '11px monospace';
    g.fillStyle = '#cfe3ff';
    g.fillText('敵はどんどん増える。でも難しくはならない。', CFG.W / 2, 180);
    g.fillText('増えた敵はそのまま火力になって返ってくる。', CFG.W / 2, 198);

    g.fillStyle = '#7fa8dd';
    g.font = '10px monospace';
    g.fillText('移動 ARROW / WASD     ショット Z（押しっぱなし）     パワーアップ X', CFG.W / 2, 232);
    g.fillText('ボム C     低速 SHIFT     ポーズ P     ミュート M', CFG.W / 2, 248);
    g.fillText('赤いカプセルでメーターを進め、X で好きな装備を取る。雲を撃つとベルが出る。', CFG.W / 2, 272);

    var a = 0.5 + Math.sin(t * 5) * 0.5;
    g.font = 'bold 15px monospace';
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    g.fillText('PRESS  Z  TO  START', CFG.W / 2, 318);
    g.textAlign = 'left';
  };

  /* ---------- ゲームオーバー ---------- */
  HUD.drawOver = function (G, g) {
    g.fillStyle = 'rgba(3,6,16,.78)';
    g.fillRect(0, 0, CFG.W, CFG.H);
    g.textAlign = 'center';
    g.font = 'bold 34px monospace';
    g.fillStyle = '#ff7a6a';
    g.fillText('GAME OVER', CFG.W / 2, 130);

    g.font = 'bold 16px monospace';
    g.fillStyle = '#eaf4ff';
    g.fillText('SCORE  ' + U.comma(G.score), CFG.W / 2, 172);
    g.font = '11px monospace';
    g.fillStyle = '#9fd0ff';
    g.fillText('最大チェイン ' + G.bestChain + '     撃破 ' + U.comma(G.kills) + '     到達 WAVE ' + (G.wave + 1), CFG.W / 2, 198);
    g.fillText('取得カプセル ' + G.pw.capsules, CFG.W / 2, 216);
    if (G.score >= G.hi) {
      g.fillStyle = '#ffd45e';
      g.font = 'bold 13px monospace';
      g.fillText('NEW RECORD!', CFG.W / 2, 244);
    }
    var a = 0.5 + Math.sin(G.t * 5) * 0.5;
    g.font = 'bold 14px monospace';
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    g.fillText('PRESS  Z  TO  RETRY', CFG.W / 2, 296);
    g.textAlign = 'left';
  };

  HUD.drawPause = function (G, g) {
    g.fillStyle = 'rgba(3,6,16,.6)';
    g.fillRect(0, 0, CFG.W, CFG.H);
    g.textAlign = 'center';
    g.font = 'bold 24px monospace';
    g.fillStyle = '#eaf4ff';
    g.fillText('PAUSE', CFG.W / 2, CFG.H / 2);
    g.font = '11px monospace';
    g.fillStyle = '#9fd0ff';
    g.fillText('P で再開', CFG.W / 2, CFG.H / 2 + 24);
    g.textAlign = 'left';
  };

  w.HUD = HUD;
})(window);

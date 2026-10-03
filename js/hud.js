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
      var pw = maxv > 5 ? 4 : 5;          // 段数が多いスロットは間隔を詰める
      for (var k = 0; k < maxv; k++) {
        var bx = x + (cw - 3) / 2 - (maxv * pw) / 2 + k * pw;
        g.fillStyle = k < lit ? (active ? '#061018' : s.color) : 'rgba(120,150,190,.25)';
        g.fillRect(bx, y + 13, pw - 1, 3);
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
      case 'cluster': return p.cluster;
      case 'vulcan': return p.vulcan;
      case 'homing': return p.homing;
      case 'option': return p.options;
      case 'force': return p.shield > 0 ? p.force : 0;
    }
    return 0;
  };
  HUD.slotMax = function (key) {
    switch (key) {
      case 'speed': return CFG.player.speedMax;
      case 'cluster': return CFG.weapon.clusterMax;
      case 'vulcan': return CFG.weapon.vulcanMax;
      case 'homing': return CFG.weapon.homingMax;
      case 'option': return CFG.weapon.optionMax;
      case 'force': return CFG.weapon.forceMax;
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

    /* 敵は必ず画面右から入ってくるので、右上に情報を置くと必ず重なる。左上にまとめる。
       「敵弾 n/上限」は、そのウェーブで飛んでくる弾の量の天井を
       プレイヤー自身がその場で確認できる表示でもある。
       ※ 直前のチェイン表示で textAlign を center にしているので必ず戻す */
    g.textAlign = 'left';
    g.font = 'bold 10px monospace';
    g.fillStyle = '#7fb4ff';
    g.fillText('WAVE ' + (G.wave + 1), 8, 44);
    g.fillStyle = '#55749f';
    g.fillText('敵 ' + G.en.length, 74, 44);
    /* 敵が実際に使っている上限と同じ式で出す。
       ここだけ経過ウェーブで計算すると、表示より多い弾が飛んでいるように見える */
    var budget = CFG.bulletBudget(CFG.threatWave(G));
    g.fillStyle = G.eb.length >= budget ? '#ff8f7a' : '#55749f';
    g.fillText('敵弾 ' + G.eb.length + '/' + budget, 130, 44);
    g.textAlign = 'left';

    HUD.drawHp(G, g);
  };

  /* ---------- 自機の体力 ----------
     目盛りを 1 つずつ並べる。バーを 1 本引くより、
     「あと何発耐えられるか」が数えられるほうが判断しやすい */
  HUD.drawHp = function (G, g) {
    var pl = G.player;
    if (!pl) return;
    var x = 8, y = 52, bw = 11, bh = 9, gap = 2;

    g.font = 'bold 10px monospace';
    g.textAlign = 'left';
    g.fillStyle = '#55749f';
    g.fillText('HP', x, y + 8);

    var ox = x + 22;
    for (var i = 0; i < pl.maxHp; i++) {
      var filled = i < pl.hp;
      if (filled) {
        /* 残りが少ないほど赤くする */
        var rate = pl.hp / pl.maxHp;
        g.fillStyle = rate > 0.6 ? '#7dff9a' : (rate > 0.3 ? '#ffd45e' : '#ff6a6a');
        if (rate <= 0.3 && Math.sin(G.t * 10) > 0) g.fillStyle = '#ffffff';
      } else {
        g.fillStyle = 'rgba(120,150,190,.22)';
      }
      g.fillRect(ox + i * (bw + gap), y, bw, bh);
    }

    /* バリアは体力の手前に積まれるので、その右に続けて出す */
    if (G.pw.shield > 0) {
      var sx = ox + pl.maxHp * (bw + gap) + 6;
      g.fillStyle = '#ff8f5e';
      g.fillText('◆' + G.pw.shield, sx, y + 8);
    }
  };

  /* ---------- 機体選択 ---------- */
  HUD.drawSelect = function (G, g) {
    g.fillStyle = 'rgba(3,6,16,.88)';
    g.fillRect(0, 0, CFG.W, CFG.H);

    g.textAlign = 'center';
    g.font = 'bold 18px monospace';
    g.fillStyle = '#eaf4ff';
    g.fillText('機体を選ぶ', CFG.W / 2, 26);
    g.font = '10px monospace';
    g.fillStyle = '#6f95c9';
    g.fillText('強さの総和は揃えてある。どこを捨てるかを選ぶ', CFG.W / 2, 42);

    /* 6 機を 3 列 2 段で並べる */
    var n = CFG.ships.length, COLS = 3;
    var cw = 192, chh = 118, gx = 10, gy = 10;
    var x0 = (CFG.W - (COLS * cw + (COLS - 1) * gx)) / 2, y0 = 54;

    for (var i = 0; i < n; i++) {
      var sh = CFG.ships[i];
      var col = i % COLS, row = (i / COLS) | 0;
      var x = x0 + col * (cw + gx), y = y0 + row * (chh + gy);
      var on = (i === G.shipIndex);

      g.fillStyle = on ? 'rgba(18,34,64,.95)' : 'rgba(9,14,28,.78)';
      g.fillRect(x, y, cw, chh);
      g.strokeStyle = on ? sh.color : 'rgba(90,140,220,.28)';
      g.lineWidth = on ? 2 : 1;
      g.strokeRect(x + 0.5, y + 0.5, cw - 1, chh - 1);

      /* 機体の絵。画像が無ければ簡単な図形で代用する */
      var cx = x + 62, cy = y + 36;
      if (!Sprites.drawW(g, sh.sprite, cx, cy, 104)) {
        g.save();
        g.translate(cx, cy);
        g.fillStyle = on ? '#dbe9ff' : '#8fa6c8';
        g.beginPath();
        g.moveTo(26, 0); g.lineTo(2, -9); g.lineTo(-16, -11); g.lineTo(-10, 0);
        g.lineTo(-16, 11); g.lineTo(2, 9); g.closePath(); g.fill();
        g.fillStyle = sh.color;
        g.beginPath();
        g.moveTo(17, 0); g.lineTo(0, -4); g.lineTo(-10, 0); g.lineTo(0, 4); g.closePath(); g.fill();
        g.restore();
      }

      g.textAlign = 'left';
      g.font = 'bold 13px monospace';
      g.fillStyle = on ? sh.color : '#9fb6d6';
      g.fillText(sh.name, x + 10, y + 72);
      g.font = 'bold 10px monospace';
      g.fillStyle = on ? '#eaf4ff' : '#7f96b8';
      g.fillText(sh.jp, x + 72, y + 72);

      /* 3 つの指標を同じ軸で並べる。機体ごとの差が形で分かるように */
      var stats = [
        { k: '耐久', v: sh.hp / 9 },
        { k: '速度', v: (195 + sh.speedMod - 155) / 85 },
        { k: '連射', v: (1.26 - sh.fireMul) / 0.46 }
      ];
      for (var s2 = 0; s2 < stats.length; s2++) {
        var sy = y + 80 + s2 * 11;
        g.font = '9px monospace';
        g.fillStyle = '#6f95c9';
        g.fillText(stats[s2].k, x + 10, sy + 7);
        var barX = x + 38, barW = 70;
        g.fillStyle = 'rgba(120,150,190,.2)';
        g.fillRect(barX, sy, barW, 6);
        g.fillStyle = on ? sh.color : 'rgba(140,170,210,.45)';
        g.fillRect(barX, sy, barW * U.clamp(stats[s2].v, 0.08, 1), 6);
      }

      /* 初期装備 */
      g.font = '9px monospace';
      g.fillStyle = '#9fd0ff';
      var eq = [];
      for (var key in sh.start) eq.push(key.toUpperCase() + ' ' + sh.start[key]);
      g.textAlign = 'right';
      var ey = y + 87;
      for (var q = 0; q < eq.length; q++) { g.fillText(eq[q], x + cw - 10, ey); ey += 11; }
    }

    var sel = CFG.ships[G.shipIndex];
    g.textAlign = 'center';
    g.font = '11px monospace';
    g.fillStyle = sel.color;
    g.fillText(sel.detail, CFG.W / 2, 324);

    var a = 0.5 + Math.sin(G.t * 5) * 0.5;
    g.font = 'bold 13px monospace';
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    g.fillText('← ↑ ↓ →  で選択      Z  で決定', CFG.W / 2, 352);
    g.textAlign = 'left';
  };

  /* 枠に収まるように折り返して描く */
  function wrapText(g, text, cx, y, maxW, lh) {
    var line = '', lines = [];
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (g.measureText(test).width > maxW && line) { lines.push(line); line = text[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    for (var j = 0; j < lines.length; j++) g.fillText(lines[j], cx, y + j * lh);
  }

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
    g.fillText('機体は 4 種類から選択。体力制なので数発は耐えられる。', CFG.W / 2, 272);
    g.fillText('赤いカプセルでメーターを進め、X で好きな装備を取る。雲を撃つとベルが出る。', CFG.W / 2, 288);

    var a = 0.5 + Math.sin(t * 5) * 0.5;
    g.font = 'bold 15px monospace';
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    g.fillText('PRESS  Z  TO  START', CFG.W / 2, 330);
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
    g.font = '10px monospace';
    g.fillStyle = '#6f95c9';
    g.fillText('機体 ' + (CFG.ships[G.shipIndex] ? CFG.ships[G.shipIndex].name : '') + ' で挑戦', CFG.W / 2, 268);
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

/* =========================================================
   items.js — パワーカプセルとベル
   ---------------------------------------------------------
   カプセル：グラディウス式。取るとメーターのカーソルが進む。
   ベル    ：ツインビー式。撃つたびに色が変わり、効果も変わる。
             撃つと少し浮き上がるので「撃ち上げて色を選ぶ」遊びになる。
   ========================================================= */
(function (w) {
  'use strict';

  var IT = CFG.item;
  var Items = {};

  /* ベルの色と効果。上から順に循環する */
  var BELLS = [
    { name: 'SCORE',  hue: 50,  col: '#ffd84a', desc: '+3000' },
    { name: 'SPEED',  hue: 200, col: '#5ec8ff', desc: 'SPEED UP' },
    { name: 'TWIN',   hue: 0,   col: '#ffffff', desc: 'SHOT UP' },
    { name: 'OPTION', hue: 130, col: '#6dff92', desc: 'OPTION' },
    { name: 'FORCE',  hue: 10,  col: '#ff6a5e', desc: 'BARRIER' }
  ];
  Items.BELLS = BELLS;

  /* 供給制限つきのカプセル投下。出せたら true、出せなければ false。
     呼び出し側は false のとき得点ボーナスに振り替える */
  Items.dropCapsule = function (G, x, y) {
    if (G.capCool > 0) return false;
    if (capsuleCount(G) >= CFG.item.capsuleOnScreenMax) return false;
    G.capCool = CFG.item.capsuleMinInterval;
    Items.spawnCapsule(G, x, y);
    return true;
  };

  /* 大型艦を倒したときのまとめ落とし。
     間隔の制限は無視する（ご褒美なので即座に出る）が、
     画面内の上限は必ず守る。ここを素通りさせると、
     せっかく絞った供給がボス戦のたびに崩れてアイテムだらけになる */
  Items.dropBulk = function (G, x, y, n) {
    for (var i = 0; i < n; i++) {
      if (capsuleCount(G) >= CFG.item.capsuleOnScreenMax) return i;
      Items.spawnCapsule(G, x + U.rand(-22, 22), y + U.rand(-22, 22));
    }
    return n;
  };

  function capsuleCount(G) {
    var n = 0;
    for (var i = 0; i < G.it.length; i++) if (G.it[i].kind === 'capsule' && !G.it[i].dead) n++;
    return n;
  }

  Items.spawnCapsule = function (G, x, y) {
    G.it.push({
      kind: 'capsule', x: x, y: y, vx: IT.capsuleSpeed, vy: 0,
      r: 11, t: 0, life: IT.life, dead: false, idx: 0
    });
  };

  Items.spawnBell = function (G, x, y) {
    /* 画面に溜まりすぎたベルは出さない（見た目の情報量を一定に保つ） */
    var n = 0;
    for (var i = 0; i < G.it.length; i++) if (G.it[i].kind === 'bell' && !G.it[i].dead) n++;
    if (n >= CFG.item.bellOnScreenMax) return;
    G.it.push({
      kind: 'bell', x: x, y: y, vx: -34, vy: -30,
      r: 13, t: 0, life: IT.life + 6, dead: false, idx: 0
    });
  };

  /* 自機弾がベルに当たったとき：浮き上がって色が変わる */
  Items.shot = function (G, it) {
    if (it.kind !== 'bell') return;
    it.idx = (it.idx + 1) % BELLS.length;
    it.vy = IT.bellFloat;
    it.vx = U.rand(-20, 8);
    Snd.bell(it.idx);
    FX.ring(it.x, it.y, 6, 90, 0.25, BELLS[it.idx].hue, 2);
  };

  Items.update = function (G, dt) {
    for (var i = 0; i < G.it.length; i++) {
      var o = G.it[i];
      o.t += dt; o.life -= dt;
      if (o.life <= 0) { o.dead = true; continue; }

      if (o.kind === 'bell') {
        o.vy += IT.bellFall * dt * 2.2;
        o.vy = U.clamp(o.vy, -120, 70);
        o.y += o.vy * dt;
        o.x += o.vx * dt;
        if (o.y < 18) { o.y = 18; o.vy = 20; }
        if (o.y > CFG.H - 46) { o.y = CFG.H - 46; o.vy = -26; }
      } else {
        o.x += o.vx * dt;
        o.y += Math.sin(o.t * 3) * 22 * dt;
      }
      if (o.x < -30) o.dead = true;
    }
    U.prune(G.it);
  };

  /* 取得したときの効果 */
  Items.collect = function (G, o) {
    o.dead = true;
    if (o.kind === 'capsule') {
      Weapons.gainCapsule(G.pw);
      Snd.power();
      FX.text(o.x, o.y - 14, 'POWER', '#ff8f5e', 11);
      FX.ring(o.x, o.y, 6, 150, 0.3, 20, 2);
      G.addScore(200);
      return;
    }
    var b = BELLS[o.idx];
    var p = G.pw;
    Snd.equip();
    FX.ring(o.x, o.y, 8, 190, 0.35, b.hue, 3);
    FX.text(o.x, o.y - 16, b.desc, b.col, 12);
    switch (b.name) {
      case 'SCORE':  G.addScore(3000); break;
      case 'SPEED':  if (p.speed < CFG.player.speedMax) p.speed++; else G.addScore(2000); break;
      case 'TWIN':
        if (p.shot === 'laser') { if (p.laser < CFG.weapon.laserMax) p.laser++; else G.addScore(2000); }
        else { p.shot = 'double'; if (p.double < CFG.weapon.doubleMax) p.double++; else G.addScore(2000); }
        break;
      case 'OPTION': if (p.options < CFG.weapon.optionMax) p.options++; else G.addScore(4000); break;
      case 'FORCE':
        if (p.force < CFG.weapon.forceMax) p.force++;
        p.shield = CFG.weapon.shieldHits[p.force - 1];
        break;
    }
  };

  /* アイテムもスプライト化しておく（毎フレームの文字・円描画をなくす） */
  var SPR = null, SH = 20;

  function buildSprites() {
    SPR = { capsule: bake('capsule', 0), bells: [] };
    for (var i = 0; i < BELLS.length; i++) SPR.bells.push(bake('bell', i));
  }

  function bake(kind, idx) {
    var c = document.createElement('canvas');
    c.width = c.height = SH * 2;
    var g = c.getContext('2d');
    g.translate(SH, SH);
    if (kind === 'capsule') {
      /* 敵弾は「丸」、カプセルは「角ばった箱」。
         形で区別できるようにする（色だけの区別は爆発の光の中で消える） */
      g.fillStyle = 'rgba(0,0,0,.85)';
      g.fillRect(-12, -9, 24, 18);
      g.fillStyle = '#ff8a2b';
      g.fillRect(-10, -7, 20, 14);
      g.fillStyle = '#ffe3a8';
      g.fillRect(-10, -7, 20, 3);
      g.fillStyle = '#2a1206';
      g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('P', 0, 2);
    } else {
      var b = BELLS[idx];
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = U.hsl(b.hue, 100, 55, 0.45);
      g.beginPath(); g.arc(0, 0, 16, 0, U.TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = b.col;
      g.beginPath();
      g.moveTo(-9, 7); g.quadraticCurveTo(-9, -9, 0, -9);
      g.quadraticCurveTo(9, -9, 9, 7); g.closePath(); g.fill();
      g.fillRect(-10, 7, 20, 3);
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath(); g.arc(0, 10, 2.4, 0, U.TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillRect(-5, -5, 3, 6);
    }
    return c;
  }

  Items.draw = function (G, g) {
    if (!SPR) buildSprites();
    for (var i = 0; i < G.it.length; i++) {
      var o = G.it[i];
      /* 消える直前は点滅させて知らせる */
      if (o.life < 3 && ((o.t * 12) | 0) % 2 === 0) continue;
      var img, y = o.y;
      if (o.kind === 'capsule') {
        img = SPR.capsule;
      } else {
        img = SPR.bells[o.idx];
        y += Math.sin(o.t * 7) * 1.6;
      }
      g.drawImage(img, (o.x - SH) | 0, (y - SH) | 0);
    }
  };

  w.Items = Items;
})(window);

/* =========================================================
   game.js — ゲーム本体（状態管理・当たり判定・スコア）
   ========================================================= */
(function (w) {
  'use strict';

  var G = {
    state: 'title',      // title | playing | pause | over
    t: 0,
    score: 0, hi: 0, lives: 3, bombs: CFG.bomb.start,
    kills: 0, killsSinceCap: 0, bestChain: 0,
    chain: 0, chainT: 0,
    wave: 0, waveT: 0, spawnT: 0,
    pb: [], eb: [], en: [], it: [], pend: [], forms: {},
    player: null, pw: null,
    bossActive: false, nextBossWave: 0,
    bombT: 0, capCool: 0, textCool: 0,
    nextExtend: 300000
  };

  /* ---------- スコア ---------- */
  G.mult = function () { return 1 + Math.floor(G.chain / CFG.chain.scoreStep); };

  G.addScore = function (v) {
    G.score += v;
    if (G.score >= G.nextExtend) {
      G.nextExtend += 300000;
      G.lives++;
      FX.text(G.player.x, G.player.y - 24, '1UP', '#7dff9a', 14);
      Snd.equip();
    }
  };

  /* ---------- 初期化 ---------- */
  G.reset = function () {
    G.t = 0;
    G.score = 0; G.lives = 3; G.bombs = CFG.bomb.start;
    G.kills = 0; G.killsSinceCap = 0; G.bestChain = 0;
    G.chain = 0; G.chainT = 0;
    G.nextExtend = 300000;
    G.pb.length = 0; G.eb.length = 0; G.en.length = 0; G.it.length = 0;
    G.pw = Weapons.newPower();
    G.player = Player.create();
    G.bombT = 0;
    G.capCool = 0; G.textCool = 0;
    Director.reset(G);
    FX.reset();
    try { G.hi = parseInt(localStorage.getItem('neobellstar.hi') || '0', 10) || 0; } catch (e) { G.hi = G.hi || 0; }
  };

  function saveHi() {
    if (G.score > G.hi) {
      G.hi = G.score;
      try { localStorage.setItem('neobellstar.hi', String(G.hi)); } catch (e) { /* 保存できなくても続行 */ }
    }
  }

  /* ---------- 撃破処理 ---------- */
  function onKill(G, e) {
    e.dead = true;
    G.kills++;
    G.killsSinceCap++;

    /* チェイン加算。敵が多いほど途切れない＝勝手に火力が上がる */
    G.chain = Math.min(CFG.chain.max, G.chain + 1);
    G.chainT = CFG.chain.hold;
    if (G.chain > G.bestChain) G.bestChain = G.chain;

    var big = e.def.boss ? 3.2 : (e.maxhp > 20 ? 2.0 : (e.maxhp > 4 ? 1.1 : 0.7));
    FX.boom(e.x, e.y, big, e.hue);
    Snd.boom(big);
    var gain = e.def.score * G.mult();
    G.addScore(gain);
    /* 得点表示は間引く。毎秒 100 匹倒す終盤に全部出すと数字で画面が埋まって
       肝心の敵と弾が見えなくなる（＝見た目の派手さが遊びやすさを壊す） */
    if (G.textCool <= 0 && (gain >= 3000 || e.maxhp > 4)) {
      G.textCool = 0.14;
      FX.text(e.x, e.y - 10, U.comma(gain), '#ffe9a8', 11);
    }

    if (e.def.boss) {
      FX.stop(CFG.fx.hitStopBig); FX.doFlash(0.55, 350); FX.addShake(14);
      for (var b = 0; b < 26; b++) {
        FX.ring(e.x + U.rand(-40, 40), e.y + U.rand(-45, 45), 4, U.rand(120, 280), U.rand(0.25, 0.5), U.rand(0, 60), 3);
      }
    } else if (e.maxhp > 20) {
      FX.stop(0.03); FX.doFlash(0.22, 30);
    }

    /* --- アイテム供給 --- */
    /* (a) 雲を壊すとベル（ツインビー） */
    if (e.def.bell) Items.spawnBell(G, e.x, e.y);
    /* (b) 大型はカプセルをまとめて落とす */
    if (e.def.caps) {
      var got = Items.dropBulk(G, e.x, e.y, e.def.caps);
      /* 画面内上限で出せなかったぶんは得点に振り替える */
      if (got < e.def.caps) G.addScore((e.def.caps - got) * 2000 * G.mult());
      G.capCool = 0;
    }
    /* (b2) 硬い敵・撃ってくる敵は、それ自体がカプセル源。
       敵が硬くなると撃破数が伸びず、撃破数基準の供給だけでは
       パワーアップが止まってしまうため */
    if (e.def.capChance && U.chance(e.def.capChance)) Items.dropCapsule(G, e.x, e.y);

    /* (c) 編隊を全滅させるとカプセル確定（グラディウス方式） */
    if (e.fid && G.forms[e.fid]) {
      var f = G.forms[e.fid];
      f.alive--;
      if (f.alive <= 0 && f.total >= 3) {
        if (Items.dropCapsule(G, e.x, e.y)) FX.text(e.x, e.y - 22, '編隊撃破!', '#ff8f5e', 11);
        else G.addScore(1000 * G.mult());
      }
    }
    /* (d) 一定数倒すごとに必ずカプセル。敵が増えるほど供給も増える。
       必要撃破数はウェーブとともに増える（10 → 60 匹）。
       固定のままだと終盤に毎秒何個も降ってきて、画面がアイテムで埋まるうえ
       メーターのカーソルが速く回りすぎて狙った装備を選べなくなる */
    if (G.killsSinceCap >= CFG.killsPerCapsule(G.wave)) {
      G.killsSinceCap = 0;
      if (!Items.dropCapsule(G, e.x, e.y)) G.addScore(500 * G.mult());
    }
  }

  function damageEnemy(G, e, dmg, x, y) {
    e.hp -= dmg;
    e.flash = 0.06;
    FX.spat(x, y, e.hue);
    if (e.hp <= 0) onKill(G, e);
    else Snd.hit();
  }

  /* ---------- ボム ---------- */
  function useBomb(G) {
    if (G.bombs <= 0 || G.bombT > 0 || !G.player.alive) return;
    G.bombs--;
    G.bombT = CFG.bomb.duration;
    Snd.bomb();
    FX.doFlash(0.75, 190);
    FX.addShake(13);
    for (var i = 0; i < 5; i++) {
      FX.ring(G.player.x, G.player.y, 10, 700 + i * 120, 0.55, 190 + i * 12, 4);
    }
    G.eb.length = 0;   // 敵弾を全消去
    for (var j = 0; j < G.en.length; j++) {
      var e = G.en[j];
      if (e.dead) continue;
      damageEnemy(G, e, CFG.bomb.damage, e.x, e.y);
    }
  }

  /* ---------- 当たり判定 ---------- */
  function collide(G) {
    var i, j, b, e, o;

    /* 自機弾 → 敵 */
    for (i = 0; i < G.pb.length; i++) {
      b = G.pb[i];
      if (b.dead) continue;
      for (j = 0; j < G.en.length; j++) {
        e = G.en[j];
        if (e.dead) continue;
        var ok;
        if (b.kind === 'laser') {
          ok = Math.abs(b.x - e.x) < b.len + e.r && Math.abs(b.y - e.y) < b.r + e.r;
          if (ok && b.hitIds[e.id]) ok = false;
        } else {
          ok = U.hit(b, e);
        }
        if (!ok) continue;
        damageEnemy(G, e, b.dmg, b.x, b.y);
        if (b.pierce) { b.hitIds[e.id] = 1; }
        else { b.dead = true; break; }
      }
      if (b.dead) continue;
      /* 自機弾 → ベル（撃つと色が変わる） */
      for (j = 0; j < G.it.length; j++) {
        o = G.it[j];
        if (o.dead || o.kind !== 'bell') continue;
        if (U.hit(b, o)) {
          Items.shot(G, o);
          if (!b.pierce) { b.dead = true; break; }
        }
      }
    }

    var pl = G.player;
    if (!pl.alive || G.state !== 'playing') return;

    /* 敵弾 → 自機 */
    for (i = 0; i < G.eb.length; i++) {
      b = G.eb[i];
      if (b.dead) continue;
      if (U.hit(b, pl)) {
        b.dead = true;
        if (Player.damage(G)) { onPlayerDeath(G); return; }
      }
    }
    /* 敵本体 → 自機。体当たりはどの敵でも自機を壊す。
       ぶつかった敵のほうも、大型でなければ一緒に砕ける */
    for (i = 0; i < G.en.length; i++) {
      e = G.en[i];
      if (e.dead) continue;
      if (!U.hit(e, pl)) continue;
      if (!e.def.boss && e.maxhp <= 8) damageEnemy(G, e, 9999, e.x, e.y);
      if (Player.damage(G)) { onPlayerDeath(G); return; }
    }
    /* アイテム → 自機（取得判定は甘めに） */
    var grab = { x: pl.x, y: pl.y, r: pl.r + 16 };
    for (i = 0; i < G.it.length; i++) {
      o = G.it[i];
      if (o.dead) continue;
      if (U.hit(o, grab)) Items.collect(G, o);
    }
  }

  function onPlayerDeath(G) {
    G.lives--;
    G.chain = 0;
    /* 復帰位置の周りを空けておく。
       敵が詰まったまま復帰すると、操作する間もなく連続で死に続ける
       （いわゆる復活パターン殺し）。腕前と関係ない死に方を潰す */
    for (var i = 0; i < G.en.length; i++) {
      var e = G.en[i];
      if (e.dead || e.def.boss) continue;
      var dx = e.x - CFG.player.x, dy = e.y - CFG.H / 2;
      if (dx * dx + dy * dy < 165 * 165) damageEnemy(G, e, 9999, e.x, e.y);
    }
    G.eb.length = 0;
    /* ペナルティは軽く。オプション 1 個だけ失う。
       全ロストにすると「死ぬほど難しくなる」典型的な難易度スパイクになるため */
    if (G.pw.options > 0) G.pw.options--;
    G.pw.shield = 0;
    G.bombs = Math.min(CFG.bomb.max, G.bombs + 1);
    if (G.lives < 0) {
      G.state = 'over';
      saveHi();
    }
  }

  /* ---------- 更新 ---------- */
  G.update = function (dt) {
    G.t += dt;

    if (G.state === 'title') {
      FX.updateStars(dt, 0);
      FX.update(dt);
      if (Input.tap('shot') || Input.tap('power')) { G.reset(); G.state = 'playing'; }
      return;
    }
    if (G.state === 'over') {
      FX.updateStars(dt, 0);
      FX.update(dt);
      Enemies.update(G, dt);
      if (Input.tap('shot') || Input.tap('power')) { G.reset(); G.state = 'playing'; }
      return;
    }
    if (Input.tap('pause')) {
      G.state = (G.state === 'pause') ? 'playing' : 'pause';
    }
    if (G.state === 'pause') { FX.update(dt); return; }

    /* ヒットストップ中は世界を止める（演出を見せる一瞬の“溜め”） */
    if (FX.hitStop > 0) { FX.hitStop -= dt; FX.update(dt); return; }

    if (Input.tap('bomb')) useBomb(G);
    if (G.bombT > 0) G.bombT -= dt;
    if (G.capCool > 0) G.capCool -= dt;
    if (G.textCool > 0) G.textCool -= dt;

    /* パワーアップ発動 */
    if (Input.tap('power')) {
      var r = Weapons.activate(G.pw);
      if (r) {
        Snd.equip();
        FX.text(G.player.x, G.player.y - 26, r.msg, r.slot.color, 13);
        FX.ring(G.player.x, G.player.y, 12, 240, 0.35, 200, 3);
        FX.doFlash(0.16, 200);
      }
    }

    /* チェインの減衰 */
    if (G.chain > 0) {
      G.chainT -= dt;
      if (G.chainT <= 0) { G.chain = 0; }
    }

    Player.update(G, dt);
    Director.update(G, dt);
    Enemies.update(G, dt);
    Enemies.updateBullets(G, dt);
    Weapons.updateBullets(G, dt);
    Items.update(G, dt);
    collide(G);
    U.prune(G.en);

    var ratio = Weapons.powerRatio(G.pw);
    FX.updateStars(dt, ratio * 0.8 + U.clamp(G.chain / CFG.chain.rateAt, 0, 1) * 0.5);
    FX.update(dt);
    Snd.layer = Math.round(U.clamp(ratio * 2 + U.clamp(G.chain / 60, 0, 1), 0, 3));
  };

  var scanPat = null;

  /* ---------- 描画 ---------- */
  G.render = function (g) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#03040c';
    g.fillRect(0, 0, CFG.W, CFG.H);

    g.save();
    g.translate(FX.shakeX, FX.shakeY);

    FX.drawStars(g);

    /* チェインが乗るほど画面がわずかに染まる（気分の演出） */
    var cr = U.clamp(G.chain / CFG.chain.rateAt, 0, 1);
    if (cr > 0.02) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = U.hsl(U.lerp(200, 320, cr) | 0, 90, 50, 0.025 + cr * 0.035);
      g.fillRect(-20, -20, CFG.W + 40, CFG.H + 40);
      g.globalCompositeOperation = 'source-over';
    }

    if (G.state !== 'title') {
      Items.draw(G, g);
      Enemies.draw(G, g);
      Weapons.drawBullets(G, g);
      Enemies.drawBullets(G, g);
      Player.draw(G, g);
      FX.draw(g);
      FX.drawTexts(g);
    } else {
      FX.draw(g);
    }
    g.restore();

    if (FX.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = U.hsl(FX.flashHue, 90, 60, FX.flash * 0.55);
      g.fillRect(0, 0, CFG.W, CFG.H);
      g.globalCompositeOperation = 'source-over';
    }

    if (G.state === 'playing' || G.state === 'pause') {
      HUD.drawTop(G, g);
      HUD.drawMeter(G, g);
    }
    if (G.state === 'title') HUD.drawTitle(G, g);
    if (G.state === 'over') HUD.drawOver(G, g);
    if (G.state === 'pause') HUD.drawPause(G, g);

    /* 走査線（ブラウン管風の薄い横縞）。
       毎フレーム 130 回 fillRect する代わりに、3px の縞をパターン化して 1 回で塗る */
    if (!scanPat) {
      var pc = document.createElement('canvas');
      pc.width = 1; pc.height = 3;
      var pg = pc.getContext('2d');
      pg.fillStyle = '#000'; pg.fillRect(0, 0, 1, 1);
      scanPat = g.createPattern(pc, 'repeat');
    }
    g.globalAlpha = 0.055;
    g.fillStyle = scanPat;
    g.fillRect(0, 0, CFG.W, CFG.H);
    g.globalAlpha = 1;
  };

  w.G = G;
  w.Game = G;
})(window);

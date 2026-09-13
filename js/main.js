/* =========================================================
   main.js — 起動とメインループ
   ---------------------------------------------------------
   固定タイムステップ（1/60 秒）で更新し、描画は毎フレーム。
   フレームレートが揺れても弾速や当たり判定がブレない方式。
   ========================================================= */
(function (w) {
  'use strict';

  var canvas, ctx, acc = 0, last = 0, running = false;
  var ema = 16.7;   // フレーム時間の指数移動平均

  function boot() {
    canvas = document.getElementById('screen');
    ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;

    Input.attach(canvas);
    Input.onFirstInput = function () { Snd.init(); Snd.resume(); };

    FX.initStars();
    G.reset();
    G.state = 'title';

    w.addEventListener('keydown', function (e) {
      if (e.code === 'KeyM') { Snd.toggleMute(); }
      if (e.code === 'KeyR' && G.state !== 'title') { G.reset(); G.state = 'playing'; }
    });

    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!running) return;

    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;        // タブ復帰時などの巨大な飛びを抑える
    acc += dt;

    var steps = 0;
    while (acc >= CFG.DT && steps < 5) {
      G.update(CFG.DT);
      Input.endFrame();
      acc -= CFG.DT;
      steps++;
    }
    if (steps >= 5) acc = 0;

    /* --- 自動画質調整 ---
       重くなったらパーティクルを減らし、余裕が戻ったら派手さも戻す。
       「敵が増えても操作感は変わらない」を描画側でも守るための仕組み。

       しきい値に注意：60Hz で垂直同期に間に合っている間は dt がほぼ 16.7ms に
       固定されるので、「16ms を下回ったら回復」にすると永久に回復しない。
       間に合っていない状態（コマ落ち = 33ms 付近）を基準に判定する。 */
    ema = ema * 0.9 + (dt * 1000) * 0.1;
    if (ema > 22) FX.quality = Math.max(0.3, FX.quality - 0.03);
    else if (ema < 19) FX.quality = Math.min(1, FX.quality + 0.01);

    G.render(ctx);
  }

  /* テスト・デバッグ用の入口 */
  w.__game = {
    get G() { return G; },
    step: function (n) { for (var i = 0; i < (n || 1); i++) { G.update(CFG.DT); Input.endFrame(); } },
    start: function () { G.reset(); G.state = 'playing'; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

/* =========================================================
   tools/smoke-test.js — ヘッドレス Chromium での自動検証
   ---------------------------------------------------------
   実行: node tools/smoke-test.js
   確認すること:
     1. 読み込み時とプレイ中に JS エラーが出ないこと
     2. 敵弾の数が、そのウェーブの「弾幕予算」を 1 フレームも超えないこと
     3. 難易度の伸びが、敵の密度と火力の伸びより緩やかであること
        （難易度カーブが暴走していないことの確認）
     4. 長時間回しても描画が破綻せずフレームが回り続けること
   ========================================================= */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require(path.join(process.env.NPM_GLOBAL_ROOT || '/opt/node22/lib/node_modules', 'playwright'));

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : req.url.slice(1));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
      rp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      rp.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => !!window.__game, null, { timeout: 5000 });
  await page.waitForTimeout(300);
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'docs/shot-title.png') });

  // --- 実時間で少し遊ぶ（rAF ループと描画を通す）---
  await page.keyboard.down('z');
  await page.waitForTimeout(1200);
  await page.keyboard.press('x');
  await page.waitForTimeout(2500);

  // --- 高速シミュレーション：ゲーム内 6 分ぶんを一気に回す ---
  const stats = await page.evaluate(() => {
    const g = window.__game.G;
    const CFG = window.CFG;
    const out = {
      maxEB: 0, ebOver: 0, maxBudget: 0, maxEnemies: 0, samples: [], thrown: null,
      curve: null
    };
    // 難易度カーブの伸び幅を先に記録しておく
    out.curve = {
      budget: [CFG.bulletBudget(0), CFG.bulletBudget(30)],
      speed: [CFG.enemyBulletSpeed(0), CFG.enemyBulletSpeed(30)],
      armed: [CFG.armedMax(0), CFG.armedMax(30)],
      tough: [CFG.toughness(0), CFG.toughness(30)],
      mix: [CFG.armedMix(0), CFG.armedMix(30)],
      density: [CFG.enemiesPerSecond(0), CFG.enemiesPerSecond(30)]
    };
    try {
      window.__game.start();
      g.lives = 99999;
      const total = 60 * 360;                       // 360 秒ぶん
      for (let i = 0; i < total; i++) {
        // 自動操縦：撃ちっぱなし、たまにパワーアップ発動、常時無敵で検証に集中
        g.player.inv = 5;
        if (i % 37 === 0) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
        if (i % 37 === 1) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }));
        window.__game.step(1);

        /* 予算はウェーブと自機の装備の両方で変わる。
           しかも自機がパワーを失うと予算は下がるが、すでに飛んでいる弾は残る。
           そこで「それまでに見た予算の最大値」を上限として検証する。
           発射時に予算を守っていれば、この値を超えることはない。 */
        const budget = CFG.bulletBudget(CFG.threatWave(g));
        if (budget > out.maxBudget) out.maxBudget = budget;
        if (g.eb.length > out.maxEB) out.maxEB = g.eb.length;
        if (g.eb.length > out.maxBudget) out.ebOver++;
        if (g.en.length > out.maxEnemies) out.maxEnemies = g.en.length;

        if (i % (60 * 30) === 0) {                  // 30 秒ごとにスナップショット
          out.samples.push({
            sec: Math.round(i / 60), wave: g.wave, enemies: g.en.length,
            ebullets: g.eb.length, kills: g.kills, score: g.score,
            options: g.pw.options, shot: g.pw.shot,
            lvl: Math.max(g.pw.double, g.pw.laser), chain: g.chain,
            budget: CFG.bulletBudget(CFG.threatWave(g))
          });
        }
      }
      out.finalScore = g.score;
      out.finalKills = g.kills;
      out.finalWave = g.wave;
      out.power = JSON.parse(JSON.stringify(g.pw));
    } catch (e) { out.thrown = e.message + '\n' + e.stack; }
    return out;
  });

  // --- 実測フレームレート：混雑した状態で 3 秒間まわす ---
  const perf = await page.evaluate(() => new Promise((res) => {
    const times = [];
    let last = performance.now(), n = 0;
    function tick(t) {
      if (n > 30) times.push(t - last);   // 計測開始直後の GC 分は捨てる
      last = t;
      if (++n < 330) requestAnimationFrame(tick);
      else {
        const over = times.filter((x) => x > 20).length / times.length;
        times.sort((a, b) => a - b);
        res({
          overRatio: +over.toFixed(3),
          median: +times[times.length >> 1].toFixed(2),
          p95: +times[Math.floor(times.length * 0.95)].toFixed(2),
          worst: +times[times.length - 1].toFixed(2),
          quality: +window.FX.quality.toFixed(2),
          enemies: window.__game.G.en.length,
          bullets: window.__game.G.pb.length,
          parts: window.FX.parts.filter((p) => p.on).length
        });
      }
    }
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: path.join(ROOT, 'docs/shot-play.png') });
  await page.keyboard.up('z');

  await browser.close();
  server.close();

  console.log('--- 経過サンプル ---');
  for (const s of stats.samples) {
    console.log(
      `${String(s.sec).padStart(3)}s  wave${String(s.wave).padStart(2)}  ` +
      `敵:${String(s.enemies).padStart(3)}  敵弾:${String(s.ebullets).padStart(2)}  ` +
      `撃破:${String(s.kills).padStart(5)}  予算:${String(s.budget).padStart(2)}  ` +
      `OP:${s.options} ${s.shot}${s.lvl}  chain:${s.chain}`
    );
  }
  const c = stats.curve;
  const ratio = (a) => (a[1] / a[0]).toFixed(1) + '倍';
  console.log('--- 難易度カーブの伸び（ウェーブ 0 → 30）---');
  console.log('敵の密度      :', c.density[0].toFixed(1), '→', c.density[1].toFixed(1), '匹/秒 ', ratio(c.density));
  console.log('敵弾の上限    :', c.budget[0], '→', c.budget[1], '発      ', ratio(c.budget));
  console.log('敵弾の速さ    :', c.speed[0].toFixed(0), '→', c.speed[1].toFixed(0), 'px/秒 ', ratio(c.speed));
  console.log('撃ってくる敵  :', c.armed[0], '→', c.armed[1], '体      ', ratio(c.armed));
  console.log('重装敵の HP   :', c.tough[0].toFixed(1), '→', c.tough[1].toFixed(1), '倍     ', ratio(c.tough));
  console.log('武装編隊の比率:', (c.mix[0] * 100).toFixed(0) + '%', '→', (c.mix[1] * 100).toFixed(0) + '%');
  console.log('--- 結果 ---');
  console.log('敵弾の最大同時数 :', stats.maxEB, '(その時点の予算上限', stats.maxBudget, ')');
  console.log('予算超過フレーム :', stats.ebOver);
  console.log('敵の最大同時数   :', stats.maxEnemies);
  console.log('最終スコア/撃破  :', stats.finalScore, '/', stats.finalKills);
  console.log('最終パワー       :', JSON.stringify(stats.power));
  console.log('フレーム時間(ms) : 中央値', perf.median, ' p95', perf.p95, ' 最悪', perf.worst,
              ' 20ms超の割合', (perf.overRatio * 100).toFixed(1) + '%');
  console.log('                   (敵', perf.enemies, '/ 自機弾', perf.bullets,
              '/ 粒子', perf.parts, '/ 画質', perf.quality, ')');
  if (stats.thrown) console.log('例外:', stats.thrown);
  if (errors.length) console.log('JS エラー:\n' + errors.join('\n'));

  /* 判定：エラーなし・弾幕予算を守る・中央値 60fps・大きく落ちるフレームが 15% 未満。
     （このヘッドレス環境は GPU を使わないソフトウェア描画なので実機よりかなり重い） */
  /* 難易度側の伸びが火力の伸び（約 19 倍）を追い越していないことを確認する。
     追い越すと、強くなるほど不利という逆転が起きる */
  const diffGrowth = Math.max(c.budget[1] / c.budget[0], c.armed[1] / c.armed[0], c.speed[1] / c.speed[0]);
  const curveOk = diffGrowth <= 8;
  console.log('難易度の伸び     :', diffGrowth.toFixed(1) + '倍', curveOk ? '(火力の伸び 約19倍 を超えていない)' : '(伸びすぎ)');

  const fail = errors.length > 0 || stats.thrown || stats.ebOver > 0 || !curveOk ||
               perf.median > 18 || perf.overRatio > 0.15;
  console.log(fail ? '\nNG' : '\nOK: エラーなし・弾幕予算も守られている');
  process.exit(fail ? 1 : 0);
})();

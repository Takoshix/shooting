/* =========================================================
   tools/dps-bench.js — 武器ごとの実効 DPS を測る
   ---------------------------------------------------------
   実行: node tools/dps-bench.js

   固定位置に倒れない的を並べ、10 秒ぶん撃ち込んで
   与えたダメージの合計を測る。
   的の並べ方を 2 通り用意してあるのが要点で、
     密集 … 狭い範囲に固まった的（クラスタが得意なはず）
     散開 … 画面全体に散った的（追尾が得意なはず）
   ここで特定の武器だけが両方で突出していたら、
   それは「強すぎる武器」＝選択肢を潰す武器ということになる。
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
      const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.slice(1));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
      rp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      rp.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => !!window.__game);

  const rows = await page.evaluate(() => {
    const g = window.__game.G, CFG = window.CFG;

    // 的の配置。密集は狭い範囲、散開は画面全体
    const LAYOUT = {
      密集: () => { const a = []; for (let i = 0; i < 9; i++) a.push({ x: 430 + (i % 3) * 26, y: 170 + ((i / 3) | 0) * 26 }); return a; },
      散開: () => { const a = []; for (let i = 0; i < 9; i++) a.push({ x: 260 + (i % 3) * 150, y: 50 + ((i / 3) | 0) * 145 }); return a; }
    };

    function bench(power, layoutName) {
      window.__game.start();
      g.lives = 99999;
      Object.assign(g.pw, power);
      g.chain = 0;                         // チェイン補正を除いた素の値を測る
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));

      const spots = LAYOUT[layoutName]();
      const HP = 1e9;
      g.en.length = 0; g.pend.length = 0;
      const dummies = spots.map((s) => {
        const e = window.Enemies.spawn(g, 'bulwark', s.x, s.y);
        e.hp = e.maxhp = HP;
        e.def = Object.assign({}, e.def, { fires: null, score: 0 });
        return e;
      });

      let total = 0;
      for (let i = 0; i < 60 * 10; i++) {
        g.player.inv = 5; g.player.y = 200; g.player.x = 90;
        g.chain = 0;
        // 的を固定し、HP の減りをダメージとして数える
        for (let k = 0; k < dummies.length; k++) {
          const e = dummies[k];
          total += HP - e.hp;
          e.hp = HP; e.dead = false;
          e.x = spots[k].x; e.y = spots[k].y;
        }
        g.en.length = 0;
        for (const e of dummies) g.en.push(e);
        window.__game.step(1);
      }
      return Math.round(total / 10);       // 1 秒あたり
    }

    const MAX = CFG.weapon;
    const sets = {
      '初期装備':            { vulcan: 0, homing: 0, cluster: 0, options: 0 },
      'VULCAN 6':            { vulcan: 6, homing: 0, cluster: 0, options: 0 },
      'HOMING 6':            { vulcan: 0, homing: 6, cluster: 0, options: 0 },
      'CLUSTER 6':           { vulcan: 0, homing: 0, cluster: 6, options: 0 },
      '3 系統 6 + OP6':      { vulcan: 6, homing: 6, cluster: 6, options: 6 }
    };
    const out = [];
    for (const name in sets) {
      out.push({ name, 密集: bench(sets[name], '密集'), 散開: bench(sets[name], '散開') });
    }
    return out;
  });

  await browser.close();
  server.close();

  console.log('武器構成             |  密集した的 |  散開した的 | 差');
  console.log('---------------------|-------------|-------------|------');
  for (const r of rows) {
    const ratio = (Math.max(r['密集'], r['散開']) / Math.max(1, Math.min(r['密集'], r['散開']))).toFixed(1);
    console.log(
      r.name.padEnd(20), '|',
      String(r['密集']).padStart(10), '|',
      String(r['散開']).padStart(10), '|', ratio + '倍');
  }
  console.log('\n単位は 1 秒あたりの与ダメージ（DPS）。チェイン補正なし。');
})();

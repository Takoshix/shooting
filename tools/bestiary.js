/* =========================================================
   tools/bestiary.js — 敵の絵を一覧で確認する
   ---------------------------------------------------------
   実行: node tools/bestiary.js  → docs/bestiary.png

   全 16 種 × 全 40 変種を並べて 1 枚に描く。
   戦闘中の画面では「見分けがつくか」を判断できないので、
   絵・縁取り・大きさの調整はこの一覧を見ながら行う。

   ※ 一度に 40 体出すと「撃ってくる敵の画面内上限」に当たって
     ザコへ差し替えられてしまうため、確認中だけ上限を外している。
   ========================================================= */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const ROOT='/home/user/shooting';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
(async()=>{
 const s=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url==='/'?'index.html':q.url.slice(1)));
  if(!fs.existsSync(p)){r.writeHead(404);return r.end();}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'text/plain'});r.end(fs.readFileSync(p));});
 await new Promise(res=>s.listen(0,'127.0.0.1',res));
 const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:1300,height:850}});
 await pg.goto(`http://127.0.0.1:${s.address().port}/index.html`);
 await pg.waitForFunction(()=>!!window.__game);
 await pg.waitForTimeout(1500);
 await pg.evaluate(()=>{
   const g=window.__game.G, CFG=window.CFG;
   window.__game.start(0);
   g.en.length=0; g.pend.length=0; g.eb.length=0; g.pb.length=0; g.it.length=0;
   g.player.alive=false; g.player.wait=9999;
   // 全種類 × 全変種を並べる
   const T=window.Enemies.TYPES; const list=[];
   for(const name in T){ const vs=T[name].variants||[null]; for(const v of vs) list.push([name,v]); }
   // 「撃ってくる敵の上限」でザコに差し替えられないよう、一時的に上限を外す
   const origArmed = window.CFG.armedMax; window.CFG.armedMax = function(){ return 9999; };
   const COLS=7; let i=0;
   for(const [name,v] of list){
     const e=window.Enemies.spawn(g,name, 60+(i%COLS)*88, 34+Math.floor(i/COLS)*45, {variant:v});
     if(e){ e.vx=0; e.vy=0; e.pat='none'; e.fireT=1e9; e.hp=e.maxhp; }
     i++;
   }
   window.CFG.armedMax = origArmed;
   window.__bestiary=list.map(x=>x.join('|'));
 });
 await pg.waitForTimeout(500);
 await pg.evaluate(()=>{
   const g=window.__game.G, ctx=document.getElementById('screen').getContext('2d');
   // 動きを止めて描画だけする
   ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#03040c'; ctx.fillRect(0,0,640,400);
   window.Enemies.draw(g, ctx);
   const T=window.Enemies.TYPES; const list=[];
   for(const name in T){ const vs=T[name].variants||[null]; for(const v of vs) list.push([name,v]); }
   ctx.font='7px monospace'; ctx.textAlign='center'; ctx.fillStyle='#6f95c9';
   const COLS=7;
   list.forEach((x,i)=>ctx.fillText(x[1]||'-', 60+(i%COLS)*88, 34+Math.floor(i/COLS)*45+20));
 });
 await (await pg.$('#screen')).screenshot({path:ROOT+'/docs/bestiary.png'});
 console.log('体数:', (await pg.evaluate(()=>window.__game.G.en.length)));
 await b.close(); s.close();
})();

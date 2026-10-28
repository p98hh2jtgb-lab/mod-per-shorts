/* Top-down corridor preview: DriftSketch 0.9.0 vs 0.9.1 on a simulated drift slalom (mocked BeamNG, Fengari, Chromium). */
'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const MODULES=process.env.BROWSER_TEST_MODULES||'/tmp/nodetest/node_modules';
const fengari=require(process.env.FENGARI_PATH||path.join(MODULES,'fengari'));
const {lua,lauxlib,lualib,to_luastring}=fengari;
const t=fs.readFileSync(path.join(ROOT,'tests/drift_sketch_lua_smoke.js'),'utf8');
const a=t.indexOf('const mocks = `')+15, b=t.indexOf('`;',a);
const mocks=t.slice(a,b).replace(/\$\{ASSET\}/g,'/art/shapes/driftsketch_v09/');
function run(src, settingsLua){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const body=`
M=assert(load(SOURCE,'@x'))()
M.onExtensionLoaded()
M.setSetting('gates',false)
${settingsLua}
math.randomseed(7)
local raw={}
current.x=0; current.y=0; current.fx=1; current.fy=0
M.start()
local x=0
while x<=110 do
  local k=2*math.pi/28
  local y=3.2*math.sin(k*x)
  local dy=3.2*k*math.cos(k*x)
  local h=math.atan(dy,1)
  local drift=math.rad(24)*math.sin(k*x+0.6)
  current.x=x+ (math.random()-0.5)*0.12
  current.y=y+ (math.random()-0.5)*0.12
  current.fx=math.cos(h+drift); current.fy=math.sin(h+drift)
  M.onUpdate(0.05)
  raw[#raw+1]=string.format('%.3f,%.3f',current.x,current.y)
  x=x+0.35
end
M.stop()
local out={}
for _,o in ipairs(liveObjects()) do out[#out+1]=string.format('%.3f,%.3f',o.position.x,o.position.y) end
RESULT=table.concat(out,' ')..'|'..table.concat(raw,' ')
`;
  const script=mocks+'\nSOURCE='+JSON.stringify(src)+'\n'+body.replace('setmetatable(_G','--');
  // strict-globals metatable in mocks would block RESULT; drop it
  const s2=script.replace(/setmetatable\(_G,\{__index=function\(_,key\) error\('undefined global '\.\.tostring\(key\),2\) end\}\)/,'');
  if(lauxlib.luaL_dostring(L,to_luastring(s2))!==lua.LUA_OK) throw new Error(lua.lua_tojsstring(L,-1));
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const [c,r]=lua.lua_tojsstring(L,-1).split('|');
  const P=s=>s.trim().split(' ').map(p=>p.split(',').map(Number));
  return {cones:P(c), raw:P(r)};
}
// OLD_LUA: path to the 0.9.0 driftSketch.lua (git show driftsketch-v0.9.0:DriftSketch/lua/ge/extensions/driftSketch.lua)
const oldSrc=process.env.OLD_LUA?fs.readFileSync(process.env.OLD_LUA,'utf8'):null;
const newSrc=fs.readFileSync(path.join(ROOT,'DriftSketch/lua/ge/extensions/driftSketch.lua'),'utf8');
const panels=[];
if(oldSrc) panels.push(['0.9.0 — settings e tua (Base width 1.9, Drift widen ON, Smooth ON, spacing 0.5)', run(oldSrc,"M.setSetting('width',1.9); M.setSetting('driftWidth',true); M.setSetting('smooth',true); M.setSetting('spacing',0.5)")]);
panels.push(
 ['0.9.1 — default (Gap to car 0.3 m, Drift widen OFF, Smooth ON, spacing 0.5)', run(newSrc,"M.setSetting('gap',0.3); M.setSetting('driftWidth',false); M.setSetting('smooth',true); M.setSetting('spacing',0.5)")],
 ['0.9.1 — Drift widen ON (Gap to car 0.3 m, spacing 0.5): hapet butë aty ku vetura shkon anash', run(newSrc,"M.setSetting('gap',0.3); M.setSetting('driftWidth',true); M.setSetting('smooth',true); M.setSetting('spacing',0.5)")]);
const S=13, W=115*S+40, PH=17*S;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${panels.length*(PH+40)+10}" style="background:#5b6367;font-family:Arial">`;
panels.forEach(([title,d],i)=>{
  const oy=i*(PH+40)+30, cy=oy+PH/2;
  svg+=`<rect x="10" y="${oy}" width="${W-20}" height="${PH}" fill="#4a5054" rx="8"/>`;
  svg+=`<text x="22" y="${oy-8}" fill="#fff" font-size="17" font-weight="bold">${title} · ${d.cones.length} kona</text>`;
  svg+=`<polyline fill="none" stroke="#9fd3ff" stroke-width="2" stroke-dasharray="5,4" points="${d.raw.map(([x,y])=>`${20+x*S},${cy-y*S}`).join(' ')}"/>`;
  d.cones.forEach(([x,y])=>{svg+=`<circle cx="${20+x*S}" cy="${cy-y*S}" r="${0.21*S}" fill="#ff6a1f" stroke="#fff" stroke-width="1.2"/>`;});
});
svg+='</svg>';
svg=svg.replace('</svg>',`<text x="22" y="${panels.length*(PH+40)+2}" fill="#dfe6e8" font-size="13">Pamje nga lart e një drift-slalomi (28 m, ±3.2 m, vetura anash deri 24°, zhurmë ±6 cm). Vija blu = rruga e regjistruar e veturës (qendra).</text></svg>`);
const OUT=process.env.OUT||path.join(ROOT,'DriftSketch_previews/0.9.1/korridori_0.9.0_vs_0.9.1.png');
(async()=>{
  const {chromium:pw}=require(path.join(MODULES,'playwright-core'));
  const {default: chromium}=await import(require('url').pathToFileURL(path.join(MODULES,'@sparticuz/chromium/build/index.js')).href);
  const b=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
  const p=await b.newPage({viewport:{width:W,height:panels.length*(PH+40)+14}});
  await p.setContent('<html><body style="margin:0;background:#5b6367">'+svg+'</body></html>');
  await p.screenshot({path:OUT});
  await p.goto('about:blank');
  console.log(panels.map(q=>q[0]+' · '+q[1].cones.length).join('\n')+'\n-> '+OUT);
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});

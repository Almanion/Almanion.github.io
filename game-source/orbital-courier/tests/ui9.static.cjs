'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let count=0;
function check(condition,label){assert.ok(condition,label);count++;}
const hashes=JSON.parse(fs.readFileSync(path.join(root,'docs/unchanged-v8-v9.json'),'utf8'));
for(const row of hashes){const data=fs.readFileSync(path.join(root,row.file));check(crypto.createHash('sha256').update(data).digest('hex')===row.sha256,row.file+' unchanged from v8');}
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
let expanded=source.replace(/<link\b[^>]*>/g,tag=>{const m=tag.match(/href="(src\/[^\"]+)"/);return !m||!tag.includes('stylesheet')?tag:'<style>\n'+fs.readFileSync(path.join(root,m[1]),'utf8')+'\n</style>';});
expanded=expanded.replace(/<script src="(src\/[^\"]+)"><\/script>/g,(_,file)=>'<script>\n'+fs.readFileSync(path.join(root,file),'utf8')+'\n</script>');
check(expanded===fs.readFileSync(path.join(root,'Orbital Courier.html'),'utf8'),'bundled HTML exactly matches current sources');
check(!/<script[^>]+src=["']https?:/i.test(expanded),'no remote script dependencies');
check(!/<link[^>]+href=["']https?:/i.test(expanded),'no remote stylesheets or font files');
const ids=[...source.matchAll(/\bid="([^\"]+)"/g)].map(m=>m[1]);check(new Set(ids).size===ids.length,'unique template IDs');
check(source.includes('src/interface-v9.js')&&source.includes('src/interface-v9.css'),'v9 controller and styles connected');
check(source.includes('id="flightDrawer"')&&source.includes('aria-labelledby="drawerTitle"'),'named native flight dialog');
check(source.includes('id="mapAim"')&&source.includes('id="mapPan"'),'explicit aim vs pan actions');
check(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version==='9.0.0','application version 9');
check(fs.readFileSync(path.join(root,'src/progression.js'),'utf8').includes("SAVE_KEY='orbital-courier-save-v8'"),'save schema intentionally unchanged');
const report={status:'passed',assertions:count,hashes,notes:['No gameplay/economy changes','v9 app retains v8 save schema']};
fs.writeFileSync(path.join(root,'docs/static-results-v9.json'),JSON.stringify(report,null,2));console.log(`UI9 static checks passed: ${count}`);

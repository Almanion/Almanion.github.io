'use strict';
const {test,expect}=require('@playwright/test');
const historical=require('../game-source/orbital-courier/docs/completed-v8-profile.json');
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/games/orbital-courier/');});
for(const width of [390,1366])test('five campaign tiers, route order and archived final '+width,async({page},info)=>{
 await page.setViewportSize({width,height:844});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(profile=>{const A=Orbital.App;A.profile=Orbital.Progress.sanitize(profile);A.profile.settings.reducedMotion=true;A.go('campaign');},historical);
 await expect(page.locator('#difficultyTabs button')).toHaveCount(5);await expect(page.locator('#campaignTotal')).toContainText('76');
 await page.locator('[data-action=campaign-tier][data-tier="4"]').click();
 if(width<700)await page.locator('#sectorSelect').selectOption('19');else await page.locator('#sectorTabs [data-sector="19"]').click();
 await expect(page.locator('.mission-card')).toHaveCount(4);await expect(page.locator('#sectorOverview')).toContainText('Предел навигации');
 await expect(page.locator('.mission-card.completed')).toHaveCount(0);await expect(page.locator('.mission-card').first()).toContainText('прежний рекорд сохранён');
 await page.screenshot({path:info.outputPath('difficulty-tiers.png'),fullPage:true});
 await page.evaluate(()=>{Orbital.App.loadLevel(15);Orbital.App.actions['following-level']();});
 await expect.poll(()=>page.evaluate(()=>Orbital.App.currentId)).toBe(18);await expect(page.locator('#flightSector')).toContainText('17');
 await page.evaluate(()=>Orbital.App.actions['previous-level']());await expect.poll(()=>page.evaluate(()=>Orbital.App.currentId)).toBe(15);
 await page.evaluate(()=>{const A=Orbital.App,P=Orbital.Physics,l=A.level(),q=l.solution;A.state=P.createState(l,q.angle,q.speed);Orbital.Review.start(A.state);while(A.state.status==='flying'){const prior=A.state;A.state=P.step(prior,l);Orbital.Review.observe(prior,A.state,l);}A.finish();Orbital.Review.selectTime(0);Orbital.UI9.sync();});
 expect(await page.evaluate(()=>Orbital.App.displayState().status)).toBe('flying');await expect(page.locator('.review-next')).toHaveText('Дальше ↗');
 if(width>700)await expect(page.locator('#nextLevelButton')).toBeVisible();
 await page.locator('.review-next').click();await expect.poll(()=>page.evaluate(()=>Orbital.App.currentId)).toBe(18);
 await page.evaluate(()=>{const A=Orbital.App,l=Orbital.LEVELS[79];A.loadLevel(79);A.state=Orbital.Physics.simulate(A.level(),l.solution.angle,l.solution.speed).state;A.finish();});
 await expect(page.locator('#nextLevelButton')).not.toBeVisible();await expect(page.locator('.review-next')).toHaveText('Все маршруты');
 await page.locator('.review-next').click();await expect(page.locator('#campaign')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
});
test('sound instruments render finite distinct bounded signals; mute and pause stop flight audio',async({page})=>{
 const result=await page.evaluate(async()=>{
  const names=['launch','cargo','gate','flyby','portal','win','fail','upgrade','click'],out=[];
  for(const name of names){const ctx=new OfflineAudioContext(2,44100*2,44100),sound=new Orbital.Sound();sound.ctx=new Proxy(ctx,{get:(o,k)=>k==='state'?'running':typeof o[k]==='function'?o[k].bind(o):o[k]});sound.prepare();sound.play(name,.4);const buffer=await ctx.startRendering(),a=buffer.getChannelData(0);let peak=0,sum=0,tail=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i]))throw Error('Nonfinite audio');peak=Math.max(peak,Math.abs(a[i]));sum+=a[i]*a[i];if(i>a.length-2205)tail+=a[i]*a[i];}out.push({name,peak,rms:Math.sqrt(sum/a.length),tail,voices:sound.voices.size});}
  return out;
 });
 expect(new Set(result.map(r=>r.rms.toFixed(8))).size).toBe(9);for(const r of result){expect(r.peak,r.name).toBeGreaterThan(.001);expect(r.peak,r.name).toBeLessThan(.5);expect(r.tail,r.name).toBeLessThan(.000001);expect(r.voices,r.name).toBe(0);}
 await page.locator('#continueButton').click();await page.waitForFunction(()=>!Orbital.App.transitioning);
 await page.evaluate(()=>Orbital.App.launch());await expect.poll(()=>page.evaluate(()=>!!Orbital.App.sound.engine)).toBe(true);
 await page.evaluate(()=>Orbital.App.actions.pause());await expect.poll(()=>page.evaluate(()=>!!Orbital.App.sound.engine)).toBe(false);
 await page.evaluate(()=>{Orbital.App.sound.enabled=false;Orbital.App.sound.play('win');});await expect.poll(()=>page.evaluate(()=>Orbital.App.sound.voices.size)).toBe(0);
 await page.evaluate(()=>Orbital.V8.settings('control'));await page.locator('#soundVolume').focus();await page.locator('#soundVolume').press('Home');
 await page.locator('#soundVolume').press('ArrowRight');await expect(page.locator('#soundVolumeValue')).toHaveText('1%');
 await page.reload();expect(await page.evaluate(()=>Orbital.App.profile.settings.volume)).toBe(.01);
});
test('eleven distinct trails, portal breaks and cached asteroid artwork',async({page},info)=>{
 const art=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.id='art';c.width=1100;c.height=780;c.style.cssText='position:fixed;inset:0;z-index:9999;width:1100px;height:780px';document.body.append(c);const ctx=c.getContext('2d');ctx.fillStyle='#081520';ctx.fillRect(0,0,c.width,c.height);const hashes=[];
  for(const [i,d]of Orbital.Cosmetics.TRAILS.entries()){const x=25+i%2*540,y=45+Math.floor(i/2)*112,pts=Array.from({length:90},(_,j)=>({x:x+110+j*3.3,y:y+24+Math.sin(j/24)*16}));ctx.font='13px sans-serif';ctx.fillStyle='#d8e7ed';ctx.fillText(d.name,x,y);Orbital.Cosmetics.drawTrail(ctx,pts,d.id,1.3,'#6af4cd',false,2);const small=document.createElement('canvas');small.width=500;small.height=100;const sc=small.getContext('2d');sc.translate(-x,-y+20);Orbital.Cosmetics.drawTrail(sc,pts,d.id,1.3,'#6af4cd',false,2);hashes.push(small.toDataURL());}
  const r=new Orbital.Renderer(c);r.ctx.setTransform(1,0,0,1,0,0);for(let i=0;i<5;i++)r.rock({x:650+i*87,y:710,r:32},i);const p={x:650,y:710,r:32};
  return {hashes,cache:r.rockTexture(p,0)===r.rockTexture(p,0),recent:Orbital.Cosmetics.recent([{x:0,y:0},{x:100,y:0},{x:800,y:0,break:true},{x:820,y:0}],100)};
 });
 expect(new Set(art.hashes).size).toBe(11);expect(art.cache).toBe(true);expect(art.recent.every(p=>p.x>=800)).toBe(true);
 await page.locator('#art').screenshot({path:info.outputPath('trails-and-asteroids.png')});
});

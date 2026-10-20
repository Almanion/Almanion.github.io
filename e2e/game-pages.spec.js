'use strict';
const {test,expect}=require('@playwright/test');
const base='/games/orbital-courier/';
const resources=()=>{
 const p=Orbital.App.profile;
 return JSON.stringify({credits:p.credits,data:p.data,xp:p.xp,upgrades:p.upgrades,receipts:p.receipts,records:p.records,courses:p.courses,achievements:p.achievements,skin:p.skin,trail:p.trail});
};
// Native tab controls use the full browser, matching desktop QA rather than
// the separate headless shell's background target lifecycle.
test.use({channel:'chromium',serviceWorkers:'block',viewport:{width:1366,height:768}});
test.beforeEach(async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});

test('five online entrypoints load the correct document directly and after reload',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);const first=await page.evaluate(()=>Orbital.Campaign.order[0]);
 const titles=[];
 for(const [path,screen]of [['','home'],['contracts/','campaign'],['hangar/','hangar'],['awards/','awards'],['flight/?contract='+first,'play']]){
  await page.goto(base+path);
  for(let visit=0;visit<2;visit++){
   await expect(page.locator('body')).toHaveAttribute('data-page',screen);
   await expect(page.locator('#'+screen)).toBeVisible();
   expect(await page.evaluate(()=>Orbital.Navigation.enabled)).toBe(true);
   if(screen==='play'){
    expect(await page.evaluate(()=>Orbital.App.currentId)).toBe(first);
    expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
   }else{
    await expect(page.locator('.topbar [data-page="'+screen+'"]')).toHaveAttribute('aria-current','page');
   }
   if(visit===0)await page.reload();
  }
  titles.push(await page.title());
 }
 expect(new Set(titles).size).toBe(5);expect(errors).toEqual([]);
});

test('native links load new documents and preserve profile, course context and browser history',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 const first=await page.evaluate(()=>Orbital.Campaign.order[0]);
 await page.evaluate(()=>window.documentMarker='original home');
 await page.locator('.topbar nav a[data-page=campaign]').click();
 await expect(page).toHaveURL(new RegExp('/contracts/$'));
 expect(await page.evaluate(()=>window.documentMarker)).toBeUndefined();
 const card=page.locator('a[data-action=mission][data-id="'+first+'"]');
 await expect(card).toHaveAttribute('href',base+'flight/?contract='+first);await card.click();
 await expect(page).toHaveURL(new RegExp('/flight/\\?contract='+first+'$'));
 await page.evaluate(()=>{const A=Orbital.App;A.setAim(15.5,200);A.storeCourse(0);});
 for(const rate of [2,4,10,50]){await page.locator('#speedButton').click();await expect(page.locator('#speedButton')).toHaveText('×'+rate);}
 const before=await page.evaluate(resources);
 await page.locator('.topbar nav a[data-page=hangar]').click();
 await expect(page).toHaveURL(new RegExp('/hangar/$'));expect(await page.evaluate(resources)).toBe(before);
 await page.locator('a[data-action=return-flight]').click();
 await expect(page).toHaveURL(new RegExp('/flight/\\?contract='+first+'$'));
 expect(await page.evaluate(()=>[Orbital.App.angle,Orbital.App.speed])).toEqual([15.5,200]);
 await expect(page.locator('#speedButton')).toHaveText('×50');
 await page.reload();await expect(page.locator('body')).toHaveAttribute('data-page','play');
 expect(await page.evaluate(()=>[Orbital.App.angle,Orbital.App.speed])).toEqual([15.5,200]);
 await expect(page.locator('#speedButton')).toHaveText('×50');
 expect(await page.evaluate(resources)).toBe(before);
 await page.goBack();await expect(page).toHaveURL(new RegExp('/hangar/$'));
 // Only this synthetic test profile is changed. Back must not revive an older JS heap and overwrite it.
 await page.evaluate(()=>{Orbital.App.profile.credits+=17;Orbital.App.save();});
 const newer=await page.evaluate(resources);
 await page.goBack();await expect(page).toHaveURL(new RegExp('/flight/\\?contract='+first+'$'));
 await expect.poll(()=>page.evaluate(resources)).toBe(newer);
 await page.goForward();await expect(page).toHaveURL(new RegExp('/hangar/$'));
 await expect.poll(()=>page.evaluate(resources)).toBe(newer);
 expect(errors).toEqual([]);
});

test('Control and middle clicks keep the current page while opening real destinations',async({page,context})=>{
 // Leave native popup navigation outside request interception. Chromium can
 // otherwise pause a background tab's first document before it is attached.
 await page.unrouteAll({behavior:'wait'});
 await context.route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/,route=>route.abort());
 await page.goto(base);
 for(const options of [{modifiers:['Control']},{button:'middle'}]){
  await page.bringToFront();
  const [other]=await Promise.all([context.waitForEvent('page'),page.locator('.topbar nav a[data-page=campaign]').click(options)]);
  await page.keyboard.up('Control');await other.bringToFront();
  await expect(other,JSON.stringify(options)+' opened '+other.url()).toHaveURL(new RegExp('/contracts/$'));
  await expect(other.locator('body')).toHaveAttribute('data-page','campaign');
  await expect.poll(()=>other.evaluate(()=>window.Orbital?.App?.screen)).toBe('campaign');
  await expect(page).toHaveURL(new RegExp('/games/orbital-courier/$'));await expect(page.locator('#home')).toBeVisible();
  await other.close();
 }
});

test('invalid or locked flight links return to contracts without launching or changing rewards',async({page})=>{
 await page.goto(base);const before=await page.evaluate(resources);
 for(const contract of ['999','-1','1.5','NaN']){
  await page.goto(base+'flight/?contract='+contract);await expect(page).toHaveURL(new RegExp('/contracts/$'));
  expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();expect(await page.evaluate(resources)).toBe(before);
 }
 const locked=await page.evaluate(()=>Orbital.Campaign.order.find(id=>!Orbital.Progress.unlocked(Orbital.App.profile,id)));
 if(locked!==undefined){await page.goto(base+'flight/?contract='+locked);await expect(page).toHaveURL(new RegExp('/contracts/$'));expect(await page.evaluate(resources)).toBe(before);}
});

test('downloadable standalone retains local screens and requires no runtime requests',async({page})=>{
 await page.goto(base);await expect(page.locator('.home-download')).toHaveAttribute('href','./offline.html');
 await page.goto(base+'offline.html');expect(await page.evaluate(()=>Orbital.Navigation.enabled)).toBe(false);
 const first=await page.evaluate(()=>Orbital.Campaign.order[0]);
 await page.evaluate(id=>Orbital.App.loadLevel(id),first);await expect(page.locator('#gameCanvas')).toBeVisible();
 await page.evaluate(()=>Orbital.App.go('awards'));await expect(page.locator('#awards')).toBeVisible();
 await expect(page).toHaveURL(new RegExp('/offline\\.html$'));
 expect(await page.locator('script[src],link[rel=stylesheet][href]').count()).toBe(0);
});

test('idle online tabs follow the latest saved profile before navigating',async({page,context})=>{
 const other=await context.newPage();
 try{
  await page.goto(base+'hangar/');await other.goto(base+'hangar/');
  const original=await page.evaluate(()=>Orbital.App.profile.credits);
  await other.evaluate(()=>{Orbital.App.profile.credits+=37;Orbital.App.save();});
  await expect.poll(()=>page.evaluate(()=>Orbital.App.profile.credits)).toBe(original+37);
  await expect(page.locator('body')).not.toHaveAttribute('data-local-save-conflict','true');
  await page.locator('.topbar nav a[data-page=awards]').click();await expect(page).toHaveURL(new RegExp('/awards/$'));
  expect(await page.evaluate(()=>Orbital.App.profile.credits)).toBe(original+37);
  expect(await other.evaluate(()=>JSON.parse(localStorage.getItem('orbital-courier-save-v8')).credits)).toBe(original+37);
 }finally{await other.close();}
});

test('a competing save pauses a flight and blocks stale writes until one whole profile is chosen',async({page,context})=>{
 const other=await context.newPage();
 try{
  await page.goto(base);const first=await page.evaluate(()=>Orbital.Campaign.order[0]);
  await page.goto(base+'flight/?contract='+first);await other.goto(base+'hangar/');
  await page.evaluate(()=>{
   const A=Orbital.App;A.launch();A.paused=true;
   // Isolated cloud double: no SDK, real account or remote database is involved.
   Orbital.Cloud={sync:{uid:'synthetic-pilot',epoch:0,setUser(uid){this.epoch++;this.uid=uid;},async sync(){this.writes=(this.writes||0)+1;},async resolve(){}}};
  });
  await expect.poll(()=>other.evaluate(id=>Orbital.App.profile.records[id]?.attempts||0,first)).toBe(1);
  const before=await page.evaluate(resources);
  await other.evaluate(()=>{Orbital.App.profile.credits+=51;Orbital.App.save();});
  const latest=await other.evaluate(()=>localStorage.getItem('orbital-courier-save-v8'));
  await expect(page.locator('body')).toHaveAttribute('data-local-save-conflict','true');
  expect(await page.evaluate(()=>[Orbital.App.state.status,Orbital.App.paused,Orbital.Cloud.sync.uid])).toEqual(['flying',true,null]);
  await page.evaluate(async()=>{Orbital.App.save();await Orbital.Cloud.sync.sync();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));});
  expect(await page.evaluate(()=>localStorage.getItem('orbital-courier-save-v8'))).toBe(latest);
  expect(await page.evaluate(()=>Orbital.Cloud.sync.writes||0)).toBe(0);
  expect(await page.evaluate(resources)).toBe(before);
  await page.locator('[data-action="pages:use-other"]').click();
  await expect(page.locator('body')).not.toHaveAttribute('data-local-save-conflict','true');
  expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
  expect(await page.evaluate(()=>Orbital.App.profile.credits)).toBe(JSON.parse(latest).credits);
  expect(await page.evaluate(()=>Orbital.Cloud.sync.uid)).toBe('synthetic-pilot');
  const backups=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-courier-tab-backups')));
  expect(backups.length).toBeGreaterThan(0);expect(backups.at(-1).other).toBe(latest);
  expect(JSON.parse(backups.at(-1).local).credits).toBeLessThan(JSON.parse(latest).credits);
 }finally{await other.close();}
});

test('the synchronous write guard catches a save change before its storage event arrives',async({page})=>{
 await page.goto(base+'hangar/');
 const result=await page.evaluate(()=>{
  const A=Orbital.App,other=structuredClone(A.profile);other.credits+=200;
  localStorage.setItem('orbital-courier-save-v8',JSON.stringify(other));
  // Same-document setItem intentionally emits no storage event. This reproduces
  // a write that reaches storage before another tab receives its queued event.
  A.profile.credits+=10;A.save();
  Orbital.Cloud={sync:{uid:null,epoch:0,setUser(uid){this.epoch++;this.uid=uid;},async sync(){this.writes=(this.writes||0)+1;},async resolve(){}}};
  Orbital.Navigation.onCloudReady();Orbital.Cloud.sync.setUser('delayed-synthetic-pilot');
  return {ours:A.profile.credits,other:other.credits,persisted:JSON.parse(localStorage.getItem('orbital-courier-save-v8')).credits};
 });
 expect(result.persisted).toBe(result.other);expect(result.ours).toBeLessThan(result.other);
 await expect(page.locator('body')).toHaveAttribute('data-local-save-conflict','true');
 expect(await page.evaluate(()=>Orbital.Cloud.sync.uid)).toBeNull();
 await page.evaluate(()=>Orbital.Cloud.sync.sync());expect(await page.evaluate(()=>Orbital.Cloud.sync.writes||0)).toBe(0);
 await page.locator('[data-action="pages:use-this"]').click();
 await expect(page.locator('body')).not.toHaveAttribute('data-local-save-conflict','true');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-courier-save-v8')).credits)).toBe(result.ours);
 const otherBackup=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-courier-tab-backups')).at(-1).other);
 expect(JSON.parse(otherBackup).credits).toBe(result.other);
 expect(await page.evaluate(()=>Orbital.Cloud.sync.uid)).toBe('delayed-synthetic-pilot');
});

test('failed storage keeps unsaved progress in this document and cancels modified navigation',async({page,context,browser})=>{
 await page.goto(base+'hangar/');
 const credits=await page.evaluate(()=>{
  Orbital.App.profile.credits+=40;
  window.originalPageSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key==='orbital-courier-save-v8')throw new DOMException('Synthetic quota','QuotaExceededError');return window.originalPageSetItem.call(this,key,value);};
  return Orbital.App.profile.credits;
 });
 const destination=page.locator('.topbar nav a[data-page=awards]');
 await destination.click();await expect(page).toHaveURL(new RegExp('/hangar/$'));
 await expect(page.locator('#modal')).toContainText('Не удалось сохранить прогресс');
 expect(await page.evaluate(()=>Orbital.App.profile.credits)).toBe(credits);
 await page.locator('#modal .modal-close').click();
 await destination.click({modifiers:['Control']});
 await expect(page.locator('#modal')).toContainText('Не удалось сохранить прогресс');
 expect(context.pages()).toHaveLength(1);await expect(page).toHaveURL(new RegExp('/hangar/$'));
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="pages:export"]').click()]);
 const exported=JSON.parse(require('node:fs').readFileSync(await download.path(),'utf8'));
 expect(exported.credits).toBe(credits);expect(exported.version).toBe(8);
 await page.locator('[data-action="pages:retry-save"]').click();await expect(page.locator('#modal')).toBeVisible();
 await page.evaluate(()=>{Storage.prototype.setItem=window.originalPageSetItem;});
 await page.locator('[data-action="pages:retry-save"]').click();await expect(page.locator('#modal')).not.toBeVisible();
 const saved=await page.evaluate(resources);await destination.click();await expect(page).toHaveURL(new RegExp('/awards/$'));
 expect(await page.evaluate(resources)).toBe(saved);

 // A completely fresh, stateless profile can still navigate with storage off.
 const empty=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:768}});
 try{
  const clean=await empty.newPage();await clean.goto('http://127.0.0.1:4173'+base);
  await clean.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='orbital-courier-save-v8')throw new DOMException('Synthetic blocked storage','SecurityError');return original.call(this,key,value);};});
  await clean.locator('.topbar nav a[data-page=awards]').click();await expect(clean).toHaveURL(new RegExp('/awards/$'));
 }finally{await empty.close();}
});

test('a changed incoming profile requires a new exact backup when backup storage is full',async({page})=>{
 await page.goto(base+'hangar/');
 const copies=await page.evaluate(()=>{
  const A=Orbital.App,other=structuredClone(A.profile);other.credits+=100;
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key==='orbital-courier-tab-backups')throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,key,value);};
  localStorage.setItem('orbital-courier-save-v8',JSON.stringify(other));A.profile.credits+=10;A.save();
  return {local:A.profile.credits,other:other.credits};
 });
 await expect(page.locator('body')).toHaveAttribute('data-local-save-conflict','true');
 for(const action of ['pages:backup-this','pages:backup-other'])await Promise.all([page.waitForEvent('download'),page.locator('[data-action="'+action+'"]').click()]);
 const newest=await page.evaluate(()=>{const other=JSON.parse(localStorage.getItem('orbital-courier-save-v8'));other.credits+=100;localStorage.setItem('orbital-courier-save-v8',JSON.stringify(other));return other.credits;});
 await page.locator('[data-action="pages:use-this"]').click();
 await expect(page.locator('body')).toHaveAttribute('data-local-save-conflict','true');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-courier-save-v8')).credits)).toBe(newest);
 expect(newest).toBeGreaterThan(copies.other);
 const [updatedDownload]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="pages:backup-other"]').click()]);
 expect(JSON.parse(require('node:fs').readFileSync(await updatedDownload.path(),'utf8')).credits).toBe(newest);
 await page.locator('[data-action="pages:use-this"]').click();
 await expect(page.locator('body')).not.toHaveAttribute('data-local-save-conflict','true');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-courier-save-v8')).credits)).toBe(copies.local);
});

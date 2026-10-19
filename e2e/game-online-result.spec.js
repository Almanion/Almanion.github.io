'use strict';
const {test,expect}=require('@playwright/test');
for(const width of [390,1366])test('online completion keeps its final frame and rewards across the next document '+width,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/games/orbital-courier/flight/?contract=4');
 await expect(page.locator('body')).toHaveAttribute('data-page','play');
 const expected=await page.evaluate(()=>{
  const O=Orbital,A=O.App,P=O.Physics,l=A.level(),q=l.solution;
  A.profile.settings.sound=false;A.profile.settings.reducedMotion=true;A.setAim(q.angle,q.speed);A.launch();let ticks=0;
  while(A.state.status==='flying'){
   const old=A.state;A.state=P.step(old,l);O.Review.observe(old,A.state,l);
   if(++ticks%3===0||A.state.status!=='flying')A.trail.push({x:A.state.x,y:A.state.y,t:A.state.t});
  }
  if(A.state.status!=='won')throw Error('The authored route must deliver');
  A.finish();
  const profile=O.Progress.sanitize(A.profile);delete profile.lastLevel;return profile;
 });
 const canvas=page.locator('#resultDockingCanvas');await expect(canvas).toHaveAttribute('data-ready','true');
 await expect(canvas).toBeInViewport();
 await page.locator('.completion-docking-button').click();await expect(page.locator('#dockingDetailCanvas')).toHaveAttribute('data-ready','true');
 await page.locator('#modal .modal-actions [data-action=close]').click();
 await expect(page.locator('#resultNext')).toHaveAttribute('href','/games/orbital-courier/flight/?contract=5');
 await page.locator('#resultNext').click();await expect(page).toHaveURL(/flight\/\?contract=5$/);
 const restored=await page.evaluate(()=>{const p=Orbital.Progress.sanitize(Orbital.App.profile);delete p.lastLevel;return p;});
 expect(restored).toEqual(expected);
 expect(await page.evaluate(()=>Orbital.App.currentId)).toBe(5);
 await expect(page.locator('#gameCanvas')).toBeVisible();
});

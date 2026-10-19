'use strict';
const {test,expect}=require('@playwright/test');
const base='/games/orbital-courier/';
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});

for(const width of [390,1366])test('catalogue explains count and predecessor access with two starting choices '+width,async({page},info)=>{
 await page.setViewportSize({width,height:844});
 await page.goto(base+'contracts/');
 await expect(page.locator('#campaignTotal')).toContainText('/ 76');
 const initial=await page.locator('a[data-action=mission]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.id));
 expect(initial).toEqual([4,8]);
 await expect(page.locator('#campaignAccess')).toContainText('2 новых контракта');
 await page.locator('[data-action=contract-filter][data-filter=all]').click();
 await expect(page.locator('[data-action=mission]')).toHaveCount(76);
 for(const id of [0,1,2,3])await expect(page.locator('[data-action=mission][data-id="'+id+'"]')).toHaveCount(0);
 await expect(page.locator('[data-action=mission][data-id="5"]')).toBeDisabled();
 await expect(page.locator('[data-action=mission][data-id="5"] .mission-status')).toContainText('После');
 await expect(page.locator('[data-action=mission][data-id="12"] .mission-status')).toContainText('2');
 await page.screenshot({path:info.outputPath('campaign-access.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 // Solve two independently available contracts, without fabricating records or rewards.
 await page.evaluate(()=>{
  const O=Orbital,A=O.App;
  for(const id of [4,8]){
   const l=O.LEVELS[id],q=l.solution,s=O.Physics.simulate(O.Physics.prepareLevel(l),q.angle,q.speed).state;
   if(s.status!=='won')throw Error('Authored starting course must deliver');
   O.Progress.complete(A.profile,l,s);
  }
  A.save();
 });
 await page.reload();
 await page.locator('[data-action=available-contracts]').click();
 const choices=await page.locator('a[data-action=mission]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.id));
 for(const id of [5,9,12])expect(choices).toContain(id);
 expect(choices).not.toContain(6);
 await page.locator('a[data-action=mission][data-id="12"]').click();
 await expect(page).toHaveURL(/flight\/\?contract=12$/);
 expect(await page.evaluate(()=>Orbital.App.currentId)).toBe(12);
});

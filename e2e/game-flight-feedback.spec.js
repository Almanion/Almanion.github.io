'use strict';
const {test, expect} = require('@playwright/test');

for (const [width,height,edition] of [
  [1366,768,'flight/?contract=4'], [320,568,'offline.html'],
  [844,390,'flight/?contract=4'], [390,844,'flight/?contract=4']
]) {
  test.describe(`${width}x${height}`, () => {
    const mobile=width<1000;
    test.use({viewport:{width,height},hasTouch:mobile,isMobile:mobile,serviceWorkers:'block'});
    test('contract speed warning, recorded refusal and correction', async ({page},info) => {
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const activate=locator=>mobile?locator.tap():locator.click();
      await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
      await page.goto('http://127.0.0.1:4173/games/orbital-courier/'+edition);
      await page.evaluate(()=>{
        const O=Orbital, A=O.App;
        A.profile.settings.sound=false;
        A.profile.settings.reducedMotion=true;
        A.profile.campaignAccess=[41];
        A.loadLevel(41);
        A.setAim(-31.6,198);
        A.setPlaybackSpeed(10);
      });
      if(mobile)await activate(page.locator('#mobileReadout'));
      const slider=page.locator('#speedRange'),limit=page.locator('#launchLimit');
      await expect(limit).toContainText('Лимит старта по контракту — 198');
      await expect(limit.locator('button')).toBeHidden();
      await slider.focus();await slider.press('ArrowRight');
      await expect(limit).toHaveClass(/over-limit/);
      await activate(limit.locator('button'));
      await expect(slider).toHaveValue('198');await expect(slider).toBeFocused();
      await slider.press('End');await expect(slider).toHaveValue('250');
      if(mobile){
        await activate(page.locator('#flightDrawer .sheet-footer button'));
        await expect(page.locator('#mobileReadoutLabel')).toBeInViewport();
        await expect(page.locator('#mobileReadoutLabel')).toHaveText('Выше лимита 198 ед./с');
      }else await expect(limit.locator('button')).toBeInViewport();
      await activate(page.locator(mobile?'#mobileLaunch':'#launchButton'));
      await expect(page.locator('#resultTitle')).toHaveText('Слишком высокая скорость старта');
      await expect(page.locator('.failure-copy .failure-event')).toHaveText('Прибытие на станцию · 3,15 с');
      await expect(page.locator('.failure-copy dd')).toHaveText(['250 ед./с','198 ед./с']);
      await expect(page.locator('.failure-copy .failure-advice')).toBeInViewport();
      await expect(page.locator('#resultRetry')).toBeInViewport();
      await expect(page.locator('#resultDockingCanvas')).toHaveAttribute('data-ready','true');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({path:info.outputPath('refused-flight.png')});
      const profile=()=>page.evaluate(()=>JSON.stringify(Orbital.App.profile)), afterFlight=await profile();
      await activate(page.locator('#resultReview'));
      const range=page.locator('#reviewRange');
      await range.focus();await range.press('Home');
      expect(await page.evaluate(()=>Orbital.App.displayState().t)).toBe(0);
      await activate(page.locator('[data-action="v8:report"]'));
      const dialog=page.locator('#modal');
      await expect(dialog.locator('#modalTitle')).toHaveText('Слишком высокая скорость старта');
      await expect(dialog.locator('dd')).toHaveText(['250 ед./с','198 ед./с']);
      await expect(dialog.locator('.failure-event')).toContainText('3,15 с');
      await page.screenshot({path:info.outputPath('recorded-failure.png')});
      await activate(dialog.getByRole('button',{name:'Показать на записи'}));
      expect(await page.evaluate(()=>Orbital.App.displayState().t===Orbital.App.state.t)).toBe(true);
      await expect(range).toHaveAttribute('aria-valuetext','3,15 с');
      await expect(range).toBeFocused();
      if(mobile)await activate(page.locator('#resultBack'));
      else await activate(page.locator('[data-action="v8:report"]'));
      await activate(page.getByRole('button',{name:'Снизить до 198 ед./с',exact:true}));
      expect(await page.evaluate(()=>[Orbital.App.angle,Orbital.App.speed,Orbital.App.state])).toEqual([-31.6,198,null]);
      expect(await profile()).toEqual(afterFlight);
      await expect(page.locator('#mobileReadout.over-limit')).toHaveCount(0);
      await page.evaluate(()=>Orbital.App.loadLevel(4));
      await expect(page.locator('#launchLimit')).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
}

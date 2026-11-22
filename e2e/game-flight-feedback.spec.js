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

    test('missed gate on the map, two recorded attempts and return to the course', async ({page},info) => {
      const activate=locator=>mobile?locator.tap():locator.click();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
      await page.goto('http://127.0.0.1:4173/games/orbital-courier/'+edition);
      await page.evaluate(()=>{
        const A=Orbital.App;
        A.profile.settings.sound=false;
        A.profile.settings.reducedMotion=true;
        A.profile.campaignAccess=[43];
        A.loadLevel(43);
        A.setPlaybackSpeed(2);
        A.setAim(-12.4,215);
      });
      const launch=page.locator(mobile?'#mobileLaunch':'#launchButton');
      const goal=page.locator('#flightGoal'),mark=page.locator('#activeStepMark');
      await expect(goal).toContainText('Кольцо 1');
      await expect(mark).toHaveAttribute('data-kind','gate');
      await expect(mark).toHaveAttribute('data-mark','1');
      await activate(page.locator('#flightPlanOpen'));
      const planGoal=page.locator('#flightDrawer li[aria-current=step]');
      await expect(planGoal).toContainText('Кольцо 1');
      await expect(planGoal.locator('.goal-badge')).toHaveAttribute('data-mark','1');
      await activate(page.locator('#flightDrawer .sheet-footer button'));
      await page.evaluate(()=>{
        Orbital.App.camera={zoom:4,cx:1100,cy:120};
        Orbital.UI9.clampCamera();
      });
      await activate(goal);
      expect(await page.evaluate(()=>{
        const {App,UI9}=Orbital,{point}=App.flightGuide().targets[0],screen=UI9.worldToScreen(point.x,point.y);
        const bounds=document.querySelector('#gameCanvas').getBoundingClientRect();
        return [App.angle,App.speed,App.state,bounds.left<screen.x&&screen.x<bounds.right&&bounds.top<screen.y&&screen.y<bounds.bottom];
      })).toEqual([-12.4,215,null,true]);
      await page.screenshot({path:info.outputPath('target-on-map.png')});
      await page.waitForFunction(()=>document.getElementById('flightGoal')&&!Orbital.App.transitioning);
      await Promise.all([
        page.waitForFunction(()=>document.getElementById('activeStep').textContent==='Кольцо 2'),
        activate(launch)
      ]);
      await expect(page.locator('#resultScreen')).toHaveAttribute('data-outcome','won');
      await activate(page.locator('#resultReview'));
      const gateTime=await page.evaluate(()=>Orbital.Review.active.data.frames.find(frame=>frame.gateIndex===1).t);
      await page.locator('#reviewRange').fill(String(Math.ceil(gateTime*100+2)/100));
      await expect(page.locator('#reviewStepLabel')).toHaveText('Кольцо 2');
      await expect(page.locator('#reviewStepMark')).toHaveAttribute('data-mark','2');
      await activate(page.locator('#resultBack'));
      await activate(page.locator('#resultRetry'));
      await page.evaluate(()=>{Orbital.App.setAim(-18.4,150);Orbital.App.setPlaybackSpeed(50);});
      await activate(launch);
      await expect(page.locator('#resultTitle')).toHaveText('Пропущено контрольное кольцо');

      const saved=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
      const mapAction=page.getByRole('button',{name:'Ошибка на карте'});
      await activate(mapAction);
      const marker=page.locator('#reviewPin'),range=page.locator('#reviewRange');
      await expect(marker).toBeInViewport();
      await expect(page.locator('#reviewEventNote')).toContainText('Кольцо 1 · ближайший подлёт');
      await expect(page.locator('#reviewStepMark')).toHaveAttribute('data-mark','1');
      await expect(marker.locator('.goal-badge')).toHaveAttribute('data-kind','gate');
      await expect(marker.locator('.goal-badge')).toHaveAttribute('data-mark','1');
      await expect(range).toHaveAttribute('aria-valuetext','1,41 с');
      const markerDistance=await marker.evaluate(el=>{
        const {x,y}=Orbital.Review.active.data.event;
        const point=Orbital.UI9.worldToScreen(x,y), bounds=el.getBoundingClientRect();
        return Math.hypot(point.x-bounds.x-bounds.width/2,point.y-bounds.y-bounds.height/2);
      });
      expect(markerDistance).toBeLessThan(1);
      expect(await page.evaluate(()=>Orbital.App.state.t)).toBeGreaterThan(5);
      await range.fill('0');
      await expect(range).toHaveAttribute('aria-valuetext','0,00 с');
      await activate(marker);
      await expect(range).toHaveAttribute('aria-valuetext','1,41 с');

      const compare=page.getByRole('button',{name:'Сравнить',exact:true});
      await activate(compare);
      await expect(compare).toHaveAttribute('aria-pressed','true');
      await expect(page.locator('.review-attempt.current')).toHaveText(/Текущая.*-18,4° · 150 ед\.\/с/);
      await expect(page.locator('.review-attempt.previous')).toHaveText(/Предыдущая.*-12,4° · 215 ед\.\/с/);
      await expect(page.locator('.review-change b')).toHaveText('-6° · -65 ед./с');
      await expect(page.locator('#reviewComparison')).toBeInViewport();
      expect(await page.evaluate(()=>{
        const {Review,UI9}=Orbital, frame=Review.renderModel();
        const bounds=document.getElementById('gameCanvas').getBoundingClientRect();
        return frame.trail===Review.active.data.points&&frame.ghost===Review.prior().points&&
          frame.ghostState.t<=frame.state.t&&[...frame.trail,...frame.ghost].every(point=>{
            const p=UI9.worldToScreen(point.x,point.y);
            return p.x>=bounds.left&&p.x<=bounds.right&&p.y>=bounds.top&&p.y<=bounds.bottom;
          });
      })).toBe(true);
      await page.screenshot({path:info.outputPath('comparison-on-map.png')});
      await activate(page.locator('#reviewEvent'));
      await expect(marker).toBeInViewport();
      const backToCourse=page.getByRole('button',{name:'К курсу →'});
      await expect(backToCourse).toBeInViewport();
      if(mobile){
        for(const button of [marker,compare,page.locator('#reviewEvent'),backToCourse]){
          const box=await button.boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
      await activate(compare);
      await expect(page.locator('#reviewComparison')).toBeHidden();
      await activate(backToCourse);
      await expect(launch).toBeVisible();
      await expect(marker).toBeHidden();
      expect(await page.evaluate(()=>[Orbital.App.angle,Orbital.App.speed,Orbital.App.state])).toEqual([-18.4,150,null]);
      expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(saved);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      await page.evaluate(()=>Orbital.App.loadLevel(4));
      await activate(page.locator('#modeChip'));
      await expect(page.locator('#activeStep')).toHaveText('Груз · Нужен 1 из 3');
      expect(await page.evaluate(()=>Orbital.App.flightGuide().targets.length)).toBe(3);
      expect(errors).toEqual([]);
    });
  });
}

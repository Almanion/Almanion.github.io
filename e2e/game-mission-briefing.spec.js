'use strict';
const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/games/orbital-courier/offline.html');
  await page.evaluate(()=>{
    const {App:A,Campaign}=Orbital;
    A.profile.campaignAccess=Campaign.order.slice();
    Object.assign(A.profile.settings,{sound:false,reducedMotion:true});
  });
});

test('every contract shows its applicable limits and three illustrated medal targets on a laptop',async({page})=>{
  await page.setViewportSize({width:1024,height:600});
  const failures=await page.evaluate(()=>{
    const {App:A,Campaign,Physics:P,Medals}=Orbital,errors=[];
    for(const mode of ['normal','pro'])for(const id of Campaign.order){
      A.profile.difficulty=mode;
      A.loadLevel(id);
      const {route,required}=A.flightGuide().plan;
      const expected=['time','radius'];
      if(route.gates.length)expected.push('gate');
      if(route.flybys?.length)expected.push('flyby');
      if(route.portalOrder?.length)expected.push('portal');
      if(route.stops?.length)expected.push('stop');
      if(route.activeBranch)expected.push('branch');
      if(route.placement)expected.push('placement');
      if(required)expected.push('cargo');
      if(route.rules.maxLaunchSpeed)expected.push('launch');
      if(route.rules.maxDockSpeed)expected.push('approach');
      expected.push(...P.receptionWindows(route).map(()=>'window'));
      const strip=document.querySelector('#play>.mission-briefing').getBoundingClientRect();
      const facts=[...document.querySelectorAll('#strictRules li')];
      const medals=[...document.querySelectorAll('#objectivesList .medal-card')];
      const inside=element=>{
        const r=element.getBoundingClientRect();
        return r.width>0&&r.height>0&&r.left>=strip.left-1&&r.right<=strip.right+1&&
          r.top>=strip.top-1&&r.bottom<=strip.bottom+1;
      };
      if(A.currentId!==id||facts.map(f=>f.dataset.rule).sort().join()!==expected.sort().join()||
        medals.map(m=>m.querySelector('svg').dataset.medalArt).join()!==Medals.rules(route).map(m=>m.type).join()||
        ![...facts,...medals].every(item=>inside(item.querySelector('svg'))&&inside(item.querySelector('span')))||
        strip.height>84||document.documentElement.scrollWidth>innerWidth){
        errors.push({id,mode,height:strip.height,actual:facts.map(f=>f.innerText),expected});
      }
    }
    return errors;
  });
  expect(failures).toEqual([]);
});

test('briefing follows the selected branch, mode and equipped docking module',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.evaluate(()=>Orbital.App.loadLevel(20));
  const facts=page.locator('#strictRules');
  await expect(facts).toContainText('Ветвь A');
  await expect(facts).toContainText('Груз ≥ 3');
  await page.locator('#flightPlanOpen').click();
  await page.locator('#branchPicker [data-branch=B]').click();
  await expect(page.locator('#flightDrawer #strictRules')).toContainText('Ветвь B');
  await page.locator('#flightDrawer .sheet-footer button').click();
  await expect(page.locator('#play #strictRules')).toContainText('Ветвь B');
  await expect(facts.locator('[data-rule=flyby]')).toContainText('↺ 185°');

  await page.evaluate(()=>{
    const A=Orbital.App;
    A.profile.upgrades.docking=3;
    A.loadLevel(91);
  });
  await page.locator('#modeChip').click();
  const radius=await page.evaluate(()=>Orbital.Physics.captureRadius(Orbital.App.level(),Orbital.App.stats()).toLocaleString('ru-RU'));
  await expect(facts.locator('[data-rule=radius]')).toHaveText('Радиус дока '+radius+' ед.');
  await expect(facts).toContainText('Груз ≥ 1');
  await expect(facts).toContainText('Сближение ≤ 55 ед./с');
  await expect(facts).toContainText('Полёт ≤ 10,5 с');
  await expect(page.locator('#medal-cargo .medal-target')).toHaveText('Весь груз · 3');
  const medal=page.getByRole('button',{name:/Точный заход/});
  await medal.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#modal')).toContainText('Точность стыковки ≥ 65%');
});

test('desktop delay can be dragged, fine-tuned and reset next to Start, including after resize',async({page})=>{
  await page.setViewportSize({width:1024,height:600});
  await page.evaluate(()=>Orbital.App.loadLevel(88));
  const range=page.getByRole('slider',{name:'Отложить старт'}),later=page.locator('#launchLater');
  const earlier=page.locator('#launchEarlier'),reset=page.locator('#launchDelayReset');
  const launch=page.locator('#launchButton'),forecast=page.locator('#launchForecast');
  await expect(earlier).toBeDisabled();
  await expect(reset).toBeDisabled();
  const [timer,button,slider]=await Promise.all([page.locator('#launchTiming').boundingBox(),launch.boundingBox(),range.boundingBox()]);
  expect(timer.y+timer.height).toBeLessThanOrEqual(button.y);
  expect(button.y-timer.y-timer.height).toBeLessThan(12);
  expect(button.y+button.height).toBeLessThanOrEqual(600);
  await page.mouse.move(slider.x+11,slider.y+slider.height/2);
  await page.mouse.down();
  await page.mouse.move(slider.x+slider.width/2,slider.y+slider.height/2,{steps:6});
  await page.mouse.up();
  await expect(range).toHaveValue('2.5');
  await expect(forecast).toContainText('Стыковка');
  await later.click();
  await expect(range).toHaveValue('2.6');
  await expect(launch).toHaveText('Старт +2,6 с');
  await earlier.click();
  await expect(range).toHaveValue('2.5');
  await range.press('End');
  await expect(later).toBeDisabled();
  await expect(forecast).toContainText('Промах');
  await reset.focus();
  await reset.press('Enter');
  await expect(range).toHaveValue('0');
  await expect(launch).toHaveText('Старт');
  await expect(range).toBeFocused();
  await range.press('ArrowRight');
  await expect(range).toHaveValue('0.1');
  await page.setViewportSize({width:390,height:844});
  const mobile=page.getByRole('slider',{name:'Старт через'});
  await expect(mobile).toBeInViewport();
  await expect(mobile).toHaveValue('0.1');
  await page.setViewportSize({width:1366,height:768});
  await expect(range).toBeFocused();
  await expect(page.locator('.panel-actions #launchDelayRange')).toHaveCount(1);
  await page.evaluate(()=>Orbital.App.loadLevel(4));
  await expect(page.locator('#launchTiming')).toBeHidden();
  await expect(launch).toHaveText('Старт');
});

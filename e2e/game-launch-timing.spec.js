'use strict';
const {test,expect}=require('@playwright/test');
const {LEVELS}=require('../game-source/orbital-courier/src/levels');
const G=require('../game-source/orbital-courier/src/progression');
const P=require('../game-source/orbital-courier/src/physics');
const base='/games/orbital-courier/';
const profile=G.fresh();
for(const id of Orbital.Campaign.order.slice(0,12)){
  const level=LEVELS[id],q=level.solution;
  G.complete(profile,level,P.simulate(P.prepareLevel(level),q.angle,q.speed,G.stats(profile)).state);
}
Object.assign(profile.settings,{reducedMotion:true,sound:false,playbackSpeed:4});
const completedWatch=structuredClone(profile);
for(const id of [88,89]){
  const level=LEVELS[id],q=level.solution,prepared=P.prepareLevel(level,'normal',q.layout,q.launchDelay);
  G.complete(completedWatch,level,P.simulate(prepared,q.angle,q.speed,G.stats(completedWatch)).state);
}
const completedPair=structuredClone(completedWatch);
const pair=LEVELS[90],early=pair.earlySolution;
G.complete(completedPair,pair,P.simulate(P.prepareLevel(pair,'normal',undefined,early.launchDelay),
  early.angle,early.speed,G.stats(completedPair)).state);

async function seed(page,initial=profile){
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({key,profile})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(profile));
  },{key:G.SAVE_KEY,profile:initial});
}

async function chooseLaunchTime(page,range,seconds,touch){
  const r=await range.boundingBox();
  expect(r.height).toBeGreaterThanOrEqual(44);
  const x=11+(r.width-22)*seconds/5;
  if(touch)await page.touchscreen.tap(r.x+x,r.y+r.height/2);
  else await range.click({position:{x,y:r.height/2}});
}

async function chooseCourse(page,touch,{angle,speed}){
  if(touch)await page.locator('#mobileReadout').tap();
  for(const [id,value] of [['angleInput',angle],['speedInput',speed]]){
    const field=page.locator('#'+id);
    await field.fill(String(value));
    await field.press('Enter');
  }
  if(touch)await page.locator('#flightDrawer .sheet-footer button').tap();
}

async function expectUncovered(item){
  await expect(item).toBeInViewport();
  expect(await item.evaluate(tag=>{
    // Mobile legends normally let taps pass through to the map.
    const r=tag.getBoundingClientRect();
    tag.style.pointerEvents='auto';
    const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    tag.style.removeProperty('pointer-events');
    return tag.contains(top);
  })).toBe(true);
}

for(const [width,height] of [[1366,768],[320,568],[568,320],[390,844]]){
  const touch=width<1000;
  test.describe(`timed rendezvous ${width}×${height}`,()=>{
    test.use({viewport:{width,height},hasTouch:touch,isMobile:touch});
    test('start time moves the forecast and changes the actual flight',async({page},info)=>{
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await seed(page);
      await page.goto(base+'contracts/');
      const activate=target=>touch?target.tap():target.click();
      const card=page.getByRole('link',{name:'Попутный док',exact:true});
      await expect(card).toBeVisible();
      await activate(card);
      await expect(page.locator('#flightTitle')).toHaveText('Попутный док');
      const range=page.getByRole('slider',{name:touch?'Старт через':'Отложить старт'}),forecast=page.locator('#launchForecast');
      const launch=page.locator(touch?'#mobileLaunch':'#launchButton');
      await expect(range).toHaveValue('0');
      await expect(forecast).toContainText('Промах');
      const start=await page.evaluate(()=>Orbital.App.preview.rendezvous.station);
      if(!touch){
        await range.focus();
        await page.keyboard.press('ArrowRight');
        await expect(range).toHaveValue('0.1');
        await page.keyboard.press('Home');
      }
      await activate(launch);
      await expect(range).toBeHidden();
      await expect(page.locator('#resultTitle')).toHaveText('Капсула и док разминулись');
      expect(await page.evaluate(()=>Orbital.Review.active.data.event.goal.kind)).toBe('dock');
      await activate(page.locator('#resultRetry'));
      await expect(range).toHaveValue('0');
      const r=await range.boundingBox();
      expect(r.height).toBeGreaterThanOrEqual(44);
      if(touch)await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);
      else await range.click({position:{x:r.width/2,y:r.height/2}});
      await expect(range).toHaveValue('2.5');
      await expect(forecast).toContainText('Стыковка');
      const plan=await page.evaluate(()=>{
        const {App:A,UI9}=Orbital,{ship,station}=A.preview.rendezvous;
        const p=UI9.worldToScreen(station.x,station.y),r=document.getElementById('gameCanvas').getBoundingClientRect();
        return {angle:A.angle,speed:A.speed,station,t:ship.t,onMap:p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom,height:r.height,overflow:document.documentElement.scrollWidth-innerWidth};
      });
      expect(plan).toMatchObject({angle:.6,speed:203,onMap:true,overflow:0});
      expect(plan.height).toBeGreaterThan(130);
      expect(Math.hypot(plan.station.x-start.x,plan.station.y-start.y)).toBeGreaterThan(100);
      await page.screenshot({path:info.outputPath('rendezvous-planning.png')});
      await activate(launch);
      await expect(page.locator('#resultScreen')).toHaveAttribute('data-outcome','won');
      await expect(page.locator('.completion-delay')).toHaveText('Старт +2,5 с');
      expect(await page.evaluate(()=>Orbital.App.state.t)).toBeCloseTo(plan.t,9);
      await activate(page.locator('#resultReview'));
      await activate(page.getByRole('button',{name:'Сравнить',exact:true}));
      await expect(page.locator('.review-attempt.current')).toContainText('старт +2,5 с');
      await expect(page.locator('.review-attempt.previous')).toContainText('старт +0,0 с');
      expect(await page.evaluate(()=>Orbital.Review.renderModel().ghostStation?.x)).toBeGreaterThan(900);
      expect(errors).toEqual([]);
    });

    test('смена вахты requires a new course and a start within the docking schedule',async({page},info)=>{
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      const activate=target=>touch?target.tap():target.click();
      const range=page.locator('#launchDelayRange'),forecast=page.locator('#launchForecast');
      const launch=page.locator(touch?'#mobileLaunch':'#launchButton');
      const schedule=page.locator(touch?'#dockSchedule':'#strictRules [data-rule=window]');
      const pro=width===568;
      await seed(page);
      await page.goto(base+'flight/?contract=88');
      await expect(schedule).toBeHidden();
      await chooseLaunchTime(page,range,2.5,touch);
      await expect(forecast).toContainText('Стыковка');
      await activate(launch);
      const next=page.locator('#resultNext');
      await expect(next).toHaveAccessibleName(/Смена вахты/);
      await activate(next);
      await expect(page.locator('#flightTitle')).toHaveText('Смена вахты');
      if(pro)await activate(page.locator('#modeChip'));
      await expect(schedule).toHaveText(pro?'Приём 8,42–9,28 с':'Приём 8,25–9,45 с');
      await expectUncovered(schedule);
      await expect(range).toHaveValue('0');
      await chooseLaunchTime(page,range,4.1,touch);
      await expect(forecast).toContainText('Промах');
      await chooseLaunchTime(page,range,0,touch);
      await expect(range).toHaveValue('0');

      if(touch)await activate(page.locator('#mobileReadout'));
      const angle=page.locator('#angleInput');
      await angle.fill('3');
      await angle.press('Enter');
      if(touch)await activate(page.locator('#flightDrawer .sheet-footer button'));
      await expect(forecast).toContainText('Шлюз закрыт');
      await activate(launch);
      await expect(page.locator('#dockSchedule')).toBeHidden();
      await expect(page.locator('#resultTitle')).toHaveText('Шлюз ещё закрыт');
      await expect(page.locator('.failure-facts')).toContainText('По часам сектора');
      expect(await page.evaluate(()=>Orbital.Review.active.data.event.goal.kind)).toBe('dock');
      await activate(page.locator('#resultRetry'));
      await chooseLaunchTime(page,range,4.1,touch);
      await expect(forecast).toContainText('Стыковка');

      const plan=await page.evaluate(()=>{
        const {App:A,UI9,Physics}=Orbital,{ship,receptionArcs:[receptionArc]}=A.preview.rendezvous;
        const r=document.getElementById('gameCanvas').getBoundingClientRect();
        return {angle:A.angle,speed:A.speed,t:ship.t,arrival:Physics.stationTime(A.level(),ship.t),
          overflow:document.documentElement.scrollWidth-innerWidth,
          arcOnMap:receptionArc.every(point=>{
            const p=UI9.worldToScreen(point.x,point.y);
            return p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;
          })};
      });
      expect(plan).toMatchObject({angle:3,speed:200,overflow:0,arcOnMap:true});
      expect(plan.arrival).toBeGreaterThan(8.42);
      expect(plan.arrival).toBeLessThan(9.28);
      const selected=await page.locator('#launchDelayValue').textContent();
      await page.screenshot({path:info.outputPath('watch-change-planning.png')});
      await activate(launch);
      await expect(page.locator('#resultScreen')).toHaveAttribute('data-outcome','won');
      await expect(page.locator('.completion-delay')).toHaveText('Старт +'+selected);
      await expect(page.locator('#resultNext')).toHaveAccessibleName(/Два окна/);
      expect(await page.evaluate(()=>Orbital.App.state.t)).toBeCloseTo(plan.t,9);
      await activate(page.locator('#resultReview'));
      await activate(page.getByRole('button',{name:'Сравнить',exact:true}));
      await expect(page.locator('.review-attempt.current')).toContainText('старт +'+selected);
      await expect(page.locator('.review-attempt.previous')).toContainText('старт +0,0 с');
      expect(errors).toEqual([]);
    });

    test('two windows accept separate routes and acknowledge the extra cargo',async({page},info)=>{
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await seed(page,completedWatch);
      await page.goto(base+'flight/?contract=90');
      await expect(page.locator('#flightTitle')).toHaveText('Два окна');
      const activate=target=>touch?target.tap():target.click();
      const launch=page.locator(touch?'#mobileLaunch':'#launchButton');
      const range=page.locator('#launchDelayRange'),forecast=page.locator('#launchForecast');
      const slots=page.locator(touch?'#dockSchedule .dock-slot':'#strictRules [data-rule=window]');
      if(width===568||width===390)await activate(page.locator('#modeChip'));
      await expect(slots).toHaveCount(2);
      await expect(slots.first()).toContainText('Раннее окно');
      await expect(slots.last()).toContainText('Позднее окно');
      for(const slot of await slots.all())await expectUncovered(slot);

      await chooseCourse(page,touch,{angle:-41,speed:164});
      await chooseLaunchTime(page,range,3.3,touch);
      await expect(forecast).toContainText('Между окнами');
      await activate(launch);
      await expect(page.locator('#resultTitle')).toHaveText('Подлёт между окнами');
      await expect(page.locator('.failure-facts')).toContainText('Позднее окно');
      expect(await page.evaluate(()=>Orbital.Review.active.data.event.goal.kind)).toBe('dock');
      await activate(page.locator('#resultRetry'));

      let shortTime=0;
      for(const [i,{course,window}] of [
        {course:LEVELS[90].earlySolution,window:'Раннее окно'},
        {course:LEVELS[90].solution,window:'Позднее окно'}
      ].entries()){
        await chooseCourse(page,touch,course);
        await chooseLaunchTime(page,range,course.launchDelay,touch);
        await expect(forecast).toContainText(window);
        const plan=await page.evaluate(()=>{
          const {App:A,UI9}=Orbital,{receptionArcs}=A.preview.rendezvous,r=document.getElementById('gameCanvas').getBoundingClientRect();
          const legend=document.getElementById('dockSchedule').getBoundingClientRect();
          return {elapsed:A.preview.state.t,cargo:A.preview.state.cargo.length,overflow:document.documentElement.scrollWidth-innerWidth,
            arcsOnMap:receptionArcs.length===2&&receptionArcs.flat().every(point=>{
              const p=UI9.worldToScreen(point.x,point.y);
              const covered=p.x>=legend.left&&p.x<=legend.right&&p.y>=legend.top&&p.y<=legend.bottom;
              return !covered&&p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;
            })};
        });
        expect(plan).toMatchObject({cargo:i+1,overflow:0,arcsOnMap:true});
        await page.screenshot({path:info.outputPath(i?'late-window.png':'early-window.png')});
        await activate(launch);
        await expect(page.locator('#resultScreen')).toHaveAttribute('data-outcome','won');
        await expect(page.locator('.completion-window')).toContainText(window);
        await expect(page.locator('#resultNext')).toHaveAccessibleName(/Дальний причал/);
        await expect(page.locator('.completion-facts > div').nth(1)).toContainText(`${i+1} / 2`);
        const {t,cargo}=await page.evaluate(()=>Orbital.App.state);
        expect(cargo).toHaveLength(i+1);
        expect(t).toBeCloseTo(plan.elapsed,9);
        if(i===0){shortTime=t;await activate(page.locator('#resultRetry'));}
        else expect(t).toBeGreaterThan(shortTime+1.5);
      }

      await activate(page.locator('#resultReview'));
      await activate(page.getByRole('button',{name:'Сравнить',exact:true}));
      await expect(page.locator('.review-attempt.current')).toContainText('Позднее окно');
      await expect(page.locator('.review-attempt.previous')).toContainText('Раннее окно');
      expect(errors).toEqual([]);
    });

    test('finale requires the flyby and reports the real relative docking speed',async({page},info)=>{
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await seed(page,completedPair);
      await page.goto(base+'flight/?contract=91');
      const activate=target=>touch?target.tap():target.click();
      const launch=page.locator(touch?'#mobileLaunch':'#launchButton'),range=page.locator('#launchDelayRange');
      const forecast=page.locator('#launchForecast'),limit=page.locator(touch?'#dockSchedule':'#strictRules [data-rule=approach]');
      await expect(page.locator('#flightTitle')).toHaveText('Дальний причал');
      if(width===568||width===390)await activate(page.locator('#modeChip'));
      await expect(limit).toHaveText('Сближение ≤ 55 ед./с');
      await expectUncovered(limit);
      await expect(page.locator('#activeStep')).toContainText('Облёт');
      await expect(forecast).toContainText('Нужен облёт');
      await activate(launch);
      await expect(page.locator('#resultTitle')).toHaveText('Не завершён облёт');
      await expect(page.locator('.failure-facts')).toContainText('225');
      expect(await page.evaluate(()=>Orbital.Review.active.data.event.goal.kind)).toBe('flyby');
      await activate(page.locator('#resultRetry'));

      await chooseCourse(page,touch,LEVELS[91].solution);
      await chooseLaunchTime(page,range,2.4,touch);
      await expect(forecast).toContainText('Быстро');
      const fast=await page.evaluate(()=>Orbital.App.preview.state.dockSpeed);
      expect(fast).toBeGreaterThan(55);
      const fastDelay=await page.locator('#launchDelayValue').textContent();
      await page.screenshot({path:info.outputPath('fast-approach.png')});
      await activate(launch);
      await expect(page.locator('#resultTitle')).toHaveText('Слишком быстрый заход');
      await expect(page.locator('.failure-facts')).toContainText('Относительно станции');
      const refusal=await page.evaluate(()=>{
        const {App:A,Review}=Orbital;
        return {speed:A.state.dockSpeed,flyby:A.state.flybyIndex,event:Review.active.data.event.goal.kind};
      });
      expect(refusal).toEqual({speed:fast,flyby:1,event:'dock'});
      await activate(page.locator('#resultRetry'));

      await chooseLaunchTime(page,range,LEVELS[91].solution.launchDelay,touch);
      await expect(forecast).toContainText('Стыковка');
      const ready=await page.evaluate(()=>({
        angle:Orbital.App.angle,speed:Orbital.App.speed,dock:Orbital.App.preview.state.dockSpeed,
        overflow:document.documentElement.scrollWidth-innerWidth
      }));
      expect(ready).toMatchObject({angle:90,speed:110,overflow:0});
      expect(ready.dock).toBeLessThan(55);
      await page.screenshot({path:info.outputPath('pursuit-planning.png')});
      await activate(launch);
      await expect(page.locator('#resultScreen')).toHaveAttribute('data-outcome','won');
      await expect(page.locator('.completion-approach')).toContainText('Сближение');
      await expect(page.locator('#resultNext')).toHaveAccessibleName('Все маршруты');
      const result=await page.evaluate(()=>{
        const {dockSpeed,flybyIndex,cargo}=Orbital.App.state;
        return {dockSpeed,flybyIndex,cargo};
      });
      expect(result).toEqual({dockSpeed:ready.dock,flybyIndex:1,cargo:[0,1,2]});
      await activate(page.locator('#resultReview'));
      if(!touch)await expect(page.locator('#strictRules [data-rule=approach]')).toBeInViewport();
      await activate(page.getByRole('button',{name:'Сравнить',exact:true}));
      await expect(page.locator('.review-attempt.previous')).toContainText('старт +'+fastDelay);
      expect(errors).toEqual([]);
    });
  });
}

test('PRO training uses the correct epoch and online course memory survives navigation',async({page})=>{
  await seed(page);
  await page.goto(base+'flight/?contract=88');
  const range=page.locator('#launchDelayRange');
  await page.locator('#modeChip').click();
  await expect(page.locator('#modeChip')).toHaveAttribute('aria-pressed','true');
  await page.locator('.mode-info').click();
  await expect(page.locator('#modal .mode-facts b').filter({hasText:'7.0 с'})).toHaveCount(2);
  await page.getByRole('button',{name:'К полёту',exact:true}).click();
  await range.fill('2.5');
  await page.evaluate(()=>Orbital.App.storeCourse(0));
  await page.reload();
  await expect(range).toHaveValue('2.5');
  await range.fill('0');
  await page.evaluate(()=>Orbital.App.recallCourse(0));
  await expect(range).toHaveValue('2.5');
  await range.fill('5');
  await expect(page.locator('#launchForecast')).toContainText('Промах');
  const before=await page.evaluate(()=>({credits:Orbital.App.profile.credits,xp:Orbital.App.profile.xp}));
  await page.evaluate(()=>Orbital.App.applySolution());
  await expect(range).toHaveValue('2.6');
  await expect(page.locator('#launchForecast')).toContainText('Стыковка');
  await page.locator('#launchButton').click();
  await expect(page.locator('#resultScreen')).toHaveAttribute('data-outcome','training');
  expect(await page.evaluate(()=>{
    const {profile,state}=Orbital.App;
    return {credits:profile.credits,xp:profile.xp,mode:state.mode,medals:Orbital.Progress.record(profile,88).medals};
  })).toEqual({...before,mode:'pro',medals:0});
});

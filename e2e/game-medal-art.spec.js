'use strict';
const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/games/orbital-courier/offline.html');
});

test('all active contracts use the matching medal artwork without changing rewards',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const result=await page.evaluate(()=>{
  const O=Orbital,A=O.App;A.profile=O.Progress.fresh();A.profile.campaignAccess=O.Campaign.order.slice();A.profile.settings.sound=false;A.profile.settings.reducedMotion=true;
  const resources=()=>JSON.stringify([A.profile.credits,A.profile.data,A.profile.xp,A.profile.achievements,A.profile.upgrades]);
  const before=resources(),mismatches=[];
  for(const l of O.Campaign.order.map(id=>O.LEVELS[id])){
   A.loadLevel(l.id);
   const expected=O.Medals.rules(A.level()).map(r=>r.type);
   const actual=[...document.querySelectorAll('#objectivesList svg')].map(s=>s.dataset.medalArt);
   if(JSON.stringify(expected)!==JSON.stringify(actual))mismatches.push({id:l.id,expected,actual});
  }
  A.loadLevel(Orbital.Campaign.order[0]);const l=A.level(),q=l.solution;A.setAim(q.angle,q.speed);A.launch();
  while(A.state.status==='flying'){const s=A.state;A.state=O.Physics.step(s,l);O.Review.observe(s,A.state,l);}
  const unchanged=resources()===before;A.finish();
  return {contracts:O.Campaign.order.length,mismatches,unchanged,expected:O.Medals.rules(l).map(r=>r.type),actual:[...document.querySelectorAll('.completion-medal-icon svg')].map(s=>s.dataset.medalArt),status:A.state.status};
 });
 expect(result).toMatchObject({contracts:84,mismatches:[],unchanged:true,status:'won'});expect(result.actual).toEqual(result.expected);
 await expect(page.locator('.completion-medal-icon')).toHaveCount(3);
 for(const icon of await page.locator('.completion-medal-icon').all())await expect(icon).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 expect(errors).toEqual([]);
});

test('medal vectors remain distinct, bounded and reusable at small and large sizes',async({page},info)=>{
 await page.setViewportSize({width:1024,height:900});
 const art=await page.evaluate(()=>{
  const O=Orbital,types=O.MedalArt.types;
  const labels={delivery:'Доставка',economy:'Бережный импульс',cargo:'Полный груз',precision:'Точный заход',time:'В срок',branches:'Исследователь'};
  const board=document.createElement('section');board.id='medalBoard';board.style.cssText='position:fixed;inset:0;z-index:150;background:#09151f;padding:28px;overflow:auto;';
  board.innerHTML='<h2 style="font-size:25px;margin:0 0 8px">Знаки орбитальной почты</h2><p style="font-size:13px;color:#aec7d1;margin:0 0 24px">Шесть целей · единый рисунок · читаемые силуэты</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">'+types.map(type=>'<article class="medal-card" data-state="won" style="display:block;padding:20px"><h3 style="font-size:14px;margin:0 0 18px">'+labels[type]+'</h3><div style="display:flex;align-items:center;justify-content:space-around;gap:18px"><div style="width:80px;height:90px">'+O.MedalArt.svg(type)+'</div><div style="width:32px;height:36px">'+O.MedalArt.svg(type)+'</div></div><p style="font-size:11px;color:#95b4c0;margin:18px 0 8px">Цель не выполнена</p><div class="completion-medal" data-state="missed" style="border:0;padding:0;display:block"><div style="width:32px;height:36px">'+O.MedalArt.svg(type)+'</div></div></article>').join('')+'</div>';
  document.body.append(board);
  const shapes=[...board.querySelectorAll('svg')];
  return {types,unique:new Set(types.map(t=>O.MedalArt.svg(t))).size,ids:board.querySelectorAll('[id]').length,
   bounds:shapes.map(svg=>{const b=svg.getBBox(),v=svg.viewBox.baseVal;return {type:svg.dataset.medalArt,w:b.width,h:b.height,inside:b.x>=v.x-1&&b.y>=v.y-1&&b.x+b.width<=v.x+v.width+1&&b.y+b.height<=v.y+v.height+1,decorative:svg.getAttribute('aria-hidden')==='true'&&svg.getAttribute('focusable')==='false'};})};
 });
 expect(art.types).toHaveLength(6);expect(art.unique).toBe(6);expect(art.ids).toBe(0);
 for(const shape of art.bounds){expect(shape.inside,shape.type).toBe(true);expect(shape.decorative,shape.type).toBe(true);expect(shape.w).toBeGreaterThan(30);expect(shape.h).toBeGreaterThan(35);}
 await page.locator('#medalBoard').screenshot({path:info.outputPath('medal-vectors.png')});
});

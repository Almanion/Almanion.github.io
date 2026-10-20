/* Workshop presentation. Quotes, upgrade gates and receipts remain owned by
   Progress and the game's existing purchase confirmation. */
(function(root){
 'use strict';
 const O=root.Orbital,A=O.App,G=O.Progress,E=O.Economy,P=O.Physics,$=id=>document.getElementById(id);
 const keys=['scanner','magnet','docking','engine'],short={scanner:'Сканер',magnet:'Захват',docking:'Стыковка',engine:'Двигатель'};
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=n=>n.toLocaleString('ru-RU');
 const view={tab:'modules',module:'scanner',scene:'dock',model:null,skin:null,trail:null,finish:null,livery:null,last:{}};
 const skin=id=>G.SKINS.find(s=>s.id===id)||G.SKINS[0],trail=id=>O.Cosmetics.TRAILS.find(t=>t.id===id)||O.Cosmetics.TRAILS[0];
 const previewModel=()=>O.Fleet.find(view.model||A.profile.model),previewSkin=()=>skin(view.skin||A.profile.skin),previewTrail=()=>trail(view.trail||A.profile.trail);
 const appearance=()=>({skin:previewSkin().id,finish:view.finish||A.profile.finish||'satin',livery:view.livery||A.profile.livery||'panels'});
 const selection=()=>({model:previewModel().id,trail:previewTrail().id,...appearance()});
 const changed=()=>Object.entries(selection()).some(([k,v])=>A.profile[k]!==v);
 const applied=(item,type)=>A.profile[type]===item.id,available=(item,type)=>applied(item,type)||O.Cosmetics.unlocked(A.profile,item);
 let background=null;
 function enhance(){
  const p=A.profile,installed=G.installed(p),ledger=$('shopSummary').querySelector('.hangar-ledger');
  for(const key of ['model','skin','trail','finish','livery']){if(view[key]===null||view[key]===view.last[key])view[key]=p[key];view.last[key]=p[key];}
  if(ledger){
   const funds=ledger.querySelector('.hangar-funds');$('hangarFunds').innerHTML=funds.innerHTML;funds.remove();
   const note=document.createElement('p');note.className='hangar-price-note';note.textContent=`Монтаж: +${(installed*2.5).toFixed(1)}% к базовой цене. Скидка за исследования: ${(Math.min(.08,G.research(p)*.002)*100).toFixed(1)}%. Возврат — по фактическим чекам.`;
   ledger.querySelector('.hangar-tools').before(note);$('hangarServiceBody').replaceChildren(ledger);
  }
  $('shopSummary').innerHTML=`<div class="dock-scene-heading"><span><i></i> КАПСУЛА В ДОКЕ</span><div class="dock-scene-views" role="group" aria-label="Осмотр корабля"><button data-action="hangar:scene" data-scene="dock">Док</button><button data-action="hangar:scene" data-scene="trail">След в полёте</button></div></div><canvas id="hangarShip" aria-label="Капсула в освещённом орбитальном доке"></canvas><div class="dock-nameplate"><span>ОС—239 / ПОЧТОВЫЙ КУРЬЕР</span><strong id="dockShipName"></strong><small id="dockFittingState"></small></div><div class="dock-caption"><div><span id="dockSystemLabel"></span><strong id="dockSystemValue"></strong></div><span class="dock-license">${installed}<small>/ 20 ступеней</small></span></div>`;
  const id=A.shopLevel??A.currentId,mode=A.shopMode||p.difficulty,l=P.prepareLevel(O.LEVELS[id],mode),tabs=[];
  for(const key of keys){
   const d=G.UPGRADE_DEFS[key],q=G.quote(p,key),card=$('upgradeGrid').querySelector(`[data-module="${key}"]`);if(!card)continue;
   const art=card.querySelector('.module-art').innerHTML,next=Math.min(5,q.lv+1);
   card.dataset.available=q.canBuy?'yes':q.max?'max':'locked';card.style.setProperty('--module','#b8c9e3');
   card.id='hangar-module-'+key;card.setAttribute('role','tabpanel');card.setAttribute('aria-labelledby','hangar-tab-'+key);
   const badge=document.createElement('span');badge.className='module-status';badge.textContent=q.max?'Все ступени установлены':q.canBuy?'Готов к установке':!q.eligible?`Откроется за ${q.required} доставок`:'Нужны ресурсы';card.querySelector('.module-description').before(badge);
   card.querySelectorAll('.module-effect').forEach(e=>e.remove());
   const effect=document.createElement('div');effect.className='module-effect';let value;
   if(key==='scanner')value=`Прогноз ${mode==='pro'?'в PRO':'здесь'}: ${+(d.values[q.lv]*(mode==='pro'?.6:1)).toFixed(1)} → ${+(d.values[next]*(mode==='pro'?.6:1)).toFixed(1)} с`;
   if(key==='magnet')value=`Радиус захвата: ${d.values[q.lv]} → ${d.values[next]} ед.`;
   if(key==='docking'){const upgraded=structuredClone(p);upgraded.upgrades.docking=next;value=`Допуск станции: ${P.captureRadius(l,G.stats(p)).toFixed(1)} → ${P.captureRadius(l,G.stats(upgraded)).toFixed(1)} ед.`;}
   if(key==='engine')value=`Расчётный расход: ${Math.round((1-.03*q.lv)*100)}% → ${Math.round((1-.03*next)*100)}%`;
   if(key==='scanner'||key==='docking'){
    const values=[q.lv,next].map(tier=>{if(key==='scanner')return +(d.values[tier]*(mode==='pro'?.6:1)).toFixed(1);const candidate=structuredClone(p);candidate.upgrades.docking=tier;return +P.captureRadius(l,G.stats(candidate)).toFixed(1);});
    card.querySelectorAll('.module-spec strong').forEach((node,i)=>{node.innerHTML=`${values[i]}<small>${d.unit}</small>`;});
   }
   effect.textContent=q.max?'Система работает на полной мощности.':value;card.querySelector('.module-spec').after(effect);
   const plan=card.querySelector('.upgrade-plan'),total=[1,2,3,4,5].filter(t=>t>q.lv).reduce((n,t)=>n+E.price(key,t,installed+t-q.lv-1,G.research(p)),0);
   plan.innerHTML=`<summary>Ступени и цены <span aria-hidden="true">＋</span></summary><div class="price-table"><div><b>Ступень</b><b>Кредиты</b><b>Данные</b><b>Доставки</b></div>${[1,2,3,4,5].map(t=>`<div class="${t<=q.lv?'owned':t===q.lv+1?'next':''}"><span>${['I','II','III','IV','V'][t-1]}</span><span>${t<=q.lv?'✓':money(E.price(key,t,installed+t-q.lv-1,G.research(p)))}</span><span>${t<=q.lv?'—':E.DATA_COSTS[t-1]}</span><span>${E.TIER_UNLOCKS[t-1]}</span></div>`).join('')}</div>${!q.max?`<p>До V ступени: ${money(total)} ◈ при текущей скидке. Другие покупки изменят расчёт.</p>`:''}`;
   const footer=card.querySelector('.module-purchase'),scroll=document.createElement('div');scroll.className='module-detail-scroll';
   for(const child of [...card.children])if(child!==footer)scroll.append(child);card.replaceChildren(scroll,footer);
   tabs.push(`<button id="hangar-tab-${key}" data-action="hangar:module" data-key="${key}" role="tab" aria-controls="hangar-module-${key}"><span class="system-icon">${art}</span><strong>${short[key]}</strong><small>${q.lv} / 5${q.canBuy?' · +':''}</small></button>`);
  }
  $('hangarModuleTabs').innerHTML=tabs.join('');$('hangarRouteLabel').textContent=`${O.LEVELS[id].name} · ${mode==='pro'?'ПРО':'Обычный'}`;
  $('shopContext').querySelector('strong').textContent='Сравнить эффект на маршруте';
  $('modelGrid').innerHTML=O.Fleet.MODELS.map(m=>`<button class="model-card" data-key="${m.id}"><canvas class="fitting-art" width="300" height="132" aria-hidden="true"></canvas><span class="model-card-title"><strong>${m.name}</strong></span><span class="model-card-description">${m.description}</span><span class="model-card-status"></span></button>`).join('');decorateFitting();sync();
 }
 function sync(){
  $('hangar').dataset.workshopView=view.tab;
  for(const b of $('hangar').querySelectorAll('[data-action="hangar:view"]')){const on=b.dataset.view===view.tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
  $('hangarEquipment').hidden=view.tab!=='modules';$('hangarStyling').hidden=view.tab!=='style';
  $('cosmeticsTitle').textContent=({models:'Модель корабля',skins:'Окраска корпуса',trails:'След в полёте'})[A.cosmeticTab||'models'];
  for(const b of $('hangar').querySelectorAll('[data-action="hangar:collection"]')){const on=b.dataset.tab===(A.cosmeticTab||'models');b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;$(b.getAttribute('aria-controls')).hidden=!on;}
  for(const b of $('hangarModuleTabs').querySelectorAll('button')){const on=b.dataset.key===view.module;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
  for(const card of $('upgradeGrid').children)card.hidden=card.dataset.module!==view.module;
  for(const b of $('shopSummary').querySelectorAll('[data-action="hangar:scene"]'))b.setAttribute('aria-pressed',String(b.dataset.scene===view.scene));
  const m=previewModel(),s=previewSkin(),t=previewTrail(),style=appearance();
  $('dockShipName').textContent=m.name;$('dockFittingState').textContent=changed()?'Примерка · ещё не применено':s.name+' · корабль готов';
  $('dockSystemLabel').textContent=view.tab==='modules'?'ВЫБРАННАЯ СИСТЕМА':view.scene==='trail'?'ПРЕДПРОСМОТР СЛЕДА':A.cosmeticTab==='models'?'МОДЕЛЬ КОРПУСА':'ОКРАСКА КОРПУСА';
  $('dockSystemValue').textContent=view.tab==='modules'?short[view.module]+' · '+A.profile.upgrades[view.module]+' / 5':view.scene==='trail'?t.name:A.cosmeticTab==='models'?m.name:s.name+' · '+O.Fleet.FINISHES.find(f=>f.id===style.finish).name;
 }
 function requirement(item){return `${money(item.xp)} XP${item.requirement?' · '+item.requirement:''}${item.xp>A.profile.xp?' · ещё '+money(item.xp-A.profile.xp)+' XP':''}`;}
 function decorateFitting(){
  const p=A.profile,m=previewModel(),s=previewSkin(),t=previewTrail(),style=appearance();
  for(const [type,id,defs]of [['finish','paintFinishes',O.Fleet.FINISHES],['livery','paintLiveries',O.Fleet.LIVERIES]]){const group=$(id);if(!group.children.length)group.innerHTML=defs.map(d=>`<button data-action="hangar:paint" data-kind="${type}" data-key="${d.id}"><i class="paint-option-art ${type}-${d.id}" aria-hidden="true"></i>${d.name}</button>`).join('');for(const b of group.children)b.setAttribute('aria-pressed',String(style[type]===b.dataset.key));}
  $('paintOptionsValue').textContent=O.Fleet.FINISHES.find(f=>f.id===style.finish).name+' · '+O.Fleet.LIVERIES.find(f=>f.id===style.livery).name;
  for(const [type,grid,defs,chosen]of [['model','modelGrid',O.Fleet.MODELS,m],['skin','skinGrid',G.SKINS,s],['trail','trailGrid',O.Cosmetics.TRAILS,t]])for(const b of $(grid).children){
   const item=defs.find(x=>x.id===b.dataset.key);if(!item)continue;const open=available(item,type),on=item.id===chosen.id;
   b.disabled=false;b.dataset.action='hangar:try-'+type;b.classList.toggle('selected',on);b.classList.toggle('locked',!open);b.setAttribute('aria-pressed',String(on));
   b.setAttribute('aria-label',`Примерить: ${item.name}. ${type==='model'?item.description+' ':''}${applied(item,type)?'Установлено':open?'Доступно':requirement(item)}`);
   let canvas=b.querySelector('canvas');
   if(!canvas){canvas=document.createElement('canvas');canvas.className='fitting-art';canvas.width=300;canvas.height=132;canvas.setAttribute('aria-hidden','true');if(type==='skin')b.querySelector('.skin-shape').replaceChildren(canvas);else{b.querySelector('svg')?.remove();b.prepend(canvas);}}
   const c=canvas.getContext('2d');c.clearRect(0,0,300,132);
   if(type==='trail'){const points=Array.from({length:70},(_,i)=>({x:12+i*3.8,y:80-Math.sin(i/69*Math.PI*.7)*42}));O.Cosmetics.drawTrail(c,points,item.id,0,s.color,true,1.9);const end=points.at(-1),last=points.at(-2);O.drawShip(c,end.x,end.y,Math.atan2(end.y-last.y,end.x-last.x),s.color,.8,false,0,m.id,style);}
   else O.drawShip(c,150,66,-.12,type==='skin'?item.color:s.color,3.1,false,0,type==='model'?item.id:m.id,type==='skin'?{...style,skin:item.id}:style);
   if(type==='skin'&&!b.querySelector('.palette-swatches')){const swatches=document.createElement('span');swatches.className='palette-swatches';swatches.setAttribute('aria-hidden','true');swatches.innerHTML=[item.body,item.panel,item.color].map(color=>`<i style="background:${color}"></i>`).join('');b.querySelector('strong').after(swatches);}
   const status=type==='skin'?b.querySelector('small'):b.querySelector('.'+type+'-card-status');status.textContent=applied(item,type)?'Установлено':open?on?'Примерка':'Доступно':requirement(item);
  }
  const locks=[[m,'model'],[s,'skin'],[t,'trail']].filter(([item,type])=>!available(item,type)),dirty=changed();
  const catalog=A.cosmeticTab==='skins'?[G.SKINS,'skin','Палитры']:A.cosmeticTab==='trails'?[O.Cosmetics.TRAILS,'trail','Следы']:[O.Fleet.MODELS,'model','Модели'];
  $('cosmeticXP').textContent=`${money(p.xp)} XP · ${catalog[2]}: ${catalog[0].filter(item=>available(item,catalog[1])).length} / ${catalog[0].length}`;
  $('fittingFooter').innerHTML=`<div><strong>${locks.length?'Можно примерить. Доступ откроется позже.':dirty?'Новый облик готов к применению.':'Твой текущий облик.'}</strong><p>${locks.length?locks.map(([item])=>esc(item.name)+': '+esc(requirement(item))).join('<br>'):'Оформление меняет только внешний вид. Опыт не расходуется.'}</p></div><div class="fitting-actions">${dirty?'<button class="button quiet" data-action="hangar:reset" aria-label="Сбросить примерку и вернуть текущее оформление">Сбросить</button>':''}<button class="button primary" data-action="hangar:apply" ${locks.length||!dirty?'disabled':''}>${locks.length?'Пока недоступно':dirty?'Применить':'Установлено ✓'}</button></div>`;
 }
 function collection(tab){A.cosmeticTab=['models','skins','trails'].includes(tab)?tab:'models';view.scene=A.cosmeticTab==='trails'?'trail':'dock';A.renderHangar();$('hangarStyling').querySelector('.fitting-collection').scrollTop=0;$({models:'modelTab',skins:'skinTab',trails:'trailTab'}[A.cosmeticTab]).focus({preventScroll:true});}
 Object.assign(A.actions,{
  'hangar:view':b=>{view.tab=b.dataset.view==='style'?'style':'modules';if(view.tab==='style')view.scene=A.cosmeticTab==='trails'?'trail':'dock';sync();},
  'hangar:module':b=>{if(keys.includes(b.dataset.key)){view.module=b.dataset.key;view.scene='dock';sync();}},
  'hangar:scene':b=>{view.scene=b.dataset.scene==='trail'?'trail':'dock';sync();},
  'hangar:collection':b=>collection(b.dataset.tab),
  'hangar:try-model':b=>{view.model=O.Fleet.find(b.dataset.key).id;view.scene='dock';decorateFitting();sync();},
  'hangar:try-skin':b=>{view.skin=skin(b.dataset.key).id;view.scene='dock';decorateFitting();sync();},
  'hangar:try-trail':b=>{view.trail=trail(b.dataset.key).id;view.scene='trail';decorateFitting();sync();},
  'hangar:paint':b=>{const defs=b.dataset.kind==='finish'?O.Fleet.FINISHES:b.dataset.kind==='livery'?O.Fleet.LIVERIES:[];if(defs.some(d=>d.id===b.dataset.key)){view[b.dataset.kind]=b.dataset.key;view.scene='dock';decorateFitting();sync();}},
  'hangar:reset':()=>{for(const key of ['model','skin','trail','finish','livery'])view[key]=A.profile[key];decorateFitting();sync();},
  'hangar:apply':()=>{const m=previewModel(),s=previewSkin(),t=previewTrail();if(!available(m,'model')||!available(s,'skin')||!available(t,'trail'))return;Object.assign(A.profile,selection());A.save();A.renderHangar();A.toast('Оформление применено. Хорошего полёта.');}
 });
 $('hangar').addEventListener('keydown',event=>{const b=event.target.closest('[role=tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...b.closest('[role=tablist]').querySelectorAll('[role=tab]')],i=buttons.indexOf(b),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;event.preventDefault();buttons[next].click();$(buttons[next].id)?.focus({preventScroll:true});});
 function context(canvas){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(root.devicePixelRatio||1,2);if(!r.width||!r.height)return null;const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const c=canvas.getContext('2d'),scale=Math.min(w/900,h/540);c.setTransform(1,0,0,1,0,0);c.fillStyle='#101216';c.fillRect(0,0,w,h);c.setTransform(scale,0,0,scale,(w-900*scale)/2,(h-540*scale)/2);return c;
 }
 function line(c,points,color,width=1){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
 function ellipse(c,x,y,rx,ry,fill,stroke){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
 function bay(){
  if(background)return background;background=document.createElement('canvas');background.width=1800;background.height=1080;const c=background.getContext('2d');c.scale(2,2);
  const wall=c.createLinearGradient(0,0,0,540);wall.addColorStop(0,'#11141b');wall.addColorStop(.58,'#1d2530');wall.addColorStop(1,'#101217');c.fillStyle=wall;c.fillRect(0,0,900,540);
  c.save();c.beginPath();c.roundRect(164,18,572,353,130);c.clip();const sky=c.createRadialGradient(500,170,10,500,170,400);sky.addColorStop(0,'#1c293b');sky.addColorStop(1,'#080d16');c.fillStyle=sky;c.fillRect(120,0,660,390);
  for(let i=0;i<55;i++){const x=185+(i*103.31)%535,y=30+(i*71.57)%300;ellipse(c,x,y,i%9===0?1.2:.6,i%9===0?1.2:.6,'#b4c8e266');}
  const planet=c.createRadialGradient(650,55,10,650,55,170);planet.addColorStop(0,'#7790ab');planet.addColorStop(.82,'#33465f');planet.addColorStop(1,'#162338');ellipse(c,660,70,128,128,planet);c.restore();
  c.strokeStyle='#63768e44';c.lineWidth=12;c.beginPath();c.roundRect(158,12,584,365,136);c.stroke();c.strokeStyle='#c6d9f52c';c.lineWidth=1;c.stroke();
  for(const x of [46,91,802,847]){const metal=c.createLinearGradient(x,0,x+20,0);metal.addColorStop(0,'#11151c');metal.addColorStop(.5,'#333e4c');metal.addColorStop(1,'#141a23');c.fillStyle=metal;c.fillRect(x,0,20,395);line(c,[[x+4,25],[x+4,375]],'#b5c8e325');}
  for(const x of [55,808]){c.fillStyle='#303a47';c.fillRect(x,115,36,162);c.fillStyle='#0b1017';c.fillRect(x+6,127,24,136);for(let y=140;y<260;y+=16)line(c,[[x+11,y],[x+26,y]],'#8295aa44',2);}
  for(const [x,angle]of [[120,.28],[775,-.28]]){c.save();c.translate(x,35);c.rotate(angle);const beam=c.createLinearGradient(0,0,0,420);beam.addColorStop(0,'#b7d3ff16');beam.addColorStop(1,'#b7d3ff00');c.fillStyle=beam;c.beginPath();c.moveTo(-8,0);c.lineTo(72,420);c.lineTo(-72,420);c.closePath();c.fill();c.fillStyle='#d2e2fc';c.shadowColor='#adcaff';c.shadowBlur=16;c.fillRect(-4,0,8,72);c.restore();}
  const floor=c.createLinearGradient(0,345,0,540);floor.addColorStop(0,'#1e2632');floor.addColorStop(1,'#11151d');c.fillStyle=floor;c.fillRect(0,345,900,195);
  for(let x=-700;x<=1600;x+=150)line(c,[[450+(x-450)*.13,345],[x,540]],'#9aadc51c');for(const y of [357,377,405,444,499])line(c,[[0,y],[900,y]],'#93a4bb1a');
  ellipse(c,450,409,222,39,'#080d1577','#9cb9e132');ellipse(c,450,409,235,42,null,'#9cb9e110');
  for(const x of [235,665]){line(c,[[x,362],[x+(x<450?-35:35),476]],'#a9c8ee55',3);line(c,[[x+7,362],[x+7+(x<450?-35:35),476]],'#aeccee18');}
  for(const x of [15,855]){c.fillStyle='#38414e';c.fillRect(x,405,30,34);c.strokeStyle='#a0b0c344';c.strokeRect(x+4,410,22,23);line(c,[[x+5,412],[x+25,431]],'#a7b7ca33');}
  c.font='10px ui-monospace,Consolas,monospace';c.fillStyle='#b9cde354';c.textAlign='left';c.fillText('07 / SERVICE BAY',116,330);c.textAlign='right';c.fillText('OC—239 / STANDBY',784,330);
  c.save();c.translate(450,502);c.scale(1,.65);c.font='500 25px ui-monospace,Consolas,monospace';c.textAlign='center';c.fillStyle='#9cb7da22';c.fillText('07  /  ORBITAL',0,0);c.restore();return background;
 }
 function preview(now){
  const canvas=$('hangarShip');if(!canvas)return;const c=context(canvas);if(!c)return;const reduced=A.profile.settings.reducedMotion,t=reduced?1.4:now/1000,color=previewSkin().color,model=previewModel(),style=appearance();
  if(view.scene==='trail'){
   const sky=c.createRadialGradient(500,240,0,500,240,600);sky.addColorStop(0,'#1b2a3b');sky.addColorStop(1,'#0b1018');c.fillStyle=sky;c.fillRect(0,0,900,540);
   for(let i=0;i<48;i++)ellipse(c,40+(i*151.3)%820,25+(i*73.7)%480,.7,.7,'#b4c8e240');c.save();c.translate(450,280);c.rotate(-.2);ellipse(c,0,0,310,105,null,'#9fb7da1c');c.restore();
   c.save();c.translate(450,270);c.rotate(-.16);c.scale(2,2);const points=Array.from({length:130},(_,i)=>{const u=i/129;return{x:-200+u*300,y:24-Math.sin(u*Math.PI*.75)*30};});O.Cosmetics.drawTrail(c,points,previewTrail().id,t,color,reduced,2);const end=points.at(-1),last=points.at(-2);O.drawShip(c,end.x,end.y,Math.atan2(end.y-last.y,end.x-last.x),color,1.7,true,t,model.id,style);c.restore();
  }else{
   c.drawImage(bay(),0,0,900,540);const y=264+Math.sin(t*.75)*2,angle=-.14,size=9;
   c.save();c.beginPath();c.rect(100,355,700,180);c.clip();c.translate(0,587);c.scale(1,-.58);c.globalAlpha=.11;O.drawShip(c,450,y,angle,color,size,false,t,model.id,style);c.restore();ellipse(c,450,387,170,20,'#05080dc0');O.drawShip(c,450,y,angle,color,size,false,t,model.id,style);
   if(view.tab==='modules'){
    const [lx,ly]=model.hardpoints[view.module],x=450+(lx*Math.cos(angle)-ly*Math.sin(angle))*size,sy=y+(lx*Math.sin(angle)+ly*Math.cos(angle))*size,left=x<450,tx=left?190:710,ty=view.module==='magnet'?409:110;
    line(c,[[x,sy],[x+(left?-28:28),ty],[tx,ty]],'#b3cceb77');ellipse(c,x,sy,7,7,'#afc9ed18','#c8dcf4aa');ellipse(c,x,sy,2,2,'#e3efff');c.font='11px ui-monospace,Consolas,monospace';c.textAlign=left?'left':'right';c.fillStyle='#afc4df';c.fillText(({scanner:'SCAN / 01',magnet:'FIELD / 02',docking:'DOCK / 03',engine:'DRIVE / 04'})[view.module],tx,ty-10);
   }
   if(!reduced)for(let i=0;i<12;i++)ellipse(c,120+(i*157.3)%660,60+(i*61.7+t*5)%350,.7,.7,'#b3c9e324');
  }
 }
 O.Hangar={enhance,preview};
})(window);

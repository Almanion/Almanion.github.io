/* Hangar presentation uses the existing quote/buy functions unchanged. */
(function(root){
  'use strict';const O=root.Orbital,A=O.App,G=O.Progress,E=O.Economy,P=O.Physics;
  const $=id=>document.getElementById(id),money=n=>n.toLocaleString('ru-RU');
  const icon='<svg viewBox="-16 -12 36 24" aria-hidden="true"><path d="M3-4-7-10-12-9-8-3M3 4-7 10-12 9-8 3" fill="#426471" stroke="currentColor"/><path d="M16 0Q8-7-4-5L-10-3V3L-4 5Q8 7 16 0" fill="#d4e9e8" stroke="currentColor"/><path d="m10 0-6-3-3 1v4l3 1Z" fill="#123a4d" stroke="currentColor"/><path d="M-7-2h5v4h-5Z" fill="#344c5b" stroke="#e9c990"/></svg>';
  function enhance(){
    const p=A.profile,installed=G.installed(p),discount=Math.min(.08,G.research(p)*.002);
    const old=$('shopSummary').querySelector('.hangar-ledger');
    const preview=$('shopSummary').querySelector('.chassis-preview');
    if(preview)preview.innerHTML='<div class="eyebrow">OC—239 / ПОЧТОВЫЙ КУРЬЕР</div><canvas id="hangarShip" aria-label="Твоя капсула с двумя двигателями и грузовым отсеком"></canvas><div class="chassis-caption"><span>Готов к следующему рейсу</span><b>'+installed+' / 20 <small>СТУПЕНЕЙ</small></b></div>';
    if(old){const note=document.createElement('p');note.className='hangar-price-note';note.textContent=`Монтаж: +${(installed*2.5).toFixed(1)}% к базовой цене. Скидка за исследования: ${(discount*100).toFixed(1)}%. Возврат — по чекам.`;old.querySelector('.hangar-tools').before(note);}
    const id=A.shopLevel??A.currentId,mode=A.shopMode||p.difficulty,l=P.prepareLevel(O.LEVELS[id],mode);
    for(const [key,d]of Object.entries(G.UPGRADE_DEFS)){
      const q=G.quote(p,key),card=$('upgradeGrid').querySelector(`[data-module="${key}"]`);if(!card)continue;
      card.dataset.available=q.canBuy?'yes':q.max?'max':'locked';
      const badge=document.createElement('span');badge.className='module-status';badge.textContent=q.max?'Установлено полностью':q.canBuy?'Можно установить':!q.eligible?`Нужно ${q.required} доставок`:'Копим ресурсы';card.querySelector('.module-description').before(badge);
      // The selected preview mode must affect the scanner as well as docking.
      card.querySelectorAll('.module-effect').forEach(e=>e.remove());
      const next=Math.min(5,q.lv+1),effect=document.createElement('div');effect.className='module-effect';
      let value;
      if(key==='scanner')value=`Прогноз ${mode==='pro'?'в PRO':'здесь'}: ${+(d.values[q.lv]*(mode==='pro'?.6:1)).toFixed(1)} → ${+(d.values[next]*(mode==='pro'?.6:1)).toFixed(1)} с`;
      if(key==='magnet')value=`Радиус захвата: ${d.values[q.lv]} → ${d.values[next]} ед.`;
      if(key==='docking'){const upgraded=structuredClone(p);upgraded.upgrades.docking=next;value=`Допуск станции: ${P.captureRadius(l,G.stats(p)).toFixed(1)} → ${P.captureRadius(l,G.stats(upgraded)).toFixed(1)} ед.`;}
      if(key==='engine')value=`Расчётный расход: ${Math.round((1-.03*q.lv)*100)}% → ${Math.round((1-.03*next)*100)}%`;
      if(key==='scanner'||key==='docking'){
        const values=[q.lv,next].map(tier=>{
          if(key==='scanner')return +(d.values[tier]*(mode==='pro'?.6:1)).toFixed(1);
          const candidate=structuredClone(p);candidate.upgrades.docking=tier;return +P.captureRadius(l,G.stats(candidate)).toFixed(1);
        });
        card.querySelectorAll('.module-spec strong').forEach((node,i)=>{node.innerHTML=`${values[i]}<small>${d.unit}</small>`;});
      }
      effect.textContent=value;card.querySelector('.module-spec').after(effect);
      const plan=card.querySelector('.upgrade-plan');if(plan){
        const total=[1,2,3,4,5].filter(t=>t>q.lv).reduce((n,t)=>n+E.price(key,t,installed+t-q.lv-1,G.research(p)),0);
        plan.innerHTML=`<summary>Ступени и цены</summary><div class="price-table"><div><b>Ступень</b><b>Кредиты</b><b>Данные</b><b>Доставки</b></div>${[1,2,3,4,5].map(t=>`<div class="${t<=q.lv?'owned':t===q.lv+1?'next':''}"><span>${['I','II','III','IV','V'][t-1]}</span><span>${t<=q.lv?'✓':money(E.price(key,t,installed+t-q.lv-1,G.research(p)))}</span><span>${t<=q.lv?'—':E.DATA_COSTS[t-1]}</span><span>${E.TIER_UNLOCKS[t-1]}</span></div>`).join('')}</div>${!q.max?`<p>До V ступени: ${money(total)} ◈ при текущей скидке. Другие покупки изменят расчёт.</p>`:''}`;
      }
    }
    for(const el of document.querySelectorAll('.skin-shape'))el.innerHTML=icon;
    $('shopContext').querySelector('strong').textContent='Примерь улучшение к маршруту';
  }
  function canvasContext(canvas,w,h){
    const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    if(!r.width||!r.height)return null;
    const width=Math.round(r.width*dpr),height=Math.round(r.height*dpr);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const c=canvas.getContext('2d'),scale=Math.min(width/w,height/h);c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,width,height);c.setTransform(scale,0,0,scale,(width-w*scale)/2,(height-h*scale)/2);return c;
  }
  function preview(now){
    const p=A.profile,color=G.SKINS.find(s=>s.id===p.skin)?.color||'#6af4cd',t=p.settings.reducedMotion?1.4:now/1000;
    const canvas=$('hangarShip');if(canvas){const c=canvasContext(canvas,540,230);if(c){
      c.strokeStyle='#94cfc52b';c.lineWidth=1;
      for(const radius of [64,92]){c.beginPath();c.ellipse(270,124,radius*1.8,radius*.65,0,0,Math.PI*2);c.stroke();}
      c.setLineDash([3,7]);c.beginPath();c.moveTo(40,124);c.lineTo(500,124);c.stroke();c.setLineDash([]);
      O.drawShip(c,270,115+Math.sin(t*.9)*5,-.12,color,5,false,t);
    }}
    const c=canvasContext($('trailPreview'),560,155);if(!c)return;
    const pts=[];for(let i=0;i<=95;i++){const a=t*.42-(95-i)*.022;pts.push({x:280+205*Math.cos(a),y:77+39*Math.sin(a)});}
    O.Cosmetics.drawTrail(c,pts,p.trail,t,color,p.settings.reducedMotion,1.7);
    const end=pts.at(-1),prev=pts.at(-2);O.drawShip(c,end.x,end.y,Math.atan2(end.y-prev.y,end.x-prev.x),color,1.1,false,t);
  }
  O.Hangar={enhance,preview};
})(window);

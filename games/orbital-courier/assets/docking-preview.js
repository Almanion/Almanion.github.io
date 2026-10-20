/* A frozen view of the flight that actually ended. No simulation or profile writes. */
(function(root){
  'use strict';
  const O=root.Orbital,P=O.Physics;
  let dispose=()=>{};
  const number=value=>value.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1});
  function markup(){
    return '<figure class="completion-docking"><button type="button" class="completion-docking-button" aria-label="Развернуть финальный кадр рейса"><canvas id="resultDockingCanvas" role="img" aria-label="Финальный кадр рейса"></canvas><span class="completion-docking-expand" aria-hidden="true">⤢</span></button><figcaption><span>Финальный кадр</span><strong id="resultDockingOffset"></strong></figcaption></figure>';
  }
  function snapshot({level,state,trail=[],stats={},color='#6af4cd',trailStyle='vector',shipModel='courier',appearance={}}){
    const l=structuredClone(O.Routes.view(level,state)),s=structuredClone(state);
    const target=P.bodyAt(l.target,s.t),velocity=P.dockVelocity(s,l),radius=P.captureRadius(l,stats);
    const distance=Math.hypot(s.x-target.x,s.y-target.y);
    const offset=Math.abs((target.x-s.x)*velocity.vy-(target.y-s.y)*velocity.vx)/Math.max(1,velocity.speed);
    const points=trail.filter(p=>(p.t??0)>=s.t-.45&&(p.t??0)<=s.t).map(p=>({...p}));
    const lastBreak=points.findLastIndex(p=>p.break);
    if(lastBreak>0)points.splice(0,lastBreak);
    if(!points.length||Math.hypot(points.at(-1).x-s.x,points.at(-1).y-s.y)>.001)points.push({x:s.x,y:s.y,t:s.t});
    // Include the actual terminal position and the whole station. The same
    // framing is retained when the recording is scrubbed or the card is opened.
    const extent=radius+53,bounds=[{x:target.x-extent,y:target.y-extent},{x:target.x+extent,y:target.y+extent},{x:s.x-28,y:s.y-28},{x:s.x+28,y:s.y+28},...points];
    const left=Math.min(...bounds.map(p=>p.x)),right=Math.max(...bounds.map(p=>p.x)),top=Math.min(...bounds.map(p=>p.y)),bottom=Math.max(...bounds.map(p=>p.y));
    const camera={cx:(left+right)/2,cy:(top+bottom)/2,zoom:Math.min(1200/(right-left+18),700/(bottom-top+18))};
    return {level:l,state:s,trail:points,stats:{...stats},color,trailStyle,shipModel,appearance:{...appearance},target,velocity,radius,distance,offset,camera};
  }
  function draw(canvas,model){
    const renderer=new O.Renderer(canvas);
    const {level,state,trail,stats,color,trailStyle,shipModel,appearance,target,velocity,camera,radius}=model;
    renderer.draw(level,{state,trail,stats,color,model:shipModel,appearance,camera,review:true,time:state.t,reducedMotion:true,trailStyle});
    const c=renderer.ctx;
    c.save();c.translate(600,350);c.scale(camera.zoom,camera.zoom);c.translate(-camera.cx,-camera.cy);
    // The dashed line is the measured relative direction at the last instant,
    // not a continuation of the flown trajectory or a predicted flight.
    if(velocity.speed>.01){
      const ux=velocity.vx/velocity.speed,uy=velocity.vy/velocity.speed,length=radius+35;
      c.strokeStyle='#ffd59dcc';c.lineWidth=1.15;c.setLineDash([3.5,3.5]);c.beginPath();
      c.moveTo(state.x-ux*length,state.y-uy*length);c.lineTo(state.x+ux*length,state.y+uy*length);c.stroke();c.setLineDash([]);
      const x=state.x+ux*length,y=state.y+uy*length;
      c.beginPath();c.moveTo(x-ux*7-uy*3,y-uy*7+ux*3);c.lineTo(x,y);c.lineTo(x-ux*7+uy*3,y-uy*7-ux*3);c.stroke();
    }
    c.strokeStyle='#fff2c9';c.lineWidth=1.2;c.beginPath();c.moveTo(target.x-5,target.y);c.lineTo(target.x+5,target.y);c.moveTo(target.x,target.y-5);c.lineTo(target.x,target.y+5);c.stroke();
    if(state.status!=='won'){
      // The main renderer deliberately omits a destroyed or lost ship. Mark its
      // exact last position, instead of inventing a successful docking pose.
      const r=Math.max(5,4/camera.zoom);c.strokeStyle='#ffb49b';c.lineWidth=Math.max(1.4,1.5/camera.zoom);c.beginPath();c.moveTo(state.x-r,state.y-r);c.lineTo(state.x+r,state.y+r);c.moveTo(state.x-r,state.y+r);c.lineTo(state.x+r,state.y-r);c.stroke();
    }
    c.restore();
    Object.assign(canvas.dataset,{ready:'true',shipModel,finish:appearance.finish||'satin',livery:appearance.livery||'panels',finalTime:String(state.t),targetX:String(target.x),targetY:String(target.y),shipX:String(state.x),shipY:String(state.y),offset:String(model.offset)});
  }
  function mount(container,input){
    dispose();
    const canvas=container.querySelector('#resultDockingCanvas');if(!canvas)return;
    const model=snapshot(input),atStation=model.distance<=model.radius+1;
    const measurement=atStation?'Смещение '+number(model.offset)+' ед.':'До станции '+number(model.distance)+' ед.';
    const description=`Финальный кадр, ${number(model.state.t)} с. ${measurement}. Крест — центр станции; штрих — направление относительно станции. ${model.state.status==='won'?'Доставка подтверждена.':'Стыковка не подтверждена; показана конечная точка рейса.'}`;
    canvas.setAttribute('aria-label',description);
    container.querySelector('#resultDockingOffset').textContent=measurement;
    const button=container.querySelector('.completion-docking-button');button.title=description;
    const render=()=>{if(canvas.isConnected&&canvas.clientWidth)draw(canvas,model);};
    const observer=new ResizeObserver(render);observer.observe(canvas);
    button.addEventListener('click',()=>{
      O.App.openModal('Финальный кадр',`<div class="docking-enlarged"><canvas id="dockingDetailCanvas" role="img"></canvas><p class="docking-measurement">${measurement} · ${number(model.state.t)} с</p><p>Крест — центр станции. Штрих со стрелкой — направление движения относительно станции в последний момент; сплошная линия — пройденный участок.</p>${model.state.status!=='won'?'<p>Рейс не завершён доставкой. Крестик отмечает конечную точку капсулы.</p>':''}</div><div class="modal-actions"><button class="button primary" data-action="close">К итогам</button></div>`,'ЗАПИСЬ ВЫПОЛНЕННОГО РЕЙСА');
      const detail=document.getElementById('dockingDetailCanvas');detail.setAttribute('aria-label',description);
      requestAnimationFrame(()=>{if(detail.isConnected)draw(detail,model);});
    });
    requestAnimationFrame(render);
    dispose=()=>observer.disconnect();
  }
  O.DockingPreview={markup,mount};
})(typeof globalThis!=='undefined'?globalThis:window);

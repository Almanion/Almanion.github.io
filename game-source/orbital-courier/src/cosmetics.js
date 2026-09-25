/* Cosmetic-only trails. Coordinates come from flight history, never feed physics.
   A portal break terminates the recent plume. All effects have bounded work. */
(function(root){
  'use strict';
  const O=root.Orbital=root.Orbital||{};
  const TRAILS=Object.freeze([
    {id:'vector',name:'Вектор',xp:0,color:'#6af4cd',description:'Тонкий световой след. Чистая траектория.',length:92},
    {id:'comet',name:'Комета',xp:400,color:'#ffd396',description:'Мягкий золотой шлейф с искрами.',length:156},
    {id:'ion',name:'Ионный след',xp:1000,color:'#8fdcff',description:'Два параллельных потока холодного света.',length:132},
    {id:'photon',name:'Фотоны',xp:2100,color:'#eff6ff',description:'Цепочка световых частиц вдоль пути.',length:150},
    {id:'plasma',name:'Плазма',xp:3600,color:'#ff9fba',description:'Пульсирующая нить с тёплым ореолом.',length:144},
    {id:'aurora',name:'Полярное сияние',xp:5200,color:'#95e6dd',description:'Переплетение бирюзовой и сиреневой лент.',length:180},
    {id:'rift',name:'Эхо разлома',xp:8000,color:'#bda4ff',description:'Угасающие кольца и фиолетовый след.',length:172},
    {id:'fork',name:'Два вектора',xp:10000,gate:'both4',requirement:'Обе ветви четырёх карт',color:'#97bfff',description:'Двойная световая нить за исследованные развилки.',length:172},
    {id:'tidal',name:'Резонанс',xp:14000,gate:'sector18',requirement:'Все карты сектора 18',color:'#ffe0a7',description:'Периодические импульсы за сложные приливные маршруты.',length:180},
    {id:'postal',name:'Почтовое сияние',xp:18000,gate:'multi4',requirement:'Четыре многоадресных рейса',color:'#ffa6cb',description:'Переплетение света за доставку всем адресатам.',length:186},
    {id:'cartographer',name:'Картограф',xp:22000,gate:'all80',requirement:'Все 80 контрактов',color:'#dcf7ff',description:'Четырёхлучевые звёзды полного атласа.',length:198}
  ]);
  function unlocked(p,item){if((p.xp||0)<item.xp)return false;const done=i=>!!(p.records?.[i]?.medals&1);switch(item.gate){case'both4':return Object.values(p.records||{}).filter(r=>r.routes?.length>=2).length>=4;case'sector18':return [68,69,70,71].every(done);case'multi4':return [76,77,78,79].every(done);case'all80':return Array.from({length:80},(_,i)=>i).every(done);default:return true;}}

  const find=id=>TRAILS.find(t=>t.id===id)||TRAILS[0];
  function recent(points,maxLength=140){
    if(!Array.isArray(points)||!points.length)return [];
    const end=points.length-1,out=[{x:points[end].x,y:points[end].y}];let length=0;
    for(let i=end;i>0;i--){
      if(points[i].break)break;
      const a=points[i],b=points[i-1],d=Math.hypot(b.x-a.x,b.y-a.y);
      if(d<1e-8)continue;
      if(length+d>maxLength){const u=(maxLength-length)/d;out.push({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u});break;}
      out.push({x:b.x,y:b.y});length+=d;
    }
    return out.reverse();
  }
  function samples(points,count=38){
    if(points.length<2)return [];
    const dist=[0];for(let i=1;i<points.length;i++)dist.push(dist[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
    const len=dist.at(-1);if(len<1e-7)return [];
    let j=1;const out=[];
    for(let i=0;i<count;i++){
      const d=len*i/(count-1);while(j<dist.length-1&&dist[j]<d)j++;
      const a=points[j-1],b=points[j],u=(d-dist[j-1])/Math.max(1e-8,dist[j]-dist[j-1]),dx=b.x-a.x,dy=b.y-a.y,h=Math.max(1e-8,Math.hypot(dx,dy));
      out.push({x:a.x+dx*u,y:a.y+dy*u,nx:-dy/h,ny:dx/h,f:i/(count-1)});
    }
    return out;
  }
  function stroke(c,pts,color,width,offset=()=>0){
    if(pts.length<2)return;c.beginPath();
    pts.forEach((p,i)=>{const o=offset(p,i);const x=p.x+p.nx*o,y=p.y+p.ny*o;i?c.lineTo(x,y):c.moveTo(x,y);});
    c.strokeStyle=color;c.lineWidth=width;c.stroke();
  }
  function drawTrail(c,points,id='vector',time=0,color='#6af4cd',reduced=false,scale=1){
    const def=find(id),pts=samples(recent(points,def.length));if(pts.length<2)return;
    const t=reduced?0:time,base=def.id==='vector'?color:def.color;
    c.save();c.lineCap='round';c.lineJoin='round';c.setLineDash([]);
    const gradient=c.createLinearGradient(pts[0].x,pts[0].y,pts.at(-1).x,pts.at(-1).y);
    gradient.addColorStop(0,base+'00');gradient.addColorStop(.5,base+'80');gradient.addColorStop(1,base+'ef');
    stroke(c,pts,gradient,(def.id==='comet'?12:7)*scale);
    if((def.id==='ion'||def.id==='fork')){
      for(const side of [-1,1])stroke(c,pts,gradient,1.9*scale,p=>side*3.7*scale*Math.sin(p.f*Math.PI*.82));
    }else if((def.id==='photon'||def.id==='tidal')){
      for(let i=3;i<pts.length;i+=3){const p=pts[i];c.globalAlpha=p.f*.9;c.fillStyle=base;c.beginPath();c.arc(p.x,p.y,(1+1.5*p.f)*scale,0,Math.PI*2);c.fill();}
    }else if((def.id==='aurora'||def.id==='postal')){
      stroke(c,pts,'#ad9cffa0',2.2*scale,p=>Math.sin(p.f*13-t*2)*4.3*scale*(1-p.f));
      stroke(c,pts,gradient,2.5*scale,p=>-Math.sin(p.f*13-t*2)*4.3*scale*(1-p.f));
    }else if(def.id==='plasma'){
      stroke(c,pts,gradient,3*scale,p=>Math.sin(p.f*22-t*3)*2.8*scale*(1-p.f));stroke(c,pts,'#fff4f270',.8*scale);
    }else if((def.id==='rift'||def.id==='cartographer')){
      stroke(c,pts,gradient,1.5*scale);
      for(let i=5;i<pts.length-2;i+=7){const p=pts[i];c.globalAlpha=p.f*.6;c.strokeStyle=base;c.lineWidth=1*scale;c.beginPath();c.arc(p.x,p.y,(3+(1-p.f)*7)*scale,0,Math.PI*2);c.stroke();}
    }else{
      stroke(c,pts,gradient,(def.id==='comet'?3.4:1.8)*scale);
      if(def.id==='comet')for(let i=3;i<pts.length-2;i+=5){const p=pts[i],o=Math.sin(i*2+t*1.4)*6*(1-p.f)*scale;c.globalAlpha=p.f*.85;c.fillStyle=base;c.beginPath();c.arc(p.x+p.nx*o,p.y+p.ny*o,1.1*scale,0,Math.PI*2);c.fill();}
    }
    c.restore();
  }
  function preview(canvas,id,color,time=0,reduced=false){
    const r=canvas.getBoundingClientRect(),dpr=Math.min(root.devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const c=canvas.getContext('2d');c.setTransform(w/560,0,0,h/155,0,0);c.clearRect(0,0,560,155);
    for(let i=0;i<35;i++){c.fillStyle=i%4?'#8ab7d040':'#d8e9ef70';c.fillRect((i*97)%560,(i*47)%155,1.2,1.2);}
    const t=reduced?1.4:time,pts=[];
    // A closed gallery orbit, sampled back from the ship. Not a simulation.
    for(let i=0;i<=95;i++){const a=t*.42-(95-i)*.022;pts.push({x:280+205*Math.cos(a),y:77+39*Math.sin(a)});}
    drawTrail(c,pts,id,t,color,reduced,1.7);
    const p=pts.at(-1),q=pts.at(-2);c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.y-q.y,p.x-q.x));
    c.beginPath();c.moveTo(12,0);c.lineTo(-8,-7);c.lineTo(-4,0);c.lineTo(-8,7);c.closePath();c.fillStyle='#ebfff8';c.fill();c.strokeStyle=color;c.lineWidth=1.8;c.stroke();c.restore();
  }
  O.Cosmetics={unlocked,TRAILS,find,recent,samples,drawTrail,preview};
  if(typeof module!=='undefined'&&module.exports)module.exports=O.Cosmetics;
})(typeof globalThis!=='undefined'?globalThis:window);

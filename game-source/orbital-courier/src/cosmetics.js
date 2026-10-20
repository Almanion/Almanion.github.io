/* Cosmetic-only trails. Coordinates come from flight history, never feed physics.
   A portal break terminates the recent plume. All effects have bounded work. */
(function(root){
  'use strict';
  const O=root.Orbital=root.Orbital||{};
  const TRAILS=Object.freeze([
    {id:'vector',name:'Вектор',xp:0,color:'#6af4cd',description:'Тонкая световая нить в цвет корпуса.',length:92},
    {id:'comet',name:'Комета',xp:400,color:'#ffd396',description:'Золотое пламя и россыпь быстрых искр.',length:156},
    {id:'ion',name:'Ионный след',xp:1000,color:'#8fdcff',description:'Две ледяные струи с магнитными перемычками.',length:132},
    {id:'photon',name:'Фотоны',xp:2100,color:'#eff6ff',description:'Отдельные ромбы света с мерцающими ядрами.',length:150},
    {id:'plasma',name:'Плазма',xp:3600,color:'#ff9fba',description:'Две плавные спирали горячей розовой плазмы.',length:144},
    {id:'aurora',name:'Полярное сияние',xp:5200,color:'#95e6dd',description:'Прозрачные вуали ледяного и сиреневого света.',length:180},
    {id:'rift',name:'Эхо разлома',xp:8000,color:'#bda4ff',description:'Цепочка раскрывающихся фиолетовых разломов.',length:172},
    {id:'fork',name:'Два вектора',xp:10000,gate:'both4',requirement:'Обе ветви четырёх карт',color:'#97bfff',description:'Расходящиеся потоки с острыми развилками.',length:172},
    {id:'tidal',name:'Резонанс',xp:14000,gate:'sector18',requirement:'Все карты «Развилок приливов»',color:'#ffe0a7',description:'Золотые волновые фронты вдоль орбиты.',length:180},
    {id:'postal',name:'Лента горизонта',xp:18000,gate:'multi4',requirement:'Все карты «Предела навигации»',color:'#ffa6cb',description:'Тканая лента с золотыми почтовыми печатями.',length:186},
    {id:'cartographer',name:'Картограф',xp:22000,gate:'all80',requirement:'Все контракты кампании',color:'#dcf7ff',description:'Четырёхлучевые звёзды полного атласа.',length:198}
  ]);
  function unlocked(p,item){if((p.xp||0)<item.xp)return false;const done=i=>!!(p.records?.[i]?.medals&1);switch(item.gate){case'both4':return Object.values(p.records||{}).filter(r=>r.routes?.length>=2).length>=4;case'sector18':return [68,69,70,71].every(done);case'multi4':return [76,77,78,79].every(done);case'all80':return !!O.Campaign?.order.length&&O.Campaign.order.every(done);default:return true;}}

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
  function trace(c,pts,move=true){
    c[move?'moveTo':'lineTo'](pts[0].x,pts[0].y);
    for(let i=1;i<pts.length-1;i++)c.quadraticCurveTo(pts[i].x,pts[i].y,(pts[i].x+pts[i+1].x)/2,(pts[i].y+pts[i+1].y)/2);
    c.lineTo(pts.at(-1).x,pts.at(-1).y);
  }
  function stroke(c,pts,color,width,offset=()=>0){
    const row=pts.map((p,i)=>{const o=offset(p,i);return{x:p.x+p.nx*o,y:p.y+p.ny*o};});
    c.beginPath();trace(c,row);c.strokeStyle=color;c.lineWidth=width;c.stroke();
  }
  function drawTrail(c,points,id='vector',time=0,color='#6af4cd',reduced=false,scale=1){
    const def=find(id),pts=samples(recent(points,def.length),54);if(pts.length<2)return;
    const t=reduced?0:time,base=def.id==='vector'?color:def.color,k=scale;
    c.save();c.lineCap='round';c.lineJoin='round';c.setLineDash([]);
    const grad=(col,opacity=1,tip=col)=>{const g=c.createLinearGradient(pts[0].x,pts[0].y,pts.at(-1).x,pts.at(-1).y);g.addColorStop(0,col+'00');g.addColorStop(.25,col+Math.round(opacity*45).toString(16).padStart(2,'0'));g.addColorStop(.75,col+Math.round(opacity*180).toString(16).padStart(2,'0'));g.addColorStop(1,tip);return g;};
    const taper=p=>Math.pow(p.f,.7)*Math.sin(Math.PI*(.04+p.f*.84)),wave=(p,phase=0)=>Math.sin(p.f*11-t*1.4+phase)*(1-p.f)*k;
    const ribbon=(col,width,offset=()=>0)=>{
      const edge=side=>pts.map(p=>{const o=offset(p)+side*width*taper(p)*k;return{x:p.x+p.nx*o,y:p.y+p.ny*o};});
      c.beginPath();trace(c,edge(1));trace(c,edge(-1).reverse(),false);c.closePath();c.fillStyle=col;c.fill();
    };
    const at=(p,draw)=>{c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(-p.nx,p.ny));c.globalAlpha*=Math.pow(p.f,.65)*.8;c.scale(k,k);draw();c.restore();};
    const star=r=>{c.beginPath();for(let j=0;j<8;j++){const a=j*Math.PI/4,q=j%2?r*.19:r;j?c.lineTo(Math.cos(a)*q,Math.sin(a)*q):c.moveTo(q,0);}c.closePath();c.fill();};
    const haze=(r,col,stretch=1)=>{c.save();c.scale(stretch,1);const g=c.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,col+'45');g.addColorStop(.32,col+'18');g.addColorStop(1,col+'00');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();};
    const core=(col=base,width=.7)=>{ribbon(grad(col,.22),3);stroke(c,pts,grad(col,.8,'#f6f8ff'),width*k);};
    switch(def.id){
      case 'vector':
        ribbon(grad(base,.35),3.2);core(base,.9);
        for(const i of [19,32,44])at(pts[i],()=>{c.strokeStyle=base;c.lineWidth=.65;c.beginPath();c.moveTo(-3,-2);c.lineTo(0,0);c.lineTo(-3,2);c.stroke();});break;
      case 'comet':
        ribbon(grad('#c96d32',.3,'#ffd59b'),10);ribbon(grad('#ffc16d',.55,'#fff2d9'),4);core('#ffe3ab',1);
        for(let i=5;i<48;i+=4)at(pts[i],()=>{const age=1-pts[i].f,spread=Math.sin(i*2.399+t*.7)*age*14;c.strokeStyle=i%3?'#f8bd70':'#fff0cf';c.lineWidth=.55+pts[i].f*.5;c.beginPath();c.moveTo(-3-age*3,spread);c.lineTo(0,spread);c.stroke();});break;
      case 'ion':
        for(const side of [-1,1]){const o=p=>side*(1-p.f)*6*k;ribbon(grad('#6ba8ef',.18),3,o);stroke(c,pts,grad('#91d4ff',.75,'#e5f5ff'),.8*k,o);}
        for(const i of [16,28,40])at(pts[i],()=>{const r=1+(1-pts[i].f)*6;c.strokeStyle='#a3deff66';c.lineWidth=.55;c.beginPath();c.ellipse(0,0,r*.28,r,0,0,Math.PI*2);c.stroke();});break;
      case 'photon':
        stroke(c,pts,grad('#c5dfff',.18),.5*k);
        for(let i=5;i<51;i+=4)at(pts[i],()=>{const r=1+pts[i].f*1.8;c.globalAlpha*=.8+.2*Math.sin(i+t*2);haze(r*2.5,'#b9d9ff',1.6);c.fillStyle='#e9f3ff';c.beginPath();c.moveTo(r*2,0);c.lineTo(0,r);c.lineTo(-r*2,0);c.lineTo(0,-r);c.closePath();c.fill();c.fillStyle='#fff';c.fillRect(-.45,-.45,.9,.9);});break;
      case 'plasma':
        ribbon(grad('#e05f92',.3,'#ffd4e5'),7);for(const phase of [0,Math.PI]){const o=p=>wave(p,phase)*5;ribbon(grad(phase?'#a384ff':'#ff8dbb',.55),2,o);stroke(c,pts,grad('#ffc6e3',.8,'#fff0f8'),.65*k,o);}break;
      case 'aurora':
        for(const [col,width,phase]of [['#8391ef',8,0],['#b6b6ff',5,1.8],['#8edee5',3,3.4]]){const o=p=>wave(p,phase)*8;ribbon(grad(col,.28),width,o);stroke(c,pts,grad(col,.45,'#e6eeff'),.45*k,p=>o(p)+width*taper(p)*k);}break;
      case 'rift':
        core('#a894f2',.45);
        for(let i=8;i<50;i+=7)at(pts[i],()=>{const r=2+(1-pts[i].f)*10;c.strokeStyle='#a69aef2a';c.lineWidth=3;c.beginPath();c.ellipse(0,0,r*.28,r,0,0,Math.PI*2);c.stroke();c.lineWidth=.7;c.strokeStyle='#c5b9ff';c.stroke();c.strokeStyle='#f0e5ff';c.beginPath();c.ellipse(0,0,r*.28,r,0,-.9,.2);c.stroke();});break;
      case 'fork':
        for(const side of [-1,1]){const o=p=>side*Math.pow(1-p.f,.85)*12*k;ribbon(grad('#78a5f5',.28),2.5,o);stroke(c,pts,grad('#b7ccff',.8,'#f0f4ff'),.8*k,o);}
        for(const i of [23,40])at(pts[i],()=>{c.strokeStyle='#a8c6ff60';c.lineWidth=.6;const r=(1-pts[i].f)*12;c.beginPath();c.moveTo(-4,-r);c.lineTo(1,0);c.lineTo(-4,r);c.stroke();});break;
      case 'tidal':
        core('#ffe0ac',.6);
        for(let i=8;i<50;i+=6)at(pts[i],()=>{const r=3+8*(1-pts[i].f);c.strokeStyle='#f6ba751c';c.lineWidth=3;c.beginPath();c.ellipse(-2,0,r*.55,r,0,-1.15,1.15);c.stroke();c.strokeStyle='#ffe4b1';c.lineWidth=.8;c.stroke();});break;
      case 'postal':
        for(const side of [-1,1]){const o=p=>wave(p,side)*4+side*3*taper(p)*k;ribbon(grad(side===1?'#db78ab':'#eab782',.4),2.5,o);stroke(c,pts,grad('#ffe1c4',.6),.45*k,o);}
        for(const i of [24,42])at(pts[i],()=>{c.strokeStyle='#ffe1bd';c.lineWidth=.6;c.beginPath();c.roundRect(-3,-2,6,4,.5);c.moveTo(-3,-2);c.lineTo(0,.4);c.lineTo(3,-2);c.stroke();});break;
      case 'cartographer':
        stroke(c,pts,grad('#9cbbdc',.35),.55*k);
        for(let i=10;i<51;i+=7)at(pts[i],()=>{const r=i%2?2:3.5;haze(r*3,'#b6d4ff');c.fillStyle='#eff7ff';star(r);c.strokeStyle='#bfdcff60';c.lineWidth=.45;c.beginPath();c.arc(0,0,r+2,-.5,2.1);c.stroke();});break;
    }
    c.restore();
  }

  function preview(canvas,id,color,time=0,reduced=false,model='courier'){
    const r=canvas.getBoundingClientRect(),dpr=Math.min(root.devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const c=canvas.getContext('2d');c.setTransform(w/560,0,0,h/155,0,0);c.clearRect(0,0,560,155);
    for(let i=0;i<35;i++){c.fillStyle=i%4?'#8ab7d040':'#d8e9ef70';c.fillRect((i*97)%560,(i*47)%155,1.2,1.2);}
    const t=reduced?1.4:time,pts=[];
    // A closed gallery orbit, sampled back from the ship. Not a simulation.
    for(let i=0;i<=95;i++){const a=t*.42-(95-i)*.022;pts.push({x:280+205*Math.cos(a),y:77+39*Math.sin(a)});}
    drawTrail(c,pts,id,t,color,reduced,1.7);
    const p=pts.at(-1),q=pts.at(-2);O.drawShip?.(c,p.x,p.y,Math.atan2(p.y-q.y,p.x-q.x),color,.8,true,t,model);
  }
  O.Cosmetics={unlocked,TRAILS,find,recent,samples,drawTrail,preview};
  if(typeof module!=='undefined'&&module.exports)module.exports=O.Cosmetics;
})(typeof globalThis!=='undefined'?globalThis:window);

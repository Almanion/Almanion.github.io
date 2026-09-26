/* Cosmetic-only trails. Coordinates come from flight history, never feed physics.
   A portal break terminates the recent plume. All effects have bounded work. */
(function(root){
  'use strict';
  const O=root.Orbital=root.Orbital||{};
  const TRAILS=Object.freeze([
    {id:'vector',name:'Вектор',xp:0,color:'#6af4cd',description:'Мятное лезвие со световыми шевронами.',length:92},
    {id:'comet',name:'Комета',xp:400,color:'#ffd396',description:'Золотое пламя и россыпь быстрых искр.',length:156},
    {id:'ion',name:'Ионный след',xp:1000,color:'#8fdcff',description:'Две ледяные струи с магнитными перемычками.',length:132},
    {id:'photon',name:'Фотоны',xp:2100,color:'#eff6ff',description:'Отдельные ромбы света с мерцающими ядрами.',length:150},
    {id:'plasma',name:'Плазма',xp:3600,color:'#ff9fba',description:'Розовые разряды внутри горячей плазменной ленты.',length:144},
    {id:'aurora',name:'Полярное сияние',xp:5200,color:'#95e6dd',description:'Переплетение бирюзовой и сиреневой лент.',length:180},
    {id:'rift',name:'Эхо разлома',xp:8000,color:'#bda4ff',description:'Цепочка раскрывающихся фиолетовых разломов.',length:172},
    {id:'fork',name:'Два вектора',xp:10000,gate:'both4',requirement:'Обе ветви четырёх карт',color:'#97bfff',description:'Расходящиеся потоки с острыми развилками.',length:172},
    {id:'tidal',name:'Резонанс',xp:14000,gate:'sector18',requirement:'Все карты «Развилок приливов»',color:'#ffe0a7',description:'Золотые волновые фронты вдоль орбиты.',length:180},
    {id:'postal',name:'Лента горизонта',xp:18000,gate:'multi4',requirement:'Все карты «Предела навигации»',color:'#ffa6cb',description:'Тканая лента с золотыми почтовыми печатями.',length:186},
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
    const def=find(id),pts=samples(recent(points,def.length),44);if(pts.length<2)return;
    const t=reduced?0:time,base=def.id==='vector'?color:def.color,k=scale;
    c.save();c.lineCap='round';c.lineJoin='round';c.setLineDash([]);
    const grad=(a,b=base)=>{const g=c.createLinearGradient(pts[0].x,pts[0].y,pts.at(-1).x,pts.at(-1).y);g.addColorStop(0,a+'00');g.addColorStop(.4,a+'60');g.addColorStop(1,b);return g;};
    const glow=grad(base),thin=grad(base,'#f0fffc'),wave=p=>Math.sin(p.f*15-t*2)*(1-p.f)*7*k;
    const ribbon=(col,width,offset=()=>0)=>{c.beginPath();for(const side of [-1,1]){const row=side===1?pts:[...pts].reverse();row.forEach((p,i)=>{const o=offset(p)+side*width*Math.sin(Math.PI*p.f)*k,x=p.x+p.nx*o,y=p.y+p.ny*o;if(side===1&&i===0)c.moveTo(x,y);else c.lineTo(x,y);});}c.closePath();c.fillStyle=col;c.fill();};
    const at=(p,draw)=>{c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(-p.nx,p.ny));c.globalAlpha=p.f*.85;c.scale(k,k);draw();c.restore();};
    const star=(r)=>{c.beginPath();for(let j=0;j<8;j++){const a=j*Math.PI/4,q=j%2?r*.23:r;j?c.lineTo(Math.cos(a)*q,Math.sin(a)*q):c.moveTo(q,0);}c.closePath();c.fill();};
    switch(def.id){
      case 'vector':
        ribbon(glow,2);stroke(c,pts,thin,.9*k);
        for(const i of [14,25,36])at(pts[i],()=>{c.strokeStyle=base;c.lineWidth=.9;c.beginPath();c.moveTo(-4,-3);c.lineTo(0,0);c.lineTo(-4,3);c.stroke();});break;
      case 'comet':
        ribbon(grad('#dd7938','#ffeac2'),9);ribbon(glow,3.5);stroke(c,pts,thin,1.3*k);
        for(let i=3;i<40;i+=4){const p=pts[i];at(p,()=>{const y=Math.sin(i*3+t*2)*11*(1-p.f);c.strokeStyle=i%3?'#ffd081':'#fff1d0';c.lineWidth=.9;c.beginPath();c.moveTo(-5,y);c.lineTo(1,y*.9);c.stroke();});}break;
      case 'ion':
        for(const side of [-1,1]){const o=p=>side*5*k*Math.sin(p.f*Math.PI*.9);stroke(c,pts,glow,4*k,o);stroke(c,pts,'#c5efffc0',1*k,o);}
        for(let i=8;i<40;i+=5)at(pts[i],()=>{c.strokeStyle='#8fdcff';c.lineWidth=.7;c.strokeRect(-2,-5,4,10);});break;
      case 'photon':
        for(let i=2;i<43;i+=3){const p=pts[i];at(p,()=>{const r=1.3+2.2*p.f,b=.65+.35*Math.sin(i+t*4);c.globalAlpha*=b;c.fillStyle='#a8dfff';c.beginPath();c.moveTo(r*2,0);c.lineTo(0,r);c.lineTo(-r*2,0);c.lineTo(0,-r);c.fill();c.fillStyle='#fff';c.fillRect(-.7,-.7,1.4,1.4);});}break;
      case 'plasma':
        ribbon(grad('#ed5387','#ffd8e8'),6,wave);stroke(c,pts,thin,1.5*k,wave);
        for(const side of [-1,1])stroke(c,pts,glow,1.1*k,(p,i)=>wave(p)+side*(1-p.f)*k*(4+Math.sin(i*2+t*4)*4));break;
      case 'aurora':
        ribbon(grad('#907cf5','#97fff0'),6,p=>wave(p)*1.4);ribbon(grad('#75e5ce','#d5bdff'),3.5,p=>-wave(p));
        stroke(c,pts,'#c1fff178',.8*k,p=>wave(p)*1.4+Math.sin(p.f*Math.PI)*6*k);break;
      case 'rift':
        stroke(c,pts,glow,2*k);
        for(let i=5;i<42;i+=6)at(pts[i],()=>{const r=3+(1-pts[i].f)*9;c.strokeStyle='#b19cff';c.lineWidth=1.3;c.beginPath();c.ellipse(0,0,r*.3,r,0,.2,Math.PI*1.85);c.stroke();c.strokeStyle='#efdbff';c.beginPath();c.ellipse(0,0,r*.3,r,0,-.6,.2);c.stroke();});break;
      case 'fork':
        for(const side of [-1,1]){const o=p=>side*(1-p.f)*12*k;stroke(c,pts,glow,3*k,o);stroke(c,pts,thin,.8*k,o);}
        for(let i=10;i<40;i+=9)at(pts[i],()=>{c.fillStyle='#d8e5ff';const q=(1-pts[i].f)*12;c.beginPath();c.moveTo(3,0);c.lineTo(-4,-q);c.lineTo(-1,0);c.lineTo(-4,q);c.closePath();c.fill();});break;
      case 'tidal':
        stroke(c,pts,grad('#ff9a5c','#fff3cf'),1.3*k);
        for(let i=5;i<42;i+=5)at(pts[i],()=>{const r=4+7*(1-pts[i].f);c.strokeStyle=i%2?'#ffe5a2':'#ffb982';c.lineWidth=1.5;c.beginPath();c.arc(-r*.6,0,r,-1.1,1.1);c.stroke();});break;
      case 'postal':
        ribbon(grad('#db68a4','#ffe0be'),5,p=>wave(p)*.65);stroke(c,pts,'#ffeed990',.9*k,p=>wave(p)*.65+4*k*Math.sin(Math.PI*p.f));
        for(const i of [14,27,38])at(pts[i],()=>{c.fillStyle='#ffdbb8';c.strokeStyle='#ba507c';c.lineWidth=.7;c.fillRect(-4,-2.8,8,5.6);c.beginPath();c.moveTo(-4,-2.8);c.lineTo(0,.5);c.lineTo(4,-2.8);c.stroke();});break;
      case 'cartographer':
        c.setLineDash([2*k,5*k]);stroke(c,pts,glow,.8*k);c.setLineDash([]);
        for(let i=5;i<43;i+=6)at(pts[i],()=>{c.fillStyle='#dbf7ff';star(i%2?4:5.5);c.strokeStyle='#84bccc';c.lineWidth=.6;c.beginPath();c.arc(0,0,7,0,Math.PI*1.45);c.stroke();});break;
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

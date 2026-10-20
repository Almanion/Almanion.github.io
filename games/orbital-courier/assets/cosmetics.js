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
    {id:'cartographer',name:'Картограф',xp:22000,gate:'all80',requirement:'Все 76 основных контрактов',color:'#dcf7ff',description:'Четырёхлучевые звёзды полного атласа.',length:198}
  ]);
  function unlocked(p,item){if((p.xp||0)<item.xp)return false;const done=i=>!!(p.records?.[i]?.medals&1);switch(item.gate){case'both4':return Object.values(p.records||{}).filter(r=>r.routes?.length>=2).length>=4;case'sector18':return [68,69,70,71].every(done);case'multi4':return [76,77,78,79].every(done);case'all80':return !!O.Campaign?.order.length&&O.Campaign.order.filter(id=>id<80).every(done);default:return true;}}

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
    const point=f=>{const n=Math.max(0,Math.min(1,f))*(pts.length-1),i=Math.min(pts.length-2,Math.floor(n)),u=n-i,a=pts[i],b=pts[i+1];return{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,nx:a.nx+(b.nx-a.nx)*u,ny:a.ny+(b.ny-a.ny)*u,f};};
    const beam=(col,width,offset=()=>0)=>{stroke(c,pts,grad(col,.16),width*4*k,offset);stroke(c,pts,grad(col,.45),width*1.8*k,offset);stroke(c,pts,grad(col,.85,'#f2f5ff'),width*k,offset);};
    c.globalCompositeOperation='lighter';
    const core=(col=base,width=.7)=>{ribbon(grad(col,.22),3);stroke(c,pts,grad(col,.8,'#f6f8ff'),width*k);};
    switch(def.id){
      case 'vector':
        ribbon(grad(base,.13),4);beam(base,.55);
        for(let i=0;i<4;i++){const f=1-((i/4+t*.11)%1);at(point(f),()=>{c.strokeStyle=base;c.lineWidth=.65;c.beginPath();c.moveTo(-4,-2.2);c.lineTo(0,0);c.lineTo(-4,2.2);c.stroke();});}break;
      case 'comet':
        ribbon(grad('#bf5c34',.18,'#ffe5ba'),8);ribbon(grad('#ffbb68',.38,'#fff0cb'),3);beam('#ffe5b5',.8);
        for(let i=0;i<28;i++){const f=1-((i/28+t*.19)%1),seed=Math.sin(i*127.1)*.5+.5;at(point(f),()=>{const y=Math.sin(i*2.399)*(1-f)*(4+seed*10),r=.3+f*.9;c.translate(-seed*3,y);haze(r*3,'#ffb56c',1.6);c.fillStyle=i%4?'#ffd49a':'#fff5dc';c.beginPath();c.ellipse(0,0,r*(1.4+seed),r*.55,0,0,Math.PI*2);c.fill();});}break;
      case 'ion':
        for(const side of [-1,1]){const o=p=>side*(1.2+(1-p.f)*3)*k;beam('#67b8ff',.6,o);}
        for(let i=0;i<7;i++){const f=1-((i/7+t*.13)%1);at(point(f),()=>{const r=2+(1-f)*3;c.strokeStyle='#81ccff55';c.lineWidth=.55;c.beginPath();c.ellipse(0,0,r*.25,r,0,0,Math.PI*2);c.stroke();c.strokeStyle='#d2efff';c.beginPath();c.ellipse(0,0,r*.25,r,0,-.6,.8);c.stroke();});}break;
      case 'photon':
        for(let i=0;i<14;i++){const f=1-((i/14+t*.12)%1);at(point(f),()=>{const r=.6+f*1.3;c.translate(0,Math.sin(i*2.4)*(1-f)*4);haze(r*4,'#bfdbff',1.5);c.fillStyle='#cfebff';c.beginPath();c.moveTo(r*2.1,0);c.lineTo(0,r);c.lineTo(-r*2.1,0);c.lineTo(0,-r);c.closePath();c.fill();c.strokeStyle='#ecf7ff55';c.lineWidth=.4;c.beginPath();c.ellipse(0,0,r*3.2,r*2,0,-.7,.7);c.stroke();});}break;
      case 'plasma':{
        ribbon(grad('#b83283',.17,'#f9b8db'),7);
        for(const side of [-1,1]){const o=p=>side*(2.2+wave(p,side)*2)*k*(1-p.f*.5);beam(side===1?'#eb72b5':'#aa89ff',.75,o);}
        for(let i=0;i<4;i++){const center=.22+i*.2,arc=pts.filter(p=>Math.abs(p.f-center)<.095);stroke(c,arc,'#f7c8f28c',.55*k,(p,j)=>Math.sin(j*2.4+t*3+i)*(1-p.f)*4*k);}
        break;}
      case 'aurora':
        for(let i=0;i<7;i++){const phase=i*.62,col=['#8f91ed','#ba9bfa','#7baedc','#86d5dc'][i%4],o=p=>wave(p,phase)*8+(i-3)*1.2*(1-p.f)*k;ribbon(grad(col,.1,'#e2dfff'),2.5,o);stroke(c,pts,grad(col,.3),.3*k,p=>o(p)+taper(p)*2.5*k);}
        for(let i=9;i<49;i+=4)at(pts[i],()=>{const r=(1-pts[i].f)*8;c.strokeStyle='#c6caff28';c.lineWidth=.4;c.beginPath();c.moveTo(-2,-r);c.quadraticCurveTo(2,0,-2,r);c.stroke();});break;
      case 'rift':
        for(const side of [-1,1])beam('#a591e8',.35,p=>side*(1-p.f)*3*k);
        for(let i=0;i<7;i++){const f=1-((i/7+t*.075)%1);at(point(f),()=>{const r=2+(1-f)*9;haze(r*1.5,'#8e6ede',.7);c.strokeStyle='#c9b5ff';c.lineWidth=.85;c.beginPath();c.ellipse(0,0,r*.32,r,0,-1.15,1.15);c.stroke();c.strokeStyle='#8670c37c';c.lineWidth=.5;c.beginPath();c.ellipse(-1.2,0,r*.32,r*1.2,0,1.7,4.6);c.stroke();c.fillStyle='#d1c0ff9c';c.beginPath();c.moveTo(-r*.5,r*.7);c.lineTo(-r*.3,r*1.2);c.lineTo(r*.1,r*.85);c.closePath();c.fill();});}break;
      case 'fork':
        for(const side of [-1,1]){const o=p=>side*Math.pow(1-p.f,.75)*11*k;beam(side===1?'#7b9fee':'#b1c9ff',.65,o);for(let i=0;i<4;i++){const f=1-((i/4+t*.1)%1),p=point(f);at(p,()=>{const y=side*Math.pow(1-f,.75)*11;c.translate(0,y);c.fillStyle='#e0eaff';c.beginPath();c.moveTo(3,0);c.lineTo(-2,-1.5);c.lineTo(-1,0);c.lineTo(-2,1.5);c.closePath();c.fill();});}}break;
      case 'tidal':
        beam('#ffd799',.4);
        for(let i=0;i<9;i++){const f=1-((i/9+t*.095)%1);at(point(f),()=>{const r=3+(1-f)*11;c.strokeStyle='#efb57220';c.lineWidth=3;c.beginPath();c.ellipse(-2,0,r*.55,r,0,-1,1);c.stroke();c.strokeStyle='#ffe2af';c.lineWidth=.65;c.stroke();c.strokeStyle='#fff1ce55';c.lineWidth=.4;c.beginPath();c.ellipse(-4,0,r*.7,r*1.35,0,-.75,.75);c.stroke();});}break;
      case 'postal':{
        const bend=p=>wave(p,.5)*4;ribbon(grad('#ce6f9b',.3,'#ffe4cf'),4,bend);
        for(const side of [-1,1])beam('#efc58e',.35,p=>bend(p)+side*3.5*taper(p)*k);
        for(let i=6;i<49;i+=2){const p=pts[i],r=3.2*taper(p);at(p,()=>{c.translate(0,bend(p)/k);c.strokeStyle=i%4?'#ffd49c55':'#ffe8bd88';c.lineWidth=.35;c.beginPath();c.moveTo(-1.5,-r);c.lineTo(1.5,r);c.stroke();});}
        for(const f of [.4,.76])at(point(f),()=>{c.translate(0,bend(point(f))/k);c.strokeStyle='#ffe2aa';c.lineWidth=.65;c.beginPath();c.moveTo(0,-2.5);c.lineTo(2.8,0);c.lineTo(0,2.5);c.lineTo(-2.8,0);c.closePath();c.stroke();});break;}
      case 'cartographer':{
        const constellation=[];
        for(let i=0;i<10;i++){const f=.07+i*.092,p=point(f),o=Math.sin(i*2.4)*(1-f)*12*k;constellation.push({...p,x:p.x+p.nx*o,y:p.y+p.ny*o});}
        stroke(c,constellation,grad('#9ebfe7',.5),.45*k);
        for(const [i,p]of constellation.entries())at(p,()=>{const r=i%3===0?3:1.3;haze(r*4,'#aacdff');c.fillStyle='#eef8ff';star(r);if(i%3===0){c.strokeStyle='#a9cafa55';c.lineWidth=.45;c.beginPath();c.arc(0,0,r+3,-.5,1.7);c.stroke();}});
        for(let i=0;i<16;i++){const f=1-((i/16+t*.04)%1);at(point(f),()=>{const y=Math.sin(i*4.17)*(1-f)*16;c.fillStyle='#b8d8ff80';c.beginPath();c.arc(0,y,.35,0,Math.PI*2);c.fill();});}break;}
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

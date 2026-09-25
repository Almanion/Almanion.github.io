/* Canvas artwork is generated locally. No image assets or external fonts. */
(function(root){
  'use strict';const O=root.Orbital=root.Orbital||{},P=O.Physics;
  const TAU=Math.PI*2;
  function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function circle(ctx,x,y,r,fill,stroke,width=1){
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }
  function text(ctx,value,x,y,size=12,color='#8fa5b5',align='left'){
    ctx.fillStyle=color;ctx.font=`500 ${size}px ui-monospace, Consolas, monospace`;ctx.textAlign=align;ctx.fillText(value,x,y);
  }
  function path(ctx,points,color,width=2,dash=[]){
    if(points.length<2)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++){if(points[i].break)ctx.moveTo(points[i].x,points[i].y);else ctx.lineTo(points[i].x,points[i].y);}
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);
  }
  function ship(ctx,x,y,angle,color,scale=1,thrust=false,t=0){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
    if(thrust){
      const glow=ctx.createLinearGradient(-7,0,-35,0);glow.addColorStop(0,color);glow.addColorStop(1,'transparent');
      ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(-8,-4);ctx.lineTo(-29-Math.sin(t*25)*7,0);ctx.lineTo(-8,4);ctx.fill();
    }
    ctx.shadowColor=color;ctx.shadowBlur=12;
    ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-9,-8);ctx.lineTo(-5,0);ctx.lineTo(-9,8);ctx.closePath();
    ctx.fillStyle='#eafaf8';ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.stroke();
    ctx.fillStyle=color;ctx.fillRect(-3,-2.3,6,4.6);ctx.restore();
  }
  class Renderer {
    constructor(canvas){
      this.canvas=canvas;this.ctx=canvas.getContext('2d');
      const random=rng(239);this.stars=Array.from({length:165},()=>({x:random()*1200,y:random()*700,r:0.4+random()*1.2,a:0.16+random()*0.65,p:random()*TAU}));
      this.planetCache=new Map();
    }
    resize(){
      const dpr=Math.min(root.devicePixelRatio||1,2),r=this.canvas.getBoundingClientRect();
      const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
      if(this.canvas.id==='gameCanvas'){this.ctx.setTransform(1,0,0,1,0,0);this.ctx.fillStyle='#07131e';this.ctx.fillRect(0,0,w,h);const fit=Math.min(w/1200,h/700);this.ctx.setTransform(fit,0,0,fit,(w-1200*fit)/2,(h-700*fit)/2);}else this.ctx.setTransform(w/1200,0,0,h/700,0,0);
      this.uiScale=this.canvas.id==='gameCanvas'?Math.max(1,Math.min(3.2,900/Math.max(1,r.width))):1;
    }
    background(t,sector=0){
      const c=this.ctx;const base=c.createLinearGradient(0,0,1200,700);
      base.addColorStop(0,'#081522');base.addColorStop(0.5,'#09121f');base.addColorStop(1,'#08111a');
      c.fillStyle=base;c.fillRect(0,0,1200,700);
      const fog=c.createRadialGradient(840,280,0,840,280,680);
      fog.addColorStop(0,['#17464044','#593d2440','#3c2e694d','#235c7040','#6e393240','#243d6345','#472c6445','#244c3e45','#59402344','#552c4844','#662a3444','#283f7145','#41306845','#6a4d2940'][sector%14]);fog.addColorStop(1,'transparent');
      c.fillStyle=fog;c.fillRect(0,0,1200,700);
      for(const s of this.stars){circle(c,s.x,s.y,s.r,`rgba(203,225,238,${s.a*(0.83+0.17*Math.sin(t*0.6+s.p))})`);}
      c.strokeStyle='#8eb9c00b';c.lineWidth=1;
      for(let x=0;x<=1200;x+=100){c.beginPath();c.moveTo(x,0);c.lineTo(x,700);c.stroke();}
      for(let y=0;y<=700;y+=100){c.beginPath();c.moveTo(0,y);c.lineTo(1200,y);c.stroke();}
      c.strokeStyle='#5b829838';c.strokeRect(14,14,1172,672);
      text(c,'NAV / 1200 × 700',32,42,10,'#567080');
    }
    planet(p){
      const c=this.ctx;
      const halo=c.createRadialGradient(p.x,p.y,p.r*0.9,p.x,p.y,p.r*1.6);
      halo.addColorStop(0,p.tint+'28');halo.addColorStop(1,'transparent');c.fillStyle=halo;
      c.fillRect(p.x-p.r*1.6,p.y-p.r*1.6,p.r*3.2,p.r*3.2);
      if(p.ring){
        c.save();c.translate(p.x,p.y);c.rotate(-0.24);
        c.beginPath();c.ellipse(0,0,p.r*1.65,p.r*0.42,0,0,TAU);
        c.lineWidth=14;c.strokeStyle=p.tint+'36';c.stroke();
        c.lineWidth=1.5;c.strokeStyle=p.tint+'80';c.stroke();c.restore();
      }
      c.save();c.beginPath();c.arc(p.x,p.y,p.r,0,TAU);c.clip();
      const g=c.createRadialGradient(p.x-p.r*0.45,p.y-p.r*0.45,0,p.x+p.r*0.3,p.y+p.r*0.2,p.r*1.5);
      g.addColorStop(0,p.tint);g.addColorStop(0.45,p.tint+'c9');g.addColorStop(1,'#10162a');
      c.fillStyle=g;c.fillRect(p.x-p.r,p.y-p.r,p.r*2,p.r*2);
      const seed=[...(p.name||'planet')].reduce((n,ch)=>Math.imul(n,31)+ch.charCodeAt(0)|0,239);
      const random=rng(seed);
      for(let i=0;i<14;i++){
        const x=p.x+(random()-0.5)*p.r*1.9,y=p.y+(random()-0.5)*p.r*1.9,r=p.r*(0.03+random()*0.12);
        circle(c,x,y,r,'#0b203724');c.beginPath();c.arc(x+1,y+1,r,Math.PI,Math.PI*1.55);c.strokeStyle='#ffffff18';c.lineWidth=1.2;c.stroke();
      }
      c.translate(p.x,p.y);c.rotate(-0.3);c.strokeStyle='#e1fff214';c.lineWidth=1;
      for(const sy of [-0.48,0,0.48]){c.beginPath();c.ellipse(0,sy*p.r,p.r*1.05,p.r*0.14,0,0,TAU);c.stroke();}
      const shade=c.createLinearGradient(-p.r,-p.r,p.r,p.r);shade.addColorStop(0,'#ffffff0a');shade.addColorStop(0.55,'transparent');shade.addColorStop(1,'#020615b0');
      c.fillStyle=shade;c.fillRect(-p.r*2,-p.r*2,p.r*4,p.r*4);c.restore();
      circle(c,p.x,p.y,p.r,null,p.tint+'75',1.4);
      if(p.name)text(c,p.name.toUpperCase(),p.x,p.y+p.r+18+11*this.uiScale,11*this.uiScale,'#9aaebf','center');
    }
    rock(p,index){
      const c=this.ctx,random=rng(index*827+37);c.save();c.translate(p.x,p.y);c.beginPath();
      for(let i=0;i<10;i++){
        const a=i*TAU/10,r=p.r*(0.86+random()*0.14),x=Math.cos(a)*r,y=Math.sin(a)*r;
        i?c.lineTo(x,y):c.moveTo(x,y);
      }
      c.closePath();const g=c.createLinearGradient(-p.r,-p.r,p.r,p.r);g.addColorStop(0,'#78828a');g.addColorStop(1,'#303c4c');
      c.fillStyle=g;c.fill();c.strokeStyle='#a9b6bf70';c.lineWidth=1.2;c.stroke();
      circle(c,-p.r*0.2,-p.r*0.15,p.r*0.25,'#24313f66');circle(c,p.r*0.3,p.r*0.3,p.r*0.13,'#24313f66');c.restore();
    }
    station(p,t,capture){
      const c=this.ctx,ui=Math.min(1.28,this.uiScale||1),R=capture;
      c.save();c.translate(p.x,p.y);
      const halo=c.createRadialGradient(0,0,7,0,0,70*ui);
      halo.addColorStop(0,'#69f7d324');halo.addColorStop(.5,'#54c9d412');halo.addColorStop(1,'transparent');
      circle(c,0,0,70*ui,halo);
      // Solar arrays and support trusses are artwork; the thin inner ring is
      // the exact capture radius. No decorative wing is a collision obstacle.
      c.save();c.scale(ui,ui);
      c.strokeStyle='#567e94';c.lineWidth=4;c.beginPath();c.moveTo(-45,0);c.lineTo(45,0);c.stroke();
      for(const side of [-1,1]){
        const x=side<0?-57:35;
        const panel=c.createLinearGradient(x,-24,x+22,24);panel.addColorStop(0,'#244f79');panel.addColorStop(.6,'#112f54');panel.addColorStop(1,'#39739c');
        c.fillStyle=panel;c.fillRect(x,-23,22,46);c.strokeStyle='#82bedb';c.lineWidth=1.3;c.strokeRect(x,-23,22,46);
        c.strokeStyle='#9dd3ee58';c.lineWidth=.65;
        for(let y=-16;y<23;y+=8){c.beginPath();c.moveTo(x+2,y);c.lineTo(x+20,y);c.stroke();}
        for(const dx of [7,15]){c.beginPath();c.moveTo(x+dx,-21);c.lineTo(x+dx,21);c.stroke();}
        c.fillStyle='#c0d2dd';c.fillRect(side<0?-33:23,-4,10,8);
        c.fillStyle='#365366';c.fillRect(-6,side*30-9,12,18);
        c.strokeStyle='#afc9d4';c.strokeRect(-6,side*30-9,12,18);
      }
      c.strokeStyle='#678ea3';c.lineWidth=1.5;c.beginPath();c.moveTo(0,-40);c.lineTo(0,-54);c.stroke();circle(c,0,-54,2,'#8cffe4');
      c.beginPath();c.arc(0,-54,7,Math.PI*.12,Math.PI*.88);c.strokeStyle='#7dfbd19a';c.stroke();
      c.restore();
      const rim=c.createLinearGradient(-R,-R,R,R);rim.addColorStop(0,'#d1e5e8');rim.addColorStop(.4,'#678798');rim.addColorStop(1,'#233e51');
      circle(c,0,0,R+6,'#081a27',rim,7);
      circle(c,0,0,R+1,null,'#a3ffdf',1.7);
      circle(c,0,0,Math.max(5,R-5),'#09212d','#467b85',1);
      // Empty, illuminated docking aperture; no confusing solid square.
      c.strokeStyle='#6debc7';c.lineWidth=1.3;
      for(let k=0;k<6;k++){const a=k*TAU/6,r=R+7;c.save();c.translate(Math.cos(a)*r,Math.sin(a)*r);c.rotate(a);c.fillStyle='#dfedef';c.fillRect(-2,-3,4,6);c.restore();}
      c.save();c.rotate(t*.16);c.strokeStyle='#7effdb';c.lineWidth=2.5;
      for(let k=0;k<3;k++){c.beginPath();c.arc(0,0,R+13,k*TAU/3,k*TAU/3+.42);c.stroke();}c.restore();
      c.strokeStyle='#9dffe5b0';c.lineWidth=1;c.beginPath();c.moveTo(-4,0);c.lineTo(4,0);c.moveTo(0,-4);c.lineTo(0,4);c.stroke();
      if(!p.noLabel)text(c,'СТАНЦИЯ',0,Math.max(53*ui,R+24)+9*this.uiScale,10*this.uiScale,'#91d8c9','center');
      c.restore();
    }
    cargo(p,i,t,collected,banked){
      if(collected)return;const c=this.ctx,u=Math.min(1.6,this.uiScale||1);
      c.save();c.translate(p.x,p.y);c.rotate(Math.sin(t*.8+i*1.7)*.07);c.scale(u,u);
      const amber=banked?'#b6ac92':'#ffd49b';
      const halo=c.createRadialGradient(0,0,2,0,0,25);halo.addColorStop(0,banked?'#ebd3a012':'#ffd79128');halo.addColorStop(1,'transparent');circle(c,0,0,25,halo);
      // Bevelled titanium crate, with an amber cargo seal and readable ribs.
      c.beginPath();c.moveTo(-11,-10);c.lineTo(-7,-15);c.lineTo(10,-15);c.lineTo(14,-10);c.lineTo(14,9);c.lineTo(9,14);c.lineTo(-8,14);c.lineTo(-11,10);c.closePath();
      const g=c.createLinearGradient(-11,-15,14,14);g.addColorStop(0,'#ddc7a3');g.addColorStop(.35,'#8a7560');g.addColorStop(1,'#34404b');c.fillStyle=g;c.fill();c.lineWidth=1.2;c.strokeStyle=amber;c.stroke();
      c.fillStyle=banked?'#51514a':'#714e30';c.fillRect(-6,-10,15,18);c.strokeStyle='#fbd49c70';c.lineWidth=.8;c.strokeRect(-6,-10,15,18);
      c.fillStyle=amber;c.fillRect(-8,-12,3,22);c.fillRect(8,-12,3,22);
      c.fillStyle='#e8d6b7';c.fillRect(-3,-9,8,3);c.fillStyle='#172831';c.fillRect(-3,-8,1,2);c.fillRect(0,-8,1,2);c.fillRect(3,-8,1,2);
      c.fillStyle=banked?'#c6d3c9':'#fff3d7';c.font='bold 9px ui-monospace,Consolas,monospace';c.textAlign='center';c.fillText(p.label||String(i+1),1,5);
      c.fillStyle='#101f2a';for(const [x,y] of [[-8,-11],[10,-11],[-8,10],[10,10]])circle(c,x,y,1.1,'#223947');
      circle(c,10,-12,1.9,banked?'#80cbb3':'#ffe6ac');c.restore();
    }
    flybys(level,state){
      if(!level.flybys?.length)return;
      const c=this.ctx,index=state?.flybyIndex||0,leg=level.flybys[index];
      if(!leg)return;const p=P.bodyAt(level.planets[leg.planet],state?.t||0);
      c.save();c.setLineDash([3,11]);circle(c,p.x,p.y,leg.radius,null,'#9ddcff28',1.25);c.restore();
      const r=p.r+12,progress=Math.min(1,(state?.flybyAngle||0)/P.rad(leg.degrees));
      circle(c,p.x,p.y,r,null,'#d7f1ff32',2);
      c.beginPath();c.arc(p.x,p.y,r,-Math.PI/2,-Math.PI/2+leg.direction*TAU*progress,leg.direction<0);c.strokeStyle='#91ffe0';c.lineWidth=3;c.stroke();
      const a=-Math.PI/2+leg.direction*.35,x=p.x+Math.cos(a)*(r+8),y=p.y+Math.sin(a)*(r+8);
      c.save();c.translate(x,y);c.rotate(a+leg.direction*Math.PI/2);c.beginPath();c.moveTo(-7,-4);c.lineTo(0,0);c.lineTo(-7,4);c.strokeStyle='#b3f4ff';c.lineWidth=2;c.stroke();c.restore();
    }
    gates(level,state){
      const c=this.ctx,next=state?.gateIndex||0;
      (level.gates||[]).forEach((g,i)=>{
        const done=i<next,color=done?'#6af4cd':i===next?'#ffbc72':'#a390ce';
        circle(c,g.x,g.y,g.r,null,color,done?1.2:2);
        c.save();c.setLineDash([3,5]);circle(c,g.x,g.y,g.r+6,null,color+'70',1);c.restore();
        text(c,done?'✓':String(i+1),g.x,g.y-g.r-9,12*Math.min(1.5,this.uiScale),color,'center');
      });
    }
    gravity(state,stats,t,reduced){
      const R=stats.gravity||0;if(!R||!state||['crash','lost'].includes(state.status))return;
      const c=this.ctx,x=state.x,y=state.y;
      const active=(state.cargoBodies||[]).filter(b=>b.phase==='pulling');
      const halo=c.createRadialGradient(x,y,8,x,y,R);
      halo.addColorStop(0,'#aa9bff18');halo.addColorStop(.55,active.length?'#99baff16':'#829bff08');halo.addColorStop(1,'#a3b8ff00');
      circle(c,x,y,R,halo);c.save();c.setLineDash([4,9]);circle(c,x,y,R,null,'#a4bcff45',1.1);c.restore();
      if(!reduced)for(let k=0;k<3;k++){
        const phase=(t*.55+k/3)%1,r=R*(1-phase);
        circle(c,x,y,Math.max(2,r),null,`rgba(158,177,255,${.19*Math.sin(phase*Math.PI)})`,1.2);
      }
      for(const b of active){
        if(b.trail?.length)path(c,b.trail,'#bba2ff88',2);
        const dx=x-b.x,dy=y-b.y,len=Math.max(1,Math.hypot(dx,dy));
        const mx=(x+b.x)/2-dy*.17,my=(y+b.y)/2+dx*.17;
        c.beginPath();c.moveTo(b.x,b.y);c.quadraticCurveTo(mx,my,x,y);c.lineWidth=1.1;c.strokeStyle='#b3baff75';c.stroke();
        if(!reduced)for(let j=0;j<3;j++){
          const u=(t*1.6+j/3)%1;
          circle(c,(1-u)**2*b.x+2*(1-u)*u*mx+u*u*x,(1-u)**2*b.y+2*(1-u)*u*my+u*u*y,1.6,'#c4c5ff');
        }
      }
      if(active.length)text(c,'ЗАХВАТ '+active.length,x,y-R-8,10*Math.min(1.5,this.uiScale),'#c7bcff','center');
    }
    field(level,simTime=0){
      const c=this.ctx;c.strokeStyle='#9aacd23b';c.lineWidth=1;
      for(let y=75;y<660;y+=65)for(let x=65;x<1170;x+=65){
        if(level.planets.some(body=>{const p=P.bodyAt(body,simTime);return Math.hypot(x-p.x,y-p.y)<p.r+12;}))continue;
        const a=P.acceleration(x,y,level.planets,simTime),mag=Math.hypot(a.x,a.y),len=Math.min(21,Math.sqrt(mag)*3);
        const angle=Math.atan2(a.y,a.x);c.save();c.translate(x,y);c.rotate(angle);
        c.beginPath();c.moveTo(-len/2,0);c.lineTo(len/2,0);c.lineTo(len/2-4,-3);c.moveTo(len/2,0);c.lineTo(len/2-4,3);c.stroke();c.restore();
      }
    }
    orbitTracks(level,simTime,preview=null){
      const c=this.ctx;
      for(const body of [...level.planets,level.target]){
        if(!body.motion)continue;
        const color=body===level.target?'#ffd29a':'#9ebaff',m=body.motion,points=[];
        for(let i=0;i<=96;i++)points.push(P.bodyAt(body,m.period*i/96));
        path(c,points,color+'38',1.25,[3,7]);
        const p=P.bodyAt(body,simTime),v=Math.hypot(p.vx,p.vy);
        if(v>0){
          const len=(body.r||25)+15,x=p.x+p.vx/v*len,y=p.y+p.vy/v*len;
          c.save();c.translate(x,y);c.rotate(Math.atan2(p.vy,p.vx));
          c.beginPath();c.moveTo(-5,-3);c.lineTo(0,0);c.lineTo(-5,3);
          c.strokeStyle=color+'a0';c.lineWidth=1.5;c.stroke();c.restore();
        }
        if(preview){
          const future=P.bodyAt(body,preview.state.t),r=body===level.target?18:body.r;
          if(Math.hypot(future.x-p.x,future.y-p.y)>r*.8){
            c.save();c.setLineDash([4,7]);circle(c,future.x,future.y,r,null,color+'60',1.5);c.restore();
          }
        }
      }
    }
    portals(level,view){
      const c=this.ctx,t=view.reducedMotion?0:(view.time||0),ui=Math.min(1.55,this.uiScale||1);
      for(const pair of level.portals||[]){
        const color=pair.color||'#b8a4ff';
        for(const [kind,p] of [['entrance',pair.entrance],['exit',pair.exit]]){
          const input=kind==='entrance',R=p.r;c.save();if(pair.branch&&level.activeBranch&&pair.branch!==level.activeBranch)c.globalAlpha=.25;c.translate(p.x,p.y);
          const glow=c.createRadialGradient(0,0,R*.4,0,0,R*3.2);
          glow.addColorStop(0,color+'45');glow.addColorStop(.4,color+'16');glow.addColorStop(1,'transparent');
          circle(c,0,0,R*3.2,glow);
          c.save();c.rotate(-.3);
          for(let k=0;k<3;k++){
            c.beginPath();c.ellipse(0,0,R*(1.5+k*.22),R*(.45+k*.12),0,t*(input?.5:-.4)+k*.8,t*(input?.5:-.4)+k*.8+Math.PI*1.65);
            c.lineWidth=k===0?3:1.2;c.strokeStyle=color+(k===0?'ba':'55');c.stroke();
          }c.restore();
          circle(c,0,0,R,input?'#01030b':'#0b132c',color+'c5',input?1.6:2.6);
          circle(c,-R*.1,-R*.1,R*.75,input?'#000105':color+'19');
          c.save();c.rotate(t*(input?-.65:.55));c.setLineDash([3,5]);circle(c,0,0,R+5,null,color+'9c',1.2);c.restore();
          if(!input){c.strokeStyle=color+'ba';c.lineWidth=1.2;for(let k=0;k<4;k++){const a=k*TAU/4+t*.12;c.save();c.rotate(a);c.beginPath();c.moveTo(R+9,0);c.lineTo(R+15,0);c.moveTo(R+12,-3);c.lineTo(R+15,0);c.lineTo(R+12,3);c.stroke();c.restore();}}
          text(c,pair.id,0,4,11*ui,input?'#d5c8ff':'#c3ffeb','center');
          text(c,input?'ВХОД':'ВЫХОД',0,R+19*ui,8*ui,color,'center');
          const last=view.state?.teleports?.at(-1),age=(view.state?.t||0)-(last?.t||-100);
          if(last?.id===pair.id&&age>=0&&age<.8&&!view.reducedMotion){circle(c,0,0,R+age*65,null,color+Math.floor((1-age/.8)*170).toString(16).padStart(2,'0'),2);}
          c.restore();
        }
      }
    }
    draw(level,view={}){
      this.resize();const c=this.ctx,t=view.time||0,color=view.color||'#6af4cd';
      const simTime=view.state?.t||0;
      const world={...level,planets:level.planets.map(p=>P.bodyAt(p,simTime)),target:P.bodyAt(level.target,simTime)};
      this.background(t,level.sector);c.save();if(view.camera){const cam=view.camera;c.translate(600,350);c.scale(cam.zoom,cam.zoom);c.translate(-cam.cx,-cam.cy);}this.orbitTracks(level,simTime,view.preview);
      if(view.grid)this.field(level,simTime);
      if(view.ghost?.length)path(c,view.ghost,view.review?'#ffd49dcc':'#a0abc344',view.review?2.8:1.5,[7,6]);
      if(view.preview){
        path(c,view.preview.points,color+'a0',2,[4,8]);
        const tail=view.preview.points.at(-1);
        if(tail){
          circle(c,tail.x,tail.y,4,color);
          if(view.preview.state.status==='flying')text(c,`+${view.preview.state.t.toFixed(1)} с`,tail.x+11,tail.y-10,10*this.uiScale,color);
          else if(view.preview.state.status==='won')text(c,'КОНТАКТ',tail.x-8,tail.y-48,11*this.uiScale,color,'right');
          else{text(c,'×',tail.x,tail.y+6,22,'#ff8795','center');}
        }
      }
      for(const p of world.planets)this.planet(p);
      (level.rocks||[]).forEach((p,i)=>this.rock(p,i));
      this.gates(level,view.state);this.flybys(level,view.state);this.portals(level,view);
      this.gravity(view.state,view.stats||{},t,view.reducedMotion);
      (level.cargo||[]).forEach((p,i)=>{
        const body=view.state?.cargoBodies?.[i];
        if(body?.phase==='lost'){text(c,'×',body.x,body.y,16,'#ee8997','center');return;}
        c.save();if(p.branch&&level.activeBranch&&p.branch!==level.activeBranch)c.globalAlpha=.3;this.cargo(body?{...body,label:p.label}:p,i,t,view.state?.cargo.includes(i),view.banked?.includes(i));c.restore();
      });
      for(let i=0;i<(level.stops||[]).length;i++){const stop=P.bodyAt(level.stops[i],simTime);c.save();c.globalAlpha=i<(view.state?.dropIndex||0)?.45:1;this.station({...stop,noLabel:true},t,stop.r);text(c,stop.id+' · '+stop.name,stop.x,stop.y+70,11*this.uiScale,'#ffd59d','center');c.restore();}
      this.station(world.target,t,P.captureRadius(level,view.stats||{}));
      if(level.rules?.window){
        const w=level.rules.window,st=view.state?.t||0,open=st>=w[0]&&st<=w[1];
        text(c,open?'ШЛЮЗ ОТКРЫТ':st>w[1]?'ШЛЮЗ ЗАКРЫТ':`${w[0].toFixed(2)}–${w[1].toFixed(2)} с`,world.target.x,world.target.y-48,10*Math.min(1.6,this.uiScale),open?'#6af4cd':'#ffba85','center');
      }
      circle(c,level.start.x,level.start.y,26,null,color+'55',1.2);
      circle(c,level.start.x,level.start.y,32,null,color+'22',1);
      text(c,'СТАРТ',level.start.x,level.start.y+32+10*this.uiScale,10*this.uiScale,'#839dab','center');
      if(view.trail?.length){
        path(c,view.trail,view.review?'#a4f3ff':color+'4f',view.review?2.6:1.4);
        if(view.state&&!['crash','lost','preview'].includes(view.state.status)){
          const pts=view.trail.concat([{x:view.state.x,y:view.state.y}]);
          O.Cosmetics.drawTrail(c,pts,view.trailStyle||'vector',t,color,view.reducedMotion,Math.min(1.55,this.uiScale));
        }
      }
      if(view.state){
        const s=view.state;
        if(!['crash','lost','preview'].includes(s.status))ship(c,s.x,s.y,Math.atan2(s.vy,s.vx),color,Math.min(1.65,this.uiScale),false,t);
      }else if(!view.hideShip){
        const angle=-P.rad(view.angle||0);const len=40+(view.speed||200)*0.35;
        c.save();c.translate(level.start.x,level.start.y);c.rotate(angle);
        c.strokeStyle=color+'80';c.lineWidth=1.3;c.beginPath();c.moveTo(33,0);c.lineTo(len,0);c.lineTo(len-7,-4);c.moveTo(len,0);c.lineTo(len-7,4);c.stroke();c.restore();
        ship(c,level.start.x,level.start.y,angle,color,Math.min(1.75,1.1*this.uiScale));
      }
      for(const p of view.particles||[]){
        c.globalAlpha=Math.max(0,p.life/p.maxLife);circle(c,p.x,p.y,p.r,p.color);c.globalAlpha=1;
      }
      if(view.state?.status==='won'){
        circle(c,view.state.x,view.state.y,30+Math.sin(t*3)*6,null,'#6af4cd50',2);
      }
      c.restore();
    }
    hero(t,color='#6af4cd',pointer={x:0,y:0}){
      // A full closed orbit: position and tangent are continuous at every wrap.
      // Pointer parallax is decorative and never influences the game physics.
      this.resize();const c=this.ctx,px=pointer.x||0,py=pointer.y||0;
      this.background(t,12);
      c.save();c.translate(px*7,py*5);
      for(const [x,y,r,rgb] of [[770,245,430,'91,93,191'],[520,460,330,'44,172,158']]){
        const glow=c.createRadialGradient(x+Math.sin(t*.09)*25,y,0,x,y,r);
        glow.addColorStop(0,`rgba(${rgb},.13)`);glow.addColorStop(1,`rgba(${rgb},0)`);
        circle(c,x,y,r,glow);
      }
      // Near stars drift a little faster than the background.
      for(let i=0;i<22;i++){
        const star=this.stars[i],x=(star.x+t*(.4+i%3*.23))%1200;
        circle(c,x-px*(5+i%4),star.y-py*6,star.r*.85,'#d1eaf03d');
      }
      const cx=664,cy=354,tilt=-.26;
      const orbit=(a,rx=324,ry=132)=>({x:cx+Math.cos(a)*rx*Math.cos(tilt)-Math.sin(a)*ry*Math.sin(tilt),
        y:cy+Math.cos(a)*rx*Math.sin(tilt)+Math.sin(a)*ry*Math.cos(tilt),z:Math.sin(a)});
      for(const [rx,ry] of [[265,110],[324,132],[395,212]]){
        const points=[];for(let i=0;i<=120;i++)points.push(orbit(i*TAU/120,rx,ry));
        path(c,points,rx===324?color+'35':'#aac8e01d',rx===324?1.5:1,[3,9]);
      }
      const theta=t*.23-1.05,q=orbit(theta),q2=orbit(theta+.001);
      const moon=orbit(t*.13+2.4,230,112);
      const courier=()=>{
        const trail=[];for(let i=0;i<=48;i++)trail.push(orbit(theta-.46+i*.46/48));
        path(c,trail,color+'12',12);path(c,trail,color+'49',3);
        const short=[];for(let i=0;i<=15;i++)short.push(orbit(theta-.12+i*.12/15));
        path(c,short,color+'b0',2);
        ship(c,q.x,q.y,Math.atan2(q2.y-q.y,q2.x-q.x),color,1.55+(q.z+1)*.23,true,t);
      };
      const moonDraw=()=>this.planet({x:moon.x,y:moon.y,r:23,tint:'#c2b2ed',name:'',ring:false});
      c.save();c.translate(cx,cy);c.rotate(tilt);
      for(let k=0;k<6;k++){
        c.beginPath();c.ellipse(0,0,225+k*3,63+k*.7,0,Math.PI,TAU);
        c.strokeStyle='#8bbebd24';c.lineWidth=1.3;c.stroke();
      }c.restore();
      if(moon.z<0)moonDraw();
      if(q.z<0)courier();
      this.planet({x:cx,y:cy,r:141,tint:'#6fcbbb',name:'',ring:false});
      // Slowly moving cloud bands clipped to the sphere, with an atmosphere rim.
      c.save();c.beginPath();c.arc(cx,cy,140,0,TAU);c.clip();
      for(let k=0;k<8;k++){
        const sy=cy-95+k*29,offset=Math.sin(t*.13+k)*16;
        c.beginPath();c.ellipse(cx+offset,sy,160,8+k%3, -.14,0,TAU);
        c.strokeStyle=k%2?'#b3fff31a':'#1c7d8225';c.lineWidth=5+k%3*3;c.stroke();
      }
      c.restore();
      circle(c,cx,cy,145,null,'#9dfff331',2);circle(c,cx,cy,149,null,'#8eeed31a',3);
      // Front half of the rings lies in front of the sphere.
      c.save();c.translate(cx,cy);c.rotate(tilt);
      for(let k=0;k<6;k++){
        c.beginPath();c.ellipse(0,0,225+k*3,63+k*.7,0,0,Math.PI);
        c.strokeStyle=k%2?'#9af6df48':'#c5eee926';c.lineWidth=1.4;c.stroke();
      }c.restore();
      if(moon.z>=0)moonDraw();
      if(q.z>=0)courier();
      // A moving beacon and smooth radio waves, not a blinking/strobing overlay.
      const dock=orbit(t*.095+1.1,398,208);
      this.station({...dock,noLabel:true},t,20);
      for(let k=0;k<2;k++){
        const u=(t*.25+k*.5)%1;circle(c,dock.x,dock.y,32+u*37,null,`rgba(122,239,208,${.16*Math.sin(u*Math.PI)})`,1);
      }
      // A parcel on the route is gently drawn into the passing courier.
      const parcelAngle=.8,parcel=orbit(parcelAngle),delta=((theta-parcelAngle+Math.PI)%TAU+TAU)%TAU-Math.PI;
      const progress=delta>=-.38&&delta<.12?P.clamp((delta+.38)/.50,0,1):0,smooth=progress*progress*(3-2*progress);
      const visible=delta<.12?1:delta<1.5?0:P.clamp((delta-1.5)/.5,0,1);
      if(visible>0){
        c.save();c.globalAlpha=visible;
        const pos={x:parcel.x+(q.x-parcel.x)*smooth,y:parcel.y+(q.y-parcel.y)*smooth};
        if(progress>0&&progress<1){
          const mx=(pos.x+q.x)/2,my=(pos.y+q.y)/2-22;
          c.beginPath();c.moveTo(pos.x,pos.y);c.quadraticCurveTo(mx,my,q.x,q.y);
          c.strokeStyle='#cdb9ff75';c.lineWidth=1.2;c.stroke();
        }
        this.cargo(pos,0,t,false,false);c.restore();
      }
      // A rare, fading distant meteor. Both ends of its cycle are transparent.
      const u=(t%17)/17;
      if(u<.10){const f=u/.10,x=250+f*600,y=105+f*95;
        path(c,[{x:x-90,y:y-14},{x,y}],`rgba(201,225,255,${.25*Math.sin(Math.PI*f)})`,1.5);}
      text(c,'ТРАФИК / СЕКТОР 239',664,646,11,'#688b9d','center');
      c.restore();
    }
  }
  O.Renderer=Renderer;O.drawShip=ship;
})(typeof globalThis!=='undefined'?globalThis:window);

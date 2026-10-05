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
    // Twin engine courier: the silhouette stays legible at flight scale.
    ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=color;ctx.lineWidth=1;
    for(const side of [-1,1]){
      ctx.beginPath();ctx.moveTo(3,side*4);ctx.lineTo(-7,side*10);ctx.lineTo(-12,side*9);ctx.lineTo(-8,side*3);ctx.closePath();
      ctx.fillStyle='#426471';ctx.fill();ctx.stroke();
      ctx.fillStyle=color;ctx.fillRect(-12,side*8-1,4,2);
    }
    const hull=ctx.createLinearGradient(0,-6,0,6);hull.addColorStop(0,'#f3fffd');hull.addColorStop(.5,'#bcd4d8');hull.addColorStop(1,'#6e939d');
    ctx.beginPath();ctx.moveTo(16,0);ctx.quadraticCurveTo(8,-7,-4,-5);ctx.lineTo(-10,-3);ctx.lineTo(-10,3);ctx.lineTo(-4,5);ctx.quadraticCurveTo(8,7,16,0);
    ctx.fillStyle=hull;ctx.fill();ctx.strokeStyle='#defaf4';ctx.stroke();
    ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(4,-3);ctx.lineTo(1,-2.4);ctx.lineTo(1,2.4);ctx.lineTo(4,3);ctx.closePath();
    ctx.fillStyle='#123a4d';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=.7;ctx.stroke();
    ctx.fillStyle='#344c5b';ctx.fillRect(-7,-2.5,5,5);ctx.strokeStyle='#e9c990';ctx.strokeRect(-6.5,-2,4,4);
    ctx.beginPath();ctx.moveTo(-4.5,-2);ctx.lineTo(-4.5,2);ctx.stroke();
    ctx.restore();
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
      this.ctx.setTransform(1,0,0,1,0,0);this.ctx.fillStyle='#07131e';this.ctx.fillRect(0,0,w,h);
      const fit=Math.min(w/1200,h/700);
      this.ctx.setTransform(fit,0,0,fit,(w-1200*fit)/2,(h-700*fit)/2);
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
    planetTexture(p){
      const size=p.r>100?512:256,key=[p.name,p.tint,p.surface,p.ring,size].join('/');
      if(this.planetCache.has(key))return this.planetCache.get(key);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      const c=canvas.getContext('2d'),r=size/2,seed=[...(p.name||p.tint)].reduce((n,ch)=>Math.imul(n,31)+ch.charCodeAt(0)|0,239),random=rng(seed);
      c.translate(r,r);c.scale(r/128,r/128);c.beginPath();c.arc(0,0,127,0,TAU);c.clip();
      c.fillStyle=p.tint;c.fillRect(-128,-128,256,256);
      const surface=p.surface||(p.ring?'gas':['rock','gas','ice','ocean','lava'][(seed>>>0)%5]);
      c.save();c.rotate(-.24);
      if(surface==='gas'){
        // Latitude bands curve around the sphere, with small turbulent eddies.
        for(let i=0;i<45;i++){
          const y=-145+i*6.5;c.beginPath();c.moveTo(-150,y);
          c.bezierCurveTo(-50,y+18+random()*12,50,y-20,150,y+5);
          c.strokeStyle=i%3?'#092b3824':'#edffed38';c.lineWidth=2+random()*7;c.stroke();
        }
        for(let i=0;i<26;i++){
          const y=(random()-.5)*210,x=(random()-.5)*190;
          c.beginPath();c.ellipse(x,y,5+random()*19,1.5+random()*4,-.1,0,TAU);
          c.strokeStyle=i%2?'#e9ffe52c':'#143c4938';c.lineWidth=1.2;c.stroke();
        }
      }else if(surface==='ice'){
        c.fillStyle='#7faccc';c.fillRect(-128,-128,256,256);
        for(let i=0;i<32;i++){
          const x=(random()-.5)*250,y=(random()-.5)*250;
          c.beginPath();c.moveTo(x,y);for(let j=0;j<6;j++)c.lineTo(x+j*9+(random()-.5)*16,y+j*5+(random()-.5)*21);
          c.strokeStyle='#234e6975';c.lineWidth=2+random()*3;c.stroke();c.translate(-1,-1);c.strokeStyle='#e1ffffa0';c.lineWidth=.8;c.stroke();c.translate(1,1);
        }
        for(let i=0;i<18;i++){c.beginPath();c.ellipse((random()-.5)*200,(random()-.5)*210,12+random()*25,3+random()*9,-.3,0,TAU);c.fillStyle='#d8ffff35';c.fill();}
        c.beginPath();c.ellipse(-10,-104,93,33,-.12,0,TAU);c.fillStyle='#efffffbb';c.fill();
        c.beginPath();c.ellipse(20,112,74,21,-.12,0,TAU);c.fillStyle='#ceeaf28a';c.fill();
      }else if(surface==='ocean'){
        c.fillStyle='#1d6886';c.fillRect(-128,-128,256,256);
        for(let i=0;i<13;i++){
          const x=(random()-.5)*235,y=(random()-.5)*220,radius=8+random()*30;
          c.beginPath();for(let j=0;j<=22;j++){const a=j*TAU/22,rr=radius*(.5+random()*.5),px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr*.8;j?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();
          c.strokeStyle='#79e1c56b';c.lineWidth=5;c.stroke();c.fillStyle=i%2?'#699664':'#457b5e';c.fill();c.strokeStyle='#adc98c88';c.lineWidth=.7;c.stroke();
        }
        for(let i=0;i<24;i++){
          const x=(random()-.5)*250,y=(random()-.5)*245;c.beginPath();c.moveTo(x-22,y);c.bezierCurveTo(x-5,y-9,x+15,y+10,x+30,y-2);c.strokeStyle='#edfff99b';c.lineWidth=2+random()*3;c.stroke();
        }
        const glint=c.createRadialGradient(-42,-45,0,-42,-45,47);glint.addColorStop(0,'#efffff70');glint.addColorStop(1,'transparent');circle(c,-42,-45,47,glint);
      }else if(surface==='lava'){
        c.fillStyle='#36282c';c.fillRect(-128,-128,256,256);
        for(let i=0;i<40;i++){
          const x=(random()-.5)*260,y=(random()-.5)*260;c.beginPath();c.moveTo(x,y);for(let j=1;j<7;j++)c.lineTo(x+j*7+(random()-.5)*25,y+j*5+(random()-.5)*24);
          c.strokeStyle='#ef582438';c.lineWidth=7;c.stroke();c.strokeStyle='#ec6239c0';c.lineWidth=2;c.stroke();c.strokeStyle='#ffcf70cc';c.lineWidth=.65;c.stroke();
        }
        for(let i=0;i<16;i++){const x=(random()-.5)*200,y=(random()-.5)*220,radius=2+random()*6;circle(c,x,y,radius+3,'#120f20b0','#a64b36',1);circle(c,x,y,radius,'#f28a3a');circle(c,x-1,y-1,radius*.35,'#ffe4a1');}
      }else{
        // Overlapping geological plates and crater rims, stable between frames.
        for(let i=0;i<55;i++){
          const x=(random()-.5)*260,y=(random()-.5)*260,radius=5+random()*22;
          c.beginPath();for(let k=0;k<=12;k++){const a=k*TAU/12,rr=radius*(.6+random()*.4);k?c.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr):c.moveTo(x+rr,y);}c.closePath();
          c.fillStyle=i%3?'#16334627':'#e1dccc23';c.fill();
        }
        for(let i=0;i<60;i++){
          const x=(random()-.5)*250,y=(random()-.5)*250,rr=1.3+random()**2*12;
          circle(c,x,y,rr,'#13233442');
          c.beginPath();c.arc(x,y,rr,-.7,2.4);c.strokeStyle='#f1eedb48';c.lineWidth=.8;c.stroke();
          circle(c,x-rr*.2,y-rr*.2,rr*.64,'#11273825');
        }
      }
      for(let i=0;i<1100;i++){
        c.fillStyle=i%2?'#ffffff12':'#03142518';const dot=.25+random()*.7;c.fillRect((random()-.5)*256,(random()-.5)*256,dot,dot);
      }
      c.restore();
      const light=c.createRadialGradient(-49,-52,10,-15,-18,150);
      light.addColorStop(0,'#ffffe74a');light.addColorStop(.48,'#ffffff08');light.addColorStop(.8,'#03122550');light.addColorStop(1,'#020918dc');
      c.fillStyle=light;c.fillRect(-128,-128,256,256);
      const night=c.createLinearGradient(-100,-75,116,70);night.addColorStop(0,'transparent');night.addColorStop(.5,'#05152600');night.addColorStop(.78,'#06112266');night.addColorStop(1,'#020713ed');
      c.fillStyle=night;c.fillRect(-128,-128,256,256);
      c.beginPath();c.arc(0,0,125,2.8,5.1);c.strokeStyle='#effffb63';c.lineWidth=1;c.stroke();
      // Bound retained textures when browsing many contracts in one renderer.
      if(this.planetCache.size>=12)this.planetCache.delete(this.planetCache.keys().next().value);
      this.planetCache.set(key,canvas);return canvas;
    }
    planet(p){
      const c=this.ctx;
      const halo=c.createRadialGradient(p.x,p.y,p.r*.94,p.x,p.y,p.r*1.3);
      halo.addColorStop(0,p.tint+'36');halo.addColorStop(.35,p.tint+'12');halo.addColorStop(1,'transparent');circle(c,p.x,p.y,p.r*1.3,halo);
      const rings=front=>{
        if(!p.ring)return;c.save();c.translate(p.x,p.y);c.rotate(-.24);
        for(let i=0;i<15;i++){c.beginPath();c.ellipse(0,0,p.r*(1.4+i*.023),p.r*(.34+i*.006),0,front?0:Math.PI,front?Math.PI:TAU);c.strokeStyle=p.tint+(i%4===0?'12':front?'68':'36');c.lineWidth=Math.max(.6,p.r*.012);c.stroke();}c.restore();
      };
      rings(false);c.drawImage(this.planetTexture(p),p.x-p.r,p.y-p.r,p.r*2,p.r*2);rings(true);
      circle(c,p.x,p.y,p.r,null,p.tint+'75',1.1);
      if(p.name)text(c,p.name.toUpperCase(),p.x,p.y+p.r+18+11*this.uiScale,11*this.uiScale,'#9aaebf','center');
    }
    starClusters(t,pointer,w=1200,h=700){
      const c=this.ctx;
      if(!this.clusterStars){
        const random=rng(23991);
        this.clusterStars=Array.from({length:820},(_,i)=>({group:i%3,a:random()*TAU,r:Math.pow(random(),.65),z:random(),size:.35+random()**4*2.1,phase:random()*TAU}));
        this.starGlows=['133,211,255','186,169,255','255,218,169'].map(rgb=>{
          const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
          g.addColorStop(0,'rgba('+rgb+',.9)');g.addColorStop(.12,'rgba('+rgb+',.45)');g.addColorStop(.4,'rgba('+rgb+',.09)');g.addColorStop(1,'rgba('+rgb+',0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return canvas;
        });
      }
      const px=(pointer.x+1)*w/2,py=(pointer.y+1)*h/2,strength=pointer.strength||0;
      const groups=[[555,105,260,.42,-.3],[955,165,180,.62,.4],[925,572,225,.36,-.48]].map(([x,y,r,flat,tilt])=>[x*w/1200,y*h/700,r*Math.min(w/1200,h/700),flat,tilt]);
      c.save();c.globalCompositeOperation='screen';
      for(let j=0;j<groups.length;j++){
        const [x,y,r,flatten,tilt]=groups[j];c.save();c.translate(x+pointer.x*12,y+pointer.y*8);c.rotate(tilt);c.scale(1,flatten);
        c.globalAlpha=.3;c.drawImage(this.starGlows[j],-r,-r,r*2,r*2);c.restore();
      }
      const count=this.canvas.clientWidth<600?440:this.clusterStars.length;
      for(let i=0;i<count;i++){
        const s=this.clusterStars[i],[cx,cy,r,flatten,tilt]=groups[s.group],a=s.a+t*(.015+s.z*.012)+s.r*4.3;
        const dx=Math.cos(a)*r*s.r,dy=Math.sin(a)*r*s.r*flatten;
        let x=cx+dx*Math.cos(tilt)-dy*Math.sin(tilt)+pointer.x*(8+s.z*13),y=cy+dx*Math.sin(tilt)+dy*Math.cos(tilt)+pointer.y*(5+s.z*10);
        const vx=px-x,vy=py-y,dist=Math.hypot(vx,vy),pull=Math.exp(-dist*dist/100000)*strength;
        // Smooth attraction with a tangential component: a small stellar vortex.
        x+=(vx*.55-vy*.20)*pull;y+=(vy*.55+vx*.20)*pull;
        const light=(.38+.3*s.z+.16*Math.sin(t*.55+s.phase))*(1+pull*.6);
        c.globalAlpha=Math.min(1,light);
        if(s.size>1.1){const radius=s.size*(5+pull*5);c.drawImage(this.starGlows[s.group],x-radius,y-radius,radius*2,radius*2);}
        circle(c,x,y,s.size*(.8+pull*.5),s.group===2?'#ffe1b1':s.group===1?'#ddd3ff':'#c8eeff');
        if(s.size>2.2){c.globalAlpha=light*.3;c.strokeStyle='#edfaff';c.lineWidth=.6;c.beginPath();c.moveTo(x-5,y);c.lineTo(x+5,y);c.moveTo(x,y-5);c.lineTo(x,y+5);c.stroke();}
      }
      c.restore();
    }
    rockTexture(p,index){
      this.rockCache??=new Map();const seed=(Math.round(p.x*31+p.y*71+p.r*113)+index*827)>>>0,key=String(seed);
      if(this.rockCache.has(key))return this.rockCache.get(key);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=224;const c=canvas.getContext('2d'),random=rng(seed),kind=seed%3;
      c.translate(112,112);const vertices=Array.from({length:14},(_,i)=>{const a=i*TAU/14,r=98*(.91+random()*.09);return {x:Math.cos(a)*r,y:Math.sin(a)*r};});
      const outline=()=>{c.beginPath();vertices.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();};
      outline();c.save();c.clip();const g=c.createLinearGradient(-70,-85,70,85),pal=[['#b2a18a','#665f59','#262f3c'],['#829bad','#485e70','#202d3b'],['#b2a8a0','#67626a','#272b39']][kind];g.addColorStop(0,pal[0]);g.addColorStop(.5,pal[1]);g.addColorStop(1,pal[2]);c.fillStyle=g;c.fillRect(-110,-110,220,220);
      // Broad fracture planes, then small pitting: detail remains coherent when small.
      for(let i=0;i<14;i++){const v=vertices[i],w=vertices[(i+1)%14];c.beginPath();c.moveTo(v.x,v.y);c.lineTo(w.x,w.y);c.lineTo((random()-.5)*70,(random()-.5)*65);c.closePath();c.fillStyle=i<7?'#07162526':'#fff1d318';c.fill();c.strokeStyle='#121c2b28';c.lineWidth=1;c.stroke();}
      for(let i=0;i<13;i++){const x=(random()-.5)*158,y=(random()-.5)*158,r=5+random()*16;c.save();c.translate(x,y);c.rotate(random()*TAU);c.scale(1,.72);const pit=c.createRadialGradient(-r*.3,-r*.3,1,0,0,r);pit.addColorStop(0,'#162132bb');pit.addColorStop(.75,'#25314099');pit.addColorStop(1,'#e2d3b544');circle(c,0,0,r,pit);c.beginPath();c.arc(0,0,r,.2,2.7);c.strokeStyle='#e0d6c870';c.lineWidth=1.5;c.stroke();c.restore();}
      for(let i=0;i<3;i++){c.beginPath();let x=(random()-.5)*110,y=-75+random()*30;c.moveTo(x,y);for(let j=0;j<5;j++){x+=(random()-.5)*28;y+=18+random()*9;c.lineTo(x,y);}c.strokeStyle='#101d2c99';c.lineWidth=2.3;c.stroke();c.translate(-1,-1);c.strokeStyle=kind===1?'#a0c6d566':'#d6bc9455';c.lineWidth=.7;c.stroke();c.translate(1,1);}
      for(let i=0;i<140;i++){c.fillStyle=i%3?'#091b2926':'#ecdfc235';c.fillRect((random()-.5)*195,(random()-.5)*195,1+random()*2,1+random()*2);}
      const shade=c.createRadialGradient(-38,-45,15,12,18,125);shade.addColorStop(0,'#ffffff00');shade.addColorStop(.65,'#101b3010');shade.addColorStop(1,'#081425aa');c.fillStyle=shade;c.fillRect(-110,-110,220,220);c.restore();
      outline();c.strokeStyle='#d0d7d472';c.lineWidth=1.2;c.stroke();
      if(this.rockCache.size>=48)this.rockCache.delete(this.rockCache.keys().next().value);this.rockCache.set(key,canvas);return canvas;
    }
    rock(p,index){
      const c=this.ctx;c.drawImage(this.rockTexture(p,index),p.x-p.r*112/98,p.y-p.r*112/98,p.r*224/98,p.r*224/98);
      // Exact collision envelope: the broken silhouette never conceals its boundary.
      circle(c,p.x,p.y,p.r,null,'#a6b7c433',.65);
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
      // Reinforced freight capsule with separate lit top, front and side faces.
      const front=c.createLinearGradient(-12,-10,12,14);front.addColorStop(0,banked?'#78857e':'#f8ce83');front.addColorStop(.45,banked?'#526763':'#ba803d');front.addColorStop(1,'#425461');
      c.beginPath();c.moveTo(-13,-8);c.lineTo(6,-8);c.lineTo(10,-4);c.lineTo(10,13);c.lineTo(-10,13);c.lineTo(-13,9);c.closePath();c.fillStyle=front;c.fill();c.strokeStyle=amber;c.lineWidth=1;c.stroke();
      c.beginPath();c.moveTo(-13,-8);c.lineTo(-6,-15);c.lineTo(12,-15);c.lineTo(17,-10);c.lineTo(10,-4);c.lineTo(6,-8);c.closePath();c.fillStyle=banked?'#9cafac':'#f4dda8';c.fill();c.strokeStyle='#e6f1e2';c.lineWidth=.7;c.stroke();
      c.beginPath();c.moveTo(10,-4);c.lineTo(17,-10);c.lineTo(17,7);c.lineTo(10,13);c.closePath();c.fillStyle='#334b58';c.fill();c.strokeStyle='#94adac';c.stroke();
      for(const x of [-9,5]){c.fillStyle='#d5e4df';c.fillRect(x,-6,3,17);c.fillStyle='#526d75';c.fillRect(x+1,-3,1,12);c.fillStyle='#eef4de';c.fillRect(x-1,-7,5,3);c.fillRect(x-1,9,5,3);}
      c.fillStyle='#193641';c.fillRect(-5,-3,9,12);c.strokeStyle='#70898c';c.strokeRect(-5,-3,9,12);
      c.fillStyle=banked?'#b8d6ce':'#fff1c4';c.font='bold 9px ui-monospace,Consolas,monospace';c.textAlign='center';c.fillText(p.label||String(i+1),-.5,6);
      c.strokeStyle='#718c92';c.lineWidth=1.5;c.beginPath();c.moveTo(-4,-11);c.lineTo(-1,-14);c.lineTo(6,-14);c.lineTo(8,-12);c.stroke();
      c.fillStyle='#486f7b';for(let k=0;k<3;k++)c.fillRect(12,-3+k*3,3,1);
      c.fillStyle='#1a323d';c.fillRect(-5,-6,8,2);c.fillStyle=banked?'#73ba9d':'#9dffe3';c.fillRect(-4,-6,5,1.3);
      circle(c,8,-10,1.3,banked?'#8ec7b4':'#b8ffe5');c.restore();
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
        const angle=-P.rad(view.angle||0);const len=view.aimPointer?Math.hypot(view.aimPointer.x-level.start.x,view.aimPointer.y-level.start.y):40+(view.speed||200)*0.35;
        c.save();c.translate(level.start.x,level.start.y);c.rotate(angle);
        c.strokeStyle=color+'80';c.lineWidth=1.3;c.beginPath();c.moveTo(33,0);c.lineTo(len,0);c.lineTo(len-7,-4);c.moveTo(len,0);c.lineTo(len-7,4);c.stroke();c.restore();
        if(view.aimPointer){const p=view.aimPointer;circle(c,p.x,p.y,9*this.uiScale,null,color+'90',1.5);text(c,Math.round(view.speed)+' ед./с',p.x,p.y-18*this.uiScale,11*this.uiScale,'#e0fff5','center');}
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
      // The scene uses viewport pixels; spheres retain their shape at every ratio.
      const c=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;
      if(!w||!h)return;
      const dpr=Math.min(root.devicePixelRatio||1,w*h>1800000?1.25:1.5);
      const bw=Math.round(w*dpr),bh=Math.round(h*dpr);
      if(this.canvas.width!==bw||this.canvas.height!==bh){this.canvas.width=bw;this.canvas.height=bh;}
      c.setTransform(dpr,0,0,dpr,0,0);this.uiScale=1;
      c.fillStyle='#060d15';c.fillRect(0,0,w,h);
      const mobile=w<700,px=pointer.x||0,py=pointer.y||0;
      const cx=w*(mobile?.87:.77)+px*9,cy=h*(mobile?.57:.48)+py*7;
      const radius=mobile?Math.min(w*.35,190):Math.min(h*.25,w*.18,270);
      const glow=(x,y,r,rgb,alpha)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba('+rgb+','+alpha+')');g.addColorStop(1,'rgba('+rgb+',0)');circle(c,x,y,r,g);};
      glow(cx,cy,radius*3.5,'43,108,120',.20);
      glow(w*.55+Math.sin(t*.035)*w*.07,h*.15,w*.55,'64,62,113',.13);
      glow(w*.18,h*.9,w*.42,'37,91,100',.12);
      for(const [i,star] of this.stars.entries()){
        const depth=.3+i%4*.24,x=(star.x/1200*w+t*depth*.9)%w-px*depth*9,y=star.y/700*h-py*depth*7;
        circle(c,x,y,star.r*(i%7===0?1:.65),'rgba(205,227,239,'+(star.a*(.5+.12*Math.sin(t*.55+star.p)))+')');
      }
      // Star fields fill the whole window, independent from the planet composition.
      c.save();c.globalAlpha=.65;this.starClusters(t,pointer,w,h);c.restore();
      const tilt=-.32,orbit=(a,rx=radius*1.85,ry=radius*.64)=>({x:cx+Math.cos(a)*rx*Math.cos(tilt)-Math.sin(a)*ry*Math.sin(tilt),y:cy+Math.cos(a)*rx*Math.sin(tilt)+Math.sin(a)*ry*Math.cos(tilt),z:Math.sin(a)});
      for(const scale of [1,1.28,1.62]){c.beginPath();c.ellipse(cx,cy,radius*1.85*scale,radius*.64*scale,tilt,0,TAU);c.strokeStyle=scale===1?'#a3cfcb25':'#a3cfcb10';c.lineWidth=.7;c.stroke();}
      // Tiny markers drift along an outer orbit; there are no abrupt resets.
      for(let i=0;i<8;i++){const p=orbit(i*TAU/8+t*.012,radius*3,radius*1.04);circle(c,p.x,p.y,1.5,'#a7d5cd65');}
      const theta=t*.16-.65,q=orbit(theta),tangent=orbit(theta+.002),moon=orbit(t*.065+2.6,radius*2.3,radius*.8);
      const courier=()=>{const trail=[];for(let i=0;i<65;i++){const p=orbit(theta-.7+i*.7/64);trail.push(p);}
        path(c,trail,color+'10',9);path(c,trail,color+'35',3);path(c,trail.slice(40),color+'a0',1.5);
        glow(q.x,q.y,24,'149,242,212',.14);
        ship(c,q.x,q.y,Math.atan2(tangent.y-q.y,tangent.x-q.x),color,mobile?.85:1.1,true,t);
      };
      const drawMoon=()=>this.planet({x:moon.x,y:moon.y,r:radius*.13,tint:'#b8b7d1',surface:'crater',name:''});
      if(moon.z<0)drawMoon();if(q.z<0)courier();
      this.planet({x:cx,y:cy,r:radius,tint:'#76baa9',surface:'gas',name:'',ring:false});
      c.save();c.beginPath();c.arc(cx,cy,radius,0,TAU);c.clip();
      for(let i=0;i<9;i++){c.beginPath();c.ellipse(cx+Math.sin(t*.065+i)*radius*.07,cy-radius*.8+i*radius*.2,radius*1.2,radius*.03,-.15,0,TAU);c.lineWidth=radius*.025;c.strokeStyle=i%2?'#b6f7e416':'#052c3d24';c.stroke();}
      const shadow=c.createLinearGradient(cx-radius,cy-radius,cx+radius,cy+radius*.2);shadow.addColorStop(0,'#06101a00');shadow.addColorStop(.46,'#06101a08');shadow.addColorStop(.77,'#06101a95');shadow.addColorStop(1,'#06101aed');c.fillStyle=shadow;c.fillRect(cx-radius,cy-radius,radius*2,radius*2);c.restore();
      c.beginPath();c.arc(cx,cy,radius+1,Math.PI*.78,Math.PI*1.82);c.strokeStyle='#a2eee760';c.lineWidth=1.5;c.stroke();
      if(moon.z>=0)drawMoon();if(q.z>=0)courier();
      const dock=orbit(t*.045+1.3,radius*2.37,radius*.82);this.station({...dock,noLabel:true},t,mobile?10:15);
      const wave=(t*.16)%1;circle(c,dock.x,dock.y,19+wave*30,null,'rgba(148,220,208,'+(.12*Math.sin(wave*Math.PI))+')',.8);
      const meteor=(t%23)/23;if(meteor<.075){const f=meteor/.075,x=w*(.22+f*.36),y=h*(.12+f*.12);path(c,[{x:x-w*.06,y:y-h*.02},{x,y}],'rgba(201,225,255,'+(.3*Math.sin(Math.PI*f))+')',1);}
    }
  }
  O.Renderer=Renderer;O.drawShip=ship;
})(typeof globalThis!=='undefined'?globalThis:window);

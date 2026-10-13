/* An artistic, deliberately slowed pulsar. Dipole field r=L sin²(theta),
   oblique magnetic axis, opposite sweeping beams. No accretion-disc bitmap.
   All geometry, surface texture, light and particles are generated locally. */
function createPulsarRenderer(canvas){
 const ctx=canvas.getContext('2d'),TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x));
 let seed=13871;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const lattice=Float32Array.from({length:65536},rand),fade=t=>t*t*(3-2*t);
 function noise(x,y){const ix=Math.floor(x),iy=Math.floor(y),u=fade(x-ix),v=fade(y-iy),at=(a,b)=>lattice[((b&255)<<8)+(a&255)];return(at(ix,iy)*(1-u)+at(ix+1,iy)*u)*(1-v)+(at(ix,iy+1)*(1-u)+at(ix+1,iy+1)*u)*v;}
 function fbm(x,y){let n=0,a=.54;for(let i=0;i<4;i++){n+=a*noise(x,y);x=x*2.03+17;y=y*2.03+31;a*=.46;}return n;}
 function sprite(color){const c=document.createElement('canvas');c.width=c.height=128;const d=c.getContext('2d'),g=d.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,`rgba(${color},.9)`);g.addColorStop(.07,`rgba(${color},.5)`);g.addColorStop(.25,`rgba(${color},.15)`);g.addColorStop(1,`rgba(${color},0)`);d.fillStyle=g;d.fillRect(0,0,128,128);return c;}
 const blue=sprite('85,157,255'),cyan=sprite('134,224,255'),white=sprite('224,244,255'),violet=sprite('133,108,243');
 const beacon=document.createElement('canvas');beacon.width=beacon.height=480;
 const texW=1024,texH=512,texture=new Float32Array(texW*texH);
 for(let y=0;y<texH;y++)for(let x=0;x<texW;x++){
  // Periodic longitude: use a torus-like noise coordinate to avoid a seam.
  const a=x/texW*TAU,n=fbm(11+Math.cos(a)*3+y/140,17+Math.sin(a)*3+y/67),f=fbm(32+Math.cos(a)*12+y/43,45+Math.sin(a)*12+y/65);
  texture[y*texW+x]=clamp(.15+n*.68+Math.pow(1-Math.abs(f-.50)*2,14)*.32);
 }
 const sphere=document.createElement('canvas');sphere.width=sphere.height=256;const sc=sphere.getContext('2d'),pixels=sc.createImageData(256,256),normals=[];
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const nx=(x-127.5)/126,ny=(127.5-y)/126,r2=nx*nx+ny*ny;if(r2>1)continue;const nz=Math.sqrt(1-r2);normals.push({i:(y*256+x)*4,x:nx,y:ny,z:nz,u:(Math.atan2(nx,nz)/TAU+.5)*texW,v:Math.acos(ny)/Math.PI*(texH-1),rim:Math.pow(1-nz,.7)});}
 const lines=[];
 for(let shell=0;shell<5;shell++)for(let k=0;k<12;k++){
  const L=2.1+shell*.54,phi=k/12*TAU+shell*.075,start=Math.asin(Math.sqrt(1/L)),points=[];
  for(let j=0;j<=76;j++){const th=start+(Math.PI-2*start)*j/76,r=L*Math.sin(th)**2;points.push([r*Math.sin(th)*Math.cos(phi),r*Math.cos(th),r*Math.sin(th)*Math.sin(phi)]);}
  lines.push({L,phi,start,points,bright:rand(),shell});
 }
 const motes=Array.from({length:1160},(_,i)=>({line:lines[i%lines.length],phase:rand(),speed:.022+rand()*.055,size:.45+rand()*.92,light:.2+rand()*.75,warm:i%19===0}));
 const wind=Array.from({length:640},(_,i)=>({phase:rand(),angle:rand()*TAU,height:(rand()-.5)*1.1,speed:.013+rand()*.025,size:.4+rand(),warm:i%23===0}));
 let matrix=[],view={x:1206,y:526,r:96},phase=0,stats={};
 function orient(t){
  phase=t*.34+.75;const c=Math.cos(phase),s=Math.sin(phase),b=.46,cb=Math.cos(b),sb=Math.sin(b),cx=Math.cos(.40),sx=Math.sin(.40),cz=Math.cos(-.38),sz=Math.sin(-.38);
  // Magnetic tilt about Z, stellar spin about Y, then a fixed viewing angle.
  matrix=[];for(const v of [[1,0,0],[0,1,0],[0,0,1]]){let x=v[0]*cb-v[1]*sb,y=v[0]*sb+v[1]*cb,z=v[2];[x,z]=[x*c+z*s,-x*s+z*c];[y,z]=[y*cx-z*sx,y*sx+z*cx];matrix.push([x*cz-y*sz,x*sz+y*cz,z]);}
 }
 function project(x,y,z){const a=matrix,X=x*a[0][0]+y*a[1][0]+z*a[2][0],Y=x*a[0][1]+y*a[1][1]+z*a[2][1],Z=x*a[0][2]+y*a[1][2]+z*a[2][2],q=14/(14-Z);return{x:view.x+X*view.r*q,y:view.y-Y*view.r*q,z:Z,q};}
 function tracePoint(i,t){const m=motes[i%motes.length],l=m.line,u=(m.phase+t*m.speed)%1,th=l.start+(Math.PI-2*l.start)*u,r=l.L*Math.sin(th)**2;return project(r*Math.sin(th)*Math.cos(l.phi),r*Math.cos(th),r*Math.sin(th)*Math.sin(l.phi));}
 function glow(s,x,y,r,alpha=1){ctx.globalAlpha=alpha;ctx.drawImage(s,x-r,y-r,2*r,2*r);ctx.globalAlpha=1;}
 function field(t,front){
  ctx.globalCompositeOperation='screen';
  for(const line of lines){const points=line.points.map(v=>project(...v));ctx.beginPath();let pen=false;for(const p of points){const show=(p.z>=0)===front;if(!show){pen=false;continue}if(pen)ctx.lineTo(p.x,p.y);else{ctx.moveTo(p.x,p.y);pen=true}}
   ctx.strokeStyle=front?`rgba(98,178,255,${.12+line.bright*.15})`:`rgba(117,111,236,${.06+line.bright*.10})`;ctx.lineWidth=front?.85:.65;ctx.stroke();
   if(line.shell===1||line.shell===3){ctx.strokeStyle=front?'rgba(69,152,255,.035)':'rgba(125,89,236,.025)';ctx.lineWidth=5;ctx.stroke();}
  }
  for(let i=0;i<motes.length;i++){const m=motes[i],p=tracePoint(i,t);if((p.z>=0)!==front)continue;if(!front&&Math.hypot(p.x-view.x,p.y-view.y)<view.r)continue;const a=m.light*(front?.82:.34),r=m.size*Math.max(.35,view.r/96)*p.q;
   ctx.fillStyle=m.warm?`rgba(255,215,172,${a})`:`rgba(151,218,255,${a})`;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();if(i%17===0)glow(cyan,p.x,p.y,r*8,a*.7);
  }
  ctx.globalCompositeOperation='source-over';
 }
 function winds(t,front){
  ctx.globalCompositeOperation='screen';
  for(const m of wind){const u=(m.phase+t*m.speed)%1,r=2.6+u*4.8,a=m.angle-u*2.5+t*.06,p=project(r*Math.cos(a),m.height*(.4+u)*1.3,r*Math.sin(a));if((p.z>=0)!==front)continue;const alpha=Math.sin(Math.PI*u)**1.5*(front?.38:.16),size=m.size*(view.r/96);
   ctx.fillStyle=m.warm?`rgba(252,197,159,${alpha})`:`rgba(130,174,244,${alpha})`;ctx.fillRect(p.x,p.y,size,size);if(m.size>1.3)glow(blue,p.x,p.y,7*size,alpha);
  }ctx.globalCompositeOperation='source-over';
 }
 function beam(t,sign){
  const near=project(0,sign,0),far=project(0,sign*8.6,0),dx=far.x-near.x,dy=far.y-near.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
  ctx.globalCompositeOperation='screen';
  // Nested translucent volumes, not an opaque laser or a flashing white bar.
  for(let i=8;i>=0;i--){const w0=view.r*(.055+i*.017),w1=view.r*(.22+i*.07),g=ctx.createLinearGradient(near.x,near.y,far.x,far.y);g.addColorStop(0,`rgba(171,232,255,${.06-i*.004})`);g.addColorStop(.28,`rgba(69,164,253,${.048-i*.003})`);g.addColorStop(.75,`rgba(92,109,232,${.015-i*.001})`);g.addColorStop(1,'rgba(99,139,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(near.x+nx*w0,near.y+ny*w0);ctx.lineTo(far.x+nx*w1,far.y+ny*w1);ctx.lineTo(far.x-nx*w1,far.y-ny*w1);ctx.lineTo(near.x-nx*w0,near.y-ny*w0);ctx.closePath();ctx.fill();}
  for(let k=0;k<11;k++){ctx.beginPath();for(let j=0;j<=45;j++){const u=j/45,a=k/11*TAU+u*10-t*.8,r=.02+u*.24,p=project(r*Math.cos(a),sign*(1+u*7.8),r*Math.sin(a));if(j)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);}const g=ctx.createLinearGradient(near.x,near.y,far.x,far.y);g.addColorStop(0,'rgba(190,238,255,.16)');g.addColorStop(.4,'rgba(96,185,255,.08)');g.addColorStop(1,'rgba(90,159,255,0)');ctx.strokeStyle=g;ctx.lineWidth=.7;ctx.stroke();}
  for(let k=0;k<150;k++){const u=(k/150+t*(.10+(k%7)*.005))%1,a=k*2.399+u*8,r=.015+u*.25,p=project(r*Math.cos(a),sign*(1+u*7.6),r*Math.sin(a));ctx.fillStyle=`rgba(177,226,255,${(1-u)**1.6*.65})`;ctx.fillRect(p.x,p.y,.65+view.r/150,.65+view.r/150);}
  glow(white,near.x,near.y,view.r*.75,.42);ctx.globalCompositeOperation='source-over';
 }
 function surface(t){
  const shift=phase/TAU*texW,axis=matrix[1];
  for(const n of normals){const u=(Math.floor(n.u+shift)%texW+texW)%texW,v=Math.floor(n.v),grain=texture[v*texW+u],hot=Math.pow(Math.abs(n.x*axis[0]+n.y*axis[1]+n.z*axis[2]),18),light=clamp(grain*.74+hot*.52+n.z*.25),rim=n.rim;
   pixels.data[n.i]=Math.min(255,68+light*178-rim*44);pixels.data[n.i+1]=Math.min(255,124+light*141-rim*30);pixels.data[n.i+2]=Math.min(255,191+light*88-rim*13);pixels.data[n.i+3]=255;
  }sc.putImageData(pixels,0,0);ctx.drawImage(sphere,view.x-view.r,view.y-view.r,view.r*2,view.r*2);
  const rim=ctx.createRadialGradient(view.x,view.y,view.r*.89,view.x,view.y,view.r*1.035);rim.addColorStop(0,'rgba(162,225,255,0)');rim.addColorStop(.67,'rgba(180,231,255,.44)');rim.addColorStop(1,'rgba(139,210,255,0)');ctx.fillStyle=rim;ctx.beginPath();ctx.arc(view.x,view.y,view.r*1.04,0,TAU);ctx.fill();
  // Fine evolving coronal filaments give the luminous edge structure.
  ctx.globalCompositeOperation='screen';
  for(let k=0;k<34;k++){ctx.beginPath();const start=k/34*TAU+t*.038;for(let j=0;j<=20;j++){const u=j/20,a=start+u*.21,r=view.r*(1.015+Math.sin(Math.PI*u)*(.025+.035*Math.sin(k*4.2+t*.34)**2)),x=view.x+Math.cos(a)*r,y=view.y+Math.sin(a)*r;if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.strokeStyle=`rgba(144,219,255,${.12+.1*Math.sin(k+t*.6)**2})`;ctx.lineWidth=.7;ctx.stroke();}
  ctx.globalCompositeOperation='source-over';
 }
 function draw(t,v,{full=false}={}){
  const started=performance.now();view=v;orient(t);ctx.clearRect(0,0,1920,1080);
  if(!full){ctx.drawImage(beacon,v.x-v.r*10,v.y-v.r*10,v.r*20,v.r*20);}
  else{
   ctx.globalCompositeOperation='screen';glow(violet,v.x+v.r*.6,v.y,view.r*5,.38);glow(blue,v.x,v.y,view.r*4.1,.60);glow(cyan,v.x,v.y,view.r*2.1,.48);ctx.globalCompositeOperation='source-over';
   winds(t,false);field(t,false);const frontSign=matrix[1][2]>=0?1:-1;beam(t,-frontSign);surface(t);beam(t,frontSign);field(t,true);winds(t,true);
  }
  if(full&&v.r>25){const dim=ctx.createLinearGradient(450,0,800,0);dim.addColorStop(0,'rgba(0,0,0,1)');dim.addColorStop(1,'rgba(0,0,0,0)');ctx.globalCompositeOperation='destination-out';ctx.fillStyle=dim;ctx.fillRect(0,0,800,1080);ctx.globalCompositeOperation='source-over';}
  stats={drawMs:performance.now()-started,fieldLines:lines.length,fieldParticles:motes.length,windParticles:wind.length,beamParticles:300,rotation:phase,radius:view.r,center:{x:view.x,y:view.y},full};
 }
 function prepareBeacon(){draw(1.6,{x:960,y:540,r:24},{full:true});beacon.getContext('2d').drawImage(canvas,720,300,480,480,0,0,480,480);}
 return{draw,prepareBeacon,tracePoint,get stats(){return stats}};
}

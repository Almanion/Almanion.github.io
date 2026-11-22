// Rigid assemblies interpreted from the selected workshop references. Their
// vertices are built once; an animated formation submits only assembly matrices.
const C={ivory:'#d8e3dc',sage:'#9ebcb4',graphite:'#293b44',joint:'#111f28',metal:'#728d8b',
  inset:'#37565a',edge:'#edf1df',mint:'#95ebe0',enemy:'#b1a28b',copper:'#bd7958',amber:'#ffbd83',
  enamel:'#347477',glass:'#173e48',oxide:'#804e40',bone:'#dfc9a6',violet:'#b8a0d6'};
const cache=new Map();
const polish=new Map([[C.glass,1],[C.metal,.63],[C.copper,.66],[C.inset,.43],[C.enamel,.34],[C.graphite,.22],[C.joint,.07]]);
function rgb(hex,emission=false){return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,emission?-1:1];}

export class Kit {
  constructor(){this.solid={positions:[],normals:[],indices:[],colors:[],uvs:[]};this.shadow={positions:[],normals:[],indices:[],colors:[]};this.faces=[];this.volumes=[];}
  volume(shadow,occludes=true){this.owner={shadow,planes:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};if(occludes)this.volumes.push(this.owner);}
  face(points,color,shadow=true,emission=false,smooth=null){
    const p=points.map(([x,y,z])=>[x,z,-y]),a=p[0],b=p[1],c=p[2],
      u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);
    if(l<1e-8)return;
    const normal=n.map(v=>v/l),owner=this.owner,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const q of p)for(let i=0;i<3;i++){min[i]=Math.min(min[i],q[i]);max[i]=Math.max(max[i],q[i]);owner.min[i]=Math.min(owner.min[i],q[i]);owner.max[i]=Math.max(owner.max[i],q[i]);}
    owner.planes.push([...normal,normal.reduce((d,x,i)=>d+x*a[i],0)]);
    this.faces.push({p,normal,smooth,col:rgb(color,emission),polish:polish.get(color)??.17,owner,min,max,shadow});
  }
  outline(w,d,r=1){
    r=Math.min(r,w/2-.001,d/2-.001);const points=[],steps=r<1.5?1:r<6?2:3;
    for(const [x,y,start]of [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,Math.PI/2],[-w/2+r,-d/2+r,Math.PI],[w/2-r,-d/2+r,Math.PI*1.5]])
      for(let i=0;i<=steps;i++){const a=start+i*Math.PI/(2*steps);points.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}
    return points;
  }
  extrusion(shape,x,y,z,h,color,{bevel=0,shadow=true,emission=false,angle=0}={}){
    this.volume(shadow);
    const co=Math.cos(angle),si=Math.sin(angle),n=shape.length,
      radius=Math.max(...shape.map(p=>Math.hypot(...p))),inset=1-Math.min(.25,bevel/Math.max(1,radius)),
      at=(p,height,scale=1)=>[x+(p[0]*co-p[1]*si)*scale,y+(p[0]*si+p[1]*co)*scale,z+height];
    this.face([...shape].reverse().map(p=>at(p,0)),color,shadow,emission);
    const edges=shape.map((p,i)=>{const q=shape[(i+1)%n],dx=q[0]-p[0],dy=q[1]-p[1],l=Math.hypot(dx,dy)||1;return [dy/l,-dx/l];}),
      sideNormal=i=>{
        const a=edges[(i+n-1)%n],b=edges[i],dot=a[0]*b[0]+a[1]*b[1];
        if(dot<.8)return null;
        const nx=a[0]+b[0],ny=a[1]+b[1],l=Math.hypot(nx,ny)||1;
        return [(nx*co-ny*si)/l,0,-(nx*si+ny*co)/l];
      };
    for(let i=0;i<n;i++){
      const a=shape[i],b=shape[(i+1)%n];
      const na=sideNormal(i),nb=sideNormal((i+1)%n);
      this.face([at(a,0),at(b,0),at(b,h-bevel),at(a,h-bevel)],color,shadow,emission,na&&nb?[na,nb,nb,na]:null);
      if(bevel)this.face([at(a,h-bevel),at(b,h-bevel),at(b,h,inset),at(a,h,inset)],color,shadow,emission);
    }
    this.face(shape.map(p=>at(p,h,inset)),color,shadow,emission);return this;
  }
  box(x,y,z,w,d,h,color=C.ivory,options={}){
    const bevel=Math.min(options.bevel??.8,h*.35,w*.12,d*.12),r=options.radius??Math.min(w,d)*.16;
    return this.extrusion(this.outline(w,d,r),x,y,z,h,color,{...options,bevel});
  }
  disc(x,y,z,r,h,color=C.graphite,options={}){
    const n=r>=10?24:16,shape=Array.from({length:n},(_,i)=>[Math.cos(i*Math.PI*2/n)*r,Math.sin(i*Math.PI*2/n)*r]);
    return this.extrusion(shape,x,y,z,h,color,{bevel:Math.min(.6,h*.25),...options});
  }
  tube(a,b,r,color=C.graphite,options={}){
    const d=b.map((v,i)=>v-a[i]),l=Math.hypot(...d);if(l<.001)return this;
    const axis=d.map(v=>v/l),q=Math.hypot(axis[0],axis[1]),u=q>.001?[-axis[1]/q,axis[0]/q,0]:[1,0,0],
      v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]],
      ring=p=>Array.from({length:10},(_,i)=>p.map((x,j)=>x+r*(u[j]*Math.cos(i*Math.PI/5)+v[j]*Math.sin(i*Math.PI/5)))),
      low=ring(a),high=ring(b),shadow=options.shadow!==false,emission=!!options.emission;
    this.volume(shadow);
    this.face([...low].reverse(),color,shadow,emission);this.face(high,color,shadow,emission);
    for(let i=0;i<10;i++){const j=(i+1)%10;this.face([low[i],low[j],high[j],high[i]],color,shadow,emission);}return this;
  }
  // Paint, lamp lenses and recessed vents have no sidewall or shadow silhouette.
  mark(points,x,y,z,color,angle=0,emission=false){
    const co=Math.cos(angle),si=Math.sin(angle);
    this.volume(false,false);
    this.face(points.map(([u,v])=>[x+u*co-v*si,y+u*si+v*co,z]),color,false,emission);
    return this;
  }
  panel(x,y,z,w,d,color=C.inset,{angle=0,emission=false}={}){
    const a=w/2,b=d/2,c=Math.min(a,b)*.32;
    return this.mark([[-a,-b+c],[-a+c,-b],[a-c,-b],[a,-b+c],[a,b-c],[a-c,b],[-a+c,b],[-a,b-c]],x,y,z+.35,color,angle,emission);
  }
  // Three cross-sections give armour a rolled lower lip and a raked upper deck.
  // All sections have the same winding and stay in the rigid parent's batch.
  shell(x,y,z,w,d,h,color,{angle=0,rake=.13,crown=.69,trim=color,shadow=true}={}){
    const plan=[[-.5,-.32],[-.34,-.5],[.24,-.5],[.5,-.25],[.5,.25],[.24,.5],[-.34,.5],[-.5,.32]];
    const co=Math.cos(angle),si=Math.sin(angle);
    const ring=(length,width,shift,height)=>plan.map(([a,b])=>{
      const u=(a*length+shift)*w,v=b*width*d;
      return [x+u*co-v*si,y+u*si+v*co,z+h*height];
    });
    this.volume(shadow);
    const sole=ring(.90,.87,0,0),belt=ring(1,1,0,.28),deck=ring(1-2*rake,crown,-rake*.65,1);
    this.face([...sole].reverse(),trim,shadow);
    for(let i=0;i<plan.length;i++){
      const j=(i+1)%plan.length;
      this.face([sole[i],sole[j],belt[j],belt[i]],trim,shadow);
      // The raked deck shifts toward the rear; triangulate non-planar corners.
      this.face([belt[i],belt[j],deck[j]],color,shadow);
      this.face([belt[i],deck[j],deck[i]],color,shadow);
    }
    this.face(deck,color,shadow);return this;
  }
  // Sloping annular rim. The dark well, open centre or charge below remains visible.
  rim(x,y,z,outer,inner,h,color,{wall=C.joint,segments=12,shadow=false}={}){
    const p=(i,r,dz)=>[x+r*Math.cos(i*2*Math.PI/segments),y+r*Math.sin(i*2*Math.PI/segments),z+dz];
    for(let i=0;i<segments;i++){
      const j=i+1;
      // Open rim surfaces cannot bury another component.
      this.volume(shadow,false);
      this.face([p(i,outer,0),p(j,outer,0),p(j,outer*.92,h),p(i,outer*.92,h)],color,shadow);
      this.face([p(i,outer*.92,h),p(j,outer*.92,h),p(j,inner,h),p(i,inner,h)],color,shadow);
      this.face([p(j,inner,h),p(i,inner,h),p(i,inner,0),p(j,inner,0)],wall,shadow);
    }
    return this;
  }
  light(x,y,z,w,d,color=C.mint){return this.panel(x,y,z,w,d,color,{emission:true});}
  vents(x,y,z,w,d,count=4,angle=0){
    this.panel(x,y,z,w,d,C.joint,{angle});
    for(let i=0;i<count;i++){
      const offset=(i-(count-1)/2)*w/count;
      this.panel(x+offset*Math.cos(angle),y+offset*Math.sin(angle),z+.4,w/count*.34,d*.76,C.metal,{angle});
    }
    return this;
  }
  result(){
    if(this.built)return this.built;
    let culledFaces=0;
    const hidden=(face,shadow)=>this.volumes.some(v=>v!==face.owner&&(!shadow||v.shadow)&&
      v.min.every((x,i)=>face.min[i]>x+1e-5)&&v.max.every((x,i)=>face.max[i]<x-1e-5)&&
      v.planes.every(plane=>face.p.every(p=>p[0]*plane[0]+p[1]*plane[1]+p[2]*plane[2]<plane[3]-1e-5))),
      emit=(d,f)=>{
        const start=d.positions.length/3,height=f.owner.max[1]-f.owner.min[1];
        for(let i=0;i<f.p.length;i++){
          const p=f.p[i];
          d.positions.push(...p);d.normals.push(...(f.smooth?.[i]||f.normal));d.colors.push(...f.col);
          // On actors UV carries material finish and the baked falloff toward a
          // mounting joint. Neither needs a texture lookup or per-frame upload.
          if(d.uvs)d.uvs.push(f.polish,height>.01?(p[1]-f.owner.min[1])/height:1);
        }
        for(let i=1;i<f.p.length-1;i++)d.indices.push(start,start+i,start+i+1);
      };
    // A face is removed only if every point lies strictly inside another convex
    // solid in this same rigid assembly. Exterior contours are never decimated.
    for(const f of this.faces){
      if(hidden(f,false))culledFaces++;else emit(this.solid,f);
      // The light is always above the ground. A closed part's horizontal sole
      // projects inside its top and side faces under every supported yaw.
      if(f.shadow&&f.normal[1]>-.999999&&!hidden(f,true))emit(this.shadow,f);
    }
    return this.built={solid:this.solid,shadow:this.shadow,culledFaces};
  }
}

// A paired, open-ended deck marking points along local +X at tactical distance.
function chevron(k,x,y,z,length,width,colour,angle=0){
  const arm=(x0,y0,x1,y1)=>{
    const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy),nx=-dy/len*width*.11,ny=dx/len*width*.11;
    k.mark([[x0-nx,y0-ny],[x1-nx,y1-ny],[x1+nx,y1+ny],[x0+nx,y0+ny]],x,y,z,colour,angle);
  };
  arm(-length/2,-width/2,length/2,0);arm(length/2,0,-length/2,width/2);
}
function helmet(k,x,y,z,w,d,h,ceramic,lens){
  k.shell(x,y,z,w,d,h*.66,C.glass,{rake:.08,crown:.88,trim:C.graphite});
  k.shell(x-.8,y,z+h*.45,w*1.02,d*1.05,h*.55,ceramic,{rake:.13,crown:.65});
  k.box(x+w*.47,y,z+h*.32,.48,d*.48,h*.14,lens,{emission:true,shadow:false});
}
function infantry(hero){
  const k=new Kit(),m=hero?C.ivory:C.sage;
  k.shell(-.7,0,12,16,15,10,C.graphite);
  k.shell(2,0,16,14,16,8,m,{trim:C.enamel});k.disc(.5,0,22.8,4.2,3,C.joint);
  k.shell(-8.4,0,14.4,7.2,hero?13.5:10.6,hero?13:11,C.enamel,{rake:.07,crown:.84});
  k.vents(-8.7,0,hero?27.5:25.5,4.8,6.4,3);
  for(const side of [-1,1]){
    const command=hero&&side<0,top=command?27:24.5;
    k.shell(-.6,side*7.6,18.5,command?12:9,command?8:6.7,top-18.5,command?C.enamel:m,{trim:C.graphite});
    k.panel(-1,side*7.6,top,1.5,command?4:2.7,command?C.edge:C.enamel);
    k.shell(4.7,side*4,18,5,4.5,4,C.ivory,{angle:side*.32});
    k.box(-7.6,side*5.9,15,3,2,8,C.metal,{shadow:false});
  }
  helmet(k,1,0,24.6,hero?13:11.3,hero?11:9.4,hero?10:8.2,hero?C.ivory:C.sage,C.mint);
  if(hero){
    k.tube([-9,-4,26],[-11,-4,36],.75,C.graphite);k.tube([-11,-4,35],[-11.8,-4,38],.55,C.edge);
    chevron(k,-1,0,34.72,2.6,4,C.enamel);
  }else k.panel(0,0,32.85,3.8,1.5,C.enamel);
  return k.result();
}
function medicArmour(){
  const k=new Kit(),light='#8ed9df';
  k.shell(0,0,12,15,15,11,C.ivory,{trim:C.enamel});
  k.shell(-8.5,0,14,8,15,16,C.enamel,{rake:.06,crown:.9});
  for(const side of [-1,1]){
    k.tube([-8,side*5.4,15],[-8,side*5.4,30],2.3,C.sage);
    k.shell(0,side*7,18,7.4,5,5,C.ivory);
  }
  k.shell(-8.8,0,29,9,14,4,C.ivory,{rake:.08,crown:.84});
  k.panel(-9,0,33,5.1,1.8,C.enamel);k.panel(-9,0,33.06,1.9,6.2,C.enamel);
  helmet(k,2,0,23,11.5,10,8,C.ivory,light);return k.result();
}
function grenadierArmour(){
  const k=new Kit();
  k.shell(-1,0,12,17,16,11,C.sage,{trim:C.enamel});k.shell(-8,0,14,9,20,11,C.graphite);
  for(const side of [-1,1]){
    k.tube([-11,side*5.8,25],[-4,side*5.8,27],3.4,C.ivory);
    k.tube([-10.7,side*5.8,25],[-9,side*5.8,25.5],3.65,C.enamel);
    k.shell(0,side*7,18.8,9.4,6.4,6,C.enamel);
  }
  helmet(k,1,0,23,12.6,11.6,8.4,C.sage,C.mint);
  return k.result();
}
function shieldPlate(){
  const k=new Kit(),outline=[[-3,-17],[-1,-20],[2,-19],[5,-10],[6,0],[5,10],[2,19],[-1,20],[-3,17]];
  k.extrusion(outline,0,0,0,24,C.enamel,{bevel:1});
  k.shell(4,0,1,4.2,17,25,C.ivory,{rake:.03,crown:.83});k.box(-3.8,0,8,2,12,3,C.joint);
  for(const side of [-1,1]){
    k.shell(2.8,side*12,2,3.6,12,19,C.sage,{angle:-side*.25,rake:.06,crown:.64});
    k.panel(1,side*10,24.2,2.4,7,C.joint);k.light(1,side*10,24.6,1.25,4.5);
  }
  return k.result();
}
function rifle(material=C.ivory){
  const k=new Kit();
  k.shell(17,5,15.5,19,6.2,6.3,C.graphite);k.shell(17,5,20.1,15,6.3,2.6,material);
  k.tube([23,5,19.5],[30.5,5,19.5],1.35,C.joint);k.box(29,5,17,4,5,5,material,{radius:.7});
  k.box(31.05,5,18.2,.3,2.9,2.6,C.joint,{bevel:0});k.box(14,5,12,4.5,4,4,C.graphite);
  k.box(16,5,21.5,4.5,3.5,2,C.joint);k.panel(21,5,22.3,3.5,1.4,C.joint);
  k.panel(21,5,22.8,3.2,2.7,material===C.enemy?C.oxide:C.enamel);
  k.tube([22,5,19.5],[25.6,5,19.5],1.85,material===C.enemy?C.copper:C.metal);
  k.light(16,5,23.6,2,1,material===C.enemy?C.amber:C.mint);return k.result();
}
function drivePod(material=C.ivory){
  const k=new Kit();k.box(0,0,0,9.5,6,2.5,C.joint,{radius:1.6});
  k.shell(1,0,2.1,8.2,6.1,2.7,material,{trim:C.graphite});k.panel(1.3,0,4.8,1.1,2.8,material===C.enemy?C.oxide:C.enamel);
  return k.result();
}
function scout(){
  const k=new Kit();
  k.extrusion([[-12,-6],[-6,-9],[5,-8],[14,-1],[14,1],[5,8],[-6,9],[-12,6]],0,0,5.5,5,C.metal,{bevel:.8});
  k.shell(0,0,9,25,17,5.2,C.enamel);
  for(const side of [-1,1])k.shell(2,side*5.6,10,19,5.3,4.7,C.ivory,{angle:-side*.13});
  chevron(k,5.8,0,14.3,2.7,5,C.ivory);
  k.disc(-4,0,14,4,2,C.graphite);k.disc(-4,0,16,3.2,.6,C.metal);
  k.tube([-4,0,15],[-4,0,28],1.6,C.graphite);k.light(12,0,10.8,1,5);
  for(const side of [-1,1])k.box(-10,side*5,8,4,3,3,C.graphite);
  return k.result();
}
function sensor(){
  const k=new Kit();
  k.shell(-1,0,0,15,11,5,C.graphite);
  k.shell(-2,0,3.4,12.5,10.7,4.2,C.ivory);
  for(const [y,r] of [[-2.6,2.6],[2.4,1.75]]){
    k.tube([3,y,4],[7.7,y,4],r,C.enamel);
    k.tube([7.7,y,4],[8,y,4],r*.68,C.mint,{emission:true,shadow:false});
  }
  k.panel(-2,0,7.6,4.6,1.5,C.enamel);return k.result();
}
function drone(){
  const k=new Kit();k.box(0,0,4,22,18,4,C.graphite,{radius:5.5});
  // The bay stays open, so the real cargo is never hidden by an opaque cap.
  for(const side of [-1,1]){
    k.shell(-.5,side*7.3,6.8,24,5.6,6.6,C.ivory,{trim:C.enamel});
    k.panel(-1,side*7.3,13.4,6,1.9,C.enamel);
    k.tube([-9,side*8.8,10],[-11,side*9.5,15.2],.95,C.metal);
  }
  k.shell(-8.6,0,7,5.8,14,5.4,C.enamel);k.shell(8.6,0,7,5.3,12.8,5.4,C.ivory);
  k.box(-1.5,0,11.8,10.5,11,1,C.joint);k.panel(-1.5,0,12.9,8,8.8,C.inset);
  for(const side of [-1,1])k.box(-1.5,side*5.1,13,10.5,.7,2.5,C.metal,{shadow:false});
  k.box(10.6,0,8.5,.5,4,1.4,C.mint,{shadow:false,emission:true,bevel:.1});k.panel(5.4,0,12.2,1.8,5.3,C.joint);return k.result();
}
function track(enemy=false){
  const k=new Kit();k.box(0,0,1,39,9,6,C.joint,{radius:3.8});
  k.shell(-1,0,6.5,35,8.5,4,enemy?C.oxide:C.sage,{rake:.08,crown:.82});
  for(const x of [-13,0,13]){
    k.tube([x,-4.7,4.8],[x,4.7,4.8],3.9,C.graphite);
    k.tube([x,-4.95,4.8],[x,4.95,4.8],2.55,enemy?C.copper:C.metal,{shadow:false});
  }
  for(const x of [-10,2])k.shell(x,0,9.4,10.5,8,2.1,enemy?C.enemy:C.ivory);
  return k.result();
}
function armoredChassis(){
  const k = new Kit();
  k.shell(-1,0,5.5,47,25,8.6,C.ivory,{trim:C.enamel});
  k.shell(-14,0,11.5,13,18,5,C.enamel);k.vents(-14.5,0,16.6,7,9,4);
  k.shell(12,0,11.4,16.5,16,4.8,C.glass,{rake:.20,crown:.75});
  k.panel(12,0,16.2,1.1,8,C.sage);
  for(const side of [-1,1]){
    k.shell(-1,side*12.4,9,32,5.4,3.5,C.sage,{rake:.08});
    k.shell(13.8,side*11.6,9,12,5.7,3.8,C.ivory,{angle:-side*.22});
    k.light(16,side*11,12.8,3.2,1.2);
    k.light(-20,side*6,10.6,1,3,C.amber);
  }
  k.disc(0,0,13,7,3,C.graphite);
  return k.result();
}
function armoredWheel(){
  const k = new Kit();
  k.tube([0,-3,6],[0,3,6],6,C.joint);
  k.tube([0,-3.25,6],[0,3.25,6],4.4,C.enamel,{shadow:false});
  k.tube([0,-3.42,6],[0,3.42,6],2.8,C.metal,{shadow:false});
  return k.result();
}
function artillery(){
  const k=new Kit();k.shell(-1,0,6,36,28,8,C.ivory,{rake:.09,trim:C.enamel});
  k.shell(-12,0,12,12,17,8,C.graphite);
  for(const side of [-1,1]){
    k.shell(-14,side*5.6,18,11,5,4,C.enamel);
    k.vents(-14.6,side*5.6,22.1,5.8,2.6,3);
    k.tube([-7,side*9,11],[-15,side*16,4],1.7,C.metal);
    k.vents(1,side*9,14.1,9,2.7,4);
  }
  k.disc(0,0,13,8,5,C.graphite);k.disc(0,0,17.4,6.8,.7,C.metal);
  k.light(-15,0,19,.8,8);k.panel(8,0,13.3,5,12,C.metal);return k.result();
}
function turret(){
  const k=new Kit();k.shell(-2,0,17,26,21,8,C.enamel,{trim:C.graphite});
  for(const side of [-1,1])k.shell(0,side*5.2,21.6,26,8.4,7.7,C.ivory,{angle:-side*.045,rake:.1});
  k.vents(-1,0,25.2,12,3.8,4);k.shell(9,0,22,15,9,7,C.sage);
  k.shell(14,0,21,7,8,6,C.graphite);chevron(k,-3,-5.2,29.35,3.5,4,C.enamel);
  k.light(-10,0,23,1,10);return k.result();
}
function rocketBody(){
  const k=new Kit();k.box(-2,0,10,14.5,15.5,5,C.graphite,{radius:3});
  k.shell(0,0,14,17,18,10.3,C.enemy,{trim:C.oxide});k.panel(1,0,24.4,8,4,C.oxide);
  k.box(-8,2,14,7.7,11.5,12,C.graphite,{radius:2});k.box(-8,2,25.5,6.7,9.5,1.5,C.enemy);
  k.light(-10.2,2,20,1.2,4,C.amber);k.box(2,4.5,25,9,8,6.5,C.graphite,{radius:2});
  k.shell(1,4.5,29.5,10,8.4,3.2,C.copper);k.light(5.3,4.5,31,1.6,3.5,C.amber);
  k.tube([-6,-6,18],[5,-6,22],1.4,C.copper);return k.result();
}
function launcher(){
  const k=new Kit();k.tube([-12,-6.5,24],[25,-6.5,24],4.1,C.enemy);
  for(const x of [-10,5,23])k.tube([x-1.4,-6.5,24],[x+1.4,-6.5,24],4.8,x===23?C.copper:C.graphite);
  k.tube([25.1,-6.5,24],[25.4,-6.5,24],3.5,C.joint,{shadow:false});
  k.shell(4,-6.5,26.6,23,7.6,3,C.oxide);k.vents(4,-6.5,29.6,11,3.7,4);
  k.shell(-9,-6.5,26.3,8,9,3.7,C.enemy);
  k.tube([16,-6.5,24],[18.8,-6.5,24],4.4,C.bone);return k.result();
}
function runner(){
  const k=new Kit();k.box(-1.2,0,0,25,15,4.1,C.graphite,{radius:5.8,bevel:1.3});
  k.shell(-3.8,0,3,21,15.8,5,C.oxide,{rake:.08,crown:.64});
  for(const side of [-1,1])k.shell(-3.8,side*4.5,4,20,5.8,4.8,C.enemy,{angle:-side*.18});
  k.extrusion([[1,-5.4],[7,-4.2],[11.8,-1.8],[12.5,0],[11.8,1.8],[7,4.2],[1,5.4]],0,0,3.9,2.8,C.enemy,{bevel:.6});
  k.vents(-4,0,8.1,10,3,3);chevron(k,5.7,0,6.8,3,4,C.oxide);
  k.box(10.2,0,3.1,3.4,6.5,2,C.graphite);k.light(11.9,0,5.4,.7,3.4,C.amber);return k.result();
}
function sentinel(){
  const k=new Kit();k.box(-2,0,11,12,13,11,C.graphite,{radius:3});k.box(-1,0,13,13,14,7,C.enemy,{radius:2.5});
  k.disc(0,0,20,3.6,4,C.joint);k.shell(1,0,23,16,12,6.6,C.oxide);
  k.shell(-.7,0,27,14,13,4.4,C.enemy);k.tube([6,0,26],[9.2,0,26],2.7,C.joint);
  k.tube([9.2,0,26],[9.6,0,26],1.65,C.amber,{emission:true,shadow:false});
  for(const side of [-1,1]){k.shell(-1,side*8,16,10,6.8,7.5,C.enemy);k.panel(-1,side*8,23.6,3.5,2,C.oxide);}
  k.box(-7,0,15,4,10,10,C.graphite);k.vents(-7,0,25.2,2.6,6,3);return k.result();
}

function warden(){
  const k=new Kit();
  k.shell(-2,0,11,23,23,15,C.oxide,{trim:C.graphite});
  for(const side of [-1,1]){
    k.shell(-3,side*11.1,16,18,10,11,C.enemy,{angle:-side*.14});
    k.vents(-4,side*11.2,27,8,3.4,3);
    k.tube([-6,side*7,13],[-9,side*10,24],1.3,C.copper);
  }
  k.shell(-1,0,24,17,16,7.5,C.graphite);
  k.shell(.6,0,29,15,15,5.3,C.enemy);
  k.tube([6,0,28.7],[10,0,28.7],3.4,C.oxide);k.tube([10,0,28.7],[10.3,0,28.7],2.1,C.amber,{emission:true,shadow:false});
  chevron(k,-1,0,34.4,3,6,C.oxide);return k.result();
}
function flamer(){
  const k=new Kit();
  k.shell(-.6,0,7,25,22,10,C.oxide,{trim:C.graphite});
  for(const side of [-1,1]){
    const y=side*7.9;
    k.disc(-6,y,11,4.7,12,C.copper);k.rim(-6,y,21.8,5.1,2,3.3,C.enemy);
    k.tube([-6,y,23],[1,side*6,19],1.15,C.graphite);
    k.shell(4.5,y,11,14,4.7,7,C.enemy,{angle:-side*.2});
  }
  k.shell(5,0,13,14,13,7,C.graphite);
  k.shell(6,0,18,12,12,4.3,C.enemy);
  k.vents(4.5,0,22.4,5.5,5,3);return k.result();
}
function bomber(){
  const k=new Kit();
  k.disc(0,0,8,9,5,C.graphite);k.disc(0,0,12,8.8,5.5,C.oxide);
  k.rim(0,0,17,8.6,4.2,3.8,C.copper,{segments:10,shadow:true});
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3;
    k.shell(Math.cos(a)*8.7,Math.sin(a)*8.7,10,5.6,8.4,7.8,C.enemy,{angle:a,rake:.16});
  }
  return k.result();
}
function siegeChassis(mortar){
  const k=new Kit(),w=mortar?33:42,d=mortar?25:30;
  k.shell(-1,0,5.5,w,d,9,C.enemy,{crown:.83,trim:C.oxide});
  for(const side of [-1,1]){
    k.shell(-8,side*d*.43,8,w*.48,6,6,C.oxide);
    k.vents(-9,side*d*.43,14,w*.25,3,3);
    k.shell(12,side*d*.38,8,13,7,5,C.enemy,{angle:-side*.17});
    if(mortar){
      k.tube([-6,side*7,12],[-15,side*15,4],1.9,C.metal);
      k.shell(-15,side*15,1,9,5,3.5,C.oxide);
    }
  }
  k.disc(-2,0,13.5,mortar?7:8.8,3,C.graphite);
  return k.result();
}
function tankTurret(){
  const k=new Kit();
  k.shell(-2,0,16,28,23,11,C.oxide,{trim:C.graphite});
  for(const side of [-1,1])k.shell(-1,side*6.9,21.5,26,10,7,C.enemy,{angle:-side*.12});
  k.rim(-6,-1,26,4.4,2.5,2.3,C.graphite);k.vents(-6,6,28.6,7,3.3,3);
  k.shell(7,-5,24.8,7,5.7,5,C.copper);k.panel(7,-5,29.9,2.7,2,C.amber,{emission:true});
  return k.result();
}
function mortarCradle(){
  const k=new Kit();
  k.shell(-3,0,15.5,19,17,7,C.oxide);
  for(const side of [-1,1]){
    k.shell(-1,side*6.7,18,15,4.8,7,C.enemy);
    k.tube([1,side*6.4,21],[14,side*4,31],1.55,C.metal);
  }
  return k.result();
}
function mortarTube(){
  const k=new Kit(),line=t=>[-6+34*t,0,19+20*t];
  k.tube(line(0),line(1),3.7,C.graphite);
  k.tube(line(.07),line(.29),5.3,C.oxide);k.tube(line(.42),line(.77),4.5,C.enemy);
  k.tube(line(.82),line(1),5.4,C.copper);k.tube(line(1),line(1.009),3.3,C.joint,{shadow:false});
  return k.result();
}
function armoredTurret(){
  const k=new Kit();
  k.shell(-1,0,15.7,18.5,14.5,6.6,C.enamel);
  k.shell(-2,-3.8,20,14.5,6.7,4,C.ivory);
  k.shell(-3,4.6,19.5,9.8,4.4,4.9,C.graphite);k.light(-1,4.5,24.4,3.1,1.6);
  return k.result();
}
function cannon(kind){
  const k=new Kit(),field=kind==='field',thermal=kind==='thermal',shell=field?C.sage:C.enemy;
  k.tube([1,0,0],[29,0,0],thermal?2.7:2,C.graphite);
  k.shell(6,0,-3.5,15,9,7.8,thermal?C.oxide:shell,{trim:C.graphite});
  k.vents(5.5,0,4.4,7,3.6,3);
  if(thermal){
    for(const side of [-1,1])k.tube([10,side*3,-1],[23,side*3,1],1.15,C.copper);
    k.tube([18,0,0],[21,0,0],3.4,C.oxide);
  }else{
    k.tube([13,0,0],[18,0,0],2.8,field?C.enamel:C.copper);
    k.tube([21,0,0],[22.5,0,0],2.3,shell);
  }
  // Flared rim and recessed throat face down the actual firing axis.
  const n=thermal?10:8,ring=(x,r)=>Array.from({length:n},(_,i)=>{
    const a=(i+.5)*Math.PI*2/n;return [x,r*Math.cos(a),r*Math.sin(a)];
  }),neck=ring(25,2.7),lip=ring(32,thermal?5:3.9),inner=ring(32,thermal?3.45:2.5),well=ring(27.5,1.85);
  k.volume(true,false);
  for(let i=0;i<n;i++){
    const j=(i+1)%n;
    k.face([neck[i],neck[j],lip[j],lip[i]],thermal?C.copper:shell);
    k.face([lip[i],lip[j],inner[j],inner[i]],field?C.ivory:C.bone);
    k.face([inner[i],inner[j],well[j],well[i]],C.joint,false);
  }
  k.face(well,C.joint,false);return k.result();
}
function defenseBase(kind){
  const k=new Kit();
  if(kind==='jammer'){
    k.disc(0,0,0,14,7,C.graphite);k.disc(0,0,7,11,13,C.enemy);k.disc(0,0,20,8,6,C.graphite);
    k.box(0,0,26,8,8,19,C.enemy);k.light(0,0,45.1,3,3,C.amber);
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3,co=Math.cos(a),si=Math.sin(a),p=(x,y,z)=>[x*co-y*si,x*si+y*co,z];
      k.box(...p(18,0,0),29,12,6,C.graphite,{angle:a});k.box(...p(18,0,6),24,10,4,C.enemy,{angle:a});
      for(const side of [-1,1]){k.tube(p(21,side*5,10),p(21,side*5,48),1.5,C.copper);k.box(...p(21,side*5,10),5,5,13,C.graphite,{angle:a});}
      k.tube(p(21,-5,48),p(21,5,48),1.5,C.copper);
      k.shell(...p(20,0,8),17,11,6,C.oxide,{angle:a});
      for(const side of [-1,1])k.tube(p(20,side*5,29),p(24,side*8,43),1.25,C.enemy);
      k.shell(...p(22,0,45.5),7,18,4,C.enemy,{angle:a});
      k.panel(...p(22,0,49.6),2.3,9,C.oxide,{angle:a});
    }
  }else if(kind==='turret'){
    k.disc(0,0,0,11,7,C.graphite);k.disc(0,0,7,8.5,8,C.enemy);k.disc(0,0,15,7,3,C.graphite);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,x=Math.cos(a)*17,y=Math.sin(a)*17;k.shell(x,y,0,31,12,6,C.oxide,{angle:a});k.shell(x,y,4.5,26,9,4,C.enemy,{angle:a});chevron(k,x,y,8.55,4,4,C.oxide,a);}
  }else{
    const south=kind==='bastion-south';k.box(0,0,0,82,76,6,C.graphite,{radius:14});k.box(0,-1,6,73,67,8,C.enemy,{radius:13});
    k.box(0,-3,14,south?61:59,south?56:54,south?17:14,C.graphite,{radius:10});k.box(0,-3,south?28:25,55,50,5,C.enemy,{radius:9});
    if(south){
      for(const side of [-1,1])for(const front of [-1,1])k.box(side*30,front*28,7,15,17,21,C.enemy,{radius:4});
      k.box(0,35,6,27,5,16,C.joint);k.box(0,41,1,28,13,3,C.metal);
      for(let i=0;i<4;i++)k.panel(-9+i*6,41,4.2,3,7,C.copper,{angle:-.4});
    }else k.box(0,24,13,48,13,15,C.graphite,{radius:3});
    k.light(0,25,29,40,1.3,C.amber);
    const roof=south?33:30;
    for(const side of [-1,1]){
      k.shell(side*27,-8,roof-5,14,39,8,C.oxide,{angle:side*.08,rake:.09});
      k.shell(side*27,-15,roof+1,9,19,5,C.enemy);
      k.vents(side*27,-15,roof+6,5,12,3);
    }
    if(south)k.shell(0,27,23,39,15,7,C.enemy);
    else{k.shell(0,-22,28,34,12,6,C.enemy);chevron(k,0,-22,34.1,5,13,C.oxide,Math.PI/2);}
    k.tube([-22,-18,25],[-22,-18,48],1.6,C.graphite);k.box(-22,-18,43,4,4,8,C.copper);
  }
  return k.result();
}
function defenseHead(){
  const k=new Kit();k.shell(-3,0,-8,26,22,9,C.oxide);k.shell(-7,0,-1,18,21,7,C.enemy);
  for(const side of [-1,1]){
    k.shell(7,side*6,-4,21,8,8,C.copper);k.tube([12,side*5.5,0],[33,side*5.5,0],2,C.graphite);
    k.tube([19,side*5.5,0],[25,side*5.5,0],2.7,C.enemy);
    k.box(32,side*5.5,-3,3.5,7,6,C.copper);k.box(34,side*5.5,-1.7,.4,3,3.4,C.joint,{shadow:false});
  }
  k.vents(-8,1,6.1,7,8,3);k.light(-5,-5,6.1,3.2,1.4,C.amber);return k.result();
}
function citadel(){
  const k=new Kit();k.disc(0,0,0,28,8,C.graphite);k.disc(0,0,8,25,10,C.enemy);k.disc(0,0,18,21,7,C.graphite);
  k.disc(0,0,25,18,15,C.oxide);k.disc(0,0,40,16,10,C.graphite);k.rim(0,0,48,19,10,8,C.enemy,{shadow:true});
  for(let i=0;i<3;i++){
    const a=Math.PI/2+i*Math.PI*2/3,x=Math.cos(a)*35,y=Math.sin(a)*35;
    k.box(x,y,0,47,17,7,C.graphite,{angle:a,radius:5});k.box(x,y,7,39,13,7,C.enemy,{angle:a,radius:4});
    k.box(Math.cos(a)*53,Math.sin(a)*53,7,15,18,6,C.graphite,{angle:a,radius:4});
    k.box(Math.cos(a)*53,Math.sin(a)*53,13,13,14,4,C.enemy,{angle:a,radius:3});
    k.shell(x,y,11,36,16,8,C.oxide,{angle:a});
    chevron(k,x,y,19.1,7,7,C.bone,a);
    k.shell(Math.cos(a)*18,Math.sin(a)*18,16,12,18,21,C.enemy,{angle:a,rake:.22,crown:.74});
  }
  return k.result();
}
function shieldPylon(){
  const k=new Kit();k.shell(0,0,0,12,23,29,C.graphite,{rake:.1,crown:.7});k.shell(1.5,0,2,8,21,32,C.copper,{rake:.08,crown:.68});
  k.shell(1,0,30,9,18,5,C.enemy);k.panel(.6,0,35.1,2.2,9,C.oxide);
  k.box(3.7,0,11,1,12,11,C.joint,{shadow:false});k.box(4.3,0,15,.4,9,5,C.amber,{shadow:false,emission:true,bevel:.1});
  return k.result();
}

function impeller(k,x,y,z,r,metal=C.metal){
  k.disc(x,y,z,r,1.6,C.joint,{shadow:false});
  k.rim(x,y,z+1.5,r,r*.77,1.8,metal);
  // Swept vanes sit inside the well; the gaps remain visible on a small screen.
  for(let i=0;i<6;i++)k.mark([[r*.21,-r*.07],[r*.62,-r*.30],[r*.72,-r*.13],[r*.43,r*.16],[r*.2,r*.13]],x,y,z+1.75,metal,i*Math.PI/3);
  k.disc(x,y,z+1.8,r*.21,1.3,C.graphite,{shadow:false});
}
function foundryLeaf(k,side){
  const x=side*20;
  k.shell(x,-9,30,38,86,6.4,C.sage,{rake:.05,crown:.92,trim:C.graphite});
  k.shell(x+side*2,-12,35,31,68,5,C.ivory,{rake:.09,crown:.82});
  k.panel(x,-9,40.05,14,43,C.enamel);
  for(const y of [-25,-8,9])k.panel(x,y,40.48,9,2.7,C.sage,{angle:side*.4});
  k.box(side*1.5,-9,35,1.5,86,2,C.graphite);
}
function buildingDeck(k,kind){
  if(kind==='base'){
    k.shell(0,-7,47,53,49,6.5,C.ivory,{rake:.08,crown:.8});
    k.rim(0,-10,53.6,14,9,3,C.enamel);k.disc(0,-10,53.4,8.8,2.5,C.glass);
    for(const side of [-1,1]){
      k.shell(side*31,3,31,15,43,9,C.enamel,{angle:side*.19});
      k.panel(side*31,3,40.1,5,18,C.sage,{angle:side*.19});
      k.shell(side*9,-10,67,14,8,7,C.ivory,{angle:-side*.28});
    }
    chevron(k,0,7,53.6,5,11,C.enamel,Math.PI/2);
  }else if(kind==='outpost'){
    k.shell(-30,-22,34,35,51,5.5,C.sage,{rake:.10});
    impeller(k,-31,-24,39.6,10.5);
    k.shell(-14,11,34.5,63,16,7,C.ivory,{rake:.08});
    k.panel(-17,10,41.6,35,5.4,C.glass);
    for(const x of [-27,-14,-1])k.panel(x,10,42,1.4,5.5,C.sage);
    k.vents(43,-1,40.7,13,22,4);
  }else if(kind==='barracks'){
    // Paired troop bays flank a recessed passage ending at the real front door.
    k.panel(-8,-8,36.15,21,69,C.enamel);
    for(const side of [-1,1]){
      const x=-8+side*22;
      k.shell(x,-9,35.6,34,77,8,C.sage,{crown:.84});
      for(const y of [-31,-6,19])k.shell(x,y,40,31,22,6,C.ivory,{rake:.065,crown:.8});
      k.panel(x,-31,46.1,12,4,C.enamel);
    }
    chevron(k,-8,13,36.6,6,9,C.edge,Math.PI/2);
    k.shell(-8,-37,37,18,13,5,C.graphite);k.vents(-8,-37,42,10,7,3);
  }else if(kind==='arsenal'){
    for(const [i,y] of [[-1,10],[0,-15],[1,10]]){
      const x=i*35;
      k.shell(x,y,35,26,46,i?7:12,i?C.sage:C.enamel,{rake:.12});
      k.shell(x,y-3,i?41:46,18,23,4,C.ivory);
      k.vents(x,y-3,i?45.1:50.1,10,12,4);
      k.panel(x,-38,36.1,8,2.5,C.enamel);
    }
  }else if(kind==='bunker'){
    k.shell(0,-6,30.4,27,55,7.6,C.sage,{crown:.82});
    k.shell(0,-7,37,21,28,5,C.enamel);k.vents(0,-8,42.1,12,12,4);
    for(const side of [-1,1]){
      k.shell(side*40,-3,28.5,15,57,7,C.ivory);
      k.panel(side*40,-3,35.55,4.5,27,C.glass);
    }
  }else if(kind==='logistics'){
    for(const side of [-1,1]){
      const x=side*28;
      for(const y of [-27,7]){
        k.shell(x,y,33,32,32,7,C.sage,{rake:.08});
        k.panel(x,y,40.1,14,18,C.enamel);
        k.panel(x,y-2,40.5,14,3.2,C.ivory);
      }
      k.tube([side*7,-24,49],[0,-24,64],1.25,C.metal);
    }
  }else if(kind==='condenser'){
    k.rim(0,0,31,18,11,6,C.enamel,{shadow:true});
    for(let i=0;i<3;i++){
      const a=i*2*Math.PI/3,x=16*Math.cos(a),y=16*Math.sin(a);
      k.shell(x,y,23,7,11,18,C.ivory,{angle:a,rake:.12,crown:.65});
      k.panel(x-.5*Math.cos(a),y-.5*Math.sin(a),41,2.4,5,C.violet,{angle:a});
    }
    k.disc(0,0,33,5.5,3.5,C.violet);k.vents(38,-7,33.65,7,23,3);
  }
}
function building(kind,roof){
  const k=new Kit(),z=30;
  if(!roof){
    k.box(0,0,0,120,120,4,C.graphite,{radius:12,bevel:1.2});
    for(const side of [-1,1])for(const front of [-1,1]){k.box(side*51,front*51,3,17,17,4,C.metal,{radius:3});k.light(side*54,front*47,7.1,1,5);}
    for(const side of [-1,1]){
      k.shell(side*54,10,3,10,47,5,C.inset,{rake:.06});
      k.panel(side*54,12,8,4,14,C.metal);
    }
  }
  if(kind==='outpost'){
    if(!roof){
      k.box(-16.6,-9.6,4,88,87,25,C.metal,{radius:16,bevel:1});
      k.box(43.5,-7,4,30.7,91,31,C.graphite,{radius:10});
      for(const side of [-1,1]){
        k.tube([27,side*28,11],[27,side*15,11],2.5,C.metal);k.tube([27,side*15,11],[34,side*15,11],2.5,C.metal);
        k.box(-16.6+side*31,40,4,8,16,27,C.ivory,{radius:2});k.light(-16.6+side*31,40,24,1.3,6);
      }
      k.box(-16.6,37,4,53,5,24,C.joint);k.box(-16.6,50,2,55,22,2,C.metal);k.panel(-16.6,50,4.2,41,13,C.inset);
      k.light(-16.6,60,4.6,42,1.1);k.box(-16.6,39,29,56,9,4,C.ivory);
      k.box(43.5,38.8,12,17,.6,17,C.joint,{shadow:false,bevel:.1});
      for(let i=0;i<6;i++)k.box(43.5,39.2,14+i*2.2,14,.35,.6,C.metal,{shadow:false,bevel:.1});
      k.tube([23,39,10],[28,43,10],2.2,C.metal);k.tube([28,43,10],[34,43,10],2.2,C.metal);k.tube([34,43,10],[34,38.5,10],2.2,C.metal);
      k.box(53,17,17,1.2,2,9,C.mint,{shadow:false,emission:true});
    }else{
      k.box(-16.6,-9.6,z,88,87,5,C.ivory,{radius:16,bevel:1.6});
      k.disc(2,-22,z+5,14.7,1.6,C.graphite);k.disc(2,-22,z+6.6,13.5,1.8,C.sage);
      k.panel(-42,-15,z+5.2,.55,44,C.metal);k.panel(-19,-38,z+5.2,47,.55,C.metal);
      k.box(43.5,-7,z+5,26,84,3,C.ivory,{radius:8});k.box(43.5,-7,z+8,22,76,2,C.graphite,{radius:6});
      k.box(43.5,-7,z+10.1,17,45,.5,C.inset);k.tube([43.5,-32,z+10],[43.5,-32,z+24],1.2,C.graphite);
      k.box(43.5,-17,z+11,7,9,4,C.ivory);k.light(43.5,-17,z+15.1,3.2,3.2);
    }
  }else if(kind==='base'){
    if(!roof){
      k.box(0,0,4,84,83,13,C.metal,{radius:17});k.box(0,-7,17,70,70,20,C.sage,{radius:15,bevel:2});
      k.box(0,47,4,48,18,11,C.joint);k.light(0,52,15.2,26,1.4);
      for(const side of [-1,1]){k.box(side*47,0,4,25,68,15,C.ivory,{radius:6});k.panel(side*47,0,19.2,19,41,C.graphite);k.box(side*43,-29,17,20,17,8,C.ivory);k.light(side*43,-29,25.1,9,3);}
    }else{
      k.box(0,-7,37,57,57,5,C.graphite,{radius:12});k.box(0,-7,42,50,50,7,C.ivory,{radius:10,bevel:1.7});
      k.tube([0,-10,49],[0,-10,68],2.3,C.graphite);k.box(0,-10,68,23,9,4,C.ivory);k.disc(8,-10,72,2.6,.8,C.graphite);k.light(8,-10,72.9,3,3);
      for(const side of [-1,1]){k.box(side*33,8,30,27,10,4,C.ivory,{angle:side*.55});k.light(side*33,8,34.2,13,1.5);}
    }
  }else if(kind==='barracks'){
    if(!roof){
      k.box(-8,-7,4,91,91,26,C.metal,{radius:10});k.box(48,-6,4,20,91,31,C.graphite,{radius:5});
      k.box(-8,40,4,61,5,22,C.joint);k.box(-8,54,1,62,18,3,C.ivory);k.panel(-8,54,4.1,46,10,C.sage);
      for(const side of [-1,1]){k.box(-8+side*34,40,4,7,11,28,C.graphite);k.light(-8+side*34,40,26,1.1,5);}
      k.vents(48,9,35.1,12,21,5);k.light(48,29,35.2,1.8,12);
    }else{k.box(-8,-7,z,94,94,6,C.ivory,{radius:10,bevel:1.5});for(const x of [-23,7])k.panel(x,-7,z+6.1,2.2,55,C.inset);k.panel(-8,-48,z+6.2,64,1,C.sage);}
  }else if(kind==='foundry'){
    if(!roof){
      k.box(0,-4,4,85,87,25,C.graphite,{radius:7});k.box(0,44,4,72,5,23,C.joint);k.box(0,55,1,66,16,3,C.metal);k.panel(0,54,4.2,54,10,C.inset);
      for(const side of [-1,1]){k.box(side*45,-6,4,26,105,34,C.graphite,{radius:6});k.box(side*45,-9,32,24,86,9,C.ivory,{radius:5});k.vents(side*45,40,38.1,16,14,5);k.light(side*56,-7,35,1.2,18);}
    }else{
      for(const side of [-1,1])foundryLeaf(k,side);
    }
  }else if(kind==='arsenal'){
    for(let i=-1;i<=1;i++){
      if(!roof){k.box(i*35,-6,4,29,96,24,C.graphite,{radius:6});k.box(i*35,40,4,25,17,23,C.metal);k.light(i*35,46,27.2,12,1);}
      else {k.box(i*35,-9,z-3,29,91,9,C.ivory,{radius:6,bevel:1.5});k.panel(i*35,-9,z+6.1,2,63,C.inset);}
    }
    if(!roof){for(const x of [-18,18])k.vents(x,-6,24,4.5,62,3);k.box(0,57,1,49,12,3,C.ivory);k.light(0,59,4.3,40,1.2);}
  }else if(kind==='bunker'){
    if(!roof){
      k.box(0,-2,4,101,96,22,C.metal,{radius:10});k.box(0,48,4,36,4,18,C.joint);k.box(0,57,1,40,13,3,C.metal);
      for(const side of [-1,1])for(const front of [-1,1])k.box(side*47,front*44,4,20,24,32,C.ivory,{radius:5,bevel:1.5});
      for(const side of [-1,1]){k.box(side*30,45,13,23,9,6,C.graphite);k.panel(side*30,45,19.1,16,3,C.joint);}
      for(let i=0;i<5;i++)k.panel(-15+i*7,57,4.2,3.5,7,C.copper,{angle:-.4});
    }else{
      k.box(0,-2,26,95,91,5,C.ivory,{radius:8,bevel:1.2});k.panel(0,-2,31.1,.8,77,C.sage);
      for(const side of [-1,1])for(const front of [-1,1]){k.box(side*27,front*23,31,26,24,1.2,C.graphite,{radius:6});k.box(side*27,front*23,32.2,23,21,2.2,C.metal,{radius:5});k.disc(side*27,front*23+8,34.5,1.4,.5,C.joint,{shadow:false});}
    }
  }else if(kind==='condenser'){
    if(!roof){
      k.disc(0,0,4,35,7,C.graphite);k.disc(0,0,11,24,10,C.inset);
      for(const side of [-1,1]){
        k.box(side*38,-6,4,18,67,24,C.metal,{radius:5});
        k.tube([side*38,20,20],[side*13,12,20],3,C.graphite);
        k.box(side*38,27,27,12,6,4,C.ivory);k.light(side*38,27,31.2,8,2,'#b6a7d7');
      }
      k.box(0,48,4,44,15,10,C.metal);k.vents(0,48,14.2,30,8,4);
    }else{
      k.disc(0,0,21,24,7,C.metal);k.disc(0,0,28,18,3,C.graphite);
      k.disc(0,0,31,12,3,'#a095bb');k.disc(0,0,34,7,1,C.joint);
      for(const side of [-1,1]){
        k.box(side*38,-6,28,19,67,5,C.ivory,{radius:5});k.panel(side*38,-6,33.2,9,43,C.inset);
        k.tube([side*38,-28,32],[side*22,-14,43],2.5,C.graphite);
      }
      k.box(0,-18,40,47,10,6,C.ivory);k.panel(0,-18,46.2,20,4,'#b6a7d7');
    }
  }else if(kind==='logistics'){
    for(const side of [-1,1]){
      if(!roof){k.box(side*28,-5,4,34,79,24,C.graphite,{radius:6});k.box(side*28,35,4,30,16,23,C.metal);k.light(side*28,35,27.1,19,1.5);}
      else{k.box(side*28,-8,z-3,34,78,7,C.ivory,{radius:6,bevel:1.1});for(const y of [-30,-10,10])k.panel(side*28,y,z+4.1,23,.8,C.inset);}
    }
    if(!roof){k.box(0,0,4,15,65,18,C.graphite);k.box(0,51,2,77,18,5,C.ivory);k.light(0,51,7.2,61,1.5);}
    else{k.box(0,-24,22,13,17,5,C.metal);k.tube([0,-24,27],[0,-24,66],2.3,C.graphite);k.box(0,-24,66,30,10,5,C.ivory);k.disc(0,-24,71,2.8,.7,C.graphite);k.light(0,-24,71.8,3,3);}
  }
  if(roof)buildingDeck(k,kind);
  return k.result();
}
function carrier(){
  const k=new Kit();k.shell(0,0,5,51,36,11,C.enamel,{trim:C.graphite});
  k.shell(16,0,12.5,16,31,10,C.ivory,{rake:.16});
  k.shell(18,0,19,12,24,5,C.glass);k.panel(18,0,24.1,1.3,15,C.sage);
  k.shell(-5,0,14,34,30,13,C.sage,{rake:.065,crown:.82});
  for(const x of [-16,5]){
    k.shell(x,0,15,5,32,14,C.enamel,{rake:.05,crown:.9});
    k.panel(x,0,29.05,2,17,C.ivory);
  }
  k.shell(-5,0,26.5,15,21,3.9,C.ivory);return k.result();
}
function archiveGate(){
  const k=new Kit();
  k.box(0,0,0,20,116,8,C.graphite);k.shell(0,0,6,24,116,31,C.enemy,{rake:.08,crown:.94,trim:C.oxide});
  for(const y of [-38,0,38]){
    k.shell(0,y,28,29,9,12,C.oxide,{rake:.12,crown:.88});
    k.panel(0,y,40.1,12,3,C.bone);
  }
  return k.result();
}
function powerNode(){
  const k=new Kit();k.shell(0,0,0,74,73,10,C.oxide);
  k.shell(0,0,9,57,57,15,C.graphite);k.rim(0,0,21,23,12,11,C.enemy,{shadow:true});
  for(const side of [-1,1]){
    k.shell(side*23,0,16,12,50,24,C.enemy,{rake:.14,crown:.82});
    k.vents(side*23,0,40.1,6,25,3);
  }
  return k.result();
}
function archiveDepot(){
  const k=new Kit();k.box(0,0,0,150,150,8,C.graphite,{radius:12});
  k.shell(0,-10,8,137,118,35,C.enemy,{rake:.065,crown:.88,trim:C.oxide});
  k.shell(0,0,41,50,77,8,C.oxide);k.panel(0,0,49.1,31,54,C.graphite);
  for(const y of [-17,-1,15])k.shell(0,y,48,29,8,3,C.enemy);
  for(const side of [-1,1]){
    k.shell(side*45,-13,36,31,77,11,C.enemy);impeller(k,side*45,-23,47.1,9,C.copper);
    k.shell(side*40,41,9,19,27,20,C.oxide);
  }
  k.box(0,49,8,60,7,21,C.joint);k.shell(0,54,27,68,17,5,C.enemy);
  k.box(0,60,2,67,21,5,C.metal);return k.result();
}
function missionDock(){
  const k=new Kit();k.box(0,0,0,100,130,3,C.graphite,{radius:8});
  for(const side of [-1,1]){
    k.shell(side*43,0,2.5,11,128,7,C.sage,{rake:.08,crown:.94});
    for(const y of [-36,28])chevron(k,side*27,y,3.1,8,12,C.metal,Math.PI*.5);
  }
  k.shell(68,-30,0,25,28,20,C.enamel);return k.result();
}
function station(kind){
  const k=new Kit(),relay=kind==='relay',watch=kind==='watch';
  k.shell(0,0,0,relay?37:32,relay?33:27,6,C.graphite);
  k.shell(-1,0,5,24,20,watch?20:13,C.metal);
  if(relay){
    k.disc(0,0,16,7,12,C.graphite);k.shell(0,0,26,20,13,5,C.ivory);
    for(const side of [-1,1])k.tube([side*11,1,16],[side*16,-2,35],1.2,C.sage);
  }else if(watch){
    k.shell(0,0,22,23,18,8,C.ivory);k.panel(0,0,30,13,5,C.glass);
    k.tube([-8,0,28],[-10,0,38],1.2,C.graphite);
  }else{
    k.shell(0,-2,16,24,20,9,C.sage);k.panel(0,-2,25,15,9,C.glass);
    k.panel(-5,6,18.1,6,3,C.enamel);
  }
  return k.result();
}
function cacheCrate(){
  const k=new Kit();k.shell(0,0,0,22,17,8.6,C.copper,{rake:.05,crown:.86,trim:C.graphite});
  for(const x of [-6.5,6.5])k.shell(x,0,.4,3,18,9,C.graphite,{rake:.04,crown:.92});
  k.panel(0,0,8.7,6.5,9,C.oxide);return k.result();
}
function deposit(matter){
  const k=new Kit();
  function facet(x,y,z,r,h,yaw,lean){
    const n=matter?5:6;
    const ring=(scale,height,shift)=>Array.from({length:n},(_,i)=>{
      const a=i*2*Math.PI/n+yaw;return [x+Math.cos(a)*r*scale+lean*shift,y+Math.sin(a)*r*scale*.78,z+height];
    });
    const base=ring(.8,0,0),shoulder=ring(1,h*.61,.45),crown=ring(matter?.24:.56,h,1);
    k.volume(true);k.face([...base].reverse(),C.graphite);
    for(let i=0;i<n;i++){
      const j=(i+1)%n;
      k.face([base[i],base[j],shoulder[j],shoulder[i]],matter?'#685e85':C.inset);
      k.face([shoulder[i],shoulder[j],crown[j],crown[i]],matter?(i%2?'#967fae':'#b6a1d1'):(i%2?C.sage:C.metal));
    }
    k.face(crown,matter?'#d9c5ea':'#bfcac0');
  }
  facet(-1,0,0,7.4,matter?18:13,.23,3.7);
  facet(5,3,0,4.7,matter?10:7,.6,2.4);
  facet(-6,3,0,4.2,matter?8:6,.13,-1.6);
  return k.result();
}
function rubble(){
  const k=new Kit();
  for(const [x,y,w,d,h,a] of [[-14,5,26,12,7,-.22],[9,-5,19,20,10,.27],[13,11,12,9,4,-.13]]){
    k.shell(x,y,0,w,d,h,C.inset,{angle:a,rake:.22,crown:.65});
    k.panel(x-2,y,h,5,3.6,C.metal,{angle:a});
  }
  k.tube([-17,-3,2],[-6,-6,10],1.1,C.graphite);k.tube([-6,-6,10],[2,-8,7],1.1,C.graphite);return k.result();
}
const factories={
  'hero-armour':()=>infantry(true),'rifle-armour':()=>infantry(false),'medic-armour':medicArmour,'shield-plate':shieldPlate,'grenadier-armour':grenadierArmour,'infantry-rifle':rifle,'drive-pod':drivePod,
  'scout-chassis':scout,'scout-sensor':sensor,'drone-chassis':drone,'allied-track':track,'siege-track':()=>track(true),
  'field-barrel':()=>cannon('field'),'siege-barrel':()=>cannon('siege'),'thermal-nozzle':()=>cannon('thermal'),
  'armored-chassis':armoredChassis,'armored-wheel':armoredWheel,'armored-turret':armoredTurret,
  'artillery-chassis':artillery,'artillery-turret':turret,'rocket-armour':rocketBody,'rocket-launcher':launcher,'runner-carapace':runner,
  'sentinel-armour':sentinel,'sentinel-rifle':()=>rifle(C.enemy),'sentinel-boot':()=>drivePod(C.enemy),
  'turret-base':()=>defenseBase('turret'),'jammer-mast':()=>defenseBase('jammer'),'bastion-base':()=>defenseBase('bastion'),
  'bastion-south-base':()=>defenseBase('bastion-south'),'defense-head':defenseHead,
  'citadel-base':citadel,'citadel-pylon':shieldPylon,
  'warden-armour':warden,'flamer-rig':flamer,'bomber-core':bomber,
  'tank-hull':()=>siegeChassis(false),'mortar-hull':()=>siegeChassis(true),'tank-turret':tankTurret,'mortar-cradle':mortarCradle,'mortar-tube':mortarTube,
  'archive-carrier':carrier,'archive-barrier':archiveGate,'archive-power':powerNode,'archive-depot':archiveDepot,
  'mission-dock':missionDock,'relay-mast':()=>station('relay'),'watch-tower':()=>station('watch'),'field-console':()=>station('terminal'),
  'supply-crate':cacheCrate,'ore-outcrop':()=>deposit(false),'matter-outcrop':()=>deposit(true),'rubble':rubble,
};
for(const kind of ['base','outpost','barracks','foundry','arsenal','bunker','logistics','condenser'])for(const piece of ['body','roof'])factories[kind+'-'+piece]=()=>building(kind,piece==='roof');
for(const side of [-1,1])factories['foundry-roof-'+(side<0?'left':'right')]=()=>{
  const k=new Kit();foundryLeaf(k,side);return k.result();
};
export const PREFAB_NAMES=Object.freeze(Object.keys(factories));
export function prefabData(name){
  if(!factories[name])throw Error('Unknown model assembly: '+name);
  let data=cache.get(name);if(!data){data=factories[name]();cache.set(name,data);}return data;
}

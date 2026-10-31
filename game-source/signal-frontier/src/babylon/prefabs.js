// Rigid assemblies interpreted from the selected workshop references. Their
// vertices are built once; an animated formation submits only assembly matrices.
const C={ivory:'#d9dfd3',sage:'#b9c7ba',graphite:'#24383f',joint:'#101e25',metal:'#5b746e',
  inset:'#3c5456',edge:'#e7eadd',mint:'#a4edd9',enemy:'#aaa18c',copper:'#ad8567',amber:'#efae8c'};
const cache=new Map();
function rgb(hex,emission=false){return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,emission?-1:1];}

export class Kit {
  constructor(){this.solid={positions:[],normals:[],indices:[],colors:[]};this.shadow={positions:[],normals:[],indices:[],colors:[]};this.faces=[];this.volumes=[];}
  volume(shadow){this.owner={shadow,planes:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};this.volumes.push(this.owner);}
  face(points,color,shadow=true,emission=false,smooth=null){
    const p=points.map(([x,y,z])=>[x,z,-y]),a=p[0],b=p[1],c=p[2],
      u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);
    if(l<1e-8)return;
    const normal=n.map(v=>v/l),owner=this.owner,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const q of p)for(let i=0;i<3;i++){min[i]=Math.min(min[i],q[i]);max[i]=Math.max(max[i],q[i]);owner.min[i]=Math.min(owner.min[i],q[i]);owner.max[i]=Math.max(owner.max[i],q[i]);}
    owner.planes.push([...normal,normal.reduce((d,x,i)=>d+x*a[i],0)]);
    this.faces.push({p,normal,smooth,col:rgb(color,emission),owner,min,max,shadow});
  }
  outline(w,d,r=1){
    r=Math.min(r,w/2-.001,d/2-.001);const points=[];
    for(const [x,y,start]of [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,Math.PI/2],[-w/2+r,-d/2+r,Math.PI],[w/2-r,-d/2+r,Math.PI*1.5]])
      for(let i=0;i<=3;i++){const a=start+i*Math.PI/6;points.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}
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
  panel(x,y,z,w,d,color=C.inset,options={}){return this.box(x,y,z,w,d,.35,color,{bevel:.1,shadow:false,...options});}
  light(x,y,z,w,d,color=C.mint){return this.panel(x,y,z,w,d,color,{emission:true});}
  vents(x,y,z,w,d,count=4,angle=0){
    this.panel(x,y,z,w,d,C.joint,{angle});
    for(let i=0;i<count;i++)this.panel(x+(i-(count-1)/2)*w/count,y,z+.4,.5,d*.76,C.metal,{angle});
    return this;
  }
  result(){
    if(this.built)return this.built;
    let culledFaces=0;
    const hidden=(face,shadow)=>this.volumes.some(v=>v!==face.owner&&(!shadow||v.shadow)&&
      v.min.every((x,i)=>face.min[i]>x+1e-5)&&v.max.every((x,i)=>face.max[i]<x-1e-5)&&
      v.planes.every(plane=>face.p.every(p=>p[0]*plane[0]+p[1]*plane[1]+p[2]*plane[2]<plane[3]-1e-5))),
      emit=(d,f)=>{const start=d.positions.length/3;for(let i=0;i<f.p.length;i++){d.positions.push(...f.p[i]);d.normals.push(...(f.smooth?.[i]||f.normal));d.colors.push(...f.col);}for(let i=1;i<f.p.length-1;i++)d.indices.push(start,start+i,start+i+1);};
    // A face is removed only if every point lies strictly inside another convex
    // solid in this same rigid assembly. Exterior contours are never decimated.
    for(const f of this.faces){if(hidden(f,false))culledFaces++;else emit(this.solid,f);if(f.shadow&&!hidden(f,true))emit(this.shadow,f);}
    return this.built={solid:this.solid,shadow:this.shadow,culledFaces};
  }
}

function infantry(hero){
  const k=new Kit(),m=hero?C.ivory:C.sage;
  k.box(-.5,0,14,15,15,hero?9.5:8.2,m,{radius:4.6,bevel:1.2});
  k.box(4.3,0,18,3.7,11,3.6,m,{radius:1});
  k.panel(-.5,0,hero?23.6:22.3,9,9,C.metal);k.panel(2.8,0,hero?24.1:22.8,2.3,6,m);
  k.box(-8,0,14,6.5,hero?13:11,hero?14:12,C.graphite,{radius:2});
  k.box(-8,0,hero?27:25,5.5,9,2,m);k.vents(-8,0,hero?29.2:27.2,3,5,3);
  for(const side of [-1,1]){
    k.box(-.5,side*7.5,19,hero?8.5:7.5,5.8,hero?6:5,m,{radius:2.1});
    k.panel(-1,side*7.5,hero?25.2:24.2,4,3.6,m);k.disc(0,side*6.9,17,2.1,1,C.joint);
    k.light(-10.5,side*3,23,1.1,3.3);k.box(-6.5,side*5.6,15,3.5,2,9,C.metal,{shadow:false});
  }
  k.box(1,0,25,hero?12:10.5,hero?10:9.5,hero?9:7,hero?C.ivory:C.graphite,{radius:3.4,bevel:1.2});
  k.box(5.4,0,25.5,3.4,7,3,m);k.box(7.1,0,hero?29.5:27.5,1.1,7.5,3.2,C.joint,{shadow:false,bevel:.2});
  k.box(7.75,0,hero?30.4:28.4,.35,6.2,1.2,C.mint,{shadow:false,emission:true,bevel:.1});
  for(const side of [-1,1]){k.tube([0,side*4.8,28],[0,side*5.7,28],1.8,C.joint);k.tube([0,side*5.75,28],[0,side*5.9,28],1.2,m,{shadow:false});}
  k.panel(-1,0,hero?34.1:32.1,4,.4,C.metal);return k.result();
}
function rifle(material=C.ivory){
  const k=new Kit();
  k.box(17,5,15.5,18,5.8,6.3,C.graphite,{radius:1.8});k.box(17,5,20.1,16.5,5.8,2.1,material);
  k.tube([23,5,19.5],[30.5,5,19.5],1.35,C.joint);k.box(29,5,17,4,5,5,material,{radius:.7});
  k.box(31.05,5,18.2,.3,2.9,2.6,C.joint,{bevel:0});k.box(14,5,12,4.5,4,4,C.graphite);
  k.box(16,5,21.5,4.5,3.5,2,C.joint);k.panel(21,5,22.3,3.5,1.4,C.joint);
  k.light(20,7.3,20.6,3.4,.7,material===C.enemy?C.amber:C.mint);k.panel(11,5,22.1,1.2,2,C.metal);return k.result();
}
function drivePod(material=C.ivory){
  const k=new Kit();k.box(0,0,0,9.5,6,2.5,C.joint,{radius:1.6});
  k.box(1,0,2.5,7,5.7,1.8,material,{radius:1.4});k.panel(2,0,4.4,3.8,3.5,material);
  return k.result();
}
function scout(){
  const k=new Kit();
  k.extrusion([[-12,-6],[-6,-9],[5,-8],[14,-1],[14,1],[5,8],[-6,9],[-12,6]],0,0,5.5,5,C.metal,{bevel:.8});
  k.box(-1.5,0,10.5,21,16,3.5,C.ivory,{radius:4.5,bevel:.9});k.panel(0,0,14.1,1,11,C.metal);
  k.disc(-4,0,14,4,2,C.graphite);k.disc(-4,0,16,3.2,.6,C.metal);
  k.tube([-4,0,15],[-4,0,28],1.6,C.graphite);k.light(12,0,10.8,1,5);
  for(const side of [-1,1])k.box(-10,side*5,8,4,3,3,C.graphite);
  return k.result();
}
function sensor(){const k=new Kit();k.box(0,0,0,14,9.5,3,C.joint,{radius:2});k.box(0,0,2.5,13.5,8.5,4.5,C.ivory,{radius:2.2});k.box(6.7,0,2.6,1.1,5.5,3.6,C.graphite);k.light(6.8,0,5.6,.9,4.5);k.panel(0,0,7.2,7,.5,C.metal);return k.result();}
function drone(){
  const k=new Kit();k.box(0,0,4,22,18,4,C.graphite,{radius:5.5});
  // The bay stays open, so the real cargo is never hidden by an opaque cap.
  for(const side of [-1,1]){k.box(-.5,side*6.6,7,21,4.5,5,C.ivory,{radius:1.6});k.panel(1,side*7,12.1,6,.5,C.metal);}
  k.box(-8,0,7,5.5,14,5,C.ivory,{radius:2});k.box(8,0,7,4.5,13,5,C.ivory,{radius:1.5});
  k.box(-1.5,0,11.8,10.5,11,1,C.joint);k.panel(-1.5,0,12.9,8,8.8,C.inset);
  for(const side of [-1,1])k.box(-1.5,side*5.1,13,10.5,.7,2.5,C.metal,{shadow:false});
  k.box(10.6,0,8.5,.5,4,1.4,C.mint,{shadow:false,emission:true,bevel:.1});k.panel(5.4,0,12.2,1.8,5.3,C.joint);return k.result();
}
function track(){
  const k=new Kit();k.box(0,0,1,39,9,6,C.joint,{radius:3.8});
  k.box(-1,0,7,34,7,3,C.ivory,{radius:2.3});
  for(const x of [-14,14]){k.tube([x,-4.6,4.8],[x,4.6,4.8],3.7,C.graphite);k.tube([x,-4.8,4.8],[x,4.8,4.8],2.6,C.metal,{shadow:false});}
  for(const x of [-9,-1,7])k.panel(x,0,10.2,3.5,1.1,C.joint);
  return k.result();
}
function artillery(){
  const k=new Kit();k.box(-1,0,6,33,26,7,C.ivory,{radius:6,bevel:1.3});
  k.box(-12,0,13,9,16,7,C.graphite,{radius:2});
  for(const side of [-1,1]){k.box(-12,side*5,20,7,4.5,2.5,C.ivory);k.vents(1,side*9,13.2,10,2.5,4);}
  k.disc(0,0,13,8,5,C.graphite);k.disc(0,0,17.4,6.8,.7,C.metal);
  k.light(-15,0,19,.8,8);k.panel(8,0,13.3,5,12,C.metal);return k.result();
}
function turret(){
  const k=new Kit();k.box(0,0,17,23,19,7.5,C.ivory,{radius:5.5,bevel:1.3});
  k.box(-1,0,24.5,12,15,3,C.sage,{radius:2});k.panel(-4,0,27.6,4,7,C.inset);
  k.box(8,0,22,14,12,7,C.sage,{radius:2.5});k.box(14,0,21,7,8,6,C.graphite);
  k.light(-10,0,23,1,10);return k.result();
}
function rocketBody(){
  const k=new Kit();k.box(-2,0,10,14.5,15.5,5,C.graphite,{radius:3});
  k.box(0,0,14,16,17,10.3,C.enemy,{radius:4,bevel:1.3});k.panel(1,0,24.4,9,9,C.enemy);
  k.box(-8,2,14,7.7,11.5,12,C.graphite,{radius:2});k.box(-8,2,25.5,6.7,9.5,1.5,C.enemy);
  k.light(-10.2,2,20,1.2,4,C.amber);k.box(2,4.5,25,9,8,6.5,C.graphite,{radius:2});
  k.box(1,4.5,30.5,7.5,7,1.5,C.enemy);k.light(6.2,4.5,29.6,1,3.5,C.amber);
  k.tube([-6,-6,18],[5,-6,22],1.4,C.copper);return k.result();
}
function launcher(){
  const k=new Kit();k.tube([-12,-6.5,24],[25,-6.5,24],4.1,C.enemy);
  for(const x of [-10,5,23])k.tube([x-1.4,-6.5,24],[x+1.4,-6.5,24],4.8,x===23?C.copper:C.graphite);
  k.tube([25.1,-6.5,24],[25.4,-6.5,24],3.5,C.joint,{shadow:false});
  k.box(4,-6.5,27.7,21,4.2,1,C.enemy);k.panel(6,-6.5,28.8,11,1,C.joint);
  k.box(-9,-6.5,28,6,5.2,1.3,C.graphite);return k.result();
}
function runner(){
  const k=new Kit();k.box(-1.2,0,0,25,15,4.1,C.graphite,{radius:5.8,bevel:1.3});
  k.box(-3.8,0,3.6,19,12.8,3.8,C.enemy,{radius:4.5,bevel:1.2});
  k.extrusion([[1,-5.4],[7,-4.2],[11.8,-1.8],[12.5,0],[11.8,1.8],[7,4.2],[1,5.4]],0,0,3.9,2.8,C.enemy,{bevel:.6});
  k.panel(-4,0,7.5,10,3.1,C.graphite);for(const x of [-7,-3])k.panel(x,-3,7.6,1,2,C.inset);
  k.box(10.2,0,3.1,3.4,6.5,2,C.graphite);k.light(11.9,0,5.4,.7,3.4,C.amber);return k.result();
}
function sentinel(){
  const k=new Kit();k.box(-2,0,11,12,13,11,C.graphite,{radius:3});k.box(-1,0,13,13,14,7,C.enemy,{radius:2.5});
  k.disc(0,0,21,3.6,3,C.joint);k.box(1,0,24,15,12,7,C.enemy,{radius:2.6,bevel:1});
  k.box(7,0,25,2,9,3,C.graphite);k.light(8,0,27,1,6,C.amber);
  for(const side of [-1,1]){k.box(-1,side*8,16,7,5,7,C.enemy);k.panel(-1,side*8,23.1,3.5,1,C.joint);}
  k.box(-7,0,15,4,10,10,C.graphite);k.vents(-7,0,25.2,2.6,6,3);return k.result();
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
    }
  }else if(kind==='turret'){
    k.disc(0,0,0,11,7,C.graphite);k.disc(0,0,7,8.5,8,C.enemy);k.disc(0,0,15,7,3,C.graphite);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,x=Math.cos(a)*17,y=Math.sin(a)*17;k.box(x,y,0,30,10,5,C.graphite,{angle:a,radius:3});k.box(x,y,5,25,8,3,C.enemy,{angle:a});}
  }else{
    const south=kind==='bastion-south';k.box(0,0,0,82,76,6,C.graphite,{radius:14});k.box(0,-1,6,73,67,8,C.enemy,{radius:13});
    k.box(0,-3,14,south?61:59,south?56:54,south?17:14,C.graphite,{radius:10});k.box(0,-3,south?28:25,55,50,5,C.enemy,{radius:9});
    if(south){
      for(const side of [-1,1])for(const front of [-1,1])k.box(side*30,front*28,7,15,17,21,C.enemy,{radius:4});
      k.box(0,35,6,27,5,16,C.joint);k.box(0,41,1,28,13,3,C.metal);
      for(let i=0;i<4;i++)k.panel(-9+i*6,41,4.2,3,7,C.copper,{angle:-.4});
    }else k.box(0,24,13,48,13,15,C.graphite,{radius:3});
    k.light(0,25,29,40,1.3,C.amber);k.vents(-22,-3,34,9,18,5);
    k.tube([-22,-18,25],[-22,-18,48],1.6,C.graphite);k.box(-22,-18,43,4,4,8,C.copper);
  }
  return k.result();
}
function defenseHead(){
  const k=new Kit();k.box(-3,0,-8,23,22,8,C.enemy,{radius:5});k.box(-8,0,0,17,21,5,C.graphite,{radius:3});
  for(const side of [-1,1]){
    k.box(9,side*5.5,-2.5,13,7,5,C.copper);k.tube([12,side*5.5,0],[33,side*5.5,0],2,C.graphite);
    k.box(32,side*5.5,-3,3.5,7,6,C.copper);k.box(34,side*5.5,-1.7,.4,3,3.4,C.joint,{shadow:false});
  }
  k.panel(-10,0,5.1,9,12,C.metal);k.light(-1,0,5.4,3,3,C.amber);return k.result();
}
function citadel(){
  const k=new Kit();k.disc(0,0,0,28,8,C.graphite);k.disc(0,0,8,25,10,C.enemy);k.disc(0,0,18,21,7,C.graphite);
  k.disc(0,0,25,18,15,C.enemy);k.disc(0,0,40,16,10,C.graphite);k.disc(0,0,50,14,6,C.enemy);
  for(let i=0;i<3;i++){
    const a=Math.PI/2+i*Math.PI*2/3,x=Math.cos(a)*35,y=Math.sin(a)*35;
    k.box(x,y,0,47,17,7,C.graphite,{angle:a,radius:5});k.box(x,y,7,39,13,7,C.enemy,{angle:a,radius:4});
    k.box(Math.cos(a)*53,Math.sin(a)*53,7,15,18,6,C.graphite,{angle:a,radius:4});
    k.box(Math.cos(a)*53,Math.sin(a)*53,13,13,14,4,C.enemy,{angle:a,radius:3});
    k.light(Math.cos(a)*14,Math.sin(a)*14,40.2,4,2,C.amber);
  }
  return k.result();
}
function shieldPylon(){
  const k=new Kit();k.box(0,0,0,9,21,29,C.graphite,{radius:2});k.box(0,0,2,7,19,32,C.copper,{radius:2,bevel:1});
  k.box(3.7,0,11,1,12,11,C.joint,{shadow:false});k.box(4.3,0,15,.4,9,5,C.amber,{shadow:false,emission:true,bevel:.1});
  return k.result();
}

function building(kind,roof){
  const k=new Kit(),z=30;
  if(!roof){
    k.box(0,0,0,120,120,4,C.graphite,{radius:12,bevel:1.2});
    for(const side of [-1,1])for(const front of [-1,1]){k.box(side*51,front*51,3,17,17,4,C.metal,{radius:3});k.light(side*54,front*47,7.1,1,5);}
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
      for(const side of [-1,1]){k.box(side*20,-9,z,37,85,6,C.ivory,{radius:5});k.panel(side*20,-9,z+6.1,27,65,C.sage);}
      k.box(0,-9,z+5,3,86,2,C.graphite);k.box(0,-9,z+6,6,22,2,C.metal);
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
  }else if(kind==='logistics'){
    for(const side of [-1,1]){
      if(!roof){k.box(side*28,-5,4,34,79,24,C.graphite,{radius:6});k.box(side*28,35,4,30,16,23,C.metal);k.light(side*28,35,27.1,19,1.5);}
      else{k.box(side*28,-8,z-3,34,78,7,C.ivory,{radius:6,bevel:1.1});for(const y of [-30,-10,10])k.panel(side*28,y,z+4.1,23,.8,C.inset);}
    }
    if(!roof){k.box(0,0,4,15,65,18,C.graphite);k.box(0,51,2,77,18,5,C.ivory);k.light(0,51,7.2,61,1.5);}
    else{k.box(0,-24,22,13,17,5,C.metal);k.tube([0,-24,27],[0,-24,66],2.3,C.graphite);k.box(0,-24,66,30,10,5,C.ivory);k.disc(0,-24,71,2.8,.7,C.graphite);k.light(0,-24,71.8,3,3);}
  }
  return k.result();
}
const factories={
  'hero-armour':()=>infantry(true),'rifle-armour':()=>infantry(false),'infantry-rifle':rifle,'drive-pod':drivePod,
  'scout-chassis':scout,'scout-sensor':sensor,'drone-chassis':drone,'allied-track':track,
  'artillery-chassis':artillery,'artillery-turret':turret,'rocket-armour':rocketBody,'rocket-launcher':launcher,'runner-carapace':runner,
  'sentinel-armour':sentinel,'sentinel-rifle':()=>rifle(C.enemy),'sentinel-boot':()=>drivePod(C.enemy),
  'turret-base':()=>defenseBase('turret'),'jammer-mast':()=>defenseBase('jammer'),'bastion-base':()=>defenseBase('bastion'),
  'bastion-south-base':()=>defenseBase('bastion-south'),'defense-head':defenseHead,
  'citadel-base':citadel,'citadel-pylon':shieldPylon,
};
for(const kind of ['base','outpost','barracks','foundry','arsenal','bunker','logistics'])for(const piece of ['body','roof'])factories[kind+'-'+piece]=()=>building(kind,piece==='roof');
for(const side of [-1,1])factories['foundry-roof-'+(side<0?'left':'right')]=()=>{
  const k=new Kit();k.box(side*20,-9,30,37,85,6,C.ivory,{radius:5});k.panel(side*20,-9,36.1,27,65,C.sage);
  k.box(side*1.5,-9,35,1.5,86,2,C.graphite);return k.result();
};
export const PREFAB_NAMES=Object.freeze(Object.keys(factories));
export function prefabData(name){
  if(!factories[name])throw Error('Unknown model assembly: '+name);
  let data=cache.get(name);if(!data){data=factories[name]();cache.set(name,data);}return data;
}

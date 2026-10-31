// Articulated 3D counterparts of the procedural models. Every helper submits
// an instance of shared immutable geometry; simulation objects remain read-only.
const P={shell:"#d9dfd3",field:"#b9c7ba",dark:"#243b43",steel:"#58756e",enemy:"#aaa18c",copper:"#ad8567",mint:"#a4edd9",amber:"#efae8c",black:"#0c1b22"},
  clamp=(x)=>Math.max(0,Math.min(1,x));

export class Models {
  constructor(parts,E,view){this.parts=parts;this.E=E;this.view=view;}
  begin(u,s,ui,memory=false) {
    this.u=u;this.s=s;this.ui=ui;this.memory=memory;
    this.floor=this.E.elevation(u.x,u.y,this.view.mapId);
    this.pose=memory?{phase:0,move:0,angle:u.angle||0}:this.view.pose(u,s,ui);
    this.gaitPose={...this.pose,cycle:globalThis.SignalUnitModels.gaits[u.kind]};
    this.parts.opacity=memory?1:this.view.wreckOpacity(u,s);
    this.a=u.construction?-u.construction.turn*Math.PI/2:this.pose.angle;
    this.aim=u.kind==="hero"&&ui.aim?this.E.aimAngle(u,ui.aim):u.combat?.angle??u.angle??0;
    this.accent=u.team?P.amber:P.mint;
    this.recoil=memory||ui.reduced?0:Math.sin(clamp((u.flash||0)/.1)*Math.PI)*3;
    this.progress=u.combat?.mode==="aim"?clamp(1-u.combat.time/(u.combat.total||1)):0;
  }
  point(x,y,z,a=this.a) {
    const co=Math.cos(a),si=Math.sin(a);return [this.u.x+x*co-y*si,this.u.y+x*si+y*co,this.floor+z];
  }
  shape(kind,x,y,w,d,z,h,color=P.shell,a=this.a,emission=false) {
    const p=this.point(x,y,z,a);
    this.parts.part(kind,...p,w,d,h,a,this.u.hit>0&&!this.ui.reduced&&!this.memory?P.amber:color,this.floor,this.memory,emission);
  }
  box(...args){this.shape("box",...args);}
  prefab(name,x=0,y=0,z=0,a=this.a,w=1,d=1,h=1){
    this.parts.part(name,...this.point(x,y,z,a),w,d,h,a,this.u.hit>0&&!this.ui.reduced&&!this.memory?'#fff0da':'#ffffff',this.floor,this.memory);
  }
  disc(x,y,r,z,h,color=P.dark,a=this.a){this.shape("cylinder",x,y,r*2,r*2,z,h,color,a);}
  joint(x,y,z,r,color=P.dark,a=this.a){this.shape("sphere",x,y,r*2,r*2,z-r,r*2,color,a);}
  beam(a,b,w,color=P.dark,angle=this.a,emission=false,kind="box") {
    this.parts.beam(...this.point(...a,angle),...this.point(...b,angle),w,color,this.floor,this.memory,emission,kind);
  }
  light(x,y,w,d,z,h=1,a=this.a,color=this.accent){this.box(x,y,w,d,z,h,color,a,true);}
  foot(x,y,w,d,lift,color=P.shell,a=this.a) {
    const p=this.point(x,y,0,a),ground=this.E.elevation(p[0],p[1],this.view.mapId)-this.floor,
      z=lift+Math.max(-7,Math.min(7,ground));
    if(!this.u.team&&['hero','rifle','scout','drone'].includes(this.u.kind))this.prefab('drive-pod',x,y,z,a,w/9.5,d/6,1);
    else if(this.u.kind==='sentinel')this.prefab('sentinel-boot',x,y,z,a,w/9.5,d/6,1);
    else {this.box(x+1,y,w,d,z,2.5,P.dark,a);this.box(x+1,y,w*.7,d*.7,z+2.5,1.6,color,a);}
    return z;
  }
  step(offset,duty=.64,height=2){return globalThis.SignalUnitModels.contact(this.gaitPose,offset,duty,height);}
  legs(spread=6,front=7,z=8,material=P.field,count=4) {
    for(let i=0;i<count;i++) {
      const side=i%2?1:-1,f=i<2?1:-1,step=this.step(i%3===0?0:.5,.68,2.2),
        x=f*front+step.x,y=side*spread,lift=this.foot(x,y,7,5,step.lift,material),
        knee=[f*front*.8+step.x*.3,side*spread*.8,z*.6];
      this.beam([f*front*.45,side*spread*.4,z],knee,3,material);
      this.beam(knee,[x,y,lift+2],2.6,P.dark);
      if(['scout','drone'].includes(this.u.kind))this.joint(...knee,1.45,P.dark);
    }
  }
  infantry() {
    const hero=this.u.kind==="hero",material=hero?P.shell:P.field,a=this.aim,p=this.pose,
      bob=Math.abs(Math.sin(p.phase))*p.move*.6,reload=hero&&!this.memory?this.s.reload:0,
      hand=reload?Math.sin(clamp(1-reload/1.1)*Math.PI):0,
      channel=hero&&!this.memory&&(this.s.terminal?.channeling||this.s.terminals?.some(t=>t.channeling));
    for(const side of [-1,1]) {
      const st=this.step(side<0?0:.5,.62,3),direction=(p.direction??this.a)-this.a,
        x=st.x*Math.cos(direction)+(side>0?-4:4)*(1-p.move),y=side*5+st.x*Math.sin(direction),
        lift=this.foot(x,y,9.5,6,st.lift,material),knee=[x*.45+1.7,side*4.5,7.5+lift*.4];
      this.beam([x,y,lift+3],knee,3.4,material);this.beam(knee,[0,side*3,13],4,P.dark);this.joint(...knee,2.1,P.dark);
      this.box(knee[0]+.5,knee[1],4.8,4.4,knee[2]-.5,2.6,material);
    }
    this.box(-1,0,12,12,10+bob,5,P.dark);
    this.prefab(hero?'hero-armour':'rifle-armour',0,0,bob,a);
    for(const side of [-1,1]) {
      const elbow=[5,side*8,16.5+bob],grip=side>0?[11-this.recoil,5.5,17.5]:channel?[14,-5,28]:[21-hand*12-this.recoil,3-hand*6,18-hand*5];
      this.beam([0,side*6.5,21+bob],elbow,3.8,P.dark,a);this.beam(elbow,grip,3.1,material,a);
      this.joint(...elbow,1.5,P.dark,a);this.box(grip[0],grip[1],3,3,grip[2]-1.5,2.6,P.dark,a);
    }
    if(!channel) {
      const mount=this.E.MOUNTS[this.u.kind]||18,r=this.recoil;
      this.prefab('infantry-rifle',-r,0,mount-19.5,a);
      if(reload)this.box(9,1-hand*6,4,3,12-hand*3,4,material,a);
      this.flash(31-r,5,mount,a,.6);
    } else this.light(14,-5,3,3,28,1,a);
    if(hero&&this.s.dashT>0&&!this.ui.reduced&&!this.memory)for(const side of [-1,1])this.beam([-11,side*6,13],[-25,side*6,13],1.2,this.accent,this.a,true);
  }
  robot() {
    const heavy=this.u.kind==="warden",a=this.aim,spread=heavy?7.5:6;
    for(const side of [-1,1]) {
      const st=this.step(side<0?0:.5,.7,2),lift=this.foot(st.x,side*spread,11,6,st.lift,P.enemy),knee=[2+st.x*.3,side*spread*.85,8];
      this.beam([st.x,side*spread,lift+2],knee,3.5,P.dark);this.beam(knee,[-2,side*4,14],4,P.enemy);
      this.joint(...knee,1.8,P.dark);this.box(knee[0]+.5,knee[1],5,4,7.3,3,P.enemy);
      if(heavy)this.box(0,side*11,12,6,19,6,P.enemy,a);
    }
    if(!heavy){
      this.prefab('sentinel-armour',0,0,0,a);this.prefab('sentinel-rifle',-this.recoil,2,-1.5,a);
      this.beam([0,7,19],[12,7,17],3.5,P.dark,a);this.beam([0,-7,19],[21,6,17],3,P.enemy,a);
      this.flash(31-this.recoil,7,18,a,.6);return;
    }
    this.box(-2,0,heavy?22:14,heavy?24:16,11,heavy?17:12,P.enemy,a);
    this.box(2,0,heavy?14:13,10,heavy?29:24,8,P.dark,a);this.light(8,0,1,6,heavy?33:28,1.8,a);
    this.gun(a,18,heavy?31:28,heavy?5:3.5,heavy?12:7,P.enemy);
  }
  runner() {
    const coil=this.progress,a=coil?this.aim:this.a,body=6.8-coil*1.7;
    if(coil)this.gaitPose={...this.gaitPose,move:0,settle:0};
    this.legs(9.5,9,body+1,P.enemy);
    this.prefab('runner-carapace',0,0,body,a);
    for(const side of [-1,1]) {
      this.joint(4,side*6,body+3,1.7,P.enemy,a);
      this.beam([7,side*4,body+2],[14-coil*2+this.recoil*.65,side*3,body-1],3,P.dark,a);
      this.beam([14-coil*2+this.recoil*.65,side*3,body],[18-coil*2+this.recoil*.65,side,body-1],2,P.enemy,a);
    }
    this.box(10,0,4,6,body+3,3,P.dark,a);this.light(12,0,1,3.5,body+4,1.4,a);
  }
  scout() {
    this.legs(12,9,8,P.field);this.prefab('scout-chassis');
    const scan=this.memory||this.ui.reduced?0:Math.sin(this.s.t*.75)*.16,a=this.a+scan,
      p=this.point(-4,0,27);
    this.parts.part('scout-sensor',...p,1,1,1,a,'#ffffff',this.floor,this.memory);
  }
  drone() {
    this.legs(12,9.5,6,P.field);
    const service=this.memory?null:this.view.workerActivity.get(this.u.id),arrived=service?.arrived,
      mining=!this.memory&&this.u.work==="gather"&&this.pose.move<.05,
      working=arrived||mining,a=arrived?Math.atan2(service.contact.y-this.u.y,service.contact.x-this.u.x):this.a;
    this.prefab('drone-chassis',0,0,0,a);
    for(let i=0;i<Math.min(4,this.u.cargo||0);i++)this.box(-3.5+i%2*4,-2.2+Math.floor(i/2)*4.4,3,3.2,13,2.5,P.copper,a);
    this.light(9.8,0,.7,4,9,1.5,a);
    const reach=arrived?Math.max(15,this.E.dist(this.u,service.contact)):working?23:19,
      z=arrived?9+(service.active&&!this.ui.reduced?Math.sin(this.s.t*4.5+this.u.id)*2:0):7;
    for(const side of [-1,1]) {
      const elbow=[working?Math.min(22,reach*.6):13.5,side*(working?4:7),working?13:8],
        tip=[working?reach:18,side*(arrived?1.2:working?3:6),working?z:6];
      this.beam([7,side*5,8],elbow,3.5,P.shell,a);this.beam(elbow,tip,2.7,P.field,a);
      this.joint(...elbow,2.1,P.dark,a);this.joint(...tip,1.7,P.dark,a);
      for(const finger of [-1,1])this.beam(tip,[tip[0]+3,tip[1]+finger*(working?.8:1.4),tip[2]],1.4,P.dark,a);
    }
    if(working) {
      this.light(reach,0,2.5,2.5,z,1,a,service?.waiting?P.copper:this.accent);
      if(arrived&&service.active&&!this.ui.reduced)for(let i=0;i<4;i++) {
        const phase=(this.s.t*3+this.u.id*.1+i*.23)%1;
        this.beam([reach,0,z],[reach+Math.cos(i*2.4)*phase*8,Math.sin(i*2.4)*phase*6,z+Math.sin(phase*Math.PI)*6],.5,i%2?P.shell:P.copper,a,true);
      }
    }
  }
  tracks(length=39,spread=14,material=P.shell) {
    for(const side of [-1,1]) {
      if(this.u.kind==='artillery')this.prefab('allied-track',0,side*spread,0,this.a,length/39,1,1);
      else {this.box(0,side*spread,length,9,1,6,P.dark);this.box(-1,side*spread,length-7,7,7,3,material);}
      const distance=(side<0?this.pose.left:this.pose.right)||0,pitch=(length-10)/5,shift=((distance%pitch)+pitch)%pitch;
      for(let i=0;i<5;i++)this.box(-length/2+4+i*pitch+shift,side*spread,1.3,7,10.1,.7,P.dark);
    }
  }
  gun(a,z,front=40,width=5,back=2,material=P.shell) {
    const r=this.recoil;
    this.box((front+back)/2-r,0,front-back,width,z-width/2,width,P.dark,a);
    this.box(back+6-r,0,13,width+5,z-3,7,material,a);
    this.box(front-2.5-r,0,5,width+3,z-4,8,material,a);this.flash(front-r,0,z,a,1);
  }
  artillery() {
    this.tracks();this.prefab('artillery-chassis');this.prefab('artillery-turret',-this.recoil*.25,0,0,this.aim);
    this.gun(this.aim,this.E.MOUNTS.artillery);
  }
  rocket() {
    const a=this.aim,brace=this.progress;
    for(const side of [-1,1]) {
      const st=this.step(side<0?0:.5,.72,1.8),x=st.x*(brace?0:1)+side*brace*2.3,y=side*(6.5+brace),lift=this.foot(x,y,11.5,6,st.lift,P.enemy),knee=[2+st.x*.25,side*6,7.5];
      this.beam([-2,side*4.5,13],knee,4.4,P.enemy);this.beam(knee,[x,y,lift+2.5],3.5,P.enemy);this.joint(...knee,1.6,P.dark);
    }
    this.prefab('rocket-armour',0,0,0,a);
    for(const side of [-1,1])this.beam([0,side*7,21],[10,side<0?-7:-4,21],3.5,P.enemy,a);
    this.prefab('rocket-launcher',-this.recoil*.3,0,0,a);
    this.light(-7,2,1,5,25,1,a);this.flash(26-this.recoil*.3,-6.5,24,a,.7);
  }
  tank() {
    const mortar=this.u.kind==="mortar",a=this.aim;
    this.tracks(mortar?35:45,mortar?13:16,P.enemy);
    this.box(0,0,mortar?32:41,mortar?25:29,6,8,P.enemy);
    this.box(-3,0,mortar?19:25,mortar?18:22,14,mortar?12:11,P.dark,a);
    this.box(-3,0,mortar?16:22,mortar?15:19,24,3,P.enemy,a);
    this.gun(a,this.E.MOUNTS[this.u.kind],mortar?28:36,mortar?7:5,-4,P.enemy);
    this.light(3,0,1,6,25,1,a);
  }
  specialist() {
    const bomber=this.u.kind==="bomber",a=this.aim;
    this.legs(bomber?8:10,bomber?6:8,bomber?9:13,P.enemy);
    this.box(0,0,bomber?21:25,bomber?19:24,8,bomber?9:13,P.enemy,a);
    if(bomber){this.disc(0,0,8,17,5,P.dark,a);this.light(0,0,8,8,22,1,a,this.progress?P.amber:P.copper);}
    else {for(const side of [-1,1])this.disc(-5,side*7,4,13,14,P.dark,a);this.gun(a,18,23,7,3,P.copper);}
  }
  building() {
    const u=this.u,E=this.E,shape=u.construction?E.construction.shape(u):null,
      w=shape?shape[0]*40:E.C[u.kind].r*1.8,h=shape?shape[1]*40:E.C[u.kind].r*1.6,
      total=this.s.campaign?E.development.items(this.s)[u.kind]?.time||6:6,
      progress=u.build>0?clamp(1-u.build/total):1,layer=clamp((progress-.12)/.68),roof=clamp((progress-.48)/.4),
      gate=this.memory?0:this.view.doorOpening(u,this.s),delivery=this.memory?0:this.view.deliveryOpening(u,this.s),
      a=this.a,wx=w/128,dy=h/128;
    this.box(0,0,w-8,h-8,0,3,P.dark);
    if(progress>.12)this.prefab(u.kind+'-body',0,0,0,a,wx,dy,Math.max(.01,layer));
    if(roof){
      const lift=11*(1-roof);
      if(u.kind==='foundry')for(const side of [-1,1])this.prefab('foundry-roof-'+(side<0?'left':'right'),side*gate*9*wx,0,lift,a,wx,dy,1);
      else this.prefab(u.kind+'-roof',0,0,lift,a,wx,dy,1);
    }
    if(layer>0&&['base','outpost','barracks','foundry','bunker'].includes(u.kind)){
      const outpost=u.kind==='outpost',barracks=u.kind==='barracks',bunker=u.kind==='bunker',
        x=outpost?-w*.13:barracks?-w*.0625:0,y=h*(outpost?.315:barracks?.335:bunker?.4:u.kind==='base'?.47:.37),
        ww=w*(outpost?.43:barracks?.48:bunker?.25:u.kind==='base'?.34:.5),opening=Math.max(gate,delivery*.75),height=(bunker?18:23)*layer,
        bottom=4+height*opening;
      this.box(x,y,ww,2.5,bottom,height*(1-opening),P.steel,a);
      for(let i=0;i<4;i++){
        const z=5+i*5;
        if(z>bottom&&z<4+height)this.box(x,y+.4,ww*.93,1,z,1,P.dark,a);
      }
      if(!this.memory&&u.jobs?.length)this.light(x,y+1.8,ww*.5,1,7+height,1,a);
    }
    if(roof&&u.kind==='bunker'){
      const crew=(this.view.garrisonActivity.get(u.id)||[]).filter(v=>v.care.inside);
      for(let i=0;i<4;i++)this.light((i%2?1:-1)*w*.21,(i<2?-1:1)*h*.18,5*wx,2*dy,34.9+11*(1-roof),.5,a,crew[i]?this.accent:P.dark);
    }
    if(roof&&u.kind==='outpost'){
      if(delivery)this.box(-w*.2,h*.36-delivery*h*.14,7,7,5,4,P.copper,a);
      if(this.view.infirmaryActivity.get(u.id)?.some(v=>v.care.inside)){
        this.light(-w*.13,h*.08,8,2,36.4);this.light(-w*.13,h*.08,2,8,36.4);
      }
    }
    if(progress<1){
      for(const side of [-1,1])for(const front of [-1,1])this.beam([side*(w*.5-8),front*(h*.5-9),3],[side*(w*.5-8),front*(h*.5-9),46],2,P.steel);
      for(const side of [-1,1])this.beam([-w*.5+8,side*(h*.5-9),46],[w*.5-8,side*(h*.5-9),46],2,P.steel);
      const work=this.view.buildingActivity.get(u.id)?.some(v=>v.active),slide=work&&!this.ui.reduced?Math.sin(this.s.t*1.5)*w*.25:0;
      this.box(slide,0,14,10,46,4,P.copper);this.beam([slide,0,46],[slide,0,5+25*layer],1,P.dark);
    }
    if(u.defense&&progress===1){const mount=E.MOUNTS[u.kind]||51;this.box(0,0,16,14,mount-6,6,P.dark,this.aim);this.gun(this.aim,mount,32,4,1,P.field);}
  }
  fortification() {
    const kind=this.u.kind,a=this.aim,r=this.E.C[kind].r;
    if(kind==='citadel'){
      const shielded=this.s.fog?this.u.shielded:this.E.shielded(this.s);
      this.prefab('citadel-base',0,0,0,0);
      for(let i=0;i<3;i++)this.prefab('citadel-pylon',22,0,28,Math.PI/2+i*Math.PI*2/3,1,1,shielded?1:.5);
      this.prefab('defense-head',-this.recoil,0,this.E.MOUNTS.citadel,a,1.1,1.1,1);this.flash(37-this.recoil,5.5,this.E.MOUNTS.citadel,a,1.3);return;
    }
    if(['turret','jammer','bastion'].includes(kind)){
      const south=kind==='bastion'&&(this.u.sector==='south'||(!this.u.sector&&this.u.y>this.E.map(this.s).H*.6));
      this.prefab(kind==='jammer'?'jammer-mast':kind==='bastion'?(south?'bastion-south-base':'bastion-base'):'turret-base',0,0,0,0);
      if(kind!=='jammer'){
        const mount=this.E.MOUNTS[kind]||24;this.prefab('defense-head',-this.recoil,0,mount,a,kind==='turret'?.75:1,kind==='turret'?.8:1,1);
        this.flash((kind==='turret'?25.5:34)-this.recoil,5.5,mount,a,1);
      }
      return;
    }
    if(kind==="jammer") {
      this.box(0,0,40,35,0,12,P.dark);this.box(0,0,25,25,12,24,P.enemy);
      for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;this.box(25,0,27,12,0,8,P.steel,angle);this.beam([18,0,7],[22,0,52],2,P.dark,angle);this.light(22,0,6,12,50,2,angle);}
    } else {
      const z=this.E.MOUNTS[kind]||24;this.box(0,0,r*1.75,r*1.4,0,10,P.dark);
      this.box(0,0,r*1.3,r*1.1,10,z-12,P.enemy);this.box(0,0,r*1.15,r*.95,z-2,7,P.steel,a);
      this.gun(a,z,kind==="citadel"?45:kind==="bastion"?43:32,kind==="turret"?4:7,0,P.enemy);
      if(kind==="citadel")for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;this.box(30,0,24,18,0,22,P.dark,angle);this.light(22,0,5,15,z,2,angle);}
    }
  }
  wreck() {
    const r=this.E.C[this.u.kind].r,shape=this.u.construction?this.E.construction.shape(this.u):null,
      w=shape?shape[0]*40:r*1.8,h=shape?shape[1]*40:r*1.4;
    this.box(0,0,w,h,0,3,P.dark);
    if(shape||!this.E.C[this.u.kind].speed) {
      for(let i=0;i<3;i++)this.box((i-1)*w*.23,(i%2-.5)*h*.3,w*.31,h*.42,3,5+i*3,P.steel,this.a+i*.13);
    } else if(["artillery","tank","mortar"].includes(this.u.kind)) {
      this.tracks(this.u.kind==="tank"?45:39,14,P.steel);this.box(-3,0,23,19,5,5,P.steel,this.a+.15);this.beam([0,0,9],[32,6,4],5,P.dark);
    } else {
      this.box(-1,0,r*1.4,r*1.2,3,4,P.steel);for(const side of [-1,1])this.beam([-3,side*3,2],[-r,side*7,1],3,P.dark);
      if(this.u.kind==="scout"){this.beam([-4,0,4],[7,5,3],2.5,P.dark);this.box(7,5,14,8,2,3,P.steel,this.a+.2);}
      else if(!["drone","runner","bomber"].includes(this.u.kind))this.beam([3,6,3],[this.u.kind==="rocket"?28:24,8,2],this.u.kind==="rocket"?7:3,P.dark);
    }
  }
  flash(x,y,z,a,size) {
    if(this.u.flash>0&&!this.memory&&!this.ui.reduced){const k=(.4+this.u.flash*6)*size;this.beam([x,y,z],[x+10*k,y,z],3*k,this.accent,a,true);}
  }
  draw(u,s,ui,memory=false) {
    this.begin(u,s,ui,memory);
    if(u.hp<=0){this.wreck();return;}
    if(u.kind==="hero"||u.kind==="rifle")this.infantry();
    else if(u.kind==="sentinel"||u.kind==="warden")this.robot();
    else if(u.kind==="runner")this.runner();else if(u.kind==="scout")this.scout();else if(u.kind==="drone")this.drone();
    else if(u.kind==="artillery")this.artillery();else if(u.kind==="rocket")this.rocket();
    else if(u.kind==="tank"||u.kind==="mortar")this.tank();else if(u.kind==="flamer"||u.kind==="bomber")this.specialist();
    else if(["base","outpost","barracks","foundry","arsenal","bunker","logistics"].includes(u.kind))this.building();else this.fortification();
  }
  scenery(s,ui) {
    const base=(p)=>{this.parts.opacity=1;this.u=p;this.floor=this.E.elevation(p.x,p.y,this.view.mapId);this.a=0;this.ui=ui;this.memory=false;this.accent=P.mint;};
    for(const mine of s.campaign?.mines||[]) {
      if(mine.unknown||!this.view.inView(mine.x,mine.y,130))continue;base(mine);
      const n=mine.remaining>0?5:2;
      for(let i=0;i<n;i++){const a=i*2.4;this.shape("rock",Math.cos(a)*19,Math.sin(a)*17,21,17,0,16+(i%3)*6,i%2?P.steel:P.field,a);}
    }
    for(const cache of s.caches||[])if(!cache.unknown&&!cache.taken&&this.view.inView(cache.x,cache.y)){base(cache);this.box(0,0,20,15,0,8,P.copper);this.light(0,0,3,9,8);}
    for(const item of [s.relay,...(s.terminals||[s.terminal]),...(s.watch||[])]) {
      if(!item||item.unknown||!this.view.inView(item.x,item.y))continue;base(item);
      this.box(0,0,32,26,0,5,P.dark);this.disc(0,0,12,5,15,P.steel);
      this.box(0,0,12,12,20,12,P.dark);this.light(0,0,8,8,32,2,0,item.online||item.side===0?P.mint:P.copper);
      for(const side of [-1,1])this.beam([side*17,0,3],[side*12,0,20],3,P.field);
    }
  }
}

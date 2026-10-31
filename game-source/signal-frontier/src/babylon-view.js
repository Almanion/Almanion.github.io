import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Matrix, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Parts } from "./babylon/batches.js";
import { Models } from "./babylon/models.js";
import { materials } from "./babylon/materials.js";
import { buildTerrain } from "./babylon/terrain.js";

const E=globalThis.SignalEngine,Legacy=globalThis.SignalView,Y=.73;
export class BabylonView extends Legacy {
  constructor(canvas) {
    super(canvas,{alpha:true,cacheFloor:false});this.rendererId="babylon";
    this.gpuCanvas=document.createElement("canvas");this.gpuCanvas.id="world3d";
    this.gpuCanvas.setAttribute("aria-hidden","true");
    Object.assign(this.gpuCanvas.style,{position:"fixed",inset:"0",width:"100%",height:"100%",pointerEvents:"none"});
    canvas.before(this.gpuCanvas);
    try {
      this.engine=new Engine(this.gpuCanvas,true,{preserveDrawingBuffer:false,stencil:true,alpha:false,powerPreference:"high-performance"},false);
      this.engine.setHardwareScalingLevel(1/this.dpr);this.engine.setSize(this.canvas.width,this.canvas.height);
      if(this.engine.webGLVersion<2)throw Error("Для 3D-режима нужен WebGL 2");
      this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(.025,.055,.075,1);
      for(let group=0;group<4;group++)this.scene.setRenderingAutoClearDepthStencil(group,false);
      this.camera3d=new FreeCamera("shared-camera",new Vector3(0,10000,-10000),this.scene);
      this.camera3d.mode=Camera.ORTHOGRAPHIC_CAMERA;this.camera3d.minZ=1;this.camera3d.maxZ=40000;
      this.scene.activeCamera=this.camera3d;
      this.materials=materials(this.scene);this.parts=new Parts(this.scene,this.materials.main,this.materials.shadow);
      this.models=new Models(this.parts,E,this);this.gpuMap=null;this.timings={};this.fogUploads=0;
      this.lost=false;this.drawnUnits=0;
      this.gpuCanvas.addEventListener("webglcontextlost",()=>{this.lost=true;window.dispatchEvent(new Event("signal-renderer-lost"));});
      this.gpuCanvas.addEventListener("webglcontextrestored",()=>{this.lost=false;this.maskKey=null;window.dispatchEvent(new Event("signal-renderer-restored"));});
      document.body.dataset.renderer="babylon";
    } catch(error){this.engine?.dispose();this.gpuCanvas.remove();throw error;}
  }
  makeGround(){return {faces:[]};}
  resize(){super.resize();if(this.engine){this.engine.setHardwareScalingLevel(1/this.dpr);this.engine.setSize(this.canvas.width,this.canvas.height);}}
  reset(s){super.reset(s);this.maskKey=null;this.fogPaths={};}
  fogPath(fog,kind) {
    const sources=fog.observers.map(u=>[u.id,u.x,u.y,u.radius].join(":")),
      code=this.mapId+":"+fog[kind+"Code"]+(kind==="visible"?":"+sources.join(","):""),old=this.fogPaths[kind];
    if(old?.code===code)return old.path;
    let polygons;
    if(kind==="explored")polygons=Legacy.fogContours(fog);
    else {
      const previous=this.sightPaths||new Map();this.sightPaths=new Map();
      polygons=fog.observers.map((u,i)=>{
        const key=this.mapId+":"+sources[i],polygon=previous.get(key)?.polygon||E.visionArea(this.mapId,u,u.radius).points.map(p=>[p.x,p.y]);
        this.sightPaths.set(key,{polygon});return polygon;
      });
    }
    this.fogPaths[kind]={code,polygons,path:null};return null;
  }
  fogClip(c,fog,kind) {
    this.fogPath(fog,kind);const region=this.fogPaths[kind];
    region.path ||= this.projectFog(region.polygons);c.clip(region.path);
  }
  map(world) {
    if(this.gpuMap?.id===world.id)return;
    this.gpuMap?.terrain.dispose();this.mask?.dispose();
    const terrain=buildTerrain(this.scene,this.materials.main,E,world),
      max=Math.min(2048,this.engine.getCaps().maxTextureSize),scale=max/Math.max(world.W,world.H),
      width=Math.ceil(world.W*scale),height=Math.ceil(world.H*scale);
    this.mask=new DynamicTexture("world-visibility",{width,height},this.scene,false,Texture.BILINEAR_SAMPLINGMODE);
    this.mask.wrapU=this.mask.wrapV=Texture.CLAMP_ADDRESSMODE;this.mask.hasAlpha=false;
    this.maskContext=this.mask.getContext();this.maskKey=null;
    for(const m of Object.values(this.materials)){m.setVector2("mapSize",new Vector2(world.W,world.H));m.setTexture("fogMask",this.mask);}
    this.materials.shadow.setTexture("heightMap",terrain.heightTexture);
    this.gpuMap={id:world.id,world,terrain,width,height};
  }
  visibility(s) {
    const fog=s.fog,enabled=!!fog;
    this.materials.main.setFloat("fogEnabled",enabled?1:0);this.materials.shadow.setFloat("fogEnabled",enabled?1:0);
    if(fog){this.fogPath(fog,"visible");this.fogPath(fog,"explored");}
    const key=enabled?this.fogPaths.visible.code+"|"+this.fogPaths.explored.code:"clear";
    if(key===this.maskKey)return;
    const c=this.maskContext,{width,height,world}=this.gpuMap;
    c.setTransform(1,0,0,1,0,0);c.fillStyle=enabled?"#000":"#ffff00";c.fillRect(0,0,width,height);
    if(fog) {
      c.scale(width/world.W,height/world.H);
      for(const kind of ["explored","visible"]) {
        c.beginPath();for(const polygon of this.fogPaths[kind].polygons){polygon.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
        c.fillStyle=kind==="visible"?"#ffff00":"#ff0000";c.fill("nonzero");
      }
    }
    this.mask.update(false);this.maskKey=key;this.fogUploads++;
  }
  syncCamera() {
    const cam=this.camera,scale=cam.scale,
      x=cam.x+(this.width*.5-this.origin.x)/scale,
      y=cam.y+(this.height*.5-this.origin.y)/(scale*Y),
      top=this.height*Math.SQRT1_2/(2*scale*Y);
    this.camera3d.position.set(x,10000,-y-10000);this.camera3d.setTarget(new Vector3(x,0,-y));
    this.camera3d.orthoLeft=-this.width/(2*scale);this.camera3d.orthoRight=this.width/(2*scale);
    this.camera3d.orthoTop=top;this.camera3d.orthoBottom=-top;
  }
  project(x,y,height=0) {
    const p=Vector3.Project(new Vector3(x,this.z(x,y)+height,-y),Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),this.camera3d.viewport.toGlobal(this.width,this.height));
    return {x:p.x,y:p.y};
  }
  render(s,ui,dt) {
    if(this.lost)return;
    let time=performance.now();const frame=this.prepareFrame(s,ui,dt);s=frame.s;
    this.timings.prepare=performance.now()-time;time=performance.now();
    this.map(frame.world);this.visibility(s);this.syncCamera();
    this.timings.fog=performance.now()-time;time=performance.now();this.parts.begin();this.drawnUnits=0;
    this.models.scenery(s,ui);
    const current=new Set(s.units.map(u=>u.id));
    for(const u of s.fog?.memory?.units||[])if(!current.has(u.id)&&!E.C[u.kind].speed&&this.inView(u.x,u.y,250))this.models.draw(u,s,{...ui,memory:true},true);
    for(const u of s.units) {
      if(u.care?.inside||!this.inView(u.x,u.y,250)||!this.wreckOpacity(u,s))continue;
      this.models.draw(u,s,ui);this.drawnUnits++;
    }
    this.parts.opacity=1;
    for(const b of s.bullets) {
      const z=E.projectileHeight(b)??this.z(b.x,b.y)+16,speed=Math.hypot(b.vx,b.vy)||1,
        length=b.kind==="shell"?10:b.kind==="missile"?15:11;
      this.parts.beam(b.x-b.vx/speed*length,b.y-b.vy/speed*length,z,b.x,b.y,z,b.kind==="missile"?2:1.2,b.team?"#efae8c":"#d5f4df",-10000,false,true);
    }
    this.parts.commit();this.timings.models=performance.now()-time;time=performance.now();
    const beforeCalls=this.engine._drawCalls?.current||0;
    this.engine.beginFrame();this.scene.render();this.engine.endFrame();this.timings.submit=performance.now()-time;
    this.lastDrawCalls=(this.engine._drawCalls?.current||0)-beforeCalls;
    this.overlay(s,ui,dt,frame);this.memoryNeedsRefine=!this.scene.isReady();
  }
  overlay(s,ui,dt,frame) {
    const c=this.c,cam=this.camera;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.canvas.width,this.canvas.height);
    if(ui.modelPreview)return;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.save();c.translate(this.origin.x,this.origin.y);c.scale(cam.scale,cam.scale*Y);c.translate(-cam.x,-cam.y);
    for(const u of s.units) {
      if(u.care?.inside||u.hp<=0)continue;
      const selected=!u.team&&(ui.selectionIds!=null?ui.selectionIds.includes(u.id):ui.mode==="tactical"&&u.group===ui.group);
      if(selected) {
        this.groundRing(c,u.x,u.y,E.C[u.kind].r+10,"#c8edda",2);
        if(ui.mode==="tactical"&&u.path?.length){c.setLineDash([5,7]);this.groundLine(c,[[u.x,u.y],...u.path.map(p=>[p.x,p.y])],"#b6e6d17a",2);c.setLineDash([]);const p=u.path.at(-1);this.groundRing(c,p.x,p.y,12,"#c8edda",2);}
        if(ui.mode==="tactical"&&u.rally){c.setLineDash([5,8]);this.groundLine(c,[[u.x,u.y],[u.rally.x,u.rally.y]],"#b2d6bf65",1);c.setLineDash([]);this.groundRing(c,u.rally.x,u.rally.y,14,"#b2d6bf",1.5);}
        if(ui.mode==="tactical"&&u.construction){const b=E.construction.rect(u);this.groundLine(c,[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h],[b.x,b.y]],"#c8edda",2);}
      }
      const area=E.dangerArea(s,u);if(area)this.danger(c,area,u.combat.time/Math.max(.01,u.combat.total),ui.reduced,s.t);
      if(u.wind>0&&u.target&&!["runner","flamer","bomber","mortar"].includes(u.kind)&&!(u.kind==="bastion"&&area)){
        c.save();c.globalAlpha=.3+.4*(u.combat?1-u.combat.time/u.combat.total:Math.max(0,.65-u.wind));
        const a=this.p(u.x,u.y,E.MOUNTS[u.kind]||19),b=this.p(u.target.x,u.target.y);
        c.beginPath();c.moveTo(...a);c.lineTo(...b);c.strokeStyle="#f4ae89";c.lineWidth=1.4;c.stroke();
        this.groundRing(c,u.target.x,u.target.y,u.kind==="rocket"?20:13,"#f4ae89",u.kind==="rocket"?2:1);c.restore();
      }
      if(u.kind==="citadel"&&(s.fog?u.shielded:E.shielded(s)))this.groundRing(c,u.x,u.y,E.C.citadel.r+12,"#efae8c88",2);
      if(u.hp<E.C[u.kind].hp||ui.mode==="tactical") {
        const r=E.C[u.kind].r,y=u.y-this.z(u.x,u.y)+r+11;
        c.fillStyle="#102832";c.fillRect(u.x-r,y,r*2,3);c.fillStyle=u.team?"#d29c83":"#9cd8c7";c.fillRect(u.x-r,y,r*2*Math.max(0,u.hp)/E.C[u.kind].hp,3);
      }
    }
    this.statusOverlay(c,s,ui);
    if(ui.placement)this.placementOverlay(c,s,ui.placement);
    const task=s.observationTask||E.objective(s);
    if(task.target&&!task.target.unknown)this.groundRing(c,task.target.x,task.target.y,task.radius,"#d5dab078",1.4);
    // Existing feedback and construction effects retain their observed events,
    // seeded animation and tactical-pause clock while migrating independently.
    this.effects(c,dt,ui,frame.active);c.restore();this.productionBars(s,ui);
  }
  statusOverlay(c,s,ui) {
    if(ui.mode==="tactical")for(const mine of s.campaign?.mines||[]) {
      if(mine.unknown||!this.inView(mine.x,mine.y,130))continue;
      c.font="10px Segoe UI";c.textAlign="center";c.fillStyle="#b1c8b8";
      const crew=E.development.logistics(s)?E.development.mineWorkers(s,mine).length:null;
      c.fillText(String(mine.remaining)+(crew===null?"":" · "+Math.min(6,crew)+"/6"),mine.x,mine.y-this.z(mine.x,mine.y)+54);
    }
    for(const camp of s.campaign?.camps||[]) {
      const source=s.units.find(u=>u.id===camp.source&&u.hp>0);if(!source)continue;
      if(camp.warning>0)this.groundRing(c,source.x,source.y,65+(ui.reduced?0:Math.sin(s.t*5)*4),"#e4a57a99",2);
    }
    const progress=(item,value,r=39)=>{
      if(!item||item.unknown||!value||!this.inView(item.x,item.y))return;
      c.save();c.translate(item.x,item.y-this.z(item.x,item.y));c.beginPath();c.arc(0,0,r,-Math.PI/2,-Math.PI/2+Math.min(1,value)*Math.PI*2);c.strokeStyle="#b6f0d7";c.lineWidth=2;c.stroke();c.restore();
    };
    progress(s.relay,s.relay.charge? s.relay.progress??s.relay.charge:0,51);
    for(const cache of s.caches||[])if(!cache.taken)progress(cache,cache.charge,22);
    for(const terminal of s.terminals||[s.terminal])progress(terminal,terminal?.channeling?terminal.charge:terminal?.window/7,36);
  }
  diagnostics() {
    return {renderer:"babylon",backend:"WebGL "+this.engine.webGLVersion,version:Engine.Version,
      units:this.drawnUnits,...this.parts.diagnostics(),drawCalls:this.lastDrawCalls||0,
      terrainTriangles:this.gpuMap?.terrain.triangles||0,fogUploads:this.fogUploads,timings:{...this.timings},lost:this.lost};
  }
  dispose(){this.gpuMap?.terrain.dispose();this.mask?.dispose();this.parts?.dispose();this.scene?.dispose();this.engine?.dispose();this.gpuCanvas?.remove();}
}

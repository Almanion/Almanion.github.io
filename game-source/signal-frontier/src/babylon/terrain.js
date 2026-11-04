import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";

export function buildTerrain(scene,material,E,world,onArtChange=()=>{}) {
  const positions=[],normals=[],colors=[],indices=[],uvs=[],uvs2=[],
    high=["districts","highlands","districts-east"].includes(world.id),
    height=(x,y)=>E.elevation(x,y,world.id),
    valid=(x,y)=>x>=0&&y>=0&&x<world.W&&y<world.H&&(!high||E.terrainFor(world).level(x,y)>=0),
    quad=(points,color,surface=2)=>{
      const start=positions.length/3,a=points[0],b=points[1],d=points[2],
        ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2],
        nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;
      const cliffAlongX=Math.abs(b[0]-a[0])+Math.abs(d[0]-a[0])>Math.abs(b[2]-a[2])+Math.abs(d[2]-a[2]);
      for(const p of points){positions.push(...p);normals.push(nx/l,ny/l,nz/l);colors.push(...color,1);
        uvs.push(...(surface===1?[(cliffAlongX?p[0]:-p[2])/256,-p[1]/256]:[p[0]/world.W,-p[2]/world.H]));uvs2.push(surface,0);}
      indices.push(start,start+1,start+2,start,start+2,start+3);
    },
    surface=(x,y,lift=0)=>[x,height(x,y)+lift,-y];
  for(let y=0;y<world.H;y+=40)for(let x=0;x<world.W;x+=40) {
    if(!valid(x+20,y+20))continue;
    const z=height(x+20,y+20),level=Math.max(0,Math.min(2,Math.floor(z/72))),
      base=(world.id==="districts-east"&&x>=3600?[[.20,.27,.32],[.36,.44,.49],[.48,.57,.62]]:[[.18,.27,.29],[.25,.34,.33],[.35,.43,.39]])[level],
      tone=.015*Math.sin(x*.006)+.012*Math.cos(y*.008),color=base.map(v=>v+tone),
      // Sample height inside its own cell, but weld XY edges exactly. Insets
      // previously left dark hairline cracks on a flat floor at close range.
      p=[[x,y],[x+40,y],[x+40,y+40],[x,y+40]].map(([xx,yy])=>[xx,height(Math.max(x+.01,Math.min(x+39.99,xx)),Math.max(y+.01,Math.min(y+39.99,yy))),-yy]);
    quad(p,color,0);
    for(let side=0;side<4;side++) {
      const a=p[side],b=p[(side+1)%4],
        outside=[[x+20,y-.01],[x+40.01,y+20],[x+20,y+40.01],[x-.01,y+20]][side],
        low=valid(...outside)?height(...outside):-36;
      if((a[1]+b[1])*.5>low+4){
        quad([a,[a[0],low,a[2]],[b[0],low,b[2]],b],[.115,.18,.20],1);
        // A pale cap and darker structural fascia make the height readable
        // without new objects, lights or draw calls. They are not obstacles.
        const [ix,iz]=[[0,-1],[-1,0],[0,1],[1,0]][side],
          inset=(p,n)=>[p[0]+ix*n,p[1]+.6,p[2]+iz*n],
          down=p=>[p[0],Math.max(low,p[1]-6),p[2]];
        quad([a,down(a),down(b),b],[.30,.40,.46]);
        quad([inset(a,0),inset(b,0),inset(b,6),inset(a,6)],[.19,.27,.32]);
        quad([inset(a,1),inset(b,1),inset(b,3),inset(a,3)],[.61,.72,.78]);
      }
    }
  }
  for(const road of world.roads||[])for(let i=1;i<road.length;i++) {
    const a=road[i-1],b=road[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),
      steps=Math.max(1,Math.ceil(length/20)),px=-dy/length*8,py=dx/length*8;
    for(let j=0;j<steps;j++) {
      const x=a[0]+dx*j/steps,y=a[1]+dy*j/steps,xx=a[0]+dx*(j+1)/steps,yy=a[1]+dy*(j+1)/steps;
      if(!valid((x+xx)/2,(y+yy)/2))continue;
      quad([surface(x-px,y-py,.4),surface(xx-px,yy-py,.4),surface(xx+px,yy+py,.4),surface(x+px,y+py,.4)],[.30,.39,.37],3);
    }
  }
  let accentLayer=0;
  for(const mark of globalThis.SignalView.heightAccents(world)){
    const rgb=mark.color.slice(1).match(/../g).map(n=>parseInt(n,16)/255),lift=.85+(accentLayer++%2)*.12;
    for(let i=1;i<mark.points.length;i++){
      const a=mark.points[i-1],b=mark.points[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),
        px=-dy/len*mark.width/2,py=dx/len*mark.width/2,steps=Math.ceil(len/20);
      for(let j=0;j<steps;j++){
        const x=a[0]+dx*j/steps,y=a[1]+dy*j/steps,xx=a[0]+dx*(j+1)/steps,yy=a[1]+dy*(j+1)/steps;
        quad([surface(x-px,y-py,lift),surface(xx-px,yy-py,lift),surface(xx+px,yy+py,lift),surface(x+px,y+py,lift)],rgb);
      }
    }
  }
  const box=(x,y,w,h,bottom,top)=>{
    const a=[x,bottom,-y],b=[x+w,bottom,-y],c=[x+w,bottom,-y-h],d=[x,bottom,-y-h],
      aa=[x,top,-y],bb=[x+w,top,-y],cc=[x+w,top,-y-h],dd=[x,top,-y-h];
    quad([aa,bb,cc,dd],[.40,.50,.47]);
    for(const q of [[a,b,bb,aa],[b,c,cc,bb],[c,d,dd,cc],[d,a,aa,dd]])quad(q,[.18,.28,.29]);
  };
  for(const wall of world.walls) {
    if(wall.gate||wall.mission)continue;
    const z=height(wall.x+wall.w/2,wall.y+wall.h/2);
    box(wall.x,wall.y,wall.w,wall.h,z,z+48);
    box(wall.x+3,wall.y+3,Math.max(2,wall.w-6),Math.max(2,wall.h-6),z+48,z+54);
  }
  const data=new VertexData();data.positions=positions;data.normals=normals;data.colors=colors;data.indices=indices;data.uvs=uvs;data.uvs2=uvs2;
  const mesh=new Mesh("terrain-"+world.id,scene);data.applyToMesh(mesh);mesh.material=material;
  mesh.isPickable=false;mesh.freezeWorldMatrix();mesh.renderingGroupId=0;
  const cols=Math.ceil(world.W/10),rows=Math.ceil(world.H/10),pixels=new Uint8Array(cols*rows*4);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
    const index=(y*cols+x)*4,xx=(x+.5)*world.W/cols,yy=(y+.5)*world.H/rows;
    pixels[index]=Math.max(0,Math.min(255,Math.round(height(xx,yy))));pixels[index+1]=valid(xx,yy)?255:0;pixels[index+3]=255;
  }
  const heightTexture=RawTexture.CreateRGBATexture(pixels,cols,rows,scene,false,false,Texture.NEAREST_SAMPLINGMODE);
  heightTexture.wrapU=heightTexture.wrapV=Texture.CLAMP_ADDRESSMODE;
  let disposed=false;const textures=[],art={ground:"loading",cliff:"loading"};
  for(const [key,sampler,id]of [["ground","groundMap",world.id],["cliff","cliffMap","cliff"]]){
    // Bind a complete placeholder so missing/slow artwork cannot hide the map.
    material.setFloat(key+"Ready",0);material.setTexture(sampler,heightTexture);
    const url=globalThis.SignalTerrainArt?.url(id);
    if(!url){art[key]="unavailable";continue;}
    const texture=new Texture(url,scene,false,false,Texture.TRILINEAR_SAMPLINGMODE,
      ()=>{if(!disposed){material.setTexture(sampler,texture);material.setFloat(key+"Ready",1);art[key]="ready";onArtChange();}},
      ()=>{if(!disposed){art[key]="unavailable";onArtChange();}});
    texture.wrapU=texture.wrapV=key==="cliff"?Texture.WRAP_ADDRESSMODE:Texture.CLAMP_ADDRESSMODE;
    // The fixed camera is not a grazing ground view. Ordinary mip filtering
    // keeps the same source detail without four anisotropic samples per pixel.
    texture.anisotropicFilteringLevel=1;textures.push(texture);
  }
  return {mesh,heightTexture,triangles:indices.length/3,art,
    dispose(){disposed=true;mesh.dispose();heightTexture.dispose();for(const t of textures)t.dispose();}};
}

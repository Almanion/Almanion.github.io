import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";

export function buildTerrain(scene,material,E,world) {
  const positions=[],normals=[],colors=[],indices=[],
    high=["districts","highlands"].includes(world.id),
    height=(x,y)=>E.elevation(x,y,world.id),
    valid=(x,y)=>x>=0&&y>=0&&x<world.W&&y<world.H&&(!high||E.terrain.level(x,y)>=0),
    quad=(points,color)=>{
      const start=positions.length/3,a=points[0],b=points[1],d=points[2],
        ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2],
        nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;
      for(const p of points){positions.push(...p);normals.push(nx/l,ny/l,nz/l);colors.push(...color,1);}
      indices.push(start,start+1,start+2,start,start+2,start+3);
    },
    surface=(x,y,lift=0)=>[x,height(x,y)+lift,-y];
  for(let y=0;y<world.H;y+=40)for(let x=0;x<world.W;x+=40) {
    if(!valid(x+20,y+20))continue;
    const z=height(x+20,y+20),level=Math.max(0,Math.min(2,Math.floor(z/72))),
      base=[[.18,.27,.29],[.25,.34,.33],[.35,.43,.39]][level],
      tone=.015*Math.sin(x*.006)+.012*Math.cos(y*.008),color=base.map(v=>v+tone),
      // Sample height inside its own cell, but weld XY edges exactly. Insets
      // previously left dark hairline cracks on a flat floor at close range.
      p=[[x,y],[x+40,y],[x+40,y+40],[x,y+40]].map(([xx,yy])=>[xx,height(Math.max(x+.01,Math.min(x+39.99,xx)),Math.max(y+.01,Math.min(y+39.99,yy))),-yy]);
    quad(p,color);
    for(let side=0;side<4;side++) {
      const a=p[side],b=p[(side+1)%4],
        outside=[[x+20,y-.01],[x+40.01,y+20],[x+20,y+40.01],[x-.01,y+20]][side],
        low=valid(...outside)?height(...outside):-36;
      if((a[1]+b[1])*.5>low+4)quad([a,[a[0],low,a[2]],[b[0],low,b[2]],b],[.115,.18,.20]);
    }
  }
  for(const road of world.roads||[])for(let i=1;i<road.length;i++) {
    const a=road[i-1],b=road[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),
      steps=Math.max(1,Math.ceil(length/20)),px=-dy/length*8,py=dx/length*8;
    for(let j=0;j<steps;j++) {
      const x=a[0]+dx*j/steps,y=a[1]+dy*j/steps,xx=a[0]+dx*(j+1)/steps,yy=a[1]+dy*(j+1)/steps;
      if(!valid((x+xx)/2,(y+yy)/2))continue;
      quad([surface(x-px,y-py,.4),surface(xx-px,yy-py,.4),surface(xx+px,yy+py,.4),surface(x+px,y+py,.4)],[.30,.39,.37]);
    }
  }
  const box=(x,y,w,h,bottom,top)=>{
    const a=[x,bottom,-y],b=[x+w,bottom,-y],c=[x+w,bottom,-y-h],d=[x,bottom,-y-h],
      aa=[x,top,-y],bb=[x+w,top,-y],cc=[x+w,top,-y-h],dd=[x,top,-y-h];
    quad([aa,bb,cc,dd],[.40,.50,.47]);
    for(const q of [[a,b,bb,aa],[b,c,cc,bb],[c,d,dd,cc],[d,a,aa,dd]])quad(q,[.18,.28,.29]);
  };
  for(const wall of world.walls) {
    const z=height(wall.x+wall.w/2,wall.y+wall.h/2);
    box(wall.x,wall.y,wall.w,wall.h,z,z+48);
    box(wall.x+3,wall.y+3,Math.max(2,wall.w-6),Math.max(2,wall.h-6),z+48,z+54);
  }
  const data=new VertexData();data.positions=positions;data.normals=normals;data.colors=colors;data.indices=indices;
  const mesh=new Mesh("terrain-"+world.id,scene);data.applyToMesh(mesh);mesh.material=material;
  mesh.isPickable=false;mesh.freezeWorldMatrix();mesh.renderingGroupId=0;
  const cols=Math.ceil(world.W/10),rows=Math.ceil(world.H/10),pixels=new Uint8Array(cols*rows*4);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
    const index=(y*cols+x)*4,xx=(x+.5)*world.W/cols,yy=(y+.5)*world.H/rows;
    pixels[index]=Math.max(0,Math.min(255,Math.round(height(xx,yy))));pixels[index+1]=valid(xx,yy)?255:0;pixels[index+3]=255;
  }
  const heightTexture=RawTexture.CreateRGBATexture(pixels,cols,rows,scene,false,false,Texture.NEAREST_SAMPLINGMODE);
  heightTexture.wrapU=heightTexture.wrapV=Texture.CLAMP_ADDRESSMODE;
  return {mesh,heightTexture,triangles:indices.length/3,dispose(){mesh.dispose();heightTexture.dispose();}};
}

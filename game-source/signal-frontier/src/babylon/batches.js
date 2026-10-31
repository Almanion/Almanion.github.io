import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { prefabData, PREFAB_NAMES } from "./prefabs.js";

// Geometry is constructed once. A formation updates compact instance buffers,
// never a scene node or a new mesh for each boot, tread or armour panel.
function geometry(kind) {
  const positions=[], normals=[], indices=[];
  const face=(points)=>{
    const start=positions.length/3,
      a=points[0],b=points[1],c=points[2],
      ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],
      vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],
      nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,
      length=Math.hypot(nx,ny,nz)||1,
      centre=points.reduce((a,p)=>a.map((v,i)=>v+p[i]),[0,0,0]),
      sign=nx*centre[0]+ny*centre[1]+nz*centre[2]<0?-1:1;
    for(const p of points){positions.push(...p);normals.push(nx/length*sign,ny/length*sign,nz/length*sign);}
    for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);
  };
  if(kind==="sphere") {
    for(let y=0;y<6;y++)for(let x=0;x<12;x++) {
      const p=(u,v)=>[Math.sin(v*Math.PI/6)*Math.cos(u*Math.PI/6)*.5,
        Math.cos(v*Math.PI/6)*.5,Math.sin(v*Math.PI/6)*Math.sin(u*Math.PI/6)*.5];
      face([p(x,y),p(x+1,y),p(x+1,y+1),p(x,y+1)]);
    }
  } else {
    const n=kind==="cylinder"?16:kind==="rock"?7:8,
      outline=kind==="cylinder"||kind==="rock"?Array.from({length:n},(_,i)=>[Math.cos(i*Math.PI*2/n)*.5,Math.sin(i*Math.PI*2/n)*.5]):
        [[-.36,-.5],[.36,-.5],[.5,-.36],[.5,.36],[.36,.5],[-.36,.5],[-.5,.36],[-.5,-.36]],
      ring=(p,y,inset=1)=>[p[0]*inset,y,p[1]*inset],
      bevel=kind==="cylinder"?.44:kind==="rock"?.12:.35;
    face(outline.map(p=>ring(p,-.5)).reverse());
    for(let i=0;i<n;i++) {
      const j=(i+1)%n;
      face([ring(outline[i],-.5),ring(outline[j],-.5),ring(outline[j],bevel),ring(outline[i],bevel)]);
      face([ring(outline[i],bevel),ring(outline[j],bevel),ring(outline[j],.5,.86),ring(outline[i],.5,.86)]);
    }
    face(outline.map(p=>ring(p,.5,.86)));
  }
  const data=new VertexData();data.positions=positions;data.normals=normals;data.indices=indices;data.colors=Array(positions.length/3*4).fill(1);return data;
}
function vertexData(source){const data=new VertexData();Object.assign(data,source);return data;}

class Batch {
  constructor(scene,kind,material,shadowMaterial,assembly=null) {
    this.prefab=!!assembly;
    this.mesh=new Mesh("actors-"+kind,scene);(assembly?vertexData(assembly.solid):geometry(kind)).applyToMesh(this.mesh);
    this.shadow=new Mesh("shadows-"+kind,scene);
    if(assembly)vertexData(assembly.shadow).applyToMesh(this.shadow);else this.mesh.geometry.applyToMesh(this.shadow);
    this.mesh.material=material;this.shadow.material=shadowMaterial;
    for(const [mesh,group]of [[this.mesh,2],[this.shadow,1]]) {
      mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.doNotSyncBoundingInfo=true;
      mesh.renderingGroupId=group;mesh.freezeWorldMatrix();mesh.setEnabled(false);
    }
    this.capacity=0;this.count=0;this.grow(256);
  }
  grow(size) {
    const previous=this.matrices,colors=this.colors,floors=this.floors;
    this.capacity=size;this.matrices=new Float32Array(size*16);this.colors=new Float32Array(size*4);this.floors=new Float32Array(size);
    if(previous){this.matrices.set(previous);this.colors.set(colors);this.floors.set(floors);}
    for(const mesh of [this.mesh,this.shadow]) {
      mesh.thinInstanceSetBuffer("matrix",this.matrices,16,false);
      mesh.thinInstanceSetBuffer("color",this.colors,4,false);
      mesh.thinInstanceSetBuffer("floorHeight",this.floors,1,false);
    }
  }
  put(matrix,color,floor,opacity) {
    if(this.count===this.capacity)this.grow(this.capacity*2);
    this.matrices.set(matrix,this.count*16);this.colors.set(color,this.count*4);this.colors[this.count*4+3]*=opacity;this.floors[this.count]=floor;this.count++;
  }
  commit() {
    for(const mesh of [this.mesh,this.shadow]) {
      mesh.setEnabled(this.count>0);mesh.thinInstanceCount=this.count;
      if(this.count) {
        mesh.thinInstanceBufferUpdated("matrix");mesh.thinInstanceBufferUpdated("color");mesh.thinInstanceBufferUpdated("floorHeight");
      }
    }
  }
  dispose(){this.mesh.dispose();this.shadow.dispose();}
}

export class Parts {
  constructor(scene,material,shadowMaterial) {
    this.scene=scene;this.material=material;this.shadowMaterial=shadowMaterial;
    this.batches=new Map(["box","cylinder","sphere","rock"].map(k=>[k,new Batch(scene,k,material,shadowMaterial)]));
    this.matrix=new Float32Array(16);this.matrix[15]=1;this.colors=new Map();this.opacity=1;
  }
  begin(){for(const batch of this.batches.values())batch.count=0;}
  color(hex,memory=false,emission=false) {
    const key=hex+":"+memory+":"+emission;let color=this.colors.get(key);
    if(!color) {
      let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
      if(memory){const grey=(r+g+b)/3;r=(r*.25+grey*.75)*.65;g=(g*.25+grey*.75)*.65;b=(b*.25+grey*.75)*.65;}
      color=new Float32Array([r,g,b,emission&&!memory?-1:1]);this.colors.set(key,color);
    }
    return color;
  }
  part(kind,x,y,z,w,d,h,a,color,floor,memory=false,emission=false) {
    if(w<=0||d<=0||h<=0)return;
    let batch=this.batches.get(kind);
    if(!batch){batch=new Batch(this.scene,kind,this.material,this.shadowMaterial,prefabData(kind));this.batches.set(kind,batch);}
    const m=this.matrix,co=Math.cos(a),si=Math.sin(a);
    m[0]=co*w;m[1]=0;m[2]=-si*w;m[3]=0;
    m[4]=0;m[5]=h;m[6]=0;m[7]=0;
    m[8]=si*d;m[9]=0;m[10]=co*d;m[11]=0;
    m[12]=x;m[13]=z+(batch.prefab?0:h/2);m[14]=-y;
    batch.put(m,this.color(color,memory,emission),floor,this.opacity);
  }
  beam(x1,y1,z1,x2,y2,z2,width,color,floor,memory=false,emission=false,kind="box") {
    const dx=x2-x1,dy=z2-z1,dz=y1-y2,l=Math.hypot(dx,dy,dz);if(l<.01)return;
    const q=Math.hypot(dx,dz),xx=q>.001?dz/q:1,xz=q>.001?-dx/q:0,
      yx=dx/l,yy=dy/l,yz=dz/l,m=this.matrix;
    m[0]=xx*width;m[1]=0;m[2]=xz*width;m[3]=0;
    m[4]=yx*l;m[5]=yy*l;m[6]=yz*l;m[7]=0;
    m[8]=-xz*yy*width;m[9]=(xz*yx-xx*yz)*width;m[10]=xx*yy*width;m[11]=0;
    m[12]=(x1+x2)/2;m[13]=(z1+z2)/2;m[14]=-(y1+y2)/2;
    this.batches.get(kind).put(m,this.color(color,memory,emission),floor,this.opacity);
  }
  commit(){for(const b of this.batches.values())b.commit();}
  diagnostics(){return {batches:this.batches.size,activeBatches:[...this.batches.values()].filter(b=>b.count>0).length,
    maxBatches:4+PREFAB_NAMES.length,assemblies:this.batches.size-4,parts:[...this.batches.values()].reduce((n,b)=>n+b.count,0),
    triangles:[...this.batches.values()].reduce((n,b)=>n+b.count*(b.mesh.getTotalIndices()+b.shadow.getTotalIndices())/3,0),
    capacity:[...this.batches.values()].reduce((n,b)=>n+b.capacity,0)};}
  dispose(){for(const b of this.batches.values())b.dispose();}
}

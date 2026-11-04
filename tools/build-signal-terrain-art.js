"use strict";
// Offline material compositing. No workshop files or per-pixel blending are
// needed by the game. Rebuild explicitly after changing the selected artwork.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require("playwright");
const E=require("../game-source/signal-frontier/src/engine.js"),D=require("../game-source/signal-frontier/src/districts.js");
const IDS=["T01","T02","T03","T04","T05","T06","T07","T11","T12","T13","T14","D13","D14","D15","D16","D17","D18"];
const OUTPUT=path.resolve(__dirname,"../game-source/signal-frontier/src/assets/terrain");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
async function build(libraryRoot){
 const library=JSON.parse(fs.readFileSync(path.join(libraryRoot,"library.json"))),sources=[],images={};
 for(const id of IDS){
  const item=library.items[id],asset=item?.assets.find(a=>a.id===item.selected&&!a.archived);
  if(!asset)throw Error("No selected image: "+id);
  const bytes=fs.readFileSync(path.join(libraryRoot,asset.file));
  const digest=sha(bytes);
  if(digest!==asset.sha256)throw Error("Original checksum differs: "+id);
  images[id]="data:"+asset.mime+";base64,"+bytes.toString("base64");
  sources.push({id,assetId:asset.id,sha256:digest,originalBytes:bytes.length,width:asset.width,height:asset.height});
 }
 const maps=["classic","frontier","expedition","highlands","districts","districts-east"].map(id=>{
  const world=E.map(id),high=["highlands","districts","districts-east"].includes(id),east=id==="districts-east";
  // The expanded atlas preserves the western map's texels per world unit.
  // One static sample per terrain fragment; no extra meshes or decal draws.
  return {id,W:world.W,H:world.H,width:east?3200:high?2048:1024,height:high?2048:1024,high,east,roads:world.roads||[],
   mines:high?(east?E.east.mines:D.mines):[],links:high?world.links:[]};
 });
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  const result=await page.evaluate(async({images,maps})=>{
   const canvas=(w,h=w)=>{const a=document.createElement("canvas");a.width=w;a.height=h;return a;},loaded={};
   await Promise.all(Object.entries(images).map(async([id,url])=>{const i=new Image();i.src=url;await i.decode();loaded[id]=i;}));
   const size=512,tiles={};
   const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
   // Feather only the boundary strips into their paired opposite edges.
   // The interior retains the uploaded panel shapes: blending whole shifted
   // tiles or a rotated second layer produces ghosted seams on metal.
   for(const id of Object.keys(loaded).filter(id=>id[0]==="T")){
    const a=canvas(size),c=a.getContext("2d");c.drawImage(loaded[id],0,0,size,size);
    const raw=c.getImageData(0,0,size,size),out=c.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
     const edge=n=>.5*smooth((Math.abs(n-(size-1)/2)-((size-1)/2-24))/24),
       wx=edge(x),wy=edge(y),index=(y*size+x)*4;
     for(let ch=0;ch<3;ch++){
      const at=(xx,yy)=>raw.data[(yy*size+xx)*4+ch],xx=size-1-x,yy=size-1-y;
      out.data[index+ch]=((1-wx)*at(x,y)+wx*at(xx,y))*(1-wy)+((1-wx)*at(x,yy)+wx*at(xx,yy))*wy;
     }
     out.data[index+3]=255;
    }
    c.putImageData(out,0,0);tiles[id]={image:a,data:out.data};
   }
   const mod=n=>((n%size)+size)%size;
   function sample(id,x,y){
    const d=tiles[id].data,ix=mod(Math.floor(x*size/640)),iy=mod(Math.floor(y*size/640)),a=(iy*size+ix)*4;
    return [d[a],d[a+1],d[a+2]];
   }
   const noise=(x,y)=>Math.sin(x*.009+Math.cos(y*.004)*2)*14+Math.cos(y*.014+x*.003)*10;
   const ellipse=(x,y,cx,cy,rx,ry)=>smooth((1-Math.hypot((x-cx)/rx,(y-cy)/ry))/.36);
   const area=(x,y,left,top,w,h,fade=150)=>smooth((Math.min(x-left,left+w-x,y-top,top+h-y)+noise(x,y))/fade);
   const segmentDistance=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy,t=q?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/q)):0;return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);};
   const output=[];
   for(const world of maps){
    const a=canvas(world.width,world.height),c=a.getContext("2d"),raster=c.createImageData(world.width,world.height),data=raster.data;
    const segments=world.roads.flatMap(r=>r.slice(1).map((p,i)=>[r[i],p]));
    for(let py=0;py<world.height;py++)for(let px=0;px<world.width;px++){
     const x=(px+.5)*world.W/world.width,y=(py+.5)*world.H/world.height;
     let rgb=sample("T01",x,y);
     const blend=(id,w)=>{if(w<.003)return;const v=sample(id,x,y);rgb=rgb.map((n,i)=>n+(v[i]-n)*w);};
     if(world.high){
      blend("T03",.62*Math.max(ellipse(x,y,1040,2520,680,650),ellipse(x,y,2060,2100,660,600)));
      blend("T02",.88*Math.max(area(x,y,120,120,2100,600),ellipse(x,y,920,3490,980,420)));
      blend("T04",.58*Math.max(ellipse(x,y,550,3600,460,400),ellipse(x,y,1500,3310,460,320)));
      blend("T05",.86*Math.max(area(x,y,120,650,2140,780),ellipse(x,y,1820,1410,450,340)));
      blend("T06",.92*ellipse(x,y,460,2750,420,380));
      blend("T07",.9*Math.max(area(x,y,2320,120,1200,960),area(x,y,2560,1440,960,1200),area(x,y,2000,3120,1360,640)));
      blend("T14",.58*Math.max(ellipse(x,y,3160,440,260,220),ellipse(x,y,3040,2020,220,400),ellipse(x,y,3040,3500,270,200)));
      if(world.east){
       blend("T02",.88*area(x,y,3720,1640,560,880,90));
       blend("T04",.82*area(x,y,3720,840,1280,520,90));
       blend("T03",.78*area(x,y,3720,2800,1280,640,90));
       blend("T07",.92*area(x,y,4360,1640,560,880,90));
       blend("T06",.94*area(x,y,5040,1520,440,1200,90));
       blend("T14",.5*ellipse(x,y,4720,1800,240,220));
      }
      for(const m of world.mines)blend("T12",.8*ellipse(x,y,m.x,m.y,175,155));
      // Road shoulders fade into their district instead of forming a grid.
      let road=Infinity;for(const [p,q]of segments)road=Math.min(road,segmentDistance(x,y,p,q));
      blend("T03",.27*(1-smooth((road-24)/35)));
      blend("T13",.76*(1-smooth((road-13-noise(x,y)*.12)/21)));
      for(const bridge of world.links)if(!bridge.axis)blend("T05",.82*area(x,y,bridge.x,bridge.y,bridge.w,bridge.h,12));
     }else{
      blend("T03",.52*ellipse(x,y,world.W*.4,world.H*.6,world.W*.5,world.H*.6));
      blend("T02",.5*ellipse(x,y,world.W*.75,world.H*.2,world.W*.32,world.H*.4));
     }
     const index=(py*world.width+px)*4,macro=.96+.035*Math.sin(x*.002+y*.0007);
     for(let ch=0;ch<3;ch++)data[index+ch]=rgb[ch]*macro;
     data[index+3]=255;
    }
    c.putImageData(raster,0,0);c.save();c.scale(world.width/world.W,world.height/world.H);
    function stamp(id,x,y,w,h,angle,opacity){c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha=opacity;c.drawImage(loaded[id],-w/2,-h/2,w,h);c.restore();}
    if(world.high){
     for(const [x,y]of [[900,2410],[1120,2900],[2060,2350],[670,450]])stamp("D13",x,y,200,130,.25,.18);
     for(const [x,y,angle]of [[840,1160,Math.PI/2],[2050,2040,0],[2540,500,0],[2410,3470,-.2]])stamp("D14",x,y,200,120,angle,.27);
     for(const [x,y]of [[3140,410],[3060,2130],[2990,3520]])stamp("D15",x,y,220,150,.3,.32);
     for(const [x,y]of [[600,1060],[1730,970]])stamp("D16",x,y,140,140,.1,.22);
     for(const [x,y]of [[2540,610],[2650,3380]])stamp("D17",x,y,120,80,0,.25);
     for(const [x,y]of [[630,3490],[1260,3560],[1320,420]])stamp("D18",x,y,180,120,.5,.25);
     if(world.east){
      for(const [x,y]of [[3910,2420],[4310,3050],[4810,3220]])stamp("D13",x,y,200,130,.25,.18);
      for(const [x,y,angle]of [[4000,2090,0],[4550,2060,0],[5280,2180,Math.PI/2]])stamp("D14",x,y,220,120,angle,.27);
      for(const [x,y]of [[4720,1840],[4480,1100]])stamp("D15",x,y,210,160,.3,.32);
      for(const [x,y]of [[4080,1060],[4880,3010]])stamp("D16",x,y,140,100,0,.28);
      for(const [x,y]of [[3820,2060],[5200,2060]])stamp("D17",x,y,140,80,0,.38);
      for(const [x,y]of [[4610,2310],[5400,2470]])stamp("D18",x,y,180,120,.5,.25);
     }
    }
    c.restore();output.push({name:world.id+".webp",W:world.W,H:world.H,width:world.width,height:world.height,size:Math.max(world.width,world.height),data:a.toDataURL("image/webp",.9).split(",")[1]});
   }
   output.push({name:"cliff.webp",width:512,height:512,size:512,data:tiles.T11.image.toDataURL("image/webp",.9).split(",")[1]});
   return output;
  },{images,maps});
  fs.mkdirSync(OUTPUT,{recursive:true});
  const files=result.map(({data,...info})=>{const bytes=Buffer.from(data,"base64");fs.writeFileSync(path.join(OUTPUT,info.name),bytes);return {...info,bytes:bytes.length,sha256:sha(bytes)};});
  const version=sha(Buffer.from(JSON.stringify(files.map(f=>f.sha256)))).slice(0,12);
  fs.writeFileSync(path.join(OUTPUT,"manifest.json"),JSON.stringify({version,libraryRevision:library.revision,sources,files,notes:"Selected metallic deck uploads; six offline continuous surface atlases with baked transparent wear. T08–T10 are model finishes, not terrain. 2048² western map; 3200×2048 expanded map preserves density; 512² repeating fascia. Mipmaps at runtime; no live blending or extra draw calls. Uploads remain unchanged."},null,2)+"\n");
  const runtime=path.resolve(OUTPUT,"../../terrain-art.js");
  fs.writeFileSync(runtime,fs.readFileSync(runtime,"utf8").replace(/version="[^"]+"/,"version="+JSON.stringify(version)));
  console.log(JSON.stringify({version,files,originalBytes:sources.reduce((n,s)=>n+s.originalBytes,0)},null,2));
 }finally{await browser.close();}
}
if(require.main===module){const library=process.argv[2];if(!library)throw Error("Usage: node tools/build-signal-terrain-art.js <art-library-directory>");build(path.resolve(library)).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={build,IDS};

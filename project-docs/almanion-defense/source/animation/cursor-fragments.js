/* Material fracture, not an opacity dissolve. Every non-empty source pixel
   belongs to exactly one tile. Attached tiles retain the original PNG alpha. */
function createCursorFragments(canvas,img){
 const ctx=canvas.getContext('2d'),raster=document.createElement('canvas');raster.width=raster.height=160;
 const rc=raster.getContext('2d');rc.drawImage(img,0,0,160,160);const rgba=rc.getImageData(0,0,160,160).data;
 const depth=new Float32Array(160*160),tiles=[],clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x))};
 for(let i=0;i<depth.length;i++)depth[i]=rgba[i*4+3]>80?160:0;
 for(let y=0;y<160;y++)for(let x=0;x<160;x++){const i=y*160+x;if(depth[i])depth[i]=Math.min(depth[i],1+(x?depth[i-1]:0),1+(y?depth[i-160]:0));}
 for(let y=159;y>=0;y--)for(let x=159;x>=0;x--){const i=y*160+x;if(depth[i])depth[i]=Math.min(depth[i],1+(x<159?depth[i+1]:0),1+(y<159?depth[i+160]:0));}
 const maxDepth=Math.max(...depth);
 function split(x,y,size){
  let max=0,total=0;for(let v=y;v<y+size;v++)for(let u=x;u<x+size;u++){const a=rgba[(v*160+u)*4+3];max=Math.max(max,a);total+=a;}
  if(!max)return;
  if(size>4||size>2&&max>48){const h=size/2;for(const [dx,dy] of [[0,0],[h,0],[0,h],[h,h]])split(x+dx,y+dy,h);return;}
  const i=tiles.length,cx=x+size/2,cy=y+size/2,hash=((Math.imul(i+51,2654435761)>>>0)%1009)/1009,d=depth[Math.floor(cy)*160+Math.floor(cx)]/maxDepth;
  tiles.push({sx:x,sy:y,size,x:cx-64,y:cy-65,delay:max>80?.10+d*.27+hash*.055:hash*.07,angle:hash*Math.PI*2,spin:(hash-.5)*5,escape:30+hash*65,star:(max>80?.58:.22)+hash*.35,core:max>80,alpha:total/(size*size*255)});
 }
 for(let y=0;y<160;y+=8)for(let x=0;x<160;x+=8)split(x,y,8);
 let stats={total:tiles.length},dirty=false;
 function clear(){if(dirty)ctx.clearRect(0,0,1920,1080);dirty=false;stats={total:tiles.length,attached:tiles.length,detached:0,material:tiles.length,stars:0,amount:0};}
 // Sample release positions and velocities once. Each piece inherits the
 // moving arrow's trajectory; material conversion and capture have separate
 // clocks, so a fully fragmented arrow still has a long journey ahead.
 function flightRoute(point,start,duration,end){return{start,duration,end,tiles:tiles.map(p=>{
  const release=start+p.delay*duration,a=point(release-.001),b=point(release+.001);
  return{release,origin:point(release),vx:(b.x-a.x)/.002,vy:(b.y-a.y)/.002};
 })};}
 function draw(origin,amount,t,renderer,view,motion=null){
  ctx.clearRect(0,0,1920,1080);dirty=true;let attached=0,detached=0,material=0,stars=0;
  for(let i=0;i<tiles.length;i++){
   const p=tiles[i],local=clamp((amount-p.delay)/(1-p.delay)),q=smooth(local),target=renderer.tracePoint(i*7,t),route=motion?.route.tiles[i];
   const age=route?Math.max(0,motion.progress-route.release):0,transport=route?clamp(age/(motion.route.end-route.release)):clamp((local-.24)/.76),capture=smooth(transport);
   const drift=.22*(1-Math.exp(-age/.22)),base=route&&local>0?{x:route.origin.x+route.vx*drift,y:route.origin.y+route.vy*drift}:origin;
   const escape=Math.sin(Math.PI*(route?transport:q))*(1-capture),x=(base.x+p.x)*(1-capture)+target.x*capture+Math.cos(p.angle)*p.escape*escape,y=(base.y+p.y)*(1-capture)+target.y*capture+Math.sin(p.angle)*p.escape*escape;
   if(local===0)attached++;else detached++;
   const heat=smooth((local-.12)/.40),scale=1-smooth((local-.22)/.40),radius=p.star*heat;
   // The target belongs to the same 3D magnetic field. Back-side stars are
   // occulted by the core, rather than painted through its surface.
   if(capture>.999&&target.z<0&&Math.hypot(x-view.x,y-view.y)<view.r)continue;
   if(radius>0){stars++;ctx.fillStyle=`rgb(${Math.round(110+heat*85)},${Math.round(167+heat*67)},255)`;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    if(p.core&&i%4===0){ctx.strokeStyle='#9acfff';ctx.lineWidth=.5;const r=radius*(2.2+.5*Math.sin(i+t));ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();}
   }
   if(scale>0){material++;ctx.save();ctx.translate(x,y);ctx.rotate(p.spin*q);ctx.scale(scale,scale);ctx.drawImage(raster,p.sx,p.sy,p.size,p.size,-p.size/2,-p.size/2,p.size,p.size);ctx.restore();}
  }
  stats={total:tiles.length,attached,detached,material,stars,amount,sourceOpacity:1,transport:motion?clamp((motion.progress-motion.route.start)/(motion.route.end-motion.route.start)):amount};
 }
 // A pixel-level check of the assembled material, independent of animation.
 function reconstructionError(){const c=document.createElement('canvas');c.width=c.height=160;const x=c.getContext('2d');for(const p of tiles)x.drawImage(raster,p.sx,p.sy,p.size,p.size,p.sx,p.sy,p.size,p.size);const actual=x.getImageData(0,0,160,160).data;let error=0;for(let i=0;i<actual.length;i++)error=Math.max(error,Math.abs(actual[i]-rgba[i]));return error;}
 return{draw,clear,flightRoute,reconstructionError,get stats(){return stats},count:tiles.length};
}

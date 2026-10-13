/* Procedural night sky, painted once. No network, photographs or animation loop.
   Fixed seeds make Home, replay and resizing produce the same star field. */
function createNightSky(){
 const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const c=canvas.getContext('2d');
 let seed=92731;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const lattice=Float32Array.from({length:65536},rnd),smooth=x=>x*x*(3-2*x);
 function noise(x,y){const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy),at=(a,b)=>lattice[((b&255)<<8)+(a&255)];return (at(ix,iy)*(1-u)+at(ix+1,iy)*u)*(1-v)+(at(ix,iy+1)*(1-u)+at(ix+1,iy+1)*u)*v;}
 function fbm(x,y){let n=0,a=.53;for(let i=0;i<5;i++){n+=a*noise(x,y);x=x*2.07+17;y=y*2.07+31;a*=.48}return n;}
 const mist=document.createElement('canvas');mist.width=960;mist.height=540;const m=mist.getContext('2d'),pixels=m.createImageData(960,540);
 for(let y=0;y<540;y++)for(let x=0;x<960;x++){
  const X=x*2,Y=y*2,cloud=fbm(X/210,Y/210),detail=fbm(X/68+70,Y/68+13);
  const axis=1170-.62*Y+90*Math.sin(Y/320),distance=X-axis;
  const band=Math.exp(-Math.pow(distance/(125+135*cloud),2)/2);
  const dust=Math.exp(-Math.pow((distance+32-95*noise(Y/95,4))/(21+37*detail),2)/2);
  const light=band*Math.pow(Math.max(0,cloud-.21),1.65)*180*(1-.82*dust);
  const veil=.8+noise(X/900,Y/900)*2,at=(y*960+x)*4;
  pixels.data[at]=4+veil+light*.82;pixels.data[at+1]=8+veil+light*.9;pixels.data[at+2]=16+veil+light*1.13;pixels.data[at+3]=255;
 }
 m.putImageData(pixels,0,0);c.drawImage(mist,0,0,1920,1080);
 const nebula=document.createElement('canvas');nebula.width=1920;nebula.height=1080;nebula.getContext('2d').drawImage(canvas,0,0);const catalog=[];
 const colors=['215,228,255','244,242,231','191,214,252','246,220,185'];
 function point(x,y,r,alpha,color,halo=false){
  catalog.push({x,y,r,alpha,color,halo});
  if(halo){const g=c.createRadialGradient(x,y,0,x,y,r*9);g.addColorStop(0,`rgba(${color},${alpha*.4})`);g.addColorStop(.25,`rgba(${color},${alpha*.12})`);g.addColorStop(1,`rgba(${color},0)`);c.fillStyle=g;c.fillRect(x-r*9,y-r*9,r*18,r*18);}
  c.fillStyle=`rgba(${color},${alpha})`;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
 }
 for(let i=0;i<2900;i++){const x=rnd()*1920,y=rnd()*1080,lum=Math.pow(rnd(),4),r=.28+lum*1.27;point(x,y,r,.12+lum*.81,colors[Math.floor(rnd()*4)],lum>.93);}
 for(let i=0;i<2400;i++){const y=rnd()*1080,spread=(rnd()+rnd()+rnd()-1.5)*210,x=1170-.62*y+90*Math.sin(y/320)+spread;point(x,y,.22+rnd()*.48,.08+rnd()*.35,colors[Math.floor(rnd()*3)]);}
 // Keep the project title against a dark, low-contrast pocket of sky.
 const shade=c.createRadialGradient(320,485,80,340,485,660);shade.addColorStop(0,'rgba(3,8,18,.8)');shade.addColorStop(.58,'rgba(3,8,18,.4)');shade.addColorStop(1,'rgba(3,8,18,0)');c.fillStyle=shade;c.fillRect(0,0,1920,1080);
 canvas.starCatalog=catalog;canvas.nebula=nebula;
 return canvas;
}

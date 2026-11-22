/* A distant field of galactic dust and a closer, coordinate-seeded star catalogue. */
(function(root){
  'use strict';
  const O=root.Orbital,TAU=2*Math.PI;
  const width=1536,height=960,cellSize=224,spriteSize=32;
  const tones=['174,204,242','230,230,222','246,201,159'];
  const patterns=new WeakMap(),cells=new Map();
  let deepSky,sprites;

  function surface(w,h){
    const canvas=document.createElement('canvas');
    canvas.width=w; canvas.height=h;
    return canvas;
  }
  function randomFrom(seed){
    return ()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    };
  }
  function noiseGrid(cols,rows,random){
    const stride=cols+1,values=new Float32Array(stride*(rows+1));
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++)values[y*stride+x]=random();
      values[y*stride+cols]=values[y*stride];
    }
    values.set(values.subarray(0,stride),rows*stride);
    return (u,v)=>{
      const x=u*cols,y=v*rows,ix=Math.floor(x),iy=Math.floor(y),i=iy*stride+ix;
      const dx=x-ix,dy=y-iy,s=dx*dx*(3-2*dx),t=dy*dy*(3-2*dy);
      const upper=values[i]+s*(values[i+1]-values[i]);
      const lower=values[i+stride]+s*(values[i+stride+1]-values[i+stride]);
      return upper+t*(lower-upper);
    };
  }
  const band=u=>.83-u+.075*Math.sin(TAU*(u+.11))+.033*Math.sin(2*TAU*u);
  function makeDeepSky(){
    const random=randomFrom(239901),large=noiseGrid(5,4,random),medium=noiseGrid(15,10,random),fine=noiseGrid(43,30,random);
    const dust=surface(256,160),dc=dust.getContext('2d'),image=dc.createImageData(dust.width,dust.height);
    for(let y=0;y<dust.height;y++)for(let x=0;x<dust.width;x++){
      const u=(x+.5)/dust.width,v=(y+.5)/dust.height;
      const a=large(u,v),b=medium(u,v),grain=fine(u,v);
      const offset=v-band(u)-.14*(a-.5)-.042*(b-.5),d=offset-Math.round(offset);
      const cloud=.49*a+.36*b+.15*grain;
      const lane=d+.038+.045*(b-.5);
      const light=Math.exp(-31*d*d)*cloud*cloud*(1-.68*Math.exp(-900*lane*lane));
      const i=(y*dust.width+x)*4;
      image.data[i]=9+4*a+47*light;
      image.data[i+1]=14+5*a+51*light;
      image.data[i+2]=22+7*a+68*light;
      image.data[i+3]=255;
    }
    dc.putImageData(image,0,0);
    const canvas=surface(width,height),c=canvas.getContext('2d');
    c.drawImage(dust,0,0,width,height);
    // Tiny stars are baked once. A second population gathers along the dust lane.
    for(let i=0;i<1260;i++){
      const u=random(),v=i<820?random():band(u)+(random()+random()-1)*.22;
      const x=u*width,y=(v-Math.floor(v))*height,r=.36+.85*random()**2;
      c.fillStyle='rgba('+tones[Math.floor(random()*tones.length)]+','+(.23+.5*random())+')';
      c.beginPath();
      // Stars that straddle a tile edge keep their other half on the opposite edge.
      for(let px=x<r?x+width:x;px>=-r;px-=width){
        for(let py=y<r?y+height:y;py>=-r;py-=height){
          c.moveTo(px+r,py);c.arc(px,py,r,0,TAU);
        }
      }
      c.fill();
    }
    return canvas;
  }
  function makeSprites(){
    const canvas=surface(spriteSize*tones.length,spriteSize*2),c=canvas.getContext('2d');
    for(const [i,rgb] of tones.entries())for(let bright=0;bright<2;bright++){
      const x=(i+.5)*spriteSize,y=(bright+.5)*spriteSize;
      const glow=c.createRadialGradient(x,y,0,x,y,15);
      for(const [stop,alpha] of [[0,1],[.085,.91],[.17,.43],[.32,.12],[.63,.031],[1,0]]){
        glow.addColorStop(stop,'rgba('+rgb+','+alpha+')');
      }
      c.fillStyle=glow;c.fillRect(x-15,y-15,30,30);
      if(bright){
        c.fillStyle='rgba('+rgb+',.46)';
        c.beginPath();c.moveTo(x,y-9);c.lineTo(x+.9,y-1);c.lineTo(x+7,y);c.lineTo(x+.9,y+1);
        c.lineTo(x,y+9);c.lineTo(x-.9,y+1);c.lineTo(x-7,y);c.lineTo(x-.9,y-1);c.closePath();c.fill();
      }
      c.fillStyle='#f4f1e8';c.beginPath();c.arc(x,y,bright?1.55:1.05,0,TAU);c.fill();
    }
    return canvas;
  }
  function starCell(sector,col,row){
    const key=sector+'/'+col+'/'+row;
    if(cells.has(key))return cells.get(key);
    const seed=Math.imul(col,73856093)^Math.imul(row,19349663)^Math.imul(sector+1,83492791);
    const random=randomFrom(seed),stars=[],count=6+Math.floor(random()*6);
    for(let i=0;i<count;i++){
      const x=(col+random())*cellSize,y=(row+random())*cellSize;
      const bright=random()>.92,size=bright?18+random()*8:6+random()*9;
      const tone=Math.floor(random()*tones.length),phase=random()*TAU,rate=.38+random()*.58;
      stars.push({x,y,size,tone,bright,phase,rate});
      if(bright&&random()<.34){
        stars.push({x:x+size*.37,y:y-size*.14,size:7,tone:(tone+1)%tones.length,bright:false,phase,rate});
      }
    }
    if(cells.size>=160)cells.delete(cells.keys().next().value);
    cells.set(key,stars);
    return stars;
  }

  // The caller's transform already contains the device scale and portrait rotation.
  // spanX/spanY include the margins outside the flight's physical coordinate system.
  function draw(c,spanX,spanY,scale,sector,camera,time){
    if(!deepSky){deepSky=makeDeepSky();sprites=makeSprites();}
    if(!patterns.has(c))patterns.set(c,c.createPattern(deepSky,'repeat'));
    const dx=(camera?.cx??600)-600,dy=(camera?.cy??350)-350,zoom=camera?.zoom||1;
    const u=(.43+sector*.237)%1,far=scale*zoom**.09;
    const farX=u*width+dx*.10,farY=(band(u)+.20)*height+dy*.10;
    c.save();c.translate(600,350);c.save();c.scale(far,far);c.translate(-farX,-farY);
    const w=spanX/far+2,h=spanY/far+2,left=farX-w/2,top=farY-h/2;
    c.fillStyle=patterns.get(c);c.fillRect(left,top,w,h);
    c.fillStyle=(O.SECTORS?.[sector]?.color||'#aec9ec')+'07';c.fillRect(left,top,w,h);
    c.restore();

    const near=scale*zoom**.23,cx=dx*.29,cy=dy*.29;
    const halfW=spanX/(2*near)+22,halfH=spanY/(2*near)+22;
    c.scale(near,near);c.translate(-cx,-cy);
    for(let row=Math.floor((cy-halfH)/cellSize);row<=Math.floor((cy+halfH)/cellSize);row++){
      for(let col=Math.floor((cx-halfW)/cellSize);col<=Math.floor((cx+halfW)/cellSize);col++){
        for(const star of starCell(sector,col,row)){
          if(Math.abs(star.x-cx)>halfW||Math.abs(star.y-cy)>halfH)continue;
          c.globalAlpha=star.bright ? .85+.13*Math.sin(time*star.rate+star.phase) : .73;
          c.drawImage(sprites,star.tone*spriteSize,star.bright?spriteSize:0,spriteSize,spriteSize,
            star.x-star.size/2,star.y-star.size/2,star.size,star.size);
        }
      }
    }
    c.restore();
  }
  O.FlightSky={draw};
})(typeof globalThis!=='undefined'?globalThis:window);

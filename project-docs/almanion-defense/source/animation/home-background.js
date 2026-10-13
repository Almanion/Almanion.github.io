/* Original Almanion star geometry and interaction helpers, driven by the
   presentation clock. The iframe contains no autonomous scripts or timers. */
const HomeBackground=(()=>{
 let canvas,surface,ctx,win,stars=[],edges=[],color,active=false,lastTime=0,lastDraw=-Infinity;
 let encoding=false,generation=0,bitmapURL=null,staticColor=null;
 const width=1440,height=810,api=window.DEMO_HOME_STARS;
 function init(frame){
  win=frame.contentWindow;canvas=win.document.createElement('canvas');canvas.width=width;canvas.height=height;ctx=canvas.getContext('2d');
  // A bitmap surface avoids Edge's cross-document Canvas repaint issue in
  // sandboxed srcdoc frames. The source renderer remains a detached Canvas.
  surface=win.document.createElement('img');surface.className='home-starfield';surface.alt='';surface.setAttribute('aria-hidden','true');win.document.body.prepend(surface);
  let seed=20261012;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  stars=api.createStars(width,height,rand);edges=api.createConnections(stars,width,height,120);surface.dataset.count=stars.length;refresh();draw();return surface.decode();
 }
 function refresh(){if(surface)color=win.getComputedStyle(surface).color;}
 function draw(elapsed=0,pointer={active:false},energy=0){
  if(!ctx)return;ctx.clearRect(0,0,width,height);ctx.fillStyle=color;ctx.strokeStyle=color;
  const points=stars.map(star=>{const x=star.u*width,y=star.v*height,target=api.influence(x,y,pointer,155),drift=Math.sin(elapsed/8500+star.phase)*1.8*energy;return{x:x+target.x*energy+drift,y:y+target.y*energy+drift*.5,alpha:star.alpha+Math.sin(elapsed/3700+star.phase)*.025*energy+target.glow*.16*energy,glow:target.glow};});
  ctx.lineWidth=.65;let visibleEdges=0;
  for(const e of edges){const a=points[e.a],b=points[e.b],opacity=api.connectionOpacity(a,b,pointer,220)*energy;if(opacity<.003)continue;ctx.globalAlpha=opacity;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();visibleEdges++;}
  stars.forEach((s,i)=>{const p=points[i];ctx.globalAlpha=p.alpha;ctx.beginPath();ctx.arc(p.x,p.y,s.radius,0,Math.PI*2);ctx.fill();if(s.sparkle){const r=s.radius*2.2+p.glow*.5*energy;ctx.globalAlpha=p.alpha*.5;ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(p.x-r,p.y);ctx.lineTo(p.x+r,p.y);ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x,p.y+r);ctx.stroke();}});
  ctx.globalAlpha=1;
  if(active){
   // Encode off the animation path, with at most one pending bitmap. A token
   // prevents a late result from overwriting the deterministic stopped frame.
   const token=generation;encoding=true;
   canvas.toBlob(blob=>{encoding=false;if(!blob||!active||token!==generation)return;
    const url=URL.createObjectURL(blob);surface.src=url;
    if(bitmapURL)URL.revokeObjectURL(bitmapURL);bitmapURL=url;
   },'image/png');
  }else{
   surface.src=canvas.toDataURL();
   staticColor=color;
   if(bitmapURL)URL.revokeObjectURL(bitmapURL);bitmapURL=null;
  }
  surface.dataset.edges=visibleEdges;surface.dataset.motion=active?'presentation':'still';lastTime=elapsed;lastDraw=performance.now();
 }
 function begin(){active=true;refresh();}
 function tick(elapsed,x,y,energy=1){if(active&&!encoding&&performance.now()-lastDraw>=32)draw(elapsed,{active:true,x,y},energy);}
 function stop(){generation++;active=false;refresh();if(surface?.dataset.motion==='still'&&staticColor===color){lastTime=0;return;}draw();}
 return{init,begin,tick,stop,refresh,get snapshot(){return surface?.src},get state(){return{count:stars.length,edges:Number(surface?.dataset.edges||0),active,time:lastTime,color}}};
})();

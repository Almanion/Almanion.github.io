/* Animate computed native colors with the browser's color engine. In particular,
   color(srgb ...) from color-mix must not be parsed as 0..255 RGB components. */
async function animateDemoTheme(dark=true){
 const d=doc(),w=d.defaultView;
 if(reduced){theme(dark);return;}
 const keys=['backgroundColor','color','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','boxShadow','textShadow','outlineColor','fill','stroke','opacity'];
 const origin=find(`[data-exp-theme="${dark?'dark':'light'}"]`).getBoundingClientRect();
 const cx=origin.x+origin.width/2,cy=origin.y+origin.height/2;
 const layers=[];
 for(const n of [d.documentElement,d.body,...d.body.querySelectorAll('*')]){
  const r=n.getBoundingClientRect();
  if(!r.width||!r.height||r.bottom<0||r.top>w.innerHeight||r.right<0||r.left>w.innerWidth)continue;
  const read=pseudo=>{const c=w.getComputedStyle(n,pseudo);return Object.fromEntries(keys.map(k=>[k,c[k]]));};
  layers.push({n,read,before:read(null),delay:Math.min(170,Math.hypot(r.x+r.width/2-cx,r.y+r.height/2-cy)*.19)});
  for(const pseudo of ['::before','::after']){
   const c=w.getComputedStyle(n,pseudo);
   if(c.content==='none'||c.content==='normal'||c.display==='none')continue;
   layers.push({n,pseudo,read:()=>read(pseudo),before:read(pseudo),delay:layers.at(-1).delay});
  }
 }
 theme(dark);
 // Read the target palette as one batch before inserting animation proxies or
 // pseudo-element rules. Interleaving these reads/writes forced a full style
 // recalculation for almost every visible element.
 for(const l of layers)l.after=l.read(null);
 // Isolated interpolation targets avoid native !important theme rules winning
 // over Web Animations. The browser still computes all colors and shadows.
 const holder=d.createElement('div');holder.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
 const shadow=holder.attachShadow({mode:'open'});d.body.appendChild(holder);
 const pseudoStyle=d.createElement('style');d.head.appendChild(pseudoStyle);
 const animations=[],restores=[];
 try{
  for(const l of layers){
   const after=l.after,from={},to={};
   for(const k of keys)if(l.before[k]!==after[k]){from[k]=l.before[k];to[k]=after[k];}
   if(!Object.keys(from).length)continue;
   const proxy=d.createElement('div');shadow.appendChild(proxy);
   const a=proxy.animate([from,to],{duration:880,delay:l.delay,fill:'both',easing:'cubic-bezier(.4,0,.15,1)'});
   let dest=l.n.style;
   if(l.pseudo){
    const id='theme-'+animations.length,attr='data-demo-theme-'+animations.length;l.n.setAttribute(attr,id);
    const selector=Array(12).fill('['+attr+']').join('')+l.pseudo;
    const i=pseudoStyle.sheet.insertRule(selector+'{}',pseudoStyle.sheet.cssRules.length);dest=pseudoStyle.sheet.cssRules[i].style;
    restores.push(()=>l.n.removeAttribute(attr));
   }
   const properties=Object.keys(from).map(k=>({js:k,css:k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}));
   if(!l.pseudo)for(const k of properties){const value=dest.getPropertyValue(k.css),priority=dest.getPropertyPriority(k.css);restores.push(()=>value?dest.setProperty(k.css,value,priority):dest.removeProperty(k.css));}
   a.pause();a.currentTime=0;animations.push({a,proxy,dest,properties});
  }
  $('stage').dataset.themeTransition=dark?'dark':'light';
  await tween(1050,t=>{
   animations.forEach(x=>x.a.currentTime=t*1050);
   const values=animations.map(x=>{const c=w.getComputedStyle(x.proxy);return x.properties.map(k=>c[k.js]);});
   animations.forEach((x,i)=>x.properties.forEach((k,j)=>x.dest.setProperty(k.css,values[i][j],'important')));
   Cosmos.themeProgress(t);
  },true);
 }finally{
  animations.forEach(x=>x.a.cancel());restores.forEach(f=>f());holder.remove();pseudoStyle.remove();
  delete $('stage').dataset.themeTransition;
  Cosmos.themeProgress(null);
 }
}

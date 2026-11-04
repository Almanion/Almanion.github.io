/* Shared baked surface assets for Canvas and Babylon; never depends on the workshop. */
(function(root){
  "use strict";
  const base=new URL("./assets/terrain/",document.currentScript?.src||location.href),
    version="15901ce623e4",images=new Map();
  const url=id=>new URL(id+".webp?v="+version,base).href;
  function request(id){
    if(images.has(id))return images.get(id);
    const entry={image:null,state:"loading"};images.set(id,entry);
    entry.ready=new Promise(resolve=>{
      const image=new Image();image.decoding="async";
      image.onload=()=>{entry.image=image;entry.state="ready";resolve(entry);};
      image.onerror=()=>{entry.state="unavailable";resolve(entry);};
      image.src=url(id);
    });
    return entry;
  }
  root.SignalTerrainArt={url,request,peek:id=>images.get(id)?.image||null};
})(globalThis);

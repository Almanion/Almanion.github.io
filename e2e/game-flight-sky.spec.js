'use strict';
const {test,expect}=require('@playwright/test');

async function openMap(page){
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/games/orbital-courier/flight/?contract=4');
  await page.waitForFunction(()=>{
    const canvas=document.getElementById('gameCanvas'),r=canvas?.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);
    return window.Orbital?.App?.screen==='play'&&r.width>0&&
      canvas.width===Math.round(r.width*dpr)&&canvas.height===Math.round(r.height*dpr);
  });
  await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;});
}

// Read only the two bands outside the fitted flight chart. Planets, UI and
// corner marks must not be able to satisfy a check for stars in the margins.
function skyMargins(page){
  return page.locator('#gameCanvas').evaluate(async canvas=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,rotated=Orbital.FlightView.portrait();
    const {width,height}=Orbital.Physics.WORLD,worldW=rotated?height:width,worldH=rotated?width:height;
    const fit=Math.min(w/worldW,h/worldH),horizontal=w-worldW*fit>h-worldH*fit;
    const margin=Math.floor((horizontal?w-worldW*fit:h-worldH*fit)/2);
    const bands=[false,true].map(opposite=>{
      const start=opposite?(horizontal?w:h)-margin:0;
      const offset=start+Math.floor(margin*.13),thickness=Math.max(1,Math.floor(margin*.72));
      const pixels=horizontal?c.getImageData(offset,Math.floor(h*.1),thickness,Math.floor(h*.8)):
        c.getImageData(Math.floor(w*.1),offset,Math.floor(w*.8),thickness);
      const data=pixels.data,colors=new Set();let stars=0,opaque=true,hash=2166136261;
      for(let i=0;i<data.length;i+=4){
        const rgb=(data[i]<<16)|(data[i+1]<<8)|data[i+2];
        colors.add(rgb);
        if(data[i+1]>65)stars++;
        if(data[i+3]!==255)opaque=false;
        hash=Math.imul(hash^rgb,16777619);
      }
      return {colors:colors.size,stars,opaque,hash};
    });
    return {axis:horizontal?'x':'y',margin,bands};
  });
}

for(const [width,height,dpr,axis] of [[1920,720,1,'x'],[1024,1024,1,'y'],[390,844,2,'x'],[844,390,2,'x']]){
  test.describe(width+'×'+height,()=>{
    test.use({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:dpr>1});
    test('the sky extends beyond both edges of the flight chart',async({page})=>{
      await openMap(page);
      const view=await skyMargins(page);
      expect(view.axis).toBe(axis);
      expect(view.margin).toBeGreaterThan(20);
      for(const band of view.bands){
        expect(band.opaque).toBe(true);
        expect(band.colors).toBeGreaterThan(35);
        expect(band.stars).toBeGreaterThan(3);
      }
    });
  });
}

test('the star field follows the camera and returns to the same coordinates',async({page})=>{
  await page.setViewportSize({width:1920,height:720});
  await openMap(page);
  const hashes=async()=>(await skyMargins(page)).bands.map(band=>band.hash);
  const home=await hashes();
  await page.getByRole('button',{name:'Увеличить карту',exact:true}).click();
  const zoomed=await hashes();
  expect(zoomed).not.toEqual(home);
  await page.locator('#mapPan').click();
  const box=await page.locator('#gameCanvas').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.55;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y-40,{steps:4});await page.mouse.up();
  expect(await page.evaluate(()=>Orbital.App.camera.cx)).toBeLessThan(600);
  expect(await hashes()).not.toEqual(zoomed);
  await page.locator('#mapFit').click();
  expect(await hashes()).toEqual(home);
});

test('only a few stars change brightness, and reduced motion freezes them',async({page})=>{
  await openMap(page);
  const changedPixels=()=>page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=525;
    const renderer=new Orbital.Renderer(canvas),c=renderer.ctx,fit=canvas.width/1200;
    c.setTransform(fit,0,0,fit,0,0);
    const draw=time=>{
      renderer.drawSky(fit,1,null,time);
      return c.getImageData(0,0,canvas.width,canvas.height).data;
    };
    const a=draw(0),b=draw(5);let changed=0;
    for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
    return changed;
  });
  await page.emulateMedia({reducedMotion:'no-preference'});
  const changed=await changedPixels();
  expect(changed).toBeGreaterThan(2);
  expect(changed).toBeLessThan(900*525*.025);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  expect(await changedPixels()).toBe(0);
});

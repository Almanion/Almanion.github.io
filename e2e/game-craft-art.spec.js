'use strict';
const {test,expect}=require('@playwright/test');
test('detailed craft models retain colour, open docking aperture and bounded texture caches',async({page},info)=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.setViewportSize({width:1200,height:800});await page.goto('/games/orbital-courier/offline.html');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const result=await page.evaluate(()=>{
  const O=Orbital,c=document.createElement('canvas');c.id='craftBoard';c.width=1200;c.height=800;c.style.cssText='position:fixed;inset:0;z-index:9999;width:1200px;height:800px';document.body.append(c);
  const g=c.getContext('2d');g.fillStyle='#09151f';g.fillRect(0,0,1200,800);
  g.fillStyle='#91b1bc';g.font='13px sans-serif';g.fillText('ОРБИТАЛЬНЫЙ КУРЬЕР / ОБНОВЛЕНИЕ ФЛОТА',45,42);
  g.fillStyle='#e6f3ee';g.font='26px sans-serif';g.fillText('Грузовой челнок',45,93);g.fillText('Орбитальная станция',660,93);
  g.strokeStyle='#31505b';g.beginPath();g.moveTo(600,125);g.lineTo(600,735);g.moveTo(45,515);g.lineTo(1155,515);g.stroke();
  O.drawShip(g,325,280,-.22,'#6af4cd',9,true,2.4);
  const r=new O.Renderer(c);r.uiScale=1;g.save();g.translate(895,300);g.scale(2.6,2.6);r.station({x:0,y:0,noLabel:true},2.4,25);g.restore();
  g.font='12px sans-serif';g.fillStyle='#93b5bd';g.fillText('Керамика · титановая рама · грузовой отсек',45,477);g.fillText('Стыковочный узел · жилые модули · солнечные панели',660,477);
  g.fillText('ОКРАСКИ И МАСШТАБ ПОЛЁТА',45,553);g.fillText('РАЗНЫЕ ДОПУСКИ СТАНЦИИ',660,553);
  for(const [i,color]of ['#6af4cd','#ffc37c','#c4a3ff'].entries()){O.drawShip(g,135+i*155,620,-.22,color,2.8,false);O.drawShip(g,135+i*155,708,0,color,1,false);}
  for(const [i,R] of [9,25,42].entries()){r.station({x:740+i*165,y:650,noLabel:true},2.4,R);g.fillText('R = '+R,725+i*165,735);}
  const tex=O.drawShip.texture('#6af4cd'),station=r.stationTexture(25,1),center=station.getContext('2d').getImageData(320,320,1,1).data[3];
  const hits=tex===O.drawShip.texture('#6af4cd')&&station===r.stationTexture(25,1);
  const colours=new Set(['#6af4cd','#ffc37c','#c4a3ff'].map(c=>O.drawShip.texture(c).toDataURL())).size;
  for(let R=10;R<30;R++)r.stationTexture(R,1);
  return {hits,colours,center,cache:r.stationCache.size,transform:g.getTransform().a};
 });
 expect(result).toEqual({hits:true,colours:3,center:0,cache:12,transform:1});expect(errors).toEqual([]);
 await page.locator('#craftBoard').screenshot({path:info.outputPath('courier-and-station.png')});
});
test('nine cohesive hulls and eleven trails have distinct artwork with no portal bridge',async({page},info)=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/games/orbital-courier/offline.html');
 const result=await page.evaluate(()=>{
  const O=Orbital,c=document.createElement('canvas');c.width=1200;c.height=1500;c.id='fleetGallery';c.style.cssText='position:fixed;inset:0;z-index:99999;width:1200px;height:1500px';document.body.append(c);
  const g=c.getContext('2d');g.fillStyle='#12151c';g.fillRect(0,0,c.width,c.height);g.font='24px sans-serif';g.fillStyle='#e5edf9';g.fillText('ФЛОТ / МОДЕЛИ И СЛЕДЫ',40,45);
  const models=O.Fleet.MODELS.map((m,i)=>{const x=190+i%3*400,y=130+Math.floor(i/3)*180;O.drawShip(g,x,y,-.14,'#91a6c2',4,false,0,m.id);g.fillStyle='#b8c9e1';g.font='16px sans-serif';g.fillText(m.name,x-40,y+95);return O.drawShip.texture('#91a6c2',m.id).toDataURL();});
  const images=[],reduced=[],points=Array.from({length:90},(_,i)=>({x:8+i*3,y:65-Math.sin(i/89*1.6)*30})),before=JSON.stringify(points);
  for(const [i,t]of O.Cosmetics.TRAILS.entries()){
   const tile=document.createElement('canvas');tile.width=300;tile.height=120;const ctx=tile.getContext('2d');
   O.Cosmetics.drawTrail(ctx,points,t.id,2,'#91a6c2',true,2);const first=tile.toDataURL();images.push(first);ctx.clearRect(0,0,300,120);O.Cosmetics.drawTrail(ctx,points,t.id,900,'#91a6c2',true,2);reduced.push(first===tile.toDataURL());
   const x=30+i%3*390,y=650+Math.floor(i/3)*200;g.drawImage(tile,x,y,360,144);g.fillStyle='#b8c9e1';g.font='16px sans-serif';g.fillText(t.name,x+12,y+165);
  }
  const tile=document.createElement('canvas');tile.width=300;tile.height=100;const ctx=tile.getContext('2d'),portal=[{x:0,y:50},{x:60,y:50},{x:240,y:50,break:true},{x:280,y:50}];
  O.Cosmetics.drawTrail(ctx,portal,'comet',1,'#91a6c2',true,1);const bridge=ctx.getImageData(80,0,120,100).data.some((n,i)=>i%4===3&&n>0);
  return {models:new Set(models).size,trails:new Set(images).size,reduced:reduced.every(Boolean),unchanged:before===JSON.stringify(points),bridge,transform:ctx.getTransform().a};
 });
 expect(result).toEqual({models:9,trails:11,reduced:true,unchanged:true,bridge:false,transform:1});
 await page.locator('#fleetGallery').screenshot({path:info.outputPath('fleet-and-trails.png')});
});

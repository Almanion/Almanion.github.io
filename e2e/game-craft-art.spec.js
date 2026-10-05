'use strict';
const {test,expect}=require('@playwright/test');
test('detailed craft models retain colour, open docking aperture and bounded texture caches',async({page},info)=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.setViewportSize({width:1200,height:800});await page.goto('/games/orbital-courier/');
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

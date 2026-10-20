/* One cosmetic hull renderer for the dock, flight and frozen flight recording.
   Hull choice never enters the simulation or upgrade calculations. */
(function(root){
 'use strict';
 const O=root.Orbital=root.Orbital||{},cache=new Map();
 const MODELS=Object.freeze([
  {id:'courier',name:'Курьер',xp:0,code:'OC—01',description:'Мягкий силуэт. Цельный керамический корпус.',engines:[[-17,-5],[-17,5]],cabin:[5,14,3.7],hardpoints:{scanner:[9,-6],magnet:[-3,8],docking:[23,0],engine:[-18,-5]}},
  {id:'swift',name:'Стриж',xp:600,code:'OC—02',description:'Стреловидное крыло и вытянутый фонарь.',engines:[[-18,-7],[-18,7]],cabin:[4,17,2.8],hardpoints:{scanner:[10,-4],magnet:[-7,10],docking:[25,0],engine:[-19,-7]}},
  {id:'atlas',name:'Атлас',xp:2200,code:'OC—03',description:'Широкий грузовой корпус с мягкими гранями.',engines:[[-19,-7],[-19,7]],cabin:[7,17,5],hardpoints:{scanner:[11,-9],magnet:[-5,11],docking:[22,0],engine:[-20,-7]}},
  {id:'manta',name:'Скат',xp:6000,code:'OC—04',description:'Плавное летающее крыло. Почти без швов.',engines:[[-15,-7],[-15,7]],cabin:[4,13,4.3],hardpoints:{scanner:[10,-7],magnet:[-7,12],docking:[21,0],engine:[-17,-7]}},
  {id:'spectre',name:'Спектр',xp:12000,code:'OC—05',description:'Тонкий монокорпус с тёмным остеклением.',engines:[[-21,-3.5],[-21,3.5]],cabin:[0,17,2.7],hardpoints:{scanner:[10,-4],magnet:[-8,7],docking:[25,0],engine:[-22,-3.5]}}
 ].map(m=>Object.freeze(m)));
 const find=id=>MODELS.find(m=>m.id===id)||MODELS[0];
 function outline(c,id){
  c.beginPath();
  switch(id){
   case 'swift':c.moveTo(25,0);c.bezierCurveTo(14,-4,6,-5,0,-6);c.lineTo(-16,-14);c.quadraticCurveTo(-20,-14,-20,-10);c.lineTo(-17,-3);c.quadraticCurveTo(-18,0,-17,3);c.lineTo(-20,10);c.quadraticCurveTo(-20,14,-16,14);c.lineTo(0,6);c.bezierCurveTo(6,5,14,4,25,0);break;
   case 'atlas':c.moveTo(22,0);c.bezierCurveTo(22,-6,15,-11,7,-12);c.lineTo(-13,-12);c.quadraticCurveTo(-20,-12,-20,-6);c.lineTo(-20,6);c.quadraticCurveTo(-20,12,-13,12);c.lineTo(7,12);c.bezierCurveTo(15,11,22,6,22,0);break;
   case 'manta':c.moveTo(21,0);c.bezierCurveTo(13,-5,5,-7,-9,-14);c.quadraticCurveTo(-18,-18,-21,-12);c.quadraticCurveTo(-22,-10,-17,-7);c.bezierCurveTo(-12,-4,-12,-2,-14,0);c.bezierCurveTo(-12,2,-12,4,-17,7);c.quadraticCurveTo(-22,10,-21,12);c.quadraticCurveTo(-18,18,-9,14);c.bezierCurveTo(5,7,13,5,21,0);break;
   case 'spectre':c.moveTo(26,0);c.bezierCurveTo(14,-4,2,-5,-6,-6);c.lineTo(-17,-9);c.quadraticCurveTo(-22,-10,-22,-5);c.lineTo(-22,5);c.quadraticCurveTo(-22,10,-17,9);c.lineTo(-6,6);c.bezierCurveTo(2,5,14,4,26,0);break;
   default:c.moveTo(23,0);c.bezierCurveTo(18,-6,10,-9,1,-9);c.quadraticCurveTo(-6,-9,-12,-11);c.quadraticCurveTo(-18,-12,-18,-6);c.lineTo(-18,6);c.quadraticCurveTo(-18,12,-12,11);c.quadraticCurveTo(-6,9,1,9);c.bezierCurveTo(10,9,18,6,23,0);
  }
  c.closePath();
 }
 function texture(color='#6af4cd',model='courier'){
  const m=find(model),paint=/^#[0-9a-f]{6}$/i.test(color)?color:'#b5c8e3',key=m.id+paint;
  if(cache.has(key))return cache.get(key);
  const canvas=document.createElement('canvas');canvas.width=560;canvas.height=400;
  const c=canvas.getContext('2d');c.translate(280,200);c.scale(10,10);c.lineJoin='round';c.lineCap='round';
  // The complete outer shape is a single shell, including the engine shoulders.
  outline(c,m.id);const metal=c.createLinearGradient(0,-15,0,16);
  for(const [at,col]of [[0,'#fafbff'],[.3,'#e6eaf1'],[.49,'#bcc6d4'],[.53,'#d8e0ea'],[.83,'#7d8b9e'],[1,'#465268']])metal.addColorStop(at,col);
  c.fillStyle=metal;c.fill();c.strokeStyle='#d6dfed';c.lineWidth=.4;c.stroke();
  c.save();outline(c,m.id);c.clip();
  const light=c.createLinearGradient(-20,-12,18,10);light.addColorStop(0,'#ffffff36');light.addColorStop(.45,'#ffffff00');light.addColorStop(1,'#19243b30');c.fillStyle=light;c.fillRect(-28,-20,56,40);
  // Paint sits flush within the shell. Broad shapes remain readable at 1×.
  c.fillStyle=paint;c.globalAlpha=.87;c.beginPath();c.moveTo(-25,-11);c.bezierCurveTo(-10,-10,4,-7,19,0);c.bezierCurveTo(4,-4,-10,-6,-25,-5);c.closePath();c.fill();c.globalAlpha=.45;c.beginPath();c.moveTo(-25,10);c.bezierCurveTo(-9,8,6,5,19,0);c.bezierCurveTo(4,7,-10,12,-25,14);c.closePath();c.fill();c.globalAlpha=1;
  if(m.id==='atlas'){
   c.fillStyle='#8190a72a';c.beginPath();c.roundRect(-13,-6,14,12,2);c.fill();c.strokeStyle='#56657d55';c.lineWidth=.35;c.stroke();
   c.beginPath();c.moveTo(-6,-5);c.lineTo(-6,5);c.stroke();
  }else{
   c.strokeStyle='#44526b38';c.lineWidth=.3;c.beginPath();c.moveTo(-12,-4);c.quadraticCurveTo(-3,-3,1,-2);c.moveTo(-12,4);c.quadraticCurveTo(-3,3,1,2);c.stroke();
  }
  c.restore();
  // Flush, dark glass with a single soft highlight instead of separate parts.
  const [back,front,half]=m.cabin,glass=c.createLinearGradient(0,-half,0,half);glass.addColorStop(0,'#6c91b1');glass.addColorStop(.3,'#283f5b');glass.addColorStop(.65,'#101c30');glass.addColorStop(1,'#20324c');
  c.beginPath();c.moveTo(front,0);c.bezierCurveTo(front-3,-half,back+3,-half-1,back,-half*.75);c.quadraticCurveTo(back-2,0,back,half*.75);c.bezierCurveTo(back+3,half+1,front-3,half,front,0);c.closePath();c.fillStyle=glass;c.fill();c.strokeStyle='#e7f0ff88';c.lineWidth=.35;c.stroke();
  c.strokeStyle='#ddecff9c';c.lineWidth=.35;c.beginPath();c.moveTo(back+1,-half*.64);c.quadraticCurveTo(back+5,-half*.7,front-4,-half*.25);c.stroke();
  // Recessed exhaust ports share the hull's rear edge.
  for(const [x,y]of m.engines){c.fillStyle='#1a2232';c.beginPath();c.roundRect(x-1,y-1.5,4,3,1);c.fill();c.fillStyle=paint;c.globalAlpha=.9;c.beginPath();c.roundRect(x-.5,y-.85,.7,1.7,.3);c.fill();c.globalAlpha=1;}
  c.fillStyle='#26354d9c';c.font='500 1.6px ui-monospace,Consolas,monospace';c.textAlign='center';c.fillText(m.code.slice(-2),-6,-1);
  c.fillStyle='#f1f6ff';c.beginPath();c.ellipse(17,0,.7,.3,0,0,Math.PI*2);c.fill();
  if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(key,canvas);return canvas;
 }
 function draw(c,x,y,angle,color,scale=1,thrust=false,time=0,model='courier'){
  const m=find(model);c.save();c.translate(x,y);c.rotate(angle);c.scale(scale,scale);
  if(thrust)for(const [ex,ey]of m.engines){
   const length=12+Math.sin(time*5)*1.2,g=c.createLinearGradient(ex,ey,ex-length,ey);g.addColorStop(0,'#f0f6ff');g.addColorStop(.22,color);g.addColorStop(1,color+'00');
   c.fillStyle=g;c.beginPath();c.moveTo(ex,ey-1);c.quadraticCurveTo(ex-length*.5,ey-1.7,ex-length,ey);c.quadraticCurveTo(ex-length*.5,ey+1.7,ex,ey+1);c.closePath();c.fill();
  }
  c.drawImage(texture(color,m.id),-28,-20,56,40);c.restore();
 }
 draw.texture=texture;
 O.Fleet={MODELS,find,draw};
 if(typeof module!=='undefined'&&module.exports)module.exports=O.Fleet;
})(typeof globalThis!=='undefined'?globalThis:window);

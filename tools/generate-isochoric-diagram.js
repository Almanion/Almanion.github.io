#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const ink='#263747',blue='#176da3',teal='#087f80',purple='#8455a5';
const fmt=n=>Number(n).toFixed(3),esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=(x,y,s,cls='math',extra='')=>`<text x="${fmt(x)}" y="${fmt(y)}" class="${cls}" ${extra}>${esc(s).replace(/[₀₁₂₃]+/g,m=>'<tspan baseline-shift="sub" font-size="70%" font-style="normal">'+[...m].map(c=>'₀₁₂₃'.indexOf(c)).join('')+'</tspan>')}</text>`;
const line=(x1,y1,x2,y2,cls='',extra='')=>`<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" class="${cls}" ${extra}/>`;
const states=[{T:1,p:1,V:1},{T:2,p:2,V:1}],volumes=[1,2,3];
function axes(x,y,w,h,horizontal,vertical,id){return line(x,y,x+w,y,'axis',`id="${id}-axis-x"`)+line(x,y,x,y-h,'axis',`id="${id}-axis-y"`)+text(x+w-4,y+34,horizontal,'math','text-anchor="end"')+text(x-19,y-h+4,vertical,'math','text-anchor="end"')+text(x-17,y+29,'0','small','text-anchor="end"');}
const dot=(x,y,n,id)=>`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="5" fill="${blue}" id="${id}-state-${n}"/>`+text(x+12,y-13,n);
function render(){let b=text(28,36,'Изохорный процесс: V = const','heading');
 const pv={x:74,y:280,X:v=>74+118*v,Y:p=>280-60*p},vt={x:394,y:280,X:t=>394+78*t,Y:v=>280-90*v};
 b+=axes(pv.x,pv.y,215,155,'V','p','isochoric-pv')+axes(vt.x,vt.y,215,155,'T','V','isochoric-vt');
 const pv1=states.map(s=>[pv.X(s.V),pv.Y(s.p)]),vt1=states.map(s=>[vt.X(s.T),vt.Y(s.V)]);
 b+=line(...pv1[0],...pv1[1],'curve',`id="isochoric-pv-process"`)+line(...vt1[0],...vt1[1],'curve',`id="isochoric-vt-process"`);
 states.forEach((s,i)=>{b+=line(pv.x,pv.Y(s.p),pv.X(s.V),pv.Y(s.p),'guide')+text(pv.x-13,pv.Y(s.p)+7,'p'+['₁','₂'][i],'math','text-anchor="end"')+dot(...pv1[i],i+1,'isochoric-pv');b+=line(vt.X(s.T),vt.Y(s.V),vt.X(s.T),vt.y,'guide')+text(vt.X(s.T),vt.y+34,'T'+['₁','₂'][i],'math','text-anchor="middle"')+dot(...vt1[i],i+1,'isochoric-vt');});
 b+=line(pv.X(1),pv.Y(1),pv.X(1),pv.y,'guide')+text(pv.X(1),pv.y+34,'V₀','math','text-anchor="middle"');
 b+=line(vt.x,vt.Y(1),vt.X(1),vt.Y(1),'guide')+text(vt.x-13,vt.Y(1)+7,'V₀','math','text-anchor="end"');
 b+=text(28,369,'Давление пропорционально температуре','heading');
 const pt={x:80,y:690,X:t=>80+142*t,Y:p=>690-75*p};
 b+=axes(pt.x,pt.y,495,250,'T','p','isochoric-pt');
 // A dashed extrapolation reaches the origin; the solid segment shows the measured process.
 b+=line(pt.x,pt.y,pt.X(1),pt.Y(1),'guide',`style="stroke:${blue};stroke-width:3" id="isochoric-pt-origin"`)
  +line(pt.X(1),pt.Y(1),pt.X(2),pt.Y(2),'curve',`id="isochoric-pt-process"`)
  +text(407,484,'p / T = const');
 states.forEach((s,i)=>{b+=line(pt.x,pt.Y(s.p),pt.X(s.T),pt.Y(s.p),'guide')+line(pt.X(s.T),pt.Y(s.p),pt.X(s.T),pt.y,'guide')+text(pt.x-13,pt.Y(s.p)+7,'p'+['₁','₂'][i],'math','text-anchor="end"')+text(pt.X(s.T),pt.y+34,'T'+['₁','₂'][i],'math','text-anchor="middle"')+dot(pt.X(s.T),pt.Y(s.p),i+1,'isochoric-pt');});
 b+=text(28,801,'Семейство изохор','heading');
 const family={x:80,y:1107,X:t=>80+118*t,Y:p=>1107-55*p};
 b+=axes(family.x,family.y,495,250,'T','p','isochoric-family');
 // With the same amount of gas, p(T) has a slope proportional to 1/V.
 volumes.forEach((V,i)=>{const colour=[blue,teal,purple][i],start=[family.X(.45),family.Y(.45/V)],end=[family.X(4),family.Y(4/V)];b+=line(family.x,family.y,...start,'guide',`style="stroke:${colour};stroke-width:3"`)+line(...start,...end,'curve',`style="stroke:${colour}" id="isochore-${i+1}" data-volume="${V}"`)+text(end[0]+10,end[1]+7,'V'+['₁','₂','₃'][i],'math',`style="fill:${colour}"`);});
 b+=text(80,1190,'V₁ < V₂ < V₃');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 1225" role="img" aria-labelledby="title desc">
<title id="title">Графики изохорного процесса</title><desc id="desc">Объём постоянен: график p(V) вертикален, V(T) горизонтален. Давление прямо пропорционально абсолютной температуре, поэтому прямая p(T) проходит через начало координат. Состояния 1 и 2 одинаковы во всех трёх графиках. Для одной массы газа при V1 меньше V2 меньше V3 наиболее крутая изохора соответствует V1.</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1L7 4L1 7" fill="none" stroke="${ink}" stroke-width="1.7"/></marker></defs>
<style>text{font-family:Arial,Helvetica,sans-serif;font-size:24px;fill:${ink}}.heading{font-size:24px;font-weight:600}.small{font-size:21px}.math{font-family:Georgia,'Times New Roman',serif;font-size:27px;font-style:italic}.guide{stroke:#64748b;stroke-width:1.4;stroke-dasharray:6 6;fill:none}.axis{stroke:${ink};stroke-width:1.7;fill:none;marker-end:url(#arrow)}.curve{stroke:${blue};stroke-width:3.5;fill:none;stroke-linecap:round}</style>
<rect width="640" height="1225" rx="12" fill="#fff"/>${b}
</svg>\n`;}
if(require.main===module){fs.writeFileSync(path.join(__dirname,'../images/notes/physics-10/isochoric-coordinate-graphs.svg'),render());console.log('Generated isochoric graphs.');}
module.exports={render};

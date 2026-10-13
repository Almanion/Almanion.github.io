#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ink='#263747', blue='#176da3', teal='#087f80', purple='#8455a5', grey='#8291a2', orange='#b85032';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const fmt=n=>Number(n).toFixed(3);
const label=(x,y,s,cls='label',extra='')=>`<text x="${fmt(x)}" y="${fmt(y)}" class="${cls}" ${extra}>${esc(s).replace(/[₀₁₂₃₄₅₆₇₈₉]+/g,m=>'<tspan baseline-shift="sub" font-size="70%" font-style="normal">'+[...m].map(c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).join('')+'</tspan>')}</text>`;
const line=(x1,y1,x2,y2,cls='wall',extra='')=>`<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" class="${cls}" ${extra}/>`;
const rect=(x,y,w,h,fill,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const circle=(x,y,r,fill='none',extra='')=>`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${r}" fill="${fill}" ${extra}/>`;
const pth=(d,cls='wall',extra='')=>`<path d="${d}" class="${cls}" ${extra}/>`;
const number=(n,x,y,tx,ty)=>line(x+16,y,tx,ty,'leader')+circle(x,y,15,'#fff','stroke="#8291a2" stroke-width="1.3"')+label(x,y+7,n,'number','text-anchor="middle"');
const ellipse=(x,y,rx,ry,fill='none',extra='')=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const polar=(cx,cy,r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
function arc(cx,cy,r,a,b){const p=polar(cx,cy,r,a),q=polar(cx,cy,r,b);return `M${fmt(p[0])} ${fmt(p[1])} A${r} ${r} 0 ${Math.abs(b-a)>Math.PI?1:0} ${b>a?1:0} ${fmt(q[0])} ${fmt(q[1])}`;}
function svg(title,desc,height,body){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc>
<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L8 4.5 L1 8" fill="none" stroke="${ink}" stroke-width="1.7"/></marker></defs>
<style>text{font-family:Arial,Helvetica,sans-serif;fill:${ink}}.label{font-size:24px}.small{font-size:22px}.heading{font-size:26px;font-weight:600}.math{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:28px}.number{font-size:21px}.wall{fill:none;stroke:${ink};stroke-width:2.3;stroke-linejoin:round}.leader{fill:none;stroke:${grey};stroke-width:1.3}.guide{fill:none;stroke:${grey};stroke-width:1.3;stroke-dasharray:6 6}.axis{fill:none;stroke:${ink};stroke-width:1.7;marker-end:url(#arrow)}.beam{fill:none;stroke:${teal};stroke-width:2.5;stroke-dasharray:7 5}.rotation{fill:none;stroke:${ink};stroke-width:2;marker-end:url(#arrow)}</style>
<rect width="720" height="${height}" rx="12" fill="#fff"/>
${body}
</svg>\n`;}

function sternApparatus(){let b=label(28,38,'Опыт Штерна','heading');
 // Cutaway: two coaxial cylinders, central wire, and a glass bell.
 b+=pth('M135 549 V179 Q135 86 236 86 H331 V54 H292 M355 54 H374 V86 H484 Q585 86 585 179 V549 Q585 597 531 597 H389 M331 597 H189 Q135 597 135 549','wall');
 b+=rect(193,175,334,336,'#f6f8fb','stroke="#263747" stroke-width="2.3"');
 b+=ellipse(360,175,167,25,'#f6f8fb','stroke="#263747" stroke-width="2.3"');
 b+=line(195,495,525,495,'guide');
 // An open front sector makes the inner cylinder and its narrow axial slit visible.
 b+=rect(224,203,272,279,'#fff');
 b+=line(193,175,193,511)+line(527,175,527,511);
 b+=ellipse(360,245,77,22,'#e5f3fa','stroke="#263747" stroke-width="2.3"');
 b+=pth('M283 245 V434 Q360 477 437 434 V245','wall');
 b+=ellipse(360,434,77,22,'#e5f3fa','stroke="#263747" stroke-width="2.3"');
 b+=line(360,266,360,416,'wall',`stroke="${orange}" stroke-width="4"`);
 b+=rect(425,298,13,83,'#fff')+line(425,298,425,381)+line(438,298,438,381);
 b+=line(362,339,522,339,'beam');
 b+=rect(521,311,6,61,orange);
 b+=rect(345,457,30,141,'#edf2f7','stroke="#263747" stroke-width="2.3"');
 b+=rect(344,597,32,69,'#edf2f7','stroke="#263747" stroke-width="2.3"');
 b+=ellipse(360,637,22,8,'#fff','stroke="#263747" stroke-width="2.3"')+ellipse(360,652,22,8,'#fff','stroke="#263747" stroke-width="2.3"');
 b+=line(339,637,290,637)+line(339,652,290,652);
 b+=rect(325,676,70,46,'#e5ebf2','rx="7" stroke="#263747" stroke-width="2.3"');
 b+=line(360,666,360,676);
 b+=pth(arc(360,512,54,Math.PI*.95,Math.PI*.08),'rotation');
 b+=number('1',633,113,574,170)+number('2',82,218,284,246)+number('3',82,312,194,323)+number('4',82,387,360,347)+number('5',633,385,525,343)+number('6',435,710,396,700)+number('7',225,639,338,637);
 b+=label(360,778,'1 — стеклянный колпак','label','text-anchor="middle"');
 return svg('Опыт Штерна','Схематический разрез установки под стеклянным колпаком: внутри расположены два цилиндра с общей осью. Молекулы проходят через щель и оставляют след. Нумерация сохранена по тетради; заполненная подпись имеется только для номера 1.',812,b);
}

function sternRotation(){let b=label(28,38,'Опыт Штерна: вид сверху','heading');const cx=335,cy=294,R=205,r=92;
 b+=circle(cx,cy,R,'none','stroke="#263747" stroke-width="2.5"')+circle(cx,cy,r,'none','stroke="#263747" stroke-width="2.5"');
 b+=rect(cx+r-10,cy-13,23,26,'#fff')+line(cx+r-3,cy-14,cx+r+5,cy-14)+line(cx+r-3,cy+14,cx+r+5,cy+14);
 b+=circle(cx,cy,5,orange);
 b+=line(cx,cy,cx+R,cy,'guide');
 b+=line(cx,cy,...polar(cx,cy,R,.295),'guide');
 // A trace shifts opposite to rotation in the cylinder's coordinates.
 b+=pth(arc(cx,cy,R,.22,.37),'wall',`style="stroke:${orange};stroke-width:9"`);
 b+=pth(arc(cx,cy,65,0,.295),'wall')+label(cx+81,cy+45,'Δφ','math');
 b+=pth(arc(cx,cy,R+27,Math.PI*.97,Math.PI*.59),'rotation')+label(137,154,'ω','math');
 b+=line(cx,cy,cx-r,cy,'leader','marker-start="url(#arrow)" marker-end="url(#arrow)"')+label(cx-r/2,cy-14,'r','math','text-anchor="middle"');
 b+=line(cx,cy,cx,cy+R,'leader','marker-start="url(#arrow)" marker-end="url(#arrow)"')+label(cx-21,cy+R*.58,'R','math');
 b+=number('2',168,438,251,328)+number('3',563,475,481,438)+number('4',100,290,cx,cy)+number('5',606,352,...polar(cx,cy,R,.295));
 return svg('Угловое смещение следа в опыте Штерна','Вид сверху на два цилиндра радиусов r и R. Угловое смещение следа обозначено дельта фи; время пролёта равно (R-r)/v и дельта фи/омега.',565,b);
}

function lammert(){let b=label(28,38,'Опыт Ламмерта','heading');
 // The vacuum chamber contains the oven, collimator, two disks and target.
 b+=rect(36,94,584,382,'#fbfdff','rx="16" stroke="#263747" stroke-width="3.2"');
 b+=rect(104,173,86,116,'#f7eee9','rx="8" stroke="#263747" stroke-width="2.5"')+rect(190,221,24,18,'#fff','stroke="#263747" stroke-width="2"');
 b+=rect(248,172,9,48,ink)+rect(248,240,9,51,ink);
 // Disks are perpendicular to the beam and share one rotation shaft.
 for(const dx of [349,434]){
  b+=ellipse(dx,294,28,97,'#e5ebf2','stroke="#263747" stroke-width="2.3"');
  b+=rect(dx-3,197,6,85,'#fff')+line(dx-3,197,dx-3,277,'leader')+line(dx+3,197,dx+3,277,'leader');
  b+=ellipse(dx,294,7,12,'#fff','stroke="#263747" stroke-width="1.5"');
 }
 b+=line(325,294,654,294,'wall','stroke-width="5"');
 b+=rect(613,284,15,20,'#fff','stroke="#263747" stroke-width="2"');
 b+=rect(654,270,46,48,'#e5ebf2','rx="6" stroke="#263747" stroke-width="2.3"');
 b+=line(214,230,570,230,'beam');
 b+=rect(568,191,9,79,'#d6e9f4','stroke="#263747" stroke-width="2"')+rect(567,220,5,20,orange);
 b+=pth('M146 476 V524 H225 V544','wall');
 // A cold trap in the pumping line, outside the molecular beam path.
 b+=rect(178,600,137,60,'#e5f3fa');
 b+=pth('M216 540 V590 Q216 623 248 623 Q280 623 280 590 V543 H301 V608 Q301 644 248 644 Q195 644 195 608 V540','wall');
 b+=pth('M175 559 V663 H318 V559','wall');
 b+=pth('M301 550 H377 V612 H468','wall');
 b+=rect(468,574,113,78,'#e5ebf2','rx="8" stroke="#263747" stroke-width="2.3"');
 b+=circle(510,613,18,'#fff','stroke="#263747" stroke-width="2"');
 b+=number('1',86,76,139,94)+number('2',108,337,147,288)+number('3',234,142,251,174)+number('4',337,151,349,197)+number('5',435,151,434,197)+number('6',672,356,678,318)+number('7',131,598,181,610)+number('8',569,147,572,193)+number('9',609,612,581,612);
 b+=label(28,722,'Прорези дисков 4 и 5','heading');
 const ys=822;for(const dx of [220,489])b+=circle(dx,ys,64,'#e5ebf2','stroke="#263747" stroke-width="2.3"');
 b+=line(220,ys-15,220,ys-65,'wall','style="stroke:#fff;stroke-width:8"')+circle(220,ys,5,ink);
 const a=-Math.PI/2+.24,p=polar(489,ys,65,a);
 b+=line(...polar(489,ys,15,a),...p,'wall','style="stroke:#fff;stroke-width:8"')+circle(489,ys,5,ink);
 b+=line(489,ys,489,ys-76,'guide')+pth(arc(489,ys,40,-Math.PI/2,a),'wall');
 b+=label(520,780,'φ','math')+label(220,919,'4','math','text-anchor="middle"')+label(489,919,'5','math','text-anchor="middle"');
 return svg('Установка опыта Ламмерта','Толстостенный сосуд 1 содержит молекулярную печь 2, диафрагму 3, диски 4 и 5 с узкими прорезями и стеклянную мишень 8. Мотор 6 вращает диски на общем валу. Ловушка 7 находится в охлаждаемой части линии насоса 9. Внизу показан относительный поворот прорезей двух дисков.',952,b);
}

// Reduced speed units: m0/(2k) = 1. Each Maxwell curve has unit area.
function density(v,T){return 4/Math.sqrt(Math.PI)*v*v/T**1.5*Math.exp(-v*v/T);}
const temperatures=[1,2.5,5];
const speeds={probable:1,mean:2/Math.sqrt(Math.PI),rms:Math.sqrt(1.5)};
function sample(X,Y,T,max){return Array.from({length:1001},(_,i)=>{const v=max*i/1000;return `${i?'L':'M'}${fmt(X(v))} ${fmt(Y(density(v,T)))}`;}).join(' ');}
function axes(y,top){return line(83,y,651,y,'axis')+line(83,y,83,top,'axis')+label(654,y+34,'v','math')+label(66,y+30,'0','small','text-anchor="end"')+label(48,top-13,'f(v)','math');}
function maxwellTemperatures(){const X=v=>83+535*v/6,Y=f=>411-300*f;let b=label(28,38,'Распределение Максвелла','heading')+label(228,79,'T₁ < T₂ < T₃','math');
 b+=axes(411,124);
 temperatures.forEach((T,i)=>{const colour=[blue,teal,purple][i];b+=pth(sample(X,Y,T,6),'wall',`id="temperature-${i+1}" style="stroke:${colour};stroke-width:3.5"`);const v=Math.sqrt(T);b+=line(X(v),Y(density(v,T)),X(v),411,'guide');b+=circle(X(v),Y(density(v,T)),4,colour);b+=label(X(v)+15,Y(density(v,T))-12,['T₁','T₂','T₃'][i],'math');b+=label(X(v),457,['v₁','v₂','v₃'][i],'math','text-anchor="middle"');});
 b+=label(360,515,'v₁, v₂, v₃ — наиболее вероятные скорости','small','text-anchor="middle"');
 return svg('Распределение Максвелла при трёх температурах','При повышении температуры максимум нормированной кривой распределения смещается к большим скоростям, становится ниже, а кривая шире. Пунктиры отмечают наиболее вероятные скорости при T1, T2, T3.',549,b);
}
function maxwellSpeeds(){const X=v=>83+535*v/2.8,Y=f=>408-290*f;let b=label(28,38,'Характерные скорости','heading')+axes(408,103);
 b+=pth(sample(X,Y,1,2.8),'wall',`id="speed-density" style="stroke:${blue};stroke-width:3.5"`);
 const data=[['probable',1,218],['mean',2,309],['rms',3,396]];
 data.forEach(([key,n,lx])=>{const v=speeds[key],xv=X(v),yv=Y(density(v,1));b+=line(xv,yv,xv,429,'guide')+circle(xv,yv,4,blue)+line(xv,429,lx,456,'leader')+circle(lx,474,15,'#fff','stroke="#8291a2" stroke-width="1.3"')+label(lx,481,n,'number','text-anchor="middle"');});
 b+=label(62,545,'1 — наиболее вероятная скорость','small')+label(62,587,'2 — средняя арифметическая скорость','small')+label(62,629,'3 — средняя квадратичная скорость','small');
 return svg('Наиболее вероятная, средняя арифметическая и средняя квадратичная скорости','Максимум соответствует наиболее вероятной скорости. Средняя арифметическая скорость находится справа от неё, а средняя квадратичная скорость — ещё правее. Положение каждой скорости рассчитано по формулам из конспекта.',667,b);
}
const diagrams={
 'shtern-apparatus.svg':sternApparatus,
 'shtern-rotation.svg':sternRotation,
 'lammert-apparatus.svg':lammert,
 'maxwell-temperatures.svg':maxwellTemperatures,
 'maxwell-characteristic-speeds.svg':maxwellSpeeds
};
if(require.main===module){const target=path.join(__dirname,'../images/notes/physics-10');for(const [name,render] of Object.entries(diagrams))fs.writeFileSync(path.join(target,name),render());console.log('Generated five note diagrams.');}
module.exports={density,temperatures,speeds,diagrams};

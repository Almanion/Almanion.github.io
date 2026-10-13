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

function sternStyles() {
 return `<defs>
  <marker id="stern-arrow-teal" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${teal}"/></marker>
  <marker id="stern-arrow-purple" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${purple}"/></marker>
 </defs><style>
 .stern-wall{fill:none;stroke:${ink};stroke-width:3;stroke-linejoin:round}.stern-glass{fill:#edf7fc;fill-opacity:.6;stroke:#7fa8bf;stroke-width:3}
 .stern-leader{fill:none;stroke:${grey};stroke-width:1.5;stroke-linejoin:round}.stern-point{fill:${grey}}
 .stern-beam{fill:none;stroke:${teal};stroke-width:3;marker-end:url(#stern-arrow-teal)}
 .stern-dimension{fill:none;stroke:${purple};stroke-width:2;marker-start:url(#arrow);marker-end:url(#arrow)}
 .stern-turn{fill:none;stroke:${blue};stroke-width:3;marker-end:url(#arrow)}.stern-guide{fill:none;stroke:${grey};stroke-width:1.5;stroke-dasharray:6 6}
 .stern-caption{font-size:22px;fill:#526a7e}.stern-teal{fill:${teal}}.stern-purple{fill:${purple}}.stern-blue{fill:${blue}}
 </style>`;
}

function sternCallout(n,x,y,points) {
 const end=points[points.length-1];
 return `<polyline points="${points.map(p=>p.map(fmt).join(',')).join(' ')}" class="stern-leader"/>`
  +circle(end[0],end[1],3,grey)
  +circle(x,y,17,'#fff',`stroke="${blue}" stroke-width="1.5"`)
  +label(x,y+7,n,'number stern-blue','text-anchor="middle"');
}

function sternApparatus() {
 let b=sternStyles()+label(28,42,'Установка опыта Штерна','heading')
  +label(28,78,'Продольный разрез','stern-caption');
 // The transparent vacuum enclosure surrounds the coaxial cylinder assembly.
 b+=pth('M140 607V225Q140 135 235 135H485Q580 135 580 225V607Z','stern-glass');
 b+=pth('M235 135V110H156','stern-wall');
 b+=label(60,117,'к насосу','stern-caption');
 b+=label(480,207,'вакуум','stern-caption','text-anchor="middle"');
 b+=rect(173,607,374,12,'#d8e4ed','rx="3"');
 // In the axial section, the cylinder walls are vertical strips; their fronts are absent.
 b+=rect(190,248,8,288,'#dce6ee',`stroke="${ink}" stroke-width="2" id="stern-apparatus-outer-left"`)
  +rect(522,248,8,288,'#dce6ee',`stroke="${ink}" stroke-width="2" id="stern-apparatus-outer-right"`);
 b+=line(194,248,350,248,'stern-wall')+line(370,248,526,248,'stern-wall')
  +line(194,536,350,536,'stern-wall')+line(370,536,526,536,'stern-wall');
 b+=rect(286,280,8,214,'#dce6ee',`stroke="${ink}" stroke-width="2"`)
  +rect(426,280,8,51,'#dce6ee',`stroke="${ink}" stroke-width="2"`)
  +rect(426,405,8,89,'#dce6ee',`stroke="${ink}" stroke-width="2"`);
 b+=line(290,280,350,280,'stern-wall')+line(370,280,430,280,'stern-wall')
  +line(290,494,350,494,'stern-wall')+line(370,494,430,494,'stern-wall');
 b+=rect(419,332,22,72,'#c6e9e5',`opacity=".55" id="stern-apparatus-slit"`);
 // A heated wire on the common axis supplies the silver vapour.
 b+=line(360,223,360,298,'stern-wall')
  +line(360,298,360,472,'stern-wall',`style="stroke:${orange};stroke-width:4" id="stern-apparatus-wire"`)
  +line(360,472,360,536,'stern-wall');
 b+=line(365,367,514,367,'stern-beam','id="stern-apparatus-beam"');
 b+=label(469,353,'v','math stern-teal');
 b+=rect(514,345,7,49,orange,'rx="2" id="stern-apparatus-deposit"');
 // A hollow shaft and two electrical contacts are shown without invented motor details.
 b+=rect(348,536,24,179,'#e5ebf1',`stroke="${ink}" stroke-width="2" id="stern-apparatus-shaft"`)
  +rect(356,536,8,179,'#fff');
 b+=rect(342,648,36,13,'#cb997b',`stroke="${ink}" stroke-width="1.5" rx="2"`)
  +rect(342,676,36,13,'#cb997b',`stroke="${ink}" stroke-width="1.5" rx="2"`);
 b+=pth('M342 654H307V754M342 682H322V754','stern-wall');
 b+=label(315,782,'нагрев током','stern-caption','text-anchor="middle"');
 b+=sternCallout('1',645,157,[[628,157],[596,157],[570,180]])
  +sternCallout('2',84,294,[[101,294],[228,294],[290,314]])
  +sternCallout('3',84,414,[[101,414],[194,414]])
  +sternCallout('4',84,477,[[101,477],[235,477],[360,438]])
  +sternCallout('5',640,475,[[623,475],[550,475],[518,370]])
  +sternCallout('6',452,713,[[435,713],[372,705]])
  +sternCallout('7',84,665,[[101,665],[254,665],[342,655]])
  +sternCallout('8',640,302,[[623,302],[551,302],[430,365]]);
 return svg('Установка опыта Штерна: продольный разрез',
  'Стеклянный колпак 1 окружает внутренний цилиндр 2, внешний цилиндр 3 и нагреваемую платиновую нить с серебром 4. Через щель 8 летит пучок частиц, оставляющий полосу 5. Показаны полая ось 6, контактные кольца 7 и отвод к вакуумному насосу.',815,b);
}

function sternRotation() {
 let b=sternStyles()+label(28,42,'Определение скорости · вид сверху','heading')
  +label(28,78,'В момент попадания частицы на стенку','stern-caption');
 const cx=320,cy=340,R=200,r=85,phi=.45;
 const initialSlit=polar(cx,cy,r,0),currentSlit=polar(cx,cy,r,-phi);
 const A=polar(cx,cy,R,-phi),B=polar(cx,cy,R,0);
 b+=circle(cx,cy,R,'#fbfdff',`stroke="${ink}" stroke-width="3" id="stern-top-outer-cylinder"`);
 // The solid cylinder is shown at arrival: its physical slit has rotated counterclockwise.
 b+=pth(arc(cx,cy,r,-phi+.065,2*Math.PI-phi-.065),'stern-wall','id="stern-top-inner-cylinder"');
 b+=line(cx,cy,...A,'stern-guide','id="stern-top-reference-ray"')
  +line(cx,cy,...B,'stern-guide','id="stern-top-flight-ray"');
 b+=line(initialSlit[0],cy-14,initialSlit[0],cy+14,'stern-guide',
  `style="stroke-width:4;stroke-dasharray:4 4" id="stern-top-initial-slit"`);
 b+=circle(currentSlit[0],currentSlit[1],2,blue,'id="stern-top-current-slit"');
 b+=label(currentSlit[0]-5,currentSlit[1]-21,'S₁','math stern-blue','text-anchor="middle"');
 b+=label(initialSlit[0]+6,cy+56,'S₀','math','style="fill:#687e90"');
 b+=circle(cx,cy,5,orange,'id="stern-top-source"')+label(cx-24,cy+29,'O','math');
 // Only the free flight after crossing the old slit is drawn: it is straight in the lab.
 b+=line(initialSlit[0]+12,cy,B[0]-12,cy,'stern-beam','id="stern-top-free-flight"')
  +label(cx+139,cy+31,'v','math stern-teal');
 b+=circle(A[0],A[1],7,'#fff',`stroke="${blue}" stroke-width="3" id="stern-top-reference-mark"`)
  +label(A[0]+15,A[1]-13,'A','math stern-blue');
 b+=pth(arc(cx,cy,R,-.035,.035),'stern-wall',`style="stroke:${orange};stroke-width:9" id="stern-top-trace"`)
  +circle(B[0],B[1],5,orange,'id="stern-top-impact"')+label(B[0]+31,B[1]+18,'B','math',`style="fill:${orange}"`);
 b+=pth(arc(cx,cy,117,-phi,0),'stern-wall',`style="stroke:${purple};stroke-width:2" marker-end="url(#stern-arrow-purple)" id="stern-top-angle"`)
  +label(cx+137,cy-51,'Δφ','math stern-purple');
 b+=pth(arc(cx,cy,R+23,-phi,0),'stern-dimension','id="stern-top-shift"')
  +label(cx+252,cy-49,'s','math stern-purple');
 b+=line(cx,cy,cx-r,cy,'stern-dimension','id="stern-top-radius-r"')
  +label(cx-r/2,cy-16,'r','math stern-purple','text-anchor="middle"');
 b+=line(cx,cy,cx,cy+R,'stern-dimension','id="stern-top-radius-R"')
  +label(cx-26,cy+R*.61,'R','math stern-purple');
 b+=pth(arc(cx,cy,R+30,2.45,1),'stern-turn','id="stern-top-rotation"')
  +label(cx+37,cy+R+72,'ω','math stern-blue');
 b+=label(360,665,'След смещается против вращения','stern-caption','text-anchor="middle"');
 return svg('Опыт Штерна: прямолинейный пролёт и смещение следа',
  'Вид сверху в момент попадания частицы. S0 — положение щели при вылете, S1 — положение щели после поворота цилиндров. Частица летит прямо из S0 в B. Точка A, отмеченная при неподвижном приборе, поворачивается вместе с внешним цилиндром. Угол от A до B и дуга s направлены против вращения. Показаны радиусы r и R, скорость v, угловая скорость омега и угол дельта фи.',705,b);
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

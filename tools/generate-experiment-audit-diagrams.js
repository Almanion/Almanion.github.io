#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const ink='#263747',blue='#176da3',teal='#087f80',orange='#b85032',purple='#8455a5',grey='#8291a2';
const f=n=>Number(n).toFixed(3),esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=(x,y,s,cls='label',extra='')=>`<text x="${f(x)}" y="${f(y)}" class="${cls}" ${extra}>${esc(s).replace(/[₀₁₂₃]+/g,m=>'<tspan baseline-shift="sub" font-size="70%" font-style="normal">'+[...m].map(c=>'₀₁₂₃'.indexOf(c)).join('')+'</tspan>')}</text>`;
const line=(x1,y1,x2,y2,cls='',extra='')=>`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="${cls}" ${extra}/>`;
const rect=(x,y,w,h,fill,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const circle=(x,y,r,fill,extra='')=>`<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" ${extra}/>`;
const pathTag=(d,cls='',extra='')=>`<path d="${d}" class="${cls}" ${extra}/>`;
function svg(title,desc,height,body){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc>
<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1L7 4L1 7" fill="none" stroke="${ink}" stroke-width="1.5"/></marker><marker id="red-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="${orange}" stroke-width="2"/></marker></defs>
<style>text{font-family:Arial,Helvetica,sans-serif;fill:${ink}}.heading{font-size:26px;font-weight:600}.label{font-size:24px}.small{font-size:22px}.math{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:27px}.wall{fill:none;stroke:${ink};stroke-width:2.5;stroke-linejoin:round}.leader{fill:none;stroke:${grey};stroke-width:1.5}.guide{fill:none;stroke:${grey};stroke-width:1.5;stroke-dasharray:6 6}.axis{fill:none;stroke:${ink};stroke-width:1.8;marker-end:url(#arrow)}.dimension{fill:none;stroke:${purple};stroke-width:1.8;marker-start:url(#arrow);marker-end:url(#arrow)}.ray{fill:none;stroke:${orange};stroke-width:3;marker-end:url(#red-arrow)}.signal{fill:none;stroke:${blue};stroke-width:2;marker-end:url(#arrow)}.beam{fill:none;stroke:${teal};stroke-width:2.8;stroke-linejoin:round}</style>
<rect width="720" height="${height}" rx="12" fill="#fff"/>${body}
</svg>\n`;}

function electron(){let b=text(28,40,'Электронный микроскоп','heading');
 b+=rect(226,92,220,785,'#f5fbff',`rx="14" stroke="#7fa8bf" stroke-width="2.5"`)
  +line(335,143,335,821,'guide');
 // Beam envelopes pass the accelerating aperture, the specimen and all lens apertures.
 b+=pathTag('M335 160L325 200L295 270L315 360L280 440L335 550L290 650L270 820','beam','id="electron-left-ray"')
  +pathTag('M335 160L345 200L375 270L355 360L390 440L335 550L380 650L400 820','beam','id="electron-right-ray"');
 b+=pathTag('M307 111H363L351 136H319Z','wall',`style="fill:${blue}" id="electron-cathode"`)+circle(335,153,4,blue);
 b+=rect(247,197,68,7,ink)+rect(355,197,70,7,ink);
 for(const [name,cy]of [['condenser',270],['objective',440],['projector',650]]){
  b+=rect(207,cy-22,47,44,'#e2f2ef',`rx="8" stroke="${teal}" stroke-width="2.5" id="electron-${name}-left"`)
   +rect(416,cy-22,47,44,'#e2f2ef',`rx="8" stroke="${teal}" stroke-width="2.5" id="electron-${name}-right"`);
 }
 b+=rect(299,357,72,6,orange,'id="electron-specimen"')
  +rect(245,820,180,8,'#f4dfb6',`stroke="${ink}" stroke-width="2" id="electron-screen"`);
 const callout=(x,y,tx,ty)=>line(x,y,tx,ty,'leader');
 b+=callout(363,125,476,125)+text(490,143,'Катод','small')
  +callout(425,201,476,201)+text(490,209,'Анод','small')
  +callout(463,270,476,270)+text(490,273,'Конденсорная','small')+text(490,302,'линза','small')
  +callout(371,360,476,360)+text(490,369,'Образец','small')
  +callout(463,440,476,440)+text(490,444,'Объективная','small')+text(490,473,'линза','small')
  +callout(463,650,476,650)+text(490,654,'Проекционная','small')+text(490,683,'линза','small')
  +callout(425,824,476,824)+text(490,834,'Экран','small')
  +text(239,856,'Вакуум','small');
 b+=text(360,928,'Схема просвечивающего микроскопа','small','text-anchor="middle"');
 return svg('Схема электронного микроскопа','Катод и анод создают ускоренный пучок электронов в вакууме. Конденсорная линза освещает тонкий образец, расположенный перед объективной линзой. Объективная и проекционная линзы формируют изображение на экране. Зелёные линии условно показывают ход пучка.',955,b);
}

function afm(){let b=text(28,40,'Атомно-силовой микроскоп','heading');
 b+=rect(185,103,96,45,'#e2f2ef',`rx="8" stroke="${teal}" stroke-width="2.5" id="afm-photodiode"`)
  +line(233,105,233,146,'wall',`style="stroke:${teal};stroke-width:1.4"`)
  +text(233,87,'Фотодиод','small','text-anchor="middle"');
 b+=rect(530,94,98,54,'#e2f2ef',`rx="8" stroke="${teal}" stroke-width="2.5"`)
  +text(579,130,'Лазер','small','text-anchor="middle"');
 b+=rect(50,217,180,76,'#f4f8fc',`rx="9" stroke="#7fa8bf" stroke-width="2"`)
  +text(140,245,'Обратная','small','text-anchor="middle"')+text(140,275,'связь','small','text-anchor="middle"');
 b+=pathTag('M185 126H140V217','signal')+pathTag('M140 293V489H335','signal','id="afm-feedback-to-scanner"');
 b+=rect(245,287,19,76,'#dce6ee',`stroke="${ink}" stroke-width="2"`)
  +rect(264,310,160,12,'#dce6ee',`stroke="${ink}" stroke-width="2" id="afm-cantilever"`)
  +pathTag('M377 322H413L395 414Z','wall',`style="fill:${blue}" id="afm-probe"`);
 b+=pathTag('M250 426L300 415L335 425L375 410L415 420L460 413L500 430V465H250Z','wall','style="fill:#fdf3df;stroke:#cc9a35" id="afm-sample"')
  +rect(250,465,250,8,'#dce6ee')
  +rect(335,473,120,32,'#e2f2ef',`rx="5" stroke="${teal}" stroke-width="2" id="afm-scanner"`);
 // Reflection from a horizontal cantilever: one common hit point and equal angles.
 b+=line(395,218,395,308,'guide')+line(557,148,395,310,'ray','id="afm-incident-ray"')
  +line(395,310,233,148,'ray','id="afm-reflected-ray"')+circle(395,310,3,orange);
 b+=text(278,268,'Кантилевер','small')+line(327,276,350,310,'leader')
  +text(448,366,'Зонд','small')+line(439,356,405,345,'leader')
  +text(538,452,'Образец','small')+line(523,445,495,434,'leader')
  +text(395,537,'Пьезосканер','small','text-anchor="middle"');
 b+=text(360,596,'Сканер перемещает образец по сигналу фотодиода','small','text-anchor="middle"');
 return svg('Схема атомно-силового микроскопа','Лазерный луч падает на кантилевер и отражается из той же точки на фотодиод. Зонд взаимодействует с образцом. Сигнал фотодиода поступает в систему обратной связи, которая управляет пьезосканером под образцом.',620,b);
}

function film(){let b=text(28,40,'Оценка размера молекулы','heading')+text(28,87,'Мономолекулярная плёнка: вид сверху','label');
 b+=rect(70,137,580,252,'#e3f2fa',`rx="10" stroke="#7fa8bf" stroke-width="2.5"`);
 for(let y=158;y<378;y+=30)for(let x=90;x<635;x+=31){const dx=x-360,dy=y-263;if(Math.hypot(dx,dy)>108)b+=circle(x+(y%7),y,2.2,grey);}
 b+=circle(360,263,95,'#fdf3df',`stroke="#cc9a35" stroke-width="2.5" id="film-area"`)
  +text(360,257,'Масло','label','text-anchor="middle"')+text(360,295,'S','math','text-anchor="middle"');
 b+=text(76,426,'Тальк','small')+line(128,410,149,377,'leader');
 b+=text(28,481,'Увеличенный разрез одного слоя','label')
  +rect(70,567,580,80,'#e3f2fa',`stroke="#7fa8bf" stroke-width="1.5"`);
 for(let i=0;i<16;i++)b+=circle(102+34*i,550,17,'#fdf3df',`stroke="#cc9a35" stroke-width="1.8" id="film-molecule-${i}"`);
 b+=line(636,533,675,533,'guide')+line(650,567,675,567,'guide')
  +line(671,533,671,567,'dimension','id="film-thickness"')+text(682,558,'d','math')
  +text(94,621,'Вода','small')+text(360,686,'Толщина одного слоя: d = V / S','small','text-anchor="middle"');
 return svg('Мономолекулярная плёнка','На воде масляная плёнка отодвигает тальк; её площадь S измеряют по границе. Ниже показан увеличенный разрез одного слоя одинаковых молекул. Толщина слоя d равна отношению известного объёма масла V к площади S.',710,b);
}

function shell(){const cx=355,cy=326,r=180,R=196;let b=text(28,40,'Переход к модулю скорости','heading')+text(28,78,'Центральное сечение шарового слоя','small');
 b+=circle(cx,cy,R,'#e3f2fa',`stroke="${blue}" stroke-width="2.5" id="velocity-shell-outer"`)
  +circle(cx,cy,r,'#fff',`stroke="${blue}" stroke-width="2.5" id="velocity-shell-inner"`);
 b+=line(95,cy,640,cy,'axis')+line(cx,565,cx,105,'axis')
  +text(653,338,'vₓ','math')+text(cx-15,114,'vᵧ','math','text-anchor="end"')+text(cx-24,cy+31,'O','math');
 const inner=[cx+r*Math.cos(-.55),cy+r*Math.sin(-.55)],outer=[cx+R*Math.cos(-1.1),cy+R*Math.sin(-1.1)];
 b+=line(cx,cy,...inner,'axis',`style="stroke:${purple}" id="velocity-shell-radius-inner"`)+text(442,280,'v','math',`style="fill:${purple}"`)
  +line(cx,cy,...outer,'guide',`style="stroke:${purple}" id="velocity-shell-radius-outer"`)+text(outer[0]+17,outer[1]-10,'v + Δv','math',`style="fill:${purple}"`);
 b+=line(cx+r,cy,cx+r,365,'guide')+line(cx+R,cy,cx+R,365,'guide')
  +line(cx+r,365,cx+R,365,'dimension','id="velocity-shell-width"')
  +line(cx+R,365,567,393,'leader')+text(570,415,'Δv','math');
 b+=text(28,578,'Сечение в плоскости v_z = 0','small').replace('v_z','v<tspan baseline-shift="sub" font-size="70%">z</tspan>')+text(360,623,'Объём тонкого слоя: ΔV ≈ 4πv²Δv','small','text-anchor="middle"');
 return svg('Шаровой слой в пространстве скоростей','Центральное сечение трёхмерного шарового слоя в плоскости vz равно нулю. Внутренний радиус — v, внешний — v плюс дельта v. Все направления скоростей одного модуля входят в сферу. Показана ширина слоя дельта v; для подсчёта молекул используется объём всего трёхмерного слоя.',650,b);
}
const diagrams={'electron-microscope.svg':electron,'atomic-force-microscope.svg':afm,'monomolecular-film.svg':film,'velocity-space-shell.svg':shell};
if(require.main===module){for(const [name,render]of Object.entries(diagrams))fs.writeFileSync(path.join(__dirname,'../images/notes/physics-10',name),render());console.log('Generated four reviewed experiment diagrams.');}
module.exports={diagrams};

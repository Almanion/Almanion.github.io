/* Explanatory graphics, separate from the captured site. All numerical values
   use the pinned FSRS library and the fixed INITIAL / NOW in director.js. */
const forget='<math><mi>R</mi><mo>(</mo><mi>t</mi><mo>,</mo><mi>S</mi><mo>)</mo><mo>=</mo><msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo><mi>b</mi><mfrac><mi>t</mi><mi>S</mi></mfrac><mo>)</mo></mrow><mrow><mo>−</mo><mi>a</mi></mrow></msup></math>';
const interval='<math><mi>I</mi><mo>(</mo><mi>r</mi><mo>,</mo><mi>S</mi><mo>)</mo><mo>=</mo><mfrac><mi>S</mi><mi>b</mi></mfrac><mo>(</mo><msup><mi>r</mi><mrow><mo>−</mo><mn>1</mn><mo>/</mo><mi>a</mi></mrow></msup><mo>−</mo><mn>1</mn><mo>)</mo></math>';
function graph(t,newer=false,complete=false){
 const s=newer?GOOD.stability:10,x=t=>76+t/40*884,y=r=>267-(r-.75)/.25*207;
 const curve=(ss,end,color,dashed=false)=>{let d='';for(let k=0;k<=400;k++){const time=Math.min(k/10,end);d+=(k?'L':'M')+x(time).toFixed(3)+','+y(R(time,ss)).toFixed(3);if(time>=end)break}return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${dashed?2.5:4}" ${dashed?'stroke-dasharray="5 6"':''}/>`};
 const p=R(t,s),is90=Math.abs(p-.9)<.00001,node=$('graph'),key=step+':'+newer;
 if(!node.firstChild||node.dataset.curve!==key){node.dataset.curve=key;
 $('graph').innerHTML=`<text x="76" y="23" class="axislabel">Расчётная вероятность вспомнить, %</text>${[75,80,90,100].map(n=>`<line x1="76" x2="960" y1="${y(n/100)}" y2="${y(n/100)}"/><text x="59" y="${y(n/100)+6}" text-anchor="end">${n}</text>`).join('')}<path d="M76 52V267H960" fill="none" stroke="#7595b2"/>${[0,5,10,20,30,40].map(n=>`<text x="${x(n)}" y="294" text-anchor="middle">${n}</text>`).join('')}<text x="518" y="337" text-anchor="middle" class="axislabel">Дни после ${newer?'нового ':''}повторения</text>${newer?curve(10,40,'#647d9c',true):''}${curve(s,40,'#2b425d',true)}<defs><clipPath id="curve-reveal"><rect x="73" y="0" width="0" height="347"/></clipPath></defs><g clip-path="url(#curve-reveal)">${curve(s,40,'#91c8ff')}</g>${step>=22?`<path d="M76 ${y(.9)}H${x(s)}V267" stroke="#9fcdf4" stroke-width="1.6" stroke-dasharray="5 5" fill="none"/><text x="${x(s)+9}" y="${y(.9)+31}">${newer?'S′':'t = S'} = ${fmt(s,newer?2:0)}</text>`:''}<circle data-point cx="${x(t)}" cy="${y(p)}" r="6" fill="#c1e4ff" stroke="#274568" stroke-width="3"/><text data-label x="${Math.min(859,x(t)+17)}" y="${y(p)-17}" class="point-label">${is90?'90':fmt(p*100)}%</text>`;
 $('curve-clock').innerHTML='<span>t = <b></b> дней</span><strong></strong>';
 node._parts={clip:node.querySelector('#curve-reveal rect'),point:node.querySelector('[data-point]'),label:node.querySelector('[data-label]'),time:$('curve-clock').querySelector('b'),recall:$('curve-clock').querySelector('strong')};
 }
 const v=node._parts;
 node.setAttribute('aria-label',`Вероятность вспоминания: ${fmt(p*100)}%, прошло ${fmt(t)} дня. Устойчивость ${fmt(s)} дня.`);
 v.clip.setAttribute('width',x(complete?40:t)-73);v.point.setAttribute('cx',x(t));v.point.setAttribute('cy',y(p));
 v.label.setAttribute('x',Math.min(859,x(t)+17));v.label.setAttribute('y',y(p)-17);v.label.textContent=(is90?'90':fmt(p*100))+'%';
 v.time.textContent=fmt(t,t%1?1:0);v.recall.textContent='R = '+fmt(p*100)+'%';
}
function showExcerpt(key){
 const quote=FSRS_EXCERPTS[key],node=$('code');
 const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 node.dataset.excerpt=key;
 const label=document.createElement('span');label.className='code-source';label.textContent=`${quote.file} · ${quote.fn} · строки ${quote.startLine}${quote.endLine===quote.startLine?'':'–'+quote.endLine}`;
 const code=document.createElement('code');code.innerHTML=escape(quote.code).replace(/\b(const|if|return|new)\b|\b\d+(?:\.\d+)?\b/g,(word,keyword)=>`<span class="code-${keyword?'keyword':'number'}">${word}</span>`);
 node.replaceChildren(label,code);node.style.display='block';
}
function mathState(s){if(s>=35){mathState(learningBase(s));renderLearningDetails(s);return;}
 const wide=s>=19&&s<=27,panel=$('panel');panel.dataset.phase=s;panel.classList.toggle('model-wide',wide);$('connector').innerHTML='';
 const display=(id,on,kind='block')=>$(id).style.display=on?kind:'none';
 for(const id of ['source-block','formula','coeff','legend','params','graph','interval','code','alternative','scene-body','curve-clock','curve-key'])display(id,false);
 for(const id of ['graph','scene-body','code','interval','alternative','curve-clock','curve-key'])$(id).innerHTML='';delete $('code').dataset.excerpt;$('graph').setAttribute('aria-label','График вероятности вспоминания');display('insight',true);
 display('math-site-label',wide);$('math-site-label').textContent='';display('math-site-label',false);
 const heads={15:'Учить: путешествие к памяти',16:'Выбрать, что повторять',17:'Один блок — одна карточка',18:'Сначала вспомнить, затем оценить',19:'У каждой карточки своя история',20:'Почему мы забываем',21:'Через пять дней',22:'Что означает S = 10',23:'Когда назначить повторение',24:'Что происходит после «Хорошо»',25:'Что изменил уверенный ответ',26:'Новый ответ — новый отсчёт',27:'Если вспомнить не удалось'};
 $('panel-title').textContent=heads[s]||'';
 const contexts={15:'Войдём в туманности: от карточки из конспекта — к модели памяти и следующему повторению.',16:'Раздел и тип блока определяют, какие карточки попадут в занятие.',17:'Вопрос и ответ берутся из конспекта. Их не нужно вводить заново.',18:'Ученик сравнивает свой ответ с определением и сам выбирает оценку.',19:'Пример: термостат уже повторяли пять раз. Это изученная карточка, а не новая.',20:'FSRS‑6 оценивает шанс вспомнить одну карточку по времени после ответа.',21:'Без нового повторения вероятность снижается. Параметры S и D остаются прежними.',22:'Устойчивость — число дней, за которое расчётная вероятность снизится до 90%.',23:'В Almanion выбран целевой уровень 90%. Ищем время, когда кривая достигнет этого уровня.',24:'В планировщик поступают прежнее состояние, время ответа и оценка 3.',25:'FSRS‑6 вернул новое состояние. Almanion сохраняет его вместе с историей ответа.',26:'После ответа t снова равно нулю. Теперь карточка забывается медленнее.',27:'Альтернатива ответу «Хорошо»: после «Снова» Almanion добавляет короткие подтверждения.'};
 $('context').textContent=contexts[s]||'';
 const current=s<=17?0:s===18?1:s<=23?2:3;
 $('model-route').innerHTML=['Материал','Самооценка','Память','Повторение'].map((v,i)=>`<span class="${i===current?'current':i<current?'passed':''}">${v}</span>`).join('');
 panel.insertBefore($('model-route'),$('panel-title'));
 $('model-owner').textContent='Код Almanion · снимок f7f708a · FSRS‑6 — Open Spaced Repetition';
 $('formula').innerHTML=forget;display('formula',[20,21].includes(s));display('coeff',s===20);display('legend',s===20,'grid');
 $('legend').innerHTML='<span><b>t</b><strong>Время</strong>дни после последнего ответа</span><span><b>S</b><strong>Устойчивость</strong>время до вероятности 90%</span><span><b>R</b><strong>Вероятность</strong>расчётный шанс вспомнить</span>';
 display('params',[19,25].includes(s),'flex');$('sv').textContent=fmt(s>=25?GOOD.stability:10);$('dv').textContent=fmt(s>=25?GOOD.difficulty:5);$('tv').textContent=s>=25?'0':'10';
 $('params').children[0].firstChild.textContent=s>=25?'Новое S, дни':'Устойчивость S, дни';$('params').children[1].firstChild.textContent=s>=25?'Новое D (шкала 1–10)':'Трудность D (1–10)';$('params').children[2].firstChild.textContent=s>=25?'Отсчёт t, дни':'Прошло дней t';
 const bodies={
 15:'<div id="nebula-map" aria-label="Первые остановки: выбор материала, карточка, её история"><span>01 · Выбор материала</span><span>02 · Карточка</span><span>03 · Её история</span></div>',
 16:'<div class="selection-explainer"><small>РАЗДЕЛ</small><h3>1.6 · Температура и уравнение состояния</h3><small>ТИП БЛОКА</small><h3>Определения · 4 карточки</h3><p>Код находит в теме блоки выбранного типа.<br>Для примера возьмём «Термостат».</p></div>',
 17:'<div class="extraction"><div><span>Заголовок блока</span><b>Термостат</b><em>→ вопрос</em></div><div><span>Содержимое блока</span><b>Определение устройства</b><em>→ ответ</em></div></div>',
 18:'<div class="rating-guide"><div><b>1 · Снова</b><span>Не вспомнил</span></div><div><b>2 · Трудно</b><span>Вспомнил с усилием</span></div><div><b>3 · Хорошо</b><span>Вспомнил уверенно</span></div><div><b>4 · Легко</b><span>Вспомнил без усилий</span></div></div>',
 19:'<div class="time-bridge"><div><small>ПОСЛЕДНИЙ ОТВЕТ</small><b>2 октября</b></div><span>10 дней →</span><div><small>ТЕКУЩИЙ ОТВЕТ</small><b>12 октября</b></div></div>',
 22:'<div class="model-equation"><math><mi>R</mi><mo>(</mo><mi>S</mi><mo>,</mo><mi>S</mi><mo>)</mo><mo>=</mo><mn>0,9</mn></math><span>В нашем примере: t = S = 10 дней</span></div>',
 24:'<div class="input-row"><span>Состояние<b>S = 10 · D = 5</b></span><span>Время<b>12 октября</b></span><span>Оценка G<b>3 · Хорошо</b></span></div><div class="handoff"><span>Код Almanion</span><i>→</i><strong>FSRS‑6</strong><i>→</i><span>Новый срок</span></div><p class="body-note">Фрагмент реального вызова: <b>G</b> — выбранная оценка, <b>now</b> — время ответа.</p>',
 25:'<div class="change-labels"><span>S: 10 → 32,03 дня</span><span>D: 5 → 4,99</span></div><p class="body-note"><b>S выросло:</b> до уровня 90% теперь пройдёт больше времени.<br><b>D почти не изменилось:</b> один ответ не переписывает всю историю.</p>',
 26:'<div class="schedule-result"><strong>32 <span>дня</span></strong><div><b>12 октября → 13 ноября</b><span>Назначенный срок в этом примере</span></div></div>',
 27:'<div class="confirmation-path"><div><b>2</b><span>«Хорошо» →</span><b>1</b><span>«Хорошо» →</span><b>0</b></div><p>Пока счётчик больше нуля, карточка возвращается в очередь примерно через минуту.</p></div>'
 };
 if(bodies[s]){display('scene-body',true);$('scene-body').innerHTML=bodies[s]}
 if([21,22,26].includes(s)){display('graph',true);display('curve-clock',true,'flex');graph(s===21?5:s===22?10:GOOD.stability,s===26,s===26);if(s===26){display('curve-key',true,'flex');$('curve-key').innerHTML='<span class="old">До ответа · S = 10 дней</span><span>После ответа · S′ ≈ 32,03 дня</span>'}}
 if(s===23){display('interval',true);$('interval').innerHTML='<div class="interval-question">Условие выбора срока: <b>R(I, S) = 0,90</b></div><div class="interval-formula">'+interval+'</div><div class="interval-solve"><span>При r = 0,90</span><i>→</i><strong>I = S</strong></div><div class="interval-example">Для S = 10: повторение <b>через 10 дней</b></div><small>Непрерывная модель до округления и правил расписания</small>'}
 if(s===27){display('alternative',true,'grid');$('alternative').innerHTML='<div><b>1 · Снова</b><span>Нужны 2 уверенных ответа</span></div><div><b>2 · Трудно</b><span>Нужен 1 уверенный ответ</span></div>'}
 const excerpts={16:'selection',17:'extraction',18:'rating',19:'state',23:'retention',24:'schedule',25:'save',27:'confirmations'};
 if(excerpts[s])showExcerpt(excerpts[s]);
 const messages={15:'Мой код отвечает за материал и занятие, библиотека — за расчёт памяти.',16:'Список формируется из структуры реального конспекта.',17:'answerHTML() готовит ответ, sourceIdFor() связывает карточку с исходным блоком.',18:'До раскрытия ответа код не принимает оценку. Интервалы на кнопках — прогнозы.',19:'S и D хранят состояние памяти именно этой карточки. Даты примера фиксированы.',20:'R — прогноз модели, а не измерение знаний и не процент освоения предмета.',21:'При S = 10 через 5 дней: R ≈ 94,03%. Это прогноз для заданного примера.',22:'90% — вероятностный ориентир. Это не обещание, что ответ будет вспомнен.',23:'В настройках планировщика эта константа передаётся как request_retention.',24:'Тем же расчётом код заранее получает интервалы для всех четырёх кнопок.',25:'Сохраняются новое состояние карточки и текущая сессия занятия.',26:'Кривые сравниваются от своего t = 0. Срок в 32 дня учитывает правила библиотеки.',27:'При коротком подтверждении S и D сохраняются; новый расчёт FSRS не запускается.'};
 $('insight').textContent=messages[s]||'';
 // Keep the slide's main evidence, rather than repeat it below the code.
 if([15,16,18,19,23,25,27].includes(s))display('insight',false);
 if(s===20)$('insight').textContent='R — прогноз для одной карточки, а не оценка знаний по предмету.';
 if(s===27){$('context').textContent='После «Снова» нужны два уверенных ответа в этой сессии.';document.querySelector('.confirmation-path p').textContent='Подтверждения — через минуту; S и D сохраняются без нового вызова FSRS.';}
 // Keep one reading order after repeated direct jumps, backward navigation and replay.
 for(const id of ['source-block','formula','coeff','legend','params','curve-key','curve-clock','graph','interval','alternative','scene-body','code','insight','model-owner'])panel.appendChild($(id));
}
async function animateMathScene(s){
 if(reduced||s<15||s>27)return;
 if(s===20){const parts=[...$('legend').children];parts.forEach(n=>n.style.opacity=0);await $('formula').animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:360,easing:'ease-out'}).finished;for(let i=0;i<3;i++){const symbols=[...$('formula').querySelectorAll('mi')].filter(n=>n.textContent===['t','S','R'][i]);symbols.forEach(n=>n.classList.add('math-emphasis'));parts[i].style.opacity='';await parts[i].animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:230,easing:'ease-out'}).finished;symbols.forEach(n=>n.classList.remove('math-emphasis'));}return;}
 if(s===23){await Promise.all([...$('interval').children].map((n,i)=>n.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:450,delay:i*120,fill:'backwards',easing:'ease-out'}).finished));return;}
 const ids=({15:['scene-body'],16:['scene-body'],17:['source-block','scene-body'],18:['scene-body'],19:['params','scene-body'],20:['formula','legend'],21:[],22:['scene-body'],23:['interval'],24:['scene-body','code'],25:['scene-body'],26:[],27:['alternative','scene-body']})[s];
 await Promise.all(ids.map((id,i)=>$(id).animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'none'}],{duration:520,delay:i*100,easing:'cubic-bezier(.22,.7,.2,1)'}).finished));
}

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
function mathState(s){
 const wide=s>=19&&s<=27,panel=$('panel');panel.dataset.phase=s;panel.classList.toggle('model-wide',wide);$('connector').innerHTML='';
 const display=(id,on,kind='block')=>$(id).style.display=on?kind:'none';
 for(const id of ['source-block','formula','coeff','legend','params','graph','interval','code','alternative','scene-body','curve-clock','curve-key'])display(id,false);
 for(const id of ['graph','scene-body','code','interval','alternative','curve-clock','curve-key'])$(id).innerHTML='';$('graph').setAttribute('aria-label','График вероятности вспоминания');$('insight').style.display='block';
 $('math-site-label').style.display=wide?'block':'none';$('math-site-label').textContent=s>=25?'Карточка · разбор выбранного ответа':'Карточка · самооценка ученика';
 const heads={15:'От конспекта — к повторению',16:'Что станет карточкой',17:'Источник вопроса и ответа',18:'Оценку выбирает ученик',19:'Что модель знает о карточке',20:'Как время связано с памятью',21:'Проходит пять дней',22:'Что означает устойчивость S',23:'Как выбрать время повторения',24:'«Хорошо» → расчёт FSRS‑6',25:'Ответ обновляет состояние',26:'Повторение — новая точка отсчёта',27:'Если ответ не вспомнился'};
 $('panel-title').textContent=heads[s]||'';
 const contexts={19:'Учебный пример · уже изученная карточка · Review',20:'Модель для одной карточки в состоянии Review',21:'Поясняющая кривая · исходное S = 10 дней',22:'Определение S в модели FSRS‑6',23:'Целевой уровень в Almanion: r = 0,90',24:'Тот же Review · S = 10 · D = 5 · t = 10',25:'Результат настоящей библиотеки для нашего примера',26:'Сравниваем два состояния одной модели',27:'Отдельный пример · ветка подтверждений Almanion'};
 $('context').textContent=contexts[s]||'Пояснение для защиты · отдельно от интерфейса сайта';
 const current=s<=17?0:s===18?1:s<=23?2:3;
 $('model-route').innerHTML=['Материал','Самооценка','Модель памяти','Расписание'].map((v,i)=>`<span class="${i===current?'current':i<current?'passed':''}"><i>${i+1}</i>${v}</span>`).join('');
 $('model-owner').innerHTML=s<19?'Almanion · работа с содержанием и интерфейс':s===27?'Almanion · очередь и дополнительные подтверждения':'FSRS‑6 · библиотека Open Spaced Repetition';
 $('formula').innerHTML=forget;display('formula',[20,21].includes(s));display('coeff',s===20);display('legend',s===20,'grid');
 $('legend').innerHTML='<span><b>t</b><strong>Сколько прошло</strong>дней после повторения</span><span><b>S</b><strong>Как долго помним</strong>время до уровня 90%</span><span><b>R</b><strong>Шанс вспомнить</strong>от 0 до 1, или в процентах</span>';
 display('params',[19,25].includes(s),'flex');$('sv').textContent=fmt(s>=25?GOOD.stability:10);$('dv').textContent=fmt(s>=25?GOOD.difficulty:5);$('tv').textContent=s>=25?'0':'10';
 $('params').children[0].firstChild.textContent=s>=25?'Новое S, дни':'Устойчивость S, дни';$('params').children[1].firstChild.textContent=s>=25?'Новая трудность D':'Трудность D';$('params').children[2].firstChild.textContent=s>=25?'Новый отсчёт t':'Прошло дней t';
 const bodies={
 15:'<div class="story-chain"><div><i>01</i><section><b>Взять смысловой блок</b><p>Определение, формулу или вывод</p></section></div><div><i>02</i><section><b>Проверить себя</b><p>Вспомнить, открыть ответ, оценить</p></section></div><div><i>03</i><section><b>Назначить повторение</b><p>С учётом состояния и истории карточки</p></section></div></div>',
 16:'<div class="selection-explainer"><small>РАЗДЕЛ</small><h3>1.6 · Температура и уравнение состояния</h3><small>ТИП МАТЕРИАЛА</small><h3>Определения</h3><p>В этом разделе — четыре определения.<br>Покажем одну карточку: «Термостат».</p></div>',
 17:'<div class="extraction"><small>extractTopicCards() · Almanion</small><div><span>Термин</span><b>Термостат</b><em>→ вопрос</em></div><div><span>Содержимое блока</span><b>Определение устройства</b><em>→ ответ</em></div></div>',
 18:'<div class="rating-guide"><div><b>Снова</b><span>Не вспомнил</span></div><div><b>Трудно</b><span>Вспомнил с усилием</span></div><div><b>Хорошо</b><span>Вспомнил уверенно</span></div><div><b>Легко</b><span>Вспомнил без усилий</span></div></div><p class="body-note">Интервалы на кнопках — прогноз для каждого варианта оценки.</p>',
 19:'<div class="time-bridge"><div><small>ПОСЛЕДНЕЕ ПОВТОРЕНИЕ</small><b>2 октября</b></div><span>10 дней →</span><div><small>МОМЕНТ ОТВЕТА</small><b>12 октября</b></div></div><p class="body-note">Карточка уже повторялась <b>5 раз</b>.<br><b>S</b> и <b>D</b> — параметры её состояния, накопленного по ответам.</p>',
 20:'<p class="body-note">Трудность <b>D</b> понадобится при обновлении состояния после ответа.</p>',
 22:'<div class="model-equation"><math><mi>R</mi><mo>(</mo><mi>S</mi><mo>,</mo><mi>S</mi><mo>)</mo><mo>=</mo><mn>0,9</mn></math><span>Здесь S = 10 дней</span></div>',
 24:'<div class="input-row"><span>Состояние<br><b>S, D, история</b></span><span>Время<br><b>12 октября</b></span><span>Оценка<br><b>3 · Хорошо</b></span></div><div class="handoff"><span>Almanion</span><i>→</i><strong>FSRS‑6</strong><i>→</i><span>Новое состояние</span></div>',
 25:'<div class="change-labels"><span>S: 10 → 32,03 дня</span><span>D: 5 → 4,99</span></div><div class="implementation-flow"><small>КОД ALMANION</small><div><code>sessionTransition()</code><span>История ответа и очередь</span></div><div><code>persistState()</code><span>Сохранение состояния карточки</span></div><div><code>persistSession()</code><span>Сохранение текущей сессии</span></div></div>',
 26:'<div class="schedule-result"><strong>32 <span>дня</span></strong><div><b>12 октября → 13 ноября</b><span>На кнопке сайта: «1 мес»</span></div></div>',
 27:'<div class="confirmation-path"><small>ПОСЛЕ «СНОВА» · ПРИМЕР ПОДТВЕРЖДЕНИЙ</small><div><b>2</b><span>«Хорошо» →</span><b>1</b><span>«Хорошо» →</span><b>0</b></div><p>«Хорошо» и «Легко» уменьшают счётчик на 1.<br>Пока он больше нуля, карточка возвращается в очередь.</p></div>'
 };
 if(bodies[s]){display('scene-body',true);$('scene-body').innerHTML=bodies[s]}
 display('source-block',s===17);
 if([21,22,26].includes(s)){display('graph',true);display('curve-clock',true,'flex');graph(s===21?5:s===22?10:GOOD.stability,s===26,s===26);if(s===26){display('curve-key',true,'flex');$('curve-key').innerHTML='<span class="old">Прежнее S = 10 дней</span><span>Новое S′ ≈ 32,03 дня</span>'}}
 if(s===23){display('interval',true);$('interval').innerHTML='<div class="interval-question">Ищем I, при котором <b>R(I, S) = r</b></div><div class="interval-formula">'+interval+'</div><div class="interval-solve"><span>r = 0,90</span><i>→</i><strong>I = S</strong></div><div class="interval-example">При S = 10 дней: <b>I = 10 дней</b></div><small>До округления и корректировок расписания</small>'}
 if(s===24){display('code',true);$('code').innerHTML='<span class="code-comment">// projectBase() · фрагмент вызова</span>\nscheduler.next(\n  toFsrsCard(state, now),\n  new Date(now), <b>3</b>\n).card';}
 if(s===27){display('alternative',true);$('alternative').innerHTML='<div><b>Снова</b><span>Нужны <strong>2</strong> уверенных ответа</span></div><div><b>Трудно</b><span>Нужен <strong>1</strong> уверенный ответ</span></div>';}
 const messages={15:'Мой код связывает учебный материал с планировщиком повторений.',16:'Выбираем содержание, с которым хотим работать.',17:'Вопрос и ответ уже есть в конспекте — программа выделяет их из блока.',18:'Программа принимает самооценку; смысл ответа оценивает сам ученик.',19:'Этот пример задан для объяснения алгоритма. Время ответа зафиксировано.',20:'R — вероятность вспомнить одну карточку, а не процент освоения предмета.',21:'При S = 10 дней через 5 дней: R ≈ 94,03%.',22:'S — время снижения вероятности вспоминания до 90%.',23:'Порог 90% превращает модель памяти в правило выбора интервала.',24:'Та же функция заранее рассчитывает прогнозы на четырёх кнопках.',25:'Уверенный ответ увеличил устойчивость. Трудность изменилась лишь немного.',26:'Обе кривые отсчитываются от t = 0. Новая достигает 90% позже.',27:'Короткое подтверждение сохраняет S и D: FSRS не вызывается заново.'};
 $('insight').textContent=messages[s]||'';panel.insertBefore($('scene-body'),s===24?$('code'):$('insight'));if(s===27)display('alternative',true,'grid');
}
async function animateMathScene(s){
 if(reduced||s<15||s>27)return;
 if(s===20){const parts=[...$('legend').children];parts.forEach(n=>n.style.opacity=0);await $('formula').animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:360,easing:'ease-out'}).finished;for(let i=0;i<3;i++){const symbols=[...$('formula').querySelectorAll('mi')].filter(n=>n.textContent===['t','S','R'][i]);symbols.forEach(n=>n.classList.add('math-emphasis'));parts[i].style.opacity='';await parts[i].animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:230,easing:'ease-out'}).finished;symbols.forEach(n=>n.classList.remove('math-emphasis'));}return;}
 if(s===23){await Promise.all([...$('interval').children].map((n,i)=>n.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:450,delay:i*120,fill:'backwards',easing:'ease-out'}).finished));return;}
 const ids=({15:['scene-body'],16:['scene-body'],17:['source-block','scene-body'],18:['scene-body'],19:['params','scene-body'],20:['formula','legend'],21:[],22:['scene-body'],23:['interval'],24:['scene-body','code'],25:['scene-body'],26:[],27:['alternative','scene-body']})[s];
 await Promise.all(ids.map((id,i)=>$(id).animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'none'}],{duration:520,delay:i*100,easing:'cubic-bezier(.22,.7,.2,1)'}).finished));
}

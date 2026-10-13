/* Stable scene IDs keep the verified FSRS scenes intact; route order is explicit.
   Account forms are captured from real account.js. The defense never runs Auth. */
const SCENE_ORDER=[0,33,1,2,3,4,5,6,7,8,9,30,31,32,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29];
const sceneIndex=s=>SCENE_ORDER.indexOf(s),adjacentScene=(s,delta)=>SCENE_ORDER[Math.max(0,Math.min(SCENE_ORDER.length-1,sceneIndex(s)+delta))];
const isAccountScene=s=>s>=30&&s<=32;
const AccountScene=(()=>{
 const email=ACCOUNT_EXAMPLE.email,password='DemoOnly42',initialButtons=new Map();
 const accountPose={x:74,y:78,w:964,h:886,z:1.45,tx:0,ty:0,panel:0},width=1024,height=(886-42)/1.45;
 accountPose.tx=accountPose.w/2-width*accountPose.z/2;
 function init(){
  const pane=document.createElement('aside');pane.id='account-story';pane.setAttribute('aria-label','Пояснение регистрации и синхронизации');$('stage').appendChild(pane);
  const label=document.createElement('div');label.id='account-site-label';label.textContent='Интерфейс Almanion · учебный профиль';$('stage').appendChild(label);
  for(const f of Object.values(frames)){
   const d=f.contentDocument,b=d.getElementById('accountBtn');initialButtons.set(d,b.outerHTML);
   let ov=d.getElementById('accountOverlay');if(!ov){ov=d.createElement('div');ov.id='accountOverlay';ov.className='auth-overlay hidden';d.body.appendChild(ov)}
  }
 }
 function signed(s){return s===32||(s>=10&&s<=29)}
 function reset(s){
  for(const f of Object.values(frames)){
   const d=f.contentDocument,btn=d.getElementById('accountBtn');btn.outerHTML=initialButtons.get(d);
   const b=d.getElementById('accountBtn');if(signed(s)){b.classList.add('signed-in');b.innerHTML='<span class="account-avatar">S</span>';b.title=email;b.setAttribute('aria-label','Аккаунт: '+email)}
   const customize=d.getElementById('homeQuickCustomize');if(customize)customize.hidden=!signed(s);
   const ov=d.getElementById('accountOverlay');ov.innerHTML='';ov.hidden=true;ov.classList.add('hidden');ov.setAttribute('aria-hidden','true');
  }
  $('account-story').style.visibility=isAccountScene(s)?'visible':'hidden';$('account-story').style.opacity=isAccountScene(s)?'1':'0';$('account-story').style.transform='';
  $('account-site-label').style.visibility=isAccountScene(s)?'visible':'hidden';
  if(isAccountScene(s)){form(s===30?'login':s===31?'register':'signedIn');if(s===31)fill();story(s)}else $('account-story').replaceChildren();
 }
 function form(mode){const ov=find('#accountOverlay');ov.innerHTML=ACCOUNT_EXAMPLE[mode];ov.hidden=false;ov.classList.remove('hidden');ov.setAttribute('aria-hidden','false');}
 function fill(){find('#accEmail').value=email;find('#accPass').value=password;find('#accPassConfirm').value=password;}
 function network(){return `<svg id="account-network" viewBox="0 0 740 265" role="img" aria-label="Компьютер, личный аккаунт, другое устройство"><path class="network-line" d="M153 104C225 104 259 95 322 95M418 95C483 95 511 104 583 104"/><g data-node="computer"><rect class="network-surface" x="41" y="61" width="112" height="80" rx="10"/><path d="M26 151h142M78 141v10m38-10v10" stroke="#7699bd" stroke-width="3"/><path d="M60 84h58M60 98h37M60 112h47" stroke="#709ccb" stroke-width="3"/><text x="98" y="190" text-anchor="middle">Компьютер</text></g><g data-node="account"><circle class="network-surface" cx="370" cy="95" r="48"/><circle cx="370" cy="82" r="12" fill="none" stroke="#c7e4ff" stroke-width="2"/><path d="M348 118v-7q0-13 22-13t22 13v7" fill="none" stroke="#c7e4ff" stroke-width="2"/><text x="370" y="190" text-anchor="middle">Один аккаунт</text></g><g data-node="phone"><rect class="network-surface" x="583" y="42" width="67" height="114" rx="13"/><path d="M604 52h25M609 144h17M595 76h35M595 92h27M595 108h33" stroke="#709ccb" stroke-width="2.5"/><text x="617" y="190" text-anchor="middle">Другое устройство</text></g><circle data-transfer class="network-point" cx="153" cy="104" r="4" opacity="0"/><text x="370" y="240" text-anchor="middle" style="font-size:17px;fill:#8da6c4">После входа в тот же аккаунт · при подключении к сети</text></svg>`}
 function story(s){
  const panel=$('account-story');panel.dataset.phase=s;
  const route='<div class="account-route">'+['Войти','Создать','Продолжить'].map((x,i)=>(i?'<i></i>':'')+(i===s-30?'<b>'+x+'</b>':'<span>'+x+'</span>')).join('')+'</div>';
  const content=s===30?'<h2>Сайт становится<br>личным</h2><p class="account-lead">Конспекты можно читать сразу.<br>Аккаунт связывает вашу работу<br>на разных устройствах.</p><div class="account-benefit"><span>01</span><div><strong>Через Google</strong><p>Один из способов входа на сайте</p></div></div><div class="account-benefit"><span>02</span><div><strong>Почта и пароль</strong><p>Покажем создание нового аккаунта</p></div></div>':s===31?'<h2>Одна форма.<br>Свой аккаунт.</h2><p class="account-lead">Почта, пароль и его повтор.<br>Форма проверяет, что пароли совпадают.</p><div class="account-focus-line"></div><div class="account-benefit"><span>→</span><div><strong>Следующее действие</strong><p>Нажать «Зарегистрироваться»</p></div></div><p class="account-foot">На экране — вымышленные данные.<br>Это локальная демонстрация интерфейса.</p>':'<h2>Продолжить<br>на другом устройстве</h2><p class="account-lead">Личный аккаунт связывает:</p>'+network()+'<div class="account-benefit"><span>01</span><div><strong>Настройки сайта</strong><p>В том числе оформление и быстрый доступ</p></div></div><div class="account-benefit"><span>02</span><div><strong>Прогресс повторений</strong><p>Состояние карточек и историю ответов</p></div></div>';
  panel.innerHTML='<div class="account-eyebrow">АККАУНТ · ПОЯСНЕНИЕ ДЛЯ ЗАЩИТЫ</div>'+route+content;
 }
 async function arrange(animate){
  const f=frames.physics,from={w:parseFloat(f.style.width)||1440,h:parseFloat(f.style.height)||810},ms=animate?720:0;
  await Promise.all([movePose(accountPose,ms),tween(ms,t=>{f.style.width=(from.w+(width-from.w)*t)+'px';f.style.height=(from.h+(height-from.h)*t)+'px';$('camera').style.width=f.style.width})]);
 }
 async function park(s){const r=box('#accountOverlay .auth-modal');await OpeningGuidance.glide({x:r.x+r.w+36,y:s===31?box('#accSubmit').y+20:r.y+Math.min(110,r.h*.36)},360,-18);}
 async function explain(s){const pane=$('account-story');await tween(120,t=>{pane.style.opacity=1-t;pane.style.transform=`translateY(${-8*t}px)`});story(s);await tween(300,t=>{pane.style.opacity=t;pane.style.transform=`translateY(${14*(1-t)}px)`});pane.style.transform='';}
 async function enter(target,forward){
  if(reduced||!forward){await direct(target);return;}
  if(target===30){
   await prepareTarget('#accountBtn');await OpeningGuidance.press('#accountBtn');
   step=30;resetUI(30);mathState(30);const pane=$('account-story');pane.style.opacity=0;
   const modal=find('#accountOverlay .auth-modal'),from={...cursor};
   await Promise.all([arrange(true),tween(720,t=>{modal.style.opacity=t;modal.style.transform=`translateY(${26*(1-t)}px) scale(${.94+.06*t})`;pane.style.opacity=t;pane.style.transform=`translateX(${35*(1-t)}px)`;Object.assign(cursor,OpeningGuidance.path(from,{x:950,y:260},t,-50));paintCursor()})]);
   modal.style.cssText='';pane.style.cssText='visibility:visible;opacity:1';await park(30);
  }else if(target===31){
   await OpeningGuidance.press('#accToggle');const old=find('#accountOverlay .auth-modal'),r=old.getBoundingClientRect();
   form('register');const modal=find('#accountOverlay .auth-modal'),next=modal.getBoundingClientRect();
   const a=modal.animate([{opacity:.35,transform:`translateY(${r.y-next.y}px) scaleY(${r.height/next.height})`},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.22,.7,.2,1)'});await Promise.all([a.finished,explain(31)]);
   const fields=[['#accEmail',email],['#accPass',password],['#accPassConfirm',password]];
   for(const [selector,value] of fields){await OpeningGuidance.press(selector,OpeningGuidance.hit(selector),null,240);for(const c of value){find(selector).value+=c;await wait(selector==='#accEmail'?22:14)}}
   step=31;await park(31);
  }else{
   await OpeningGuidance.press('#accSubmit');const modal=find('#accountOverlay .auth-modal');
   await tween(260,t=>{modal.style.opacity=1-t;modal.style.transform=`scale(${1-.04*t})`});hide('accountOverlay',true);
   for(const f of Object.values(frames)){const btn=f.contentDocument.getElementById('accountBtn');btn.classList.add('signed-in');btn.innerHTML='<span class="account-avatar">S</span>';}
   // Successful registration closes the real form. Open the native account menu
   // as a second, visible UI click; do not invent an automatic success screen.
   await prepareTarget('#accountBtn');await OpeningGuidance.press('#accountBtn',OpeningGuidance.hit('#accountBtn'),null,420);form('signedIn');step=32;
   const menu=find('#accountOverlay .auth-modal');await Promise.all([arrange(true),explain(32),tween(420,t=>{menu.style.opacity=t;menu.style.transform=`translateY(${15*(1-t)}px)`})]);menu.style.cssText='';await park(32);
   const dot=$('account-network').querySelector('[data-transfer]');
   await tween(1000,t=>{const q=OpeningGuidance.smooth(t),x=153+430*q;dot.setAttribute('cx',x);dot.setAttribute('cy',104-9*Math.sin(Math.PI*q));dot.setAttribute('opacity',Math.sin(Math.PI*t));},true);dot.setAttribute('opacity','0');
  }
  // Normalize input values, attributes, highlights and empty inline styles.
  await direct(target);
 }
 async function leave(){
  if(!reduced){if(find('#accClose'))await OpeningGuidance.press('#accClose');hide('accountOverlay',true);await tween(220,t=>$('account-story').style.opacity=1-t)}
  $('account-story').style.visibility='hidden';$('account-site-label').style.visibility='hidden';await layout(9,true);
 }
 return{init,reset,layout:arrange,park,enter,leave,signed,width,height};
})();

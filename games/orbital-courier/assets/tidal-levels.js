/* Stable IDs for the Tidal Line sector. */
(function(root){
  'use strict';
  const O=root.Orbital=root.Orbital||{};
  O.SECTORS.push({
    id:22, name:'Приливная линия', color:'#9bdcdb',
    description:'Перехваты движущихся станций с выбором курса и момента старта.'
  });
  const solution={angle:0.6,speed:203,launchDelay:2.6};
  O.LEVELS.push({
    id:88, sector:22, routeRevision:13, newIn:13, name:'Попутный док',
    brief:'Курс уже пересекает орбиту станции. Выбери время старта так, чтобы док оказался на пути капсулы в момент сближения.',
    hint:'Оставь исходные угол и скорость. Двигай ползунок и следи, как пунктирный док смещается к траектории капсулы. Игра учитывает задержку в расчёте и запускает рейс сразу.',
    dynamic:true, motionKind:'station', launchTiming:{max:5},
    start:{x:110,y:476},
    target:{x:1128.61,y:522.67,r:25,motion:{cx:1050,cy:455,rx:83,ry:132,period:14,phase:0.651,tilt:-0.17}},
    planets:[{name:'Наяда',x:535,y:290,r:88,mu:625000,tint:'#78c8c9',surface:'ocean'}],
    cargo:[{x:318,y:473,label:'1'},{x:539,y:463,label:'2'},{x:751,y:436,label:'3'}],
    rules:{captureCap:25,proCaptureCap:16},
    timeLimit:7, qualityTime:8.5, parSpeed:210,
    initialAngle:solution.angle, initialSpeed:solution.speed, solution,
    medalRules:[{type:'delivery'},{type:'precision',limit:0.65},{type:'cargo'}]
  });
  O.LEVELS.push({
    id:89, sector:22, routeRevision:13, newIn:13, name:'Смена вахты',
    brief:'Проведи капсулу под Инеем к подсвеченной части орбиты. Подбери время старта, чтобы встретить станцию, пока шлюз открыт.',
    hint:'Контейнеры намечают дугу под Инеем. Направь траекторию к светлому участку орбиты, затем сдвинь время старта так, чтобы док встретил капсулу на этом участке.',
    dynamic:true, motionKind:'station', launchTiming:{max:5},
    start:{x:110,y:505},
    target:{x:1069.22,y:342.88,r:25,motion:{cx:989,cy:319,rx:83,ry:85,period:9.8,phase:0.628,tilt:-0.35}},
    planets:[{name:'Иней',x:510,y:333,r:103,mu:910000,tint:'#aabde8',surface:'ice'}],
    cargo:[{x:323,y:492,label:'1'},{x:615,y:445,label:'2'},{x:784,y:394,label:'3'}],
    // Both ends of the reception window use the sector clock.
    rules:{captureCap:25,proCaptureCap:16,window:[8.25,9.45]},
    timeLimit:7, qualityTime:8.5, parSpeed:210,
    initialAngle:-5.5, initialSpeed:200, solution:{angle:3,speed:200,launchDelay:4.1},
    medalRules:[{type:'delivery'},{type:'precision',limit:0.65},{type:'cargo'}]
  });
  const earlySolution={angle:15,speed:220,launchDelay:0.9};
  O.LEVELS.push({
    id:90, sector:22, routeRevision:13, newIn:13, name:'Два окна',
    brief:'Короткая дуга ведёт к раннему окну. На дальнем обходе Лиры можно забрать контейнер «+» и доставить оба груза к позднему окну.',
    hint:'Обычный контейнер лежит там, где дуги пересекаются. Для дальнего обхода направь капсулу к контейнеру «+» мимо Лиры. Меньший импульс помогает притяжению довернуть курс к позднему участку приёма.',
    dynamic:true, motionKind:'station', launchTiming:{max:5},
    start:{x:108,y:262},
    target:{x:1056.57,y:175.02,r:25,motion:{cx:1058,cy:293,rx:74,ry:118,period:10.2,phase:4.693,direction:-1}},
    planets:[{name:'Лира',x:510,y:350,r:105,mu:3250000,tint:'#c1a1e3',surface:'gas'}],
    cargo:[{x:875,y:319,label:'1'},{x:670,y:443,label:'+'}],
    rules:{captureCap:25,proCaptureCap:18,windows:[[4.5,5.7],[9.5,10.85]]},
    timeLimit:8.5, qualityTime:10.5, parSpeed:218,
    initialAngle:earlySolution.angle, initialSpeed:earlySolution.speed, earlySolution,
    solution:{angle:-41,speed:160,launchDelay:4.3},
    medalRules:[{type:'delivery'},{type:'precision',limit:0.65},{type:'cargo'}]
  });
  O.LEVELS.push({
    id:91, sector:22, routeRevision:13, newIn:13, name:'Дальний причал',
    brief:'Облети Рею по часовой стрелке и выйди вслед за станцией. Подбери время старта и курс, чтобы догнать док с малой скоростью сближения.',
    hint:'Если дуга выходит за пределы зоны облёта, попробуй уменьшить скорость старта. После облёта сверь направление траектории со стрелкой у прогнозной метки станции и подбери момент встречи.',
    dynamic:true, motionKind:'station', launchTiming:{max:5},
    start:{x:244,y:314},
    target:{x:348.44,y:417,r:25,motion:{cx:409,cy:476,rx:110,ry:53,period:6.1,phase:3.96,tilt:0.297}},
    planets:[{name:'Рея',x:590,y:314,r:76,mu:6800000,tint:'#d5ab88',surface:'rock'}],
    flybys:[{planet:0,radius:298,direction:1,degrees:225}],
    cargo:[{x:423,y:93,label:'1'},{x:681,y:162,label:'2'},{x:577,y:533,label:'3'}],
    rules:{captureCap:25,proCaptureCap:18,maxDockSpeed:55},
    timeLimit:10.5, qualityTime:15, parSpeed:122,
    initialAngle:85, initialSpeed:125, solution:{angle:90,speed:110,launchDelay:2.8},
    medalRules:[{type:'delivery'},{type:'precision',limit:0.65},{type:'cargo'}]
  });
})(typeof globalThis!=='undefined'?globalThis:window);

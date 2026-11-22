/* Route cues read the prepared contract and the displayed flight frame. */
(function(root){
  'use strict';
  const O=root.Orbital,P=O.Physics,R=O.Routes;
  const plans=new WeakMap();

  function marker(kind,index,label,mark,body,r){
    return {kind,index,key:kind+'-'+index,label,mark,body,r:r??body?.r};
  }

  function build(level,branch){
    const route=R.view(level,null,branch);
    const gates=(route.gates||[]).map((g,i)=>marker('gate',i,'Кольцо '+(i+1),String(i+1),g));
    const flybys=(route.flybys||[]).map((leg,i)=>{
      const planet=route.planets[leg.planet];
      const goal=marker('flyby',i,'Облёт '+(i+1)+' · '+planet.name,(leg.direction>0?'↻':'↺')+(i+1),planet,leg.radius);
      return {...goal,degrees:leg.degrees,direction:leg.direction};
    });
    const portals=(route.portalOrder||[]).map((id,i)=>{
      const pair=level.portals?.find(p=>p.id===id&&(!p.branch||p.branch===branch));
      if(!pair)return null;
      return {...marker('portal',i,'Вход '+id,id,pair.entrance),pair,
        afterFlybys:pair.afterFlybys??Math.min(i+1,flybys.length)};
    });
    const stops=(route.stops||[]).map((stop,i)=>marker('stop',i,'Адрес '+(stop.name||stop.id),stop.id,stop));
    const cargo=R.cargoIds(level,null,branch).map(i=>{
      const box=level.cargo[i],mark=box.label||String(i+1);
      return marker('cargo',i,'Контейнер '+mark,mark,box,18);
    });
    const required=Math.max(route.rules?.minCargo||0,route.minCargo||0);
    const freight=required?marker('freight',0,'Груз','▣'):null;
    const dock=marker('dock',0,'Станция','◇',level.target);
    // Within a leg, the ring is the waypoint into the orbit and the portal is
    // its exit. Each of the three counters is still independent in the flight.
    const sequence=gates.map(goal=>({goal,order:3*goal.index}))
      .concat(flybys.map(goal=>({goal,order:3*goal.index+1})),
        portals.filter(Boolean).map(goal=>({goal,order:3*goal.afterFlybys-1})))
      .sort((a,b)=>a.order-b.order).map(item=>item.goal);
    return {route,gates,flybys,portals,stops,cargo,required,freight,dock,
      steps:sequence.concat(stops,freight?[freight,dock]:[dock])};
  }

  function plan(level,state,branch){
    const id=R.branch(level,state,branch)?.id;
    if(!plans.has(level))plans.set(level,new Map());
    const variants=plans.get(level);
    if(!variants.has(id))variants.set(id,build(level,id));
    return variants.get(id);
  }

  function position(plan,goal,state,stats=state?.stats||{}){
    const body=goal.kind==='cargo'?(state?.cargoBodies?.[goal.index]||goal.body):goal.body;
    if(!body||body.phase==='lost')return null;
    const point=P.bodyAt(body,state?.t||0);
    if(goal.kind==='dock')return {...point,r:P.captureRadius(plan.route,stats)};
    if(goal.kind==='stop')return {...point,r:goal.r*(1+.03*(stats.dockingLevel||0))};
    return {...point,r:goal.r};
  }

  function completed(goal,guide){
    if(goal.kind==='dock')return guide.won;
    if(goal.kind==='freight')return guide.needed===0;
    return goal.index<guide.count[goal.kind];
  }

  function inspect(level,state,branch,stats){
    const course=plan(level,state,branch);
    const progress=state?.branchProgress?.[course.route.activeBranch]||state;
    const onBoard=state?.cargo||[];
    const carried=course.cargo.filter(goal=>onBoard.includes(goal.index)).length;
    const available=course.cargo.filter(goal=>!onBoard.includes(goal.index)&&state?.cargoBodies?.[goal.index]?.phase!=='lost');
    const needed=Math.max(0,course.required-carried);
    const guide={plan:course,won:state?.status==='won',needed,available,carried,
      count:{gate:progress?.gateIndex||0,flyby:progress?.flybyIndex||0,portal:progress?.portalIndex||0,stop:state?.dropIndex||0}};
    // A delivery en route becomes actionable when its physical prerequisites are met.
    const stop=course.stops[guide.count.stop];
    const stopReady=stop&&guide.count.flyby>=(stop.body.afterFlybys||0)&&guide.count.portal>=(stop.body.afterPortals||0);
    guide.next=guide.won?null:stopReady?stop:course.steps.find(goal=>!completed(goal,guide));
    const goals=guide.next?.kind==='freight'?available:guide.next?[guide.next]:[];
    guide.targets=goals.map(goal=>({goal,point:position(course,goal,state,stats)})).filter(item=>item.point);
    guide.degrees=Math.floor(P.deg(progress?.flybyAngle||0));
    return guide;
  }

  function freightLabel(guide){
    if(!guide.needed)return 'Груз на борту';
    if(!guide.available.length)return 'Обязательный груз потерян';
    if(guide.needed>guide.available.length)return 'Груза осталось '+guide.available.length+' из '+guide.needed;
    return (guide.needed===1?'Нужен ':'Нужно ')+guide.needed+' из '+guide.available.length;
  }

  const receptionLabel=index=>['Раннее окно','Позднее окно'][index]||`Окно ${index+1}`;
  const windowLabel=interval=>interval.map(t=>t.toLocaleString('ru-RU',{maximumFractionDigits:2})).join('–')+' с';

  function conditions(course,stats){
    const {route,flybys,gates,portals,stops,required}=course,rules=route.rules||{};
    const facts=[];
    const add=(kind,label,detail=label)=>facts.push({kind,label,detail});
    if(route.activeBranch)add('branch','Ветвь '+route.activeBranch,'Условия выбранной ветви '+route.activeBranch);
    if(route.placement)add('placement','Расстановка ×'+route.placement.zones.length,'Планеты можно перемещать в отмеченных зонах');
    if(gates.length)add('gate','Кольца ×'+gates.length,'Пройти кольца по порядку');
    if(flybys.length){
      const legLabel=goal=>goal.body.name+(goal.direction>0?' ↻ ':' ↺ ')+goal.degrees+'°';
      const degrees=flybys.map(goal=>goal.degrees+'°');
      const sequence=degrees.every(value=>value===degrees[0])?flybys.length+' × '+degrees[0]:degrees.join(' → ');
      add('flyby',flybys.length===1?'Облёт · '+legLabel(flybys[0]):'Облёты '+sequence,flybys.map(legLabel).join(' → '));
    }
    if(portals.length)add('portal','Порталы ×'+portals.length,'Входы по порядку: '+route.portalOrder.join(' → '));
    if(stops.length)add('stop','Адреса ×'+stops.length,stops.map(goal=>goal.label).join(' → '));
    if(required)add('cargo','Груз ≥ '+required,'Минимум контейнеров для доставки: '+required);
    if(rules.maxLaunchSpeed)add('launch','Старт ≤ '+rules.maxLaunchSpeed+' ед./с');
    if(rules.maxDockSpeed)add('approach','Сближение ≤ '+rules.maxDockSpeed+' ед./с','Предельная скорость относительно станции');
    const windows=P.receptionWindows(route);
    windows.forEach((interval,i)=>{
      const label=(windows.length>1?receptionLabel(i):'Приём')+' '+windowLabel(interval);
      add('window',label,label+(route.launchTiming?' по часам сектора':' от старта'));
    });
    add('radius','Радиус дока '+P.captureRadius(route,stats).toLocaleString('ru-RU')+' ед.','Радиус стыковки с текущим оснащением');
    add('time','Полёт ≤ '+(route.timeLimit||24).toLocaleString('ru-RU')+' с','Предельное время в полёте от старта');
    return facts;
  }

  function medalTarget(rule,cargoCount){
    switch(rule.type){
      case 'economy': return 'Расход ≤ '+rule.limit;
      case 'cargo': return 'Весь груз · '+cargoCount;
      case 'precision': return 'Точность ≥ '+Math.round(rule.limit*100)+'%';
      case 'time': return 'Доставка ≤ '+rule.limit.toLocaleString('ru-RU')+' с';
      case 'branches': return 'Обе ветви';
      default: return 'Доставка';
    }
  }

  O.FlightObjectives={plan,position,completed,inspect,freightLabel,receptionLabel,windowLabel,conditions,medalTarget};
})(typeof globalThis!=='undefined'?globalThis:window);

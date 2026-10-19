/* Version 8. Explicit skill economy: best-result deltas, not repeat grinding.
   Design parameters, not an empirically proven universal optimum. */
(function(root){
  'use strict'; const O=root.Orbital=root.Orbital||{};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const BASE_COST={scanner:140,magnet:180,docking:160,engine:125};
  const TIER_UNLOCKS=[2,8,20,40,64],DATA_COSTS=[0,2,5,9,14];
  const baseReward=level=>5*Math.round((80+12*level.sector+(level.expert?45:0))/5);
  const capReward=level=>Math.floor(baseReward(level)*1.7);
  function rating(level,flight){
    const R=O.Routes||(typeof require==='function'?require('./routes.js'):null);level=R.view(level,flight);const n=R.collected(level,flight),cargo=clamp(n/Math.max(1,R.cargoIds(level,flight).length),0,1);
    const precision=clamp(flight.dockPrecision||0,0,1);
    const fuel=clamp((level.parSpeed+30-flight.launchSpeed*(flight.stats?.fuelFactor||1))/55,0,1);
    const deadline=level.qualityTime||Math.min(level.timeLimit||24,8);
    const pace=clamp((deadline-flight.t)/(deadline*.55),0,1);
    const score=Math.round(100*(.5*cargo+.2*precision+.15*fuel+.15*pace));
    const mode=flight.mode==='pro'?'pro':'normal';
    const potential=Math.floor(baseReward(level)*(mode==='pro'?1.7:1)*(.25+.75*(score/100)**1.65));
    const data=(score>=80?1:0)+(score>=94?1:0)+(mode==='pro'?1:0)+(mode==='pro'&&score>=85?1:0);
    const grade=score>=94?'S':score>=80?'A':score>=65?'B':score>=45?'C':'D';
    return {score,grade,potential,data,mode,parts:{cargo,precision,fuel,pace}};
  }
  function price(key,tier,installed,research){
    if(!Object.hasOwn(BASE_COST,key)||tier<1||tier>5)return 0;
    const assembly=1+.025*installed,discount=1-Math.min(.08,.002*research);
    return 5*Math.ceil(BASE_COST[key]*tier**1.88*assembly*discount/5);
  }
  O.Economy=Object.freeze({START_CREDITS:25,BASE_COST,TIER_UNLOCKS,DATA_COSTS,
    price,rating,baseReward,capReward,contractReward:sector=>baseReward({sector})});
  if(typeof module!=='undefined'&&module.exports)module.exports=O.Economy;
})(typeof globalThis!=='undefined'?globalThis:window);

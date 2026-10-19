/* Shared-world alternate routes. Selecting a briefing never replaces geometry. */
(function(root){'use strict';const O=root.Orbital=root.Orbital||{};
function branch(l,s,id){return l.branches?.find(b=>b.id===(s?.branchId||s?.branchCommit||id))||l.branches?.[0];}
function view(l,s,id){const b=branch(l,s,id);return b?{...l,...b,id:l.id,activeBranch:b.id,branches:l.branches,planets:l.planets,portals:l.portals,cargo:l.cargo,target:l.target,rules:{...l.rules,minCargo:Math.max(l.rules?.minCargo||0,b.minCargo||0)}}:l;}
function cargoIds(l,s,id){return view(l,s,id).manifest||l.cargo.map((_,i)=>i);}
function collected(l,s,id){const ids=cargoIds(l,s,id);return (s?.cargo||[]).filter(i=>ids.includes(i)).length;}
O.Routes={branch,view,cargoIds,collected};if(typeof module!=='undefined'&&module.exports)module.exports=O.Routes;
})(typeof globalThis!=='undefined'?globalThis:window);

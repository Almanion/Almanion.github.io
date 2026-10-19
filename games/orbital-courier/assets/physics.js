/* Orbital Courier 8 — deterministic fields, local flybys and momentum-preserving portals. */
(function (root) {
  'use strict';
  const O = root.Orbital = root.Orbital || {};
  const R=O.Routes||(typeof require==='function'?require('./routes.js'):null);
  const WORLD = Object.freeze({ width: 1200, height: 700 });
  const DT = 1 / 120;
  const SHIP_RADIUS = 5;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rad = deg => deg * Math.PI / 180;
  const deg = value => value * 180 / Math.PI;

  // Prescribed elliptical orbit, in world coordinates. Period is in simulated
  // seconds; phase and tilt are radians. This is NOT a self-consistent N-body
  // simulation: massive bodies follow authored paths, the ship feels their field.
  function bodyAt(body, time = 0) {
    const m = body.motion;
    if (!m) return body;
    const w = (m.direction === -1 ? -1 : 1) * Math.PI * 2 / m.period;
    const a = (m.phase || 0) + w * time, tilt = m.tilt || 0;
    const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tilt), st = Math.sin(tilt);
    const ox = m.rx * ca, oy = m.ry * sa;
    const ux = -m.rx * w * sa, uy = m.ry * w * ca;
    return { ...body, x: m.cx + ox * ct - oy * st,
      y: m.cy + ox * st + oy * ct, vx: ux * ct - uy * st, vy: ux * st + uy * ct };
  }

  function acceleration(x, y, planets, time = 0) {
    let ax = 0, ay = 0;
    for (const body of planets) {
      const p = bodyAt(body, time);
      const dx = p.x - x, dy = p.y - y;
      const r2 = dx * dx + dy * dy + 16; // Plummer softening, epsilon = 4.
      const scale = p.mu / (r2 * Math.sqrt(r2));
      ax += dx * scale; ay += dy * scale;
    }
    return { x: ax, y: ay };
  }

  // Time-dependent velocity Verlet: the two accelerations use positions of the
  // moving planets at t and t+dt, not their initial or visual frame positions.
  function integrate(s, planets, dt = DT) {
    const t = s.t || 0, a0 = acceleration(s.x, s.y, planets, t);
    const x = s.x + s.vx * dt + 0.5 * a0.x * dt * dt;
    const y = s.y + s.vy * dt + 0.5 * a0.y * dt * dt;
    const a1 = acceleration(x, y, planets, t + dt);
    return { x, y, vx: s.vx + 0.5 * (a0.x + a1.x) * dt,
      vy: s.vy + 0.5 * (a0.y + a1.y) * dt, t: t + dt };
  }

  // Earliest intersection on a segment, including a starting point inside a circle.
  function segmentCircle(x0, y0, x1, y1, cx, cy, radius) {
    const dx = x1 - x0, dy = y1 - y0, ox = x0 - cx, oy = y0 - cy;
    const c = ox * ox + oy * oy - radius * radius;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy;
    if (a < 1e-20) return null;
    const b = 2 * (ox * dx + oy * dy);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const u = (-b - Math.sqrt(discriminant)) / (2 * a);
    return u >= 0 && u <= 1 ? u : null;
  }

  function boundaryHit(a, b) {
    const lo = SHIP_RADIUS, xmax = WORLD.width - lo, ymax = WORLD.height - lo;
    let u = Infinity;
    if (b.x < lo) u = Math.min(u, (lo - a.x) / (b.x - a.x));
    if (b.x > xmax) u = Math.min(u, (xmax - a.x) / (b.x - a.x));
    if (b.y < lo) u = Math.min(u, (lo - a.y) / (b.y - a.y));
    if (b.y > ymax) u = Math.min(u, (ymax - a.y) / (b.y - a.y));
    return u === Infinity ? null : clamp(u, 0, 1);
  }

  // Only contract rules change between difficulties; the integrator never does.
  function prepareLevel(level, mode = 'normal') {
    const r = { ...(level.rules || {}) };
    if (mode === 'pro') {
      r.captureCap = Math.min(r.captureCap || 25, r.proCaptureCap || (level.expert ? 9 : 12));
      r.minCargo = Math.max(r.minCargo || 0, level.expert ? 2 : 1);
      if (r.window) {
        const mid = (r.window[0] + r.window[1]) / 2;
        const half = (r.window[1] - r.window[0]) * 0.36;
        r.window = [mid - half, mid + half];
      }
    }
    return { ...level, mode, rules: r,
      branches: level.branches?.map(b=>({...b,gates:(b.gates||[]).map(g=>({...g,r:g.r*(mode==='pro'?(level.rules?.proGateScale||.92):1)}))})),
      gates: (level.gates || []).map(g => ({ ...g, r: g.r * (mode === 'pro' ? (level.rules?.proGateScale || 0.82) : 1) })) };
  }

  function createState(level, angle, speed, stats = {}) {
    const a = rad(angle), st = { capture: 25, magnet: 18, gravity: 0, gravityMu: 0, ...stats };
    return { branchProgress:Object.fromEntries((level.branches||[]).map(b=>[b.id,{flybyIndex:0,flybyAngle:0,flybyInside:false,gateIndex:0,portalIndex:0}])),branchId:null,dropIndex:0,dropEvents:[], x: level.start.x, y: level.start.y, vx: Math.cos(a) * speed,
      vy: -Math.sin(a) * speed, t: 0, status: 'flying', reason: '',
      cargo: [], gateIndex: 0, flybyIndex: 0, flybyAngle: 0, flybyInside: false, nearMiss: false, minClearance: Infinity,
      cargoBodies: (level.cargo || []).map(c => ({ ...c, vx: 0, vy: 0, phase: 'idle', trail: [], age: 0 })),
      pullCount: 0, dockPrecision: 0, assisted: false,
      portalIndex: 0, portalJumps: 0, portalReadyAt: 0, teleports: [],
      mode: level.mode || 'normal', launchSpeed: speed, launchAngle: angle, stats: st };
  }

  function captureRadius(level, stats) {
    return Math.min(stats.capture || 25, (level.rules?.captureCap || Infinity)*(1+.055*(stats.dockingLevel||0)));
  }

  // Sweep in relative coordinates. Curved orbits are linearly interpolated over
  // one fixed 1/120 s step; testing only either endpoint would miss fast crossings.
  function movingCircle(a, b, body, radius, t0 = a.t || 0, t1 = b.t || 0) {
    const p0 = bodyAt(body, t0), p1 = bodyAt(body, t1);
    return segmentCircle(a.x-p0.x, a.y-p0.y, b.x-p1.x, b.y-p1.y, 0, 0, radius);
  }

  function obstacleHit(a, b, level, padding = 0, t0 = a.t || 0, t1 = b.t || 0) {
    let first = null;
    for (const p of [...level.planets, ...(level.rocks || [])]) {
      const u = movingCircle(a, b, p, p.r + padding, t0, t1);
      if (u !== null && (first === null || u < first)) first = u;
    }
    return first;
  }

  function terminalEvents(level, a, b, stats) {
    const events = [];
    for (const p of [...level.planets, ...(level.rocks || [])]) {
      const u = movingCircle(a, b, p, p.r + SHIP_RADIUS);
      if (u !== null) events.push({ u, type: 'crash', reason: p.mu ? 'planet' : 'asteroid' });
    }
    const u = movingCircle(a, b, level.target, captureRadius(level, stats));
    if (u !== null) events.push({ u, type: 'won', reason: 'delivered' });
    // One-way entrances. Outlets are NOT additional collision targets. A short
    // simulated-time lock prevents a coincident entrance from teleporting forever.
    if ((a.portalReadyAt || 0) <= (a.t || 0)) {
      for (const pair of level.portals || []) {
        const progress=pair.branch?(a.branchProgress?.[pair.branch]||{}):a;
        if(a.branchId&&pair.branch&&pair.branch!==a.branchId)continue;
        if((progress.flybyIndex||0)<(pair.afterFlybys||0)||(pair.afterPortals!==undefined&&(progress.portalIndex||0)!==pair.afterPortals))continue;
        const entry = pair.entrance;
        const hit = segmentCircle(a.x, a.y, b.x, b.y, entry.x, entry.y, entry.r);
        if (hit !== null) events.push({ u: hit, type: 'portal', pair });
      }
    }
    const stop=(level.stops||[])[a.dropIndex||0];
    if(stop&&(a.flybyIndex||0)>=(stop.afterFlybys||0)&&(a.portalIndex||0)>=(stop.afterPortals||0)){const hit=movingCircle(a,b,stop,stop.r*(1+.03*(stats.dockingLevel||0)));if(hit!==null)events.push({u:hit,type:'drop',stop});}
    const edge = boundaryHit(a, b);
    if (edge !== null) events.push({ u: edge, type: 'lost', reason: 'boundary' });
    return events.sort((x, y) => x.u - y.u);
  }

  function obstructed(a, b, level, padding = 0, time = 0) {
    return [...level.planets, ...(level.rocks || [])].some(body => {
      const p = bodyAt(body, time);
      return segmentCircle(a.x, a.y, b.x, b.y, p.x, p.y, p.r + padding) !== null;
    });
  }

  function dockVelocity(s, level) {
    const target = bodyAt(level.target, s.t);
    const vx = s.vx - (target.vx || 0), vy = s.vy - (target.vy || 0);
    return { vx, vy, speed: Math.hypot(vx, vy) };
  }

  // Cargo is anchored until it meets the field. The field is a gameplay tractor:
  // softened inverse-square attraction + damping relative to ship velocity.
  // It is NOT a claim that real gravity includes velocity matching.
  function advanceCargo(s, ship, level, dt) {
    const collected = s.cargo.slice(), bodies = [], R = s.stats.gravity || 0;
    let pulls = s.pullCount || 0;
    for (let i = 0; i < (level.cargo || []).length; i++) {
      const old = s.cargoBodies?.[i] || { ...level.cargo[i], vx: 0, vy: 0, phase: 'idle', trail: [], age: 0 };
      const c = { ...old, trail: old.trail || [] };
      if (collected.includes(i) || c.phase === 'lost') { bodies.push(c); continue; }
      // Even an anchored container can be struck by a moving planet.
      if (c.phase === 'idle' && level.planets.some(p => p.motion) &&
          obstacleHit(c, c, level, 4, s.t, ship.t) !== null) {
        c.phase = 'lost'; bodies.push(c); continue;
      }
      const d = Math.hypot(c.x - s.x, c.y - s.y);
      const direct = segmentCircle(s.x, s.y, ship.x, ship.y, c.x, c.y, 18);
      // Direct physical pickup stays available without the module.
      if (direct !== null && !obstructed(ship, c, level, 0, ship.t)) {
        c.phase = 'collected'; collected.push(i); bodies.push(c); continue;
      }
      if (R > 0 && c.phase === 'idle' && d <= R && !obstructed(s, c, level, 2, s.t)) {
        c.phase = 'pulling'; pulls++; c.age = 0;
      }
      if (c.phase === 'pulling' || c.phase === 'drifting') {
        const dx = ship.x - c.x, dy = ship.y - c.y;
        const clear = !obstructed(ship, c, level, 2, ship.t);
        const tethered = R > 0 && Math.hypot(dx, dy) < R * 2.4 && clear;
        c.phase = tethered ? 'pulling' : 'drifting';
        let ax = 0, ay = 0;
        if (tethered) {
          const softened = dx * dx + dy * dy + 24 * 24;
          const factor = (s.stats.gravityMu || 2400000) / (softened * Math.sqrt(softened));
          // Tangential drift gives a curved approach, never a teleport.
          ax = dx * factor + 11 * (ship.vx - c.vx);
          ay = dy * factor + 11 * (ship.vy - c.vy);
        } else {
          const a = acceleration(c.x, c.y, level.planets, s.t); ax = a.x; ay = a.y;
        }
        const magnitude = Math.hypot(ax, ay), limit = 6500;
        if (magnitude > limit) { ax *= limit / magnitude; ay *= limit / magnitude; }
        c.vx += ax * dt; c.vy += ay * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.age += dt;
        const hit = segmentCircle(old.x - s.x, old.y - s.y,
          c.x - ship.x, c.y - ship.y, 0, 0, 14);
        if (obstacleHit(old, c, level, 4, s.t, ship.t) !== null) c.phase = 'lost';
        else if (hit !== null) { c.phase = 'collected'; collected.push(i); }
        else if (c.x < 0 || c.x > WORLD.width || c.y < 0 || c.y > WORLD.height) c.phase = 'lost';
        // Bounded deterministic trace; not part of the numerical update.
        if (Math.floor(s.t * 120) % 4 === 0) c.trail = [...c.trail.slice(-17), { x: c.x, y: c.y }];
      }
      bodies.push(c);
    }
    return { cargo: collected, cargoBodies: bodies, pullCount: pulls };
  }

  // A route is a sequence of signed, local angular sweeps about DIFFERENT
  // bodies. Angle is unwrapped at +/-pi and measured in relative coordinates,
  // so moving a planet visually cannot fake progress. Exiting the local zone
  // resets the current manoeuvre; completed manoeuvres remain completed.
  function advanceFlybys(previous, ship, level) {
    const sequence = level.flybys || [];
    const index = previous.flybyIndex || 0, leg = sequence[index];
    if (!leg) return { flybyIndex: index, flybyAngle: 0, flybyInside: false };
    const planet = level.planets[leg.planet];
    const p0 = bodyAt(planet, previous.t), p1 = bodyAt(planet, ship.t);
    const r0 = Math.hypot(previous.x - p0.x, previous.y - p0.y);
    const r1 = Math.hypot(ship.x - p1.x, ship.y - p1.y);
    if (r1 > leg.radius) return { flybyIndex: index, flybyAngle: 0, flybyInside: false };
    let sweep = previous.flybyAngle || 0;
    if (r0 <= leg.radius && previous.flybyInside) {
      const a0 = Math.atan2(previous.y - p0.y, previous.x - p0.x);
      const a1 = Math.atan2(ship.y - p1.y, ship.x - p1.x);
      const delta = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      sweep = Math.max(0, sweep + delta * leg.direction);
    }
    if (sweep >= rad(leg.degrees))
      return { flybyIndex: index + 1, flybyAngle: 0, flybyInside: false };
    return { flybyIndex: index, flybyAngle: sweep, flybyInside: true };
  }

  function dockingReason(s, level) {
    level=R.view(level,s);const r = level.rules || {};
    if(level.branches?.length&&!s.branchId)return 'branch';
    if((s.dropIndex||0)<(level.stops||[]).length)return 'deliveries';
    if ((s.portalIndex || 0) < (level.portalOrder || []).length) return 'portals';
    if ((s.flybyIndex || 0) < (level.flybys || []).length) return 'flybys';
    if (s.gateIndex < (level.gates || []).length) return 'gates';
    if (R.collected(level,s) < Math.max(r.minCargo||0,level.minCargo||0)) return 'manifest';
    if (r.maxLaunchSpeed && s.launchSpeed > r.maxLaunchSpeed) return 'fuel';
    if (r.maxDockSpeed && dockVelocity(s, level).speed > r.maxDockSpeed + 1e-7) return 'overspeed';
    if (r.window && (s.t < r.window[0] || s.t > r.window[1])) return 'window';
    return null;
  }

  // Teleportation changes position, NEVER vx/vy or time. It is an authored
  // wormhole mechanic, not a physical model of a Schwarzschild black hole.
  function teleport(s, pair, level) {
    const v = Math.hypot(s.vx, s.vy), ux = v > 1e-12 ? s.vx / v : 1;
    const uy = v > 1e-12 ? s.vy / v : 0, margin = pair.exit.r + SHIP_RADIUS + 2;
    const to = { x: pair.exit.x + ux * margin, y: pair.exit.y + uy * margin };
    const entry = { id: pair.id, t: s.t, from: { x: s.x, y: s.y }, to,
      before: { vx: s.vx, vy: s.vy }, after: { vx: s.vx, vy: s.vy } };
    const view=pair.branch?R.view(level,null,pair.branch):level;
    const prior=pair.branch?(s.branchProgress?.[pair.branch]||{}):s;const index=prior.portalIndex||0;
    const progress={...prior,portalIndex:index+((view.portalOrder||[])[index]===pair.id?1:0),flybyAngle:0,flybyInside:false};
    const branchProgress=pair.branch?{...s.branchProgress,[pair.branch]:progress}:s.branchProgress;
    return { ...s, ...progress, branchId:pair.branch||s.branchId,branchProgress,...to, portalJumps: (s.portalJumps || 0) + 1,
      portalIndex:progress.portalIndex,
      portalReadyAt: s.t + 0.35, teleports: [...(s.teleports || []).slice(-63), entry],
      flybyInside: false, flybyAngle: 0,
      // Already loaded cargo is carried by the ship. Tethered cargo is NOT
      // teleported; cutting its tether prevents collection through the gap.
      cargoBodies: (s.cargoBodies || []).map(c => c.phase === 'pulling' ? { ...c, phase: 'drifting' } : c) };
  }

  function step(s, level, dt = DT, splits = 0) {
    if (s.status !== 'flying') return s;
    const b = integrate(s, level.planets, dt);
    if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) return { ...s, status: 'lost', reason: 'numeric' };
    const event = terminalEvents(level, s, b, s.stats)[0];
    const end = event ? event.u : 1;
    const x = s.x + (b.x - s.x) * end, y = s.y + (b.y - s.y) * end;
    let minClearance = s.minClearance, gateIndex = s.gateIndex || 0;
    for (const body of level.planets) {
      const p = bodyAt(body, s.t + dt * end);
      minClearance = Math.min(minClearance, Math.hypot(x-p.x,y-p.y)-p.r-SHIP_RADIUS);
    }
    function advance(previous,view,ship){let gi=previous.gateIndex||0,last=-1;while(gi<(view.gates||[]).length){const g=view.gates[gi],u=segmentCircle(s.x,s.y,x,y,g.x,g.y,g.r);if(u===null||u<last)break;last=u;gi++;}return {...advanceFlybys(previous,ship,view),gateIndex:gi,portalIndex:previous.portalIndex||0};}
    let result={...s,...b,x,y,vx:s.vx+(b.vx-s.vx)*end,vy:s.vy+(b.vy-s.vy)*end,t:s.t+dt*end,minClearance,nearMiss:s.nearMiss||minClearance<28};
    if(level.branches?.length){const bp={...s.branchProgress};for(const branch of level.branches){if(s.branchId&&s.branchId!==branch.id)continue;bp[branch.id]=advance({...s,...bp[branch.id]},R.view(level,null,branch.id),result);delete bp[branch.id].branchProgress;delete bp[branch.id].cargoBodies;delete bp[branch.id].teleports;}
      const selected=bp[s.branchId||level.branches[0].id];result={...result,branchProgress:bp,flybyIndex:selected.flybyIndex,flybyAngle:selected.flybyAngle,flybyInside:selected.flybyInside,gateIndex:selected.gateIndex,portalIndex:selected.portalIndex};
    }else result={...result,...advance(s,level,result)};
    result = { ...result, ...advanceCargo(s, result, level, dt * end) };
    if (event) {
      if(event.type==='drop'){const at=bodyAt(event.stop,result.t),relative=Math.hypot(result.vx-(at.vx||0),result.vy-(at.vy||0));if(event.stop.maxSpeed&&relative>event.stop.maxSpeed)return {...result,status:'lost',reason:'drop-speed'};result={...result,dropIndex:(s.dropIndex||0)+1,dropEvents:[...(s.dropEvents||[]),{id:event.stop.id,t:result.t,x:result.x,y:result.y,vx:result.vx,vy:result.vy}]};const remaining=dt*(1-end);return remaining>1e-12?step(result,level,remaining,splits+1):result;}
      if (event.type === 'portal') {
        result = teleport(result, event.pair, level);
        const remaining = dt * (1 - end);
        if (splits >= 6) return { ...result, status: 'lost', reason: 'portal-loop' };
        // Explicitly split at the crossing. There is no swept line between the
        // two mouths; gates, cargo, flybys and obstacles see only physical legs.
        return remaining > 1e-12 ? step(result, level, remaining, splits + 1) : result;
      }
      if (event.type === 'won') {
        const bad = dockingReason(result, level);
        const dock = bodyAt(level.target, result.t), velocity = dockVelocity(result, level);
        result.dockSpeed = velocity.speed;
        const dx = dock.x - x, dy = dock.y - y;
        const miss = Math.abs(dx * velocity.vy - dy * velocity.vx) / Math.max(1, velocity.speed);
        result.dockPrecision = clamp(1 - miss / Math.min(25,level.rules?.captureCap||25),0,1);
        if (bad) return { ...result, status: 'lost', reason: bad };
      }
      return { ...result, status: event.type, reason: event.reason };
    }
    if (result.t >= (level.timeLimit || 24)) return { ...result, status: 'lost', reason: 'timeout' };
    return result;
  }

  function simulate(level, angle, speed, stats = {}, duration = Infinity, sampleEvery = 6) {
    let s = createState(level, angle, speed, stats), ticks = 0;
    const points = [{ x: s.x, y: s.y, t: 0 }];
    const limit = Math.min(duration, level.timeLimit || 24);
    while (s.status === 'flying' && s.t < limit) {
      const jumps = s.portalJumps;
      s = step(s, level);
      if (s.portalJumps > jumps) for (const jump of s.teleports.slice(-(s.portalJumps - jumps))) {
        points.push({ ...jump.from, t: jump.t });
        points.push({ ...jump.to, t: jump.t, break: true });
      }
      if (++ticks % sampleEvery === 0) points.push({ x: s.x, y: s.y, t: s.t });
    }
    points.push({ x: s.x, y: s.y, t: s.t });
    return { state: s, points };
  }

  function energy(s, planets) {
    let potential = 0;
    for (const body of planets) {
      const p = bodyAt(body, s.t || 0);
      potential -= p.mu / Math.sqrt((s.x-p.x)**2 + (s.y-p.y)**2 + 16);
    }
    return (s.vx * s.vx + s.vy * s.vy) / 2 + potential;
  }
  O.Physics = { WORLD, DT, SHIP_RADIUS, clamp, rad, deg, acceleration, integrate,
    bodyAt, movingCircle, obstacleHit, obstructed, dockVelocity, terminalEvents, segmentCircle, createState, step, simulate, energy, prepareLevel, captureRadius, advanceCargo, advanceFlybys, dockingReason, teleport };
  if (typeof module !== 'undefined' && module.exports) module.exports = O.Physics;
})(typeof globalThis !== 'undefined' ? globalThis : window);

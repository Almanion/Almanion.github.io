(function (root) {
  'use strict';
  const E = root.EclipseEngine, B = root.EclipseBattle, TAU = Math.PI * 2;
  const palette = { ice: '#b5d4ff', gold: '#e4bd87', red: '#ec8e9e' };
  function seeded(n) { return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
  class EclipseRenderer {
    constructor(canvas) {
      this.canvas = canvas; this.c = canvas.getContext('2d'); this.scale = 1; this.ox = 0; this.oy = 0;
      const rand = seeded(179); this.stars = Array.from({ length: 340 }, () => ({ x: rand() * 2100 - 500, y: rand() * E.H, r: .3 + rand(), a: .12 + rand() * .55 }));
      this.fragments = B.shieldPieces(); this.glows = {};
      for (const [key, color] of Object.entries({ ice: '153,195,255', gold: '255,193,116', red: '255,123,117', smoke: '65,69,87' })) {
        const tile = document.createElement('canvas'); tile.width = tile.height = 128; const ctx = tile.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, `rgba(${color},.8)`); g.addColorStop(.16, `rgba(${color},.35)`); g.addColorStop(.5, `rgba(${color},.09)`); g.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); this.glows[key] = tile;
      }
      this.moon = this.moonTexture(); this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
      this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr); this.dpr = dpr;
      this.scale = Math.min(this.width / E.W, this.height / E.H); this.ox = (this.width - E.W * this.scale) / 2; this.oy = (this.height - E.H * this.scale) / 2;
      this.needsDraw = true;
    }
    point(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect(); return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
    }
    camera(view) {
      const base = Math.min(this.width / E.W, this.height / E.H);
      const close = view.camera === 'follow' && view.battle.breakAge === null;
      this.scale = close ? Math.max(base, Math.min(1.1, base * 2.15)) : base;
      let x = E.W / 2, y = E.H / 2;
      if (close) {
        const lead = view.mode === 'running' ? .45 : 0, halfX = this.width / this.scale / 2, halfY = this.height / this.scale / 2;
        x = halfX < E.W / 2 ? E.clamp(view.state.x + view.state.vx * lead, halfX, E.W - halfX) : E.W / 2;
        y = halfY < E.H / 2 ? E.clamp(view.state.y + view.state.vy * lead, halfY, E.H - halfY) : E.H / 2;
      }
      this.ox = this.width / 2 - x * this.scale; this.oy = this.height / 2 - y * this.scale; this.closeCamera = close;
    }
    overview(view) {
      this.minimap = null; if (!this.closeCamera) return;
      const c = this.c, w = Math.min(118, this.width * .29), h = w * E.H / E.W, x = 10, y = this.height - h - 10, k = w / E.W;
      this.minimap = { x, y, w, h };
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.fillStyle = '#0a1020e8'; c.fillRect(x - 1, y - 1, w + 2, h + 2); c.strokeStyle = '#b5c8e844'; c.lineWidth = 1; c.strokeRect(x, y, w, h);
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y); c.scale(k, k);
      c.fillStyle = '#45516d'; c.beginPath(); c.arc(E.MOON.x, E.MOON.y, E.MOON.r, 0, TAU); c.fill();
      for (const [p, color, r] of [[E.FORT, '#cfb89e', 35], [view.phase === 2 ? E.EXIT : E.NODE, '#9cbeff', 25], [view.state, '#ffffff', 20]]) { c.fillStyle = color; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill(); }
      c.strokeStyle = '#cadcff88'; c.lineWidth = 1 / k; c.strokeRect(-this.ox / this.scale, -this.oy / this.scale, this.width / this.scale, this.height / this.scale); c.restore();
    }
    moonTexture() {
      const tile = document.createElement('canvas'); tile.width = tile.height = 512;
      const c = tile.getContext('2d'), random = seeded(84);
      c.translate(256, 256); c.beginPath(); c.arc(0, 0, 248, 0, TAU); c.clip();
      const g = c.createRadialGradient(150, -120, 5, -30, 40, 350); g.addColorStop(0, '#a2adc3'); g.addColorStop(.25, '#717a90'); g.addColorStop(.63, '#30394e'); g.addColorStop(1, '#111a2a'); c.fillStyle = g; c.fillRect(-256, -256, 512, 512);
      for (let i = 0; i < 320; i++) {
        const x = random() * 500 - 250, y = random() * 500 - 250, r = 1 + random() ** 3 * 33;
        c.beginPath(); c.ellipse(x, y, r, r * .8, .1, 0, TAU); c.fillStyle = '#0b1020' + Math.floor(15 + random() * 40).toString(16).padStart(2, '0'); c.fill();
        c.beginPath(); c.ellipse(x - r * .1, y + r * .15, r, r * .8, .1, -.1, 2.5); c.strokeStyle = '#bbc4d32b'; c.lineWidth = .5 + r * .055; c.stroke();
      }
      c.strokeStyle = '#10172688'; c.lineWidth = 5; c.beginPath(); c.moveTo(-30, -260); c.lineTo(-10, -160); c.lineTo(28, -80); c.lineTo(6, -10); c.lineTo(63, 94); c.lineTo(69, 170); c.lineTo(130, 250); c.stroke();
      c.strokeStyle = '#c8b18e55'; c.lineWidth = 1.4; c.stroke();
      const shade = c.createLinearGradient(-240, 130, 180, -40); shade.addColorStop(0, '#070d1ef0'); shade.addColorStop(.45, '#080e2144'); shade.addColorStop(1, '#00000000'); c.fillStyle = shade; c.fillRect(-256, -256, 512, 512);
      return tile;
    }
    line(points, color, width = 1, dashed = false) {
      if (points.length < 2) return; const c = this.c; c.save(); c.strokeStyle = color; c.lineWidth = width / this.scale; c.setLineDash(dashed ? [5 / this.scale, 5 / this.scale] : []); c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); c.restore();
    }
    label(text, x, y, color = '#94a2bb', align = 'center', size = 10) {
      const c = this.c; c.save(); c.font = `500 ${Math.max(12, size / this.scale)}px Manrope, sans-serif`; c.textAlign = align; c.fillStyle = '#0b1123c9'; const w = c.measureText(text).width; c.fillRect(x - (align === 'center' ? w / 2 : 0) - 4, y - Math.max(12, size / this.scale), w + 8, Math.max(16, (size + 4) / this.scale)); c.fillStyle = color; c.fillText(text, x, y); c.restore();
    }
    ring(p, r, color, width = 1) {
      const c = this.c; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.strokeStyle = color; c.lineWidth = width / this.scale; c.stroke();
    }
    ship(p, color, scale, model, t, thrust = true) {
      root.Orbital.Fleet.draw(this.c, p.x, p.y, p.angle ?? Math.atan2(p.vy || 0, p.vx || 1), color, scale, thrust, t, model, { finish: 'satin', livery: 'panels' });
    }
    flagship(p, thrust) {
      const c = this.c; c.save(); c.translate(p.x, p.y); c.rotate(p.angle);
      for (const y of [-13, 0, 13]) {
        if (thrust) { this.line([{ x: -115, y }, { x: -54, y }], '#b8d4ff15', 6); this.line([{ x: -88, y }, { x: -54, y }], '#cee4ffc9', 1.4); this.glow(-58, y, 20, 'ice', .65); }
        c.fillStyle = '#b6d6fa'; c.fillRect(-58, y - 2.5, 5, 5);
      }
      const hull = c.createLinearGradient(0, -25, 0, 25); hull.addColorStop(0, '#8996ac'); hull.addColorStop(.34, '#58667e'); hull.addColorStop(.5, '#b3b8bf'); hull.addColorStop(.53, '#68758b'); hull.addColorStop(1, '#273143');
      c.beginPath(); for (const [i, point] of [[-55,-12],[-38,-24],[-16,-21],[18,-14],[53,-6],[66,0],[53,6],[18,14],[-16,21],[-38,24],[-55,12]].entries()) i ? c.lineTo(...point) : c.moveTo(...point); c.closePath(); c.fillStyle = hull; c.fill(); c.strokeStyle = '#bdc7d17a'; c.lineWidth = .7; c.stroke();
      for (const side of [-1, 1]) {
        c.fillStyle = '#242f43'; c.fillRect(-38, side * 13 - 2.5, 39, 5); c.fillStyle = '#c7af89'; c.fillRect(-33, side * 13 - 1, 27, 1.6);
        for (const x of [-24, 2, 25]) { c.fillStyle = '#bac2cd'; c.fillRect(x, side * 8 - 2, 8, 4); c.fillStyle = '#222d41'; c.fillRect(x + 3, side * 8 - 1.4, 11, 2.8); }
        c.strokeStyle = '#18233788'; c.beginPath(); c.moveTo(-39, side * 23); c.lineTo(-20, side * 17); c.lineTo(33, side * 8); c.stroke();
        for (let x = -43; x <= -23; x += 5) { c.fillStyle = '#a8c5e4'; c.fillRect(x, side * 18, 2, 1); }
      }
      c.fillStyle = '#1b2638'; c.beginPath(); c.moveTo(-39,-5); c.lineTo(36,-2); c.lineTo(48,0); c.lineTo(36,2); c.lineTo(-39,5); c.closePath(); c.fill();
      c.fillStyle = '#d5be97'; c.fillRect(-30, -3, 13, 6); c.fillStyle = '#b3daf6'; c.fillRect(-19, -2, 4, 4); c.strokeStyle = '#c7cbd378'; c.lineWidth = .6; c.beginPath(); c.moveTo(-13,0); c.lineTo(57,0); c.stroke(); c.restore();
    }
    glow(x, y, r, color = 'ice', alpha = 1) {
      const c = this.c; c.save(); c.globalAlpha = B.clamp(alpha, 0, 1); c.drawImage(this.glows[color], x - r, y - r, r * 2, r * 2); c.restore();
    }
    bolt(from, to, progress, color = 'ice', width = 1.5, bend = 0) {
      if (progress < 0 || progress > 1) return;
      const c = this.c, dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
      const point = t => ({ x: from.x + dx * t - dy / length * Math.sin(t * Math.PI) * bend, y: from.y + dy * t + dx / length * Math.sin(t * Math.PI) * bend });
      const tail = Math.max(0, progress - Math.min(.28, 100 / length)), points = Array.from({ length: 7 }, (_, i) => point(tail + (progress - tail) * i / 6));
      const head = points[6], colors = color === 'ice' ? ['#86bbff16', '#a6d4ff77', '#eff7ff'] : color === 'gold' ? ['#ffcb861b', '#ffd29c99', '#fff0d8'] : ['#fa7d8d19', '#ff9e9d99', '#ffe6d9'];
      this.line(points, colors[0], width * 7); this.line(points, colors[1], width * 2.6); this.line(points, colors[2], width);
      this.glow(head.x, head.y, 24 + width * 5, color, .85);
      c.fillStyle = colors[2]; c.beginPath(); c.arc(head.x, head.y, Math.max(1.8, width * .9 / this.scale), 0, TAU); c.fill();
    }
    explosion(p, age, seed, size = 1, color = 'gold', reduced = false) {
      if (age < 0 || age > 2.8) return; const c = this.c, rand = seeded(seed), fade = Math.max(0, 1 - age / 2.8);
      if (reduced) { this.glow(p.x, p.y, 22 * size, color, .35 * fade); this.ring(p, 12 * size, '#bd9e8766'); return; }
      this.glow(p.x, p.y, size * (34 + age * 34), color, fade * .8);
      if (age < .4) {
        this.glow(p.x, p.y, size * (24 + age * 55), color, 1 - age / .4);
        c.fillStyle = '#fff1d5'; c.globalAlpha = Math.max(0, 1 - age / .22); c.beginPath(); c.arc(p.x, p.y, size * (4 + age * 12), 0, TAU); c.fill(); c.globalAlpha = 1;
      }
      for (let i = 0; i < 7; i++) {
        const a = rand() * TAU, d = (8 + rand() * 18) * age * size;
        this.glow(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, (16 + age * 19) * size, 'smoke', fade * .8);
      }
      c.save(); c.globalAlpha = fade;
      for (let i = 0; i < 26; i++) {
        const a = rand() * TAU, velocity = (22 + rand() * 105) * size, travel = velocity * (1 - Math.exp(-age * 1.7)) / 1.7;
        const x = p.x + Math.cos(a) * travel, y = p.y + Math.sin(a) * travel, l = Math.max(1, 8 * (1 - age / 1.1)) * size;
        this.line([{ x: x - Math.cos(a) * l, y: y - Math.sin(a) * l }, { x, y }], i % 4 ? color === 'ice' ? '#a8d3ffbb' : '#e8b17dba' : '#f9ead9', .6 + rand() * .8);
      }
      if (age < .85) { c.globalAlpha = (1 - age / .85) * .4; this.ring(p, (8 + age * 75) * size, color === 'ice' ? '#bddbff' : '#dfb092', 1); }
      c.restore();
    }
    shieldBreak(age, reduced) {
      const c = this.c, p = E.FORT; if (age === null || age < .25 || age > 4.1) return;
      if (reduced) { this.ring(p, 113, '#acc9f044'); return; }
      const t = age - .25;
      this.glow(p.x, p.y, 160 + t * 70, 'ice', Math.max(0, .7 - t * .6));
      if (t < 1.55) {
        c.save(); c.globalAlpha = .52 * (1 - t / 1.55); c.strokeStyle = '#c6dfff'; c.lineWidth = 1.6 / this.scale;
        c.beginPath(); c.ellipse(p.x, p.y, 106 + t * 155, 32 + t * 64, -.28, 0, TAU); c.stroke(); c.restore();
      }
      for (const f of this.fragments) {
        const life = Math.max(0, t - f.delay), radius = f.r + f.speed * life * .55, x = p.x + Math.cos(f.a) * radius, y = p.y + Math.sin(f.a) * radius;
        c.save(); c.translate(x, y); c.rotate(f.a + f.spin * life); c.globalAlpha = Math.max(0, 1 - life / 2.6);
        c.beginPath(); c.moveTo(-f.length / 2, -f.width * f.r); c.lineTo(4 + f.length / 2, -f.width * f.r * .6); c.lineTo(f.length / 2, f.width * f.r); c.lineTo(-f.length / 2, f.width * f.r * .7); c.closePath();
        c.fillStyle = '#9ac6ff22'; c.strokeStyle = '#bad9ffbd'; c.lineWidth = .8 / this.scale; c.fill(); c.stroke(); c.restore();
      }
    }
    fleet(state, battle, t, reduced) {
      const age = battle.breakAge, advance = state.phase === 2 ? 112 + Math.min(state.t, 14) * 27 : age === null ? 0 : 112 * B.smooth((age - .7) / 3.5);
      for (let i = state.fleet - 1; i >= 0; i--) {
        const p = B.fleetAt(i, advance), capital = i === 0, attacking = state.phase === 2 || age !== null && age > .7;
        this.line([{ x: p.x - (attacking ? 96 : 38), y: p.y + 4 }, { x: p.x - 8, y: p.y }], attacking ? '#a8c7fa40' : '#b7b9d21c', capital ? 2.5 : 1);
        if (attacking) this.glow(p.x - (capital ? 29 : 16), p.y, capital ? 32 : 20, 'ice', .4);
        if (capital) this.flagship(p, attacking);
        else this.ship(p, '#9aabbf', i === 1 ? 1.6 : .92, i === 1 ? 'zenith' : 'pilgrim', t, attacking);
        // Small escorts establish scale around the flagship, without extra health units.
        if (capital) {
          for (const side of [-1, 1]) this.ship({ x: p.x - 28, y: p.y + side * 29, angle: p.angle }, '#9eafc7', .42, 'raven', t, attacking);
          if (state.phase !== 2 && age === null) this.label('ЗАРЯ', p.x, p.y - 44, '#b1bdcf', 'center', 8);
        }
      }
    }
    ordnance(view) {
      const { state: s, battle, reduced, mode } = view, c = this.c;
      if (s.phase < 2 && s.status === 'running' && mode !== 'plan') {
        const next = Math.floor((s.t + 1e-7) / 5) + 1, timeToHit = next * 5 - s.t;
        if (timeToHit < 1.12 && !s.jam) {
          const target = B.fleetAt(Math.max(0, s.fleet - 1)), charge = B.clamp((1.12 - timeToHit) / .42, 0, 1);
          if (timeToHit > .72) { this.ring(target, 24 + timeToHit * 6, '#ed9b9c66', 1); this.line([B.batteryAt(1), target], '#ed9b9c25', .7, true); }
          for (let i = 0; i < 3; i++) {
            const from = B.batteryAt(i); this.glow(from.x, from.y, 17 + charge * 20, 'red', reduced ? .25 : charge * .75);
            const bend = -Math.max(65, 150 - (target.y - 383) * .3) - (i - 1) * 12;
            if (!reduced) this.bolt(from, { x: target.x + (i - 1) * 9, y: target.y + (i - 1) * 5 }, (1 - timeToHit / .72) - i * .018, 'red', 1.7, bend);
          }
          const ownHit = view.prediction?.events.find(ev => ev.type === 'hit' && Math.abs(ev.t - next * 5) < .02);
          if (ownHit && !reduced) this.bolt(B.batteryAt(0), ownHit, 1 - timeToHit / .65, 'red', 1.3);
        }
        if (s.phase === 1 && s.tactic === 'escort') for (const at of [4.5, 7.5]) {
          const progress = (s.flightT - (at - .65)) / .65;
          if (progress >= 0 && progress <= 1 && !reduced) this.bolt(B.batteryAt(2), E.allyAt(at), progress, 'red', 2, -17);
        }
      }
      for (const fx of battle.effects) {
        const age = battle.time - fx.at;
        if (fx.type === 'fire') {
          if (!reduced) {
            const angle = Math.atan2(E.FORT.y - fx.y, E.FORT.x - fx.x);
            for (const side of [-1, 1]) { const muzzle = { x: fx.x - Math.sin(angle) * side * 5, y: fx.y + Math.cos(angle) * side * 5 }; this.bolt(muzzle, { x: E.FORT.x + side * 9, y: E.FORT.y }, age / .2, 'ice', 1); }
            this.glow(fx.x, fx.y, 22, 'ice', Math.max(0, 1 - age / .12));
          }
          this.explosion(E.FORT, age - .2, fx.seed, .28, 'ice', reduced);
        } else if (fx.type === 'torpedo') {
          if (!reduced) { this.bolt(fx, E.FORT, age / .65, 'gold', 2.5, -40); this.glow(fx.x, fx.y, 28, 'gold', Math.max(0, 1 - age / .2)); }
          this.explosion(E.FORT, age - .65, fx.seed, .6, 'gold', reduced);
        } else if (fx.type === 'fleet-fire') {
          const p = (age - fx.delay) / .63;
          if (!reduced) {
            this.bolt(fx, fx.target, p, fx.index === 0 ? 'gold' : 'ice', fx.index === 0 ? 2.4 : 1.1, Math.max(0, 175 - Math.max(0, fx.x - 200) * .55) + fx.index * 8);
            if (fx.index === 0) for (const side of [-1, 1]) this.bolt({ x: fx.x - 12, y: fx.y + side * 12 }, { x: fx.target.x + side * 10, y: fx.target.y + side * 8 }, p - .035, 'gold', 1.3, Math.max(0, 175 - Math.max(0, fx.x - 200) * .55));
            this.glow(fx.x, fx.y, fx.index === 0 ? 44 : 20, fx.index === 0 ? 'gold' : 'ice', Math.max(0, 1 - (age - fx.delay) / .24));
          }
        } else if (fx.type === 'fort-impact') this.explosion(fx, age, fx.seed, fx.heavy ? 1.4 : .55, fx.heavy ? 'gold' : 'ice', reduced);
        else if (fx.type === 'wreck') {
          this.explosion(fx, age, fx.seed, 1.15, 'gold', reduced);
          if (age > .35 && age < 7) {
            c.save(); c.globalAlpha = .65 * Math.max(0, 1 - age / 7);
            for (let i = 0; i < (reduced ? 3 : 9); i++) {
              const a = i * 2.4, d = reduced ? 10 : age * (6 + i * 2); c.save(); c.translate(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d); c.rotate(a + (reduced ? 0 : age * .45)); c.fillStyle = i % 2 ? '#605969' : '#b89277'; c.fillRect(-3, -1.5, 4 + i % 3, 3); c.restore();
            } c.restore();
          }
        } else if (['hit', 'ally-hit', 'storm-hit'].includes(fx.type)) this.explosion(fx, age, fx.seed, .65, fx.type === 'storm-hit' ? 'ice' : 'gold', reduced);
        else if (['signal', 'jammed'].includes(fx.type) && age < 1.8) {
          const radius = reduced ? 36 : 18 + age * (fx.type === 'jammed' ? 120 : 65);
          c.save(); c.globalAlpha = Math.max(0, 1 - age / 1.8); this.ring(fx, radius, '#d8bce6', 1.5); this.ring(fx, radius * .8, '#c4d9ff66', .7); this.glow(fx.x, fx.y, 75, 'ice', .35);
          if (fx.type === 'jammed') for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; this.line([{x:fx.x+Math.cos(a)*75,y:fx.y+Math.sin(a)*75},{x:fx.x+Math.cos(a+.1)*95,y:fx.y+Math.sin(a+.1)*95},{x:fx.x+Math.cos(a)*115,y:fx.y+Math.sin(a)*115}], '#dec6e9aa', 1); } c.restore();
        }
        else if (['blocked', 'protect', 'shield'].includes(fx.type) && age < 1.2) {
          c.save(); c.globalAlpha = (1 - age / 1.2) * .85;
          if (fx.type === 'protect' && !reduced) this.bolt(fx.from, fx, Math.min(1, age / .14), 'ice', 1.5);
          this.glow(fx.x, fx.y, 48, 'ice', reduced ? .2 : .55);
          c.strokeStyle = '#bbddff'; c.lineWidth = 1.6 / this.scale; c.beginPath(); c.arc(fx.x, fx.y, 27 + (reduced ? 0 : age * 8), -Math.PI * .85, Math.PI * .85); c.stroke();
          if (!reduced) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; this.line([{ x: fx.x + Math.cos(a) * 20, y: fx.y + Math.sin(a) * 20 }, { x: fx.x + Math.cos(a) * (26 + age * 30), y: fx.y + Math.sin(a) * (26 + age * 30) }], '#abd0ff88', .7); } c.restore();
        } else if (fx.type === 'overload') {
          if (fx.tactic === 'escort' && !reduced) this.bolt(E.allyAt(9), E.FORT, age / .27, 'gold', 3.2, -10);
          if (fx.tactic === 'rebound') this.explosion(fx.from, age, fx.seed, .9, 'gold', reduced);
          this.explosion(E.FORT, age - .28, fx.seed, 1.5, 'ice', reduced);
        }
      }
      this.shieldBreak(battle.breakAge, reduced);
    }
    background(t, reduced) {
      const c = this.c; c.fillStyle = '#0c111e'; c.fillRect(-2000, -2000, 5000, 5000);
      const nebula = c.createRadialGradient(830, 390, 30, 830, 390, 700); nebula.addColorStop(0, '#33334c80'); nebula.addColorStop(.45, '#1b244250'); nebula.addColorStop(1, '#10152500'); c.fillStyle = nebula; c.fillRect(-2000, -2000, 5000, 5000);
      const world = c.createRadialGradient(1080, 980, 110, 960, 950, 430); world.addColorStop(0, '#0e192d'); world.addColorStop(.86, '#23334c'); world.addColorStop(.97, '#4b5e7c'); world.addColorStop(1, '#b4c3d000'); c.fillStyle = world; c.beginPath(); c.arc(960, 950, 430, 0, TAU); c.fill();
      for (const s of this.stars) { c.globalAlpha = s.a * (reduced ? 1 : .86 + .14 * Math.sin(t * .6 + s.x)); c.fillStyle = s.r > 1 ? '#e0dbda' : '#9aa9c9'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); } c.globalAlpha = 1;
      c.strokeStyle = '#a6bddb09'; c.lineWidth = 1 / this.scale; c.beginPath(); for (let x = 50; x < E.W; x += 100) { c.moveTo(x, 10); c.lineTo(x, E.H - 10); } for (let y = 50; y < E.H; y += 100) { c.moveTo(10, y); c.lineTo(E.W - 10, y); } c.stroke();
      c.strokeStyle = '#b2b9d213'; c.beginPath(); c.ellipse(E.MOON.x, E.MOON.y, 230, 190, -.25, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(E.FORT.x, E.FORT.y, 202, 193, 0, 0, TAU); c.stroke();
    }
    environment(view, t) {
      const { state: s, reduced, mode } = view, c = this.c;
      for (const [i, rock] of E.wreckageAt(s).entries()) {
        if (mode === 'plan') this.line([rock, E.wreckageAt(s, s.t + 3)[i]], '#d1b4a65a', 1, true);
        c.save(); c.translate(rock.x, rock.y); c.rotate(i * .9 + s.t * .08); c.beginPath();
        for (let j = 0; j < 8; j++) { const a = j * TAU / 8, r = rock.r * (j % 2 ? .82 : 1); j ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(r, 0); }
        c.closePath(); const metal = c.createLinearGradient(-rock.r, -rock.r, rock.r, rock.r); metal.addColorStop(0, '#657187'); metal.addColorStop(.4, '#343e51'); metal.addColorStop(1, '#111b2c'); c.fillStyle = metal; c.strokeStyle = '#acb7c48a'; c.lineWidth = 1 / this.scale; c.fill(); c.stroke();
        this.line([{x:-rock.r*.7,y:-5},{x:rock.r*.65,y:-5}], '#c2c6cd70', .8); this.line([{x:-rock.r*.7,y:5},{x:rock.r*.65,y:5}], '#171c2a', 2);
        c.fillStyle = '#d0ad87'; c.fillRect(-rock.r*.45,-rock.r*.5,6,3); c.restore(); this.ring(rock, rock.r, '#dfa7aa29', .7);
      }
      const storm = E.stormAt(s);
      if (storm) {
        const color = storm.active ? '#d7b5f6' : '#98b2df', power = storm.active ? 1 : storm.warning ? .45 : .12;
        c.fillStyle = storm.active ? '#c3a2ed17' : '#a5beef07'; c.fillRect(storm.x-storm.r, storm.top, storm.r*2, storm.bottom-storm.top);
        for (const side of [-1, 1]) this.line([{x:storm.x+side*storm.r,y:storm.top},{x:storm.x+side*storm.r,y:storm.bottom}], storm.active ? '#d5b3f95c' : '#9ebee933', .6, !storm.active);
        for (let strand = 0; strand < 3; strand++) {
          const points = Array.from({length:30}, (_,i) => ({x:storm.x+(reduced ? Math.sin(i*3+strand)*4 : Math.sin(i*2.7+t*8+strand*2)*Math.sin(i*.7+t*5)*storm.r*.8),y:storm.top+i/29*(storm.bottom-storm.top)}));
          c.save(); c.globalAlpha = power * (strand ? .32 : .8); this.line(points, color, strand ? .8 : 1.5); c.restore();
        }
        for (const y of [storm.top, storm.bottom]) { this.glow(storm.x,y,38,'ice',power*.6); this.ring({x:storm.x,y},8,color,1); }
      }
      if (s.phase === 0) {
        const p = E.operation(s.operation).signal; c.save(); c.globalAlpha = s.signal ? .3 : 1;
        this.glow(p.x,p.y,44,'gold',.25); this.ring(p,p.r,'#dfbd8970',1);
        c.translate(p.x,p.y); c.rotate(Math.PI/4); c.fillStyle = '#34364a'; c.strokeStyle = '#e3c797'; c.lineWidth = 1.2/this.scale; c.fillRect(-6,-6,12,12); c.strokeRect(-6,-6,12,12); c.restore();
        if (!s.signal) this.label('БОНУС',p.x,p.y-p.r-12,palette.gold,'center',8);
      }
    }
    fortress(state, t, reduced, battle) {
      const c = this.c, p = E.FORT, age = battle.breakAge, open = state.phase === 2 || age !== null && age > .32 || state.phase === 1 && state.status === 'won' && age === null;
      const charging = !open && !state.jam && state.status === 'running' ? B.clamp((state.t % 5 - 3.85) / .7, 0, 1) : 0;
      c.save(); c.translate(p.x, p.y);
      const halo = c.createRadialGradient(0, 0, 35, 0, 0, 120); halo.addColorStop(0, '#b6abc82a'); halo.addColorStop(1, '#b6abc800'); c.fillStyle = halo; c.fillRect(-120, -120, 240, 240);
      for (let i = 0; i < 12; i++) {
        c.save(); c.rotate(i * TAU / 12); c.fillStyle = i % 3 === 0 ? '#505168' : '#2e3348'; c.strokeStyle = '#8b92a15c'; c.lineWidth = .8; c.beginPath(); c.moveTo(47, -8); c.lineTo(78 + (i % 3 === 0 ? 12 : 0), -11); c.lineTo(82 + (i % 3 === 0 ? 12 : 0), 0); c.lineTo(78 + (i % 3 === 0 ? 12 : 0), 11); c.lineTo(47, 8); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = open ? '#bdd6ff' : '#d5b48b'; c.fillRect(73, -1.4, 8, 2.8); c.fillStyle = '#151b2b'; c.fillRect(58, -5, 11, 10); c.restore();
      }
      for (const [r, width, color] of [[62, 7, '#414354'], [56, 2, '#8d8d9a'], [44, 7, '#272c40'], [37, 1, '#a4abbf']]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
      c.fillStyle = '#0c101e'; c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.fill();
      const core = c.createRadialGradient(0, 0, 0, 0, 0, 27); core.addColorStop(0, open ? '#b6dbff' : '#ffe9c9'); core.addColorStop(.12, open ? '#799ac08a' : '#dbba7b99'); core.addColorStop(1, '#d7b47800'); c.fillStyle = core; c.fillRect(-30, -30, 60, 60);
      c.strokeStyle = '#a5afbd88'; c.lineWidth = 2; c.beginPath(); c.moveTo(-24, 0); c.lineTo(24, 0); c.moveTo(0, -24); c.lineTo(0, 24); c.stroke();
      if (!open) {
        const overload = age !== null, charge = overload ? .85 : charging * .4;
        c.fillStyle = overload ? '#b3d5ff12' : '#deb98608'; c.beginPath(); c.arc(0, 0, 113, Math.PI - 1.19, Math.PI + 1.19); c.arc(0, 0, 88, Math.PI + 1.19, Math.PI - 1.19, true); c.closePath(); c.fill();
        for (const [r, width, color] of [[112, 12, '#c0d3ff0a'], [111, 2.2, overload ? '#e5f1ff' : '#e6c095a0'], [119, .6, '#d9c6b333']]) { c.beginPath(); c.arc(0, 0, r, Math.PI - 1.19, Math.PI + 1.19); c.strokeStyle = color; c.lineWidth = width / Math.max(.7, this.scale); c.stroke(); }
        for (let i = 0; i < 18; i++) { const a = Math.PI - 1.17 + i * .13;
          c.beginPath(); c.arc(0, 0, 104, a, a + .095); c.lineTo(Math.cos(a + .095) * 116, Math.sin(a + .095) * 116); c.arc(0, 0, 116, a + .095, a, true); c.closePath(); c.strokeStyle = overload ? '#c8e5ffc9' : '#e4cfab38'; c.lineWidth = .6 / this.scale; c.stroke();
        }
        this.glow(-77, 0, 45 + charge * 55, overload ? 'ice' : 'red', reduced ? charge * .2 : charge);
        for (let i = 0; i < 3; i++) { const port = B.batteryAt(i); c.fillStyle = '#222535'; c.fillRect(port.x - p.x - 8, port.y - p.y - 4, 17, 8); c.fillStyle = charging > .1 ? '#f8b2a0' : '#b49e97'; c.fillRect(port.x - p.x - 9, port.y - p.y - 2, 4, 4); }
      } else {
        c.strokeStyle = '#495777'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 102, 1.95, 2.35); c.stroke(); c.beginPath(); c.arc(0, 0, 102, 4.2, 4.45); c.stroke();
        for (let i = 0; i < 5; i++) { const a = i * 2.7; this.glow(Math.cos(a) * 52, Math.sin(a) * 52, 20 + i * 3, i % 2 ? 'gold' : 'smoke', .32); }
      }
      c.restore(); this.label(open ? 'ЩИТ ОТКЛЮЧЁН' : 'КРЕПОСТЬ', p.x, p.y + 141, open ? palette.ice : '#c7bda9', 'center', 9);
      if (state.phase < 2 && state.status !== 'won') this.label(state.jam ? 'ЗАЛП БУДЕТ ЗАГЛУШЁН' : 'ЗАЛП ' + (5 - state.t % 5).toFixed(1) + ' с', p.x, p.y - 136, state.jam ? palette.ice : palette.red, 'center', 9);
      if (state.charge > 0 && !open) { c.strokeStyle = '#d6e8ff'; c.lineWidth = 3 / this.scale; c.beginPath(); c.arc(p.x,p.y,42,-Math.PI/2,-Math.PI/2+TAU*state.charge/.8); c.stroke(); }
    }
    draw(view, clock) {
      const { state: s, prediction, phase, tactic, plan, reduced, showForecast, editing, previous, battle } = view;
      if (!s) return; this.camera(view); const c = this.c, t = reduced ? 0 : clock, scale = this.scale;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.width, this.height); c.translate(this.ox, this.oy); c.scale(scale, scale);
      if (!reduced && battle.breakAge !== null) {
        const a = battle.breakAge - .32, shake = a > 0 && a < .65 ? 1.7 * (1 - a / .65) : 0;
        c.translate(Math.sin(a * 53) * shake / scale, Math.cos(a * 43) * shake * .65 / scale);
      }
      this.background(t, reduced);
      // The moon's geometric shadow is the same occlusion used by the simulation.
      if (phase === 0) {
        const angle = Math.atan2(E.MOON.y - E.FORT.y, E.MOON.x - E.FORT.x), da = Math.asin(E.MOON.r / E.distance(E.MOON, E.FORT));
        c.beginPath(); c.moveTo(E.FORT.x, E.FORT.y); c.lineTo(E.FORT.x + Math.cos(angle - da) * 1400, E.FORT.y + Math.sin(angle - da) * 1400); c.lineTo(E.FORT.x + Math.cos(angle + da) * 1400, E.FORT.y + Math.sin(angle + da) * 1400); c.closePath(); c.fillStyle = '#04091480'; c.fill(); this.label('ТЕНЬ', 205, 365, '#9da8bb', 'center', 9);
      }
      if (phase === 1 && s.status !== 'won') {
        c.save(); c.strokeStyle = '#dcc39a22'; c.setLineDash([3 / scale, 6 / scale]); c.lineWidth = 1 / scale; c.strokeRect(540, 65, 460, 505); c.restore();
        if (editing) { this.ring(E.FORT, 118, '#ed8f9d44'); this.ring(E.MOON, E.MOON.r + 45, '#ed8f9d44'); }
        const anchor = { x: plan.ax, y: plan.ay }, good = E.validAnchor(plan);
        const field = c.createRadialGradient(anchor.x, anchor.y, 4, anchor.x, anchor.y, 160); field.addColorStop(0, '#99b9ed29'); field.addColorStop(1, '#99b9ed00'); c.fillStyle = field; c.fillRect(anchor.x - 160, anchor.y - 160, 320, 320);
        for (const r of [40, 78, 120]) this.ring(anchor, r, '#9fbef229', .6);
        c.save(); c.translate(anchor.x, anchor.y); c.rotate(Math.PI / 4); c.fillStyle = '#17233c'; c.strokeStyle = good ? palette.ice : palette.red; c.lineWidth = 1.5 / scale; const r = Math.max(10, 8 / scale); c.fillRect(-r, -r, r * 2, r * 2); c.strokeRect(-r, -r, r * 2, r * 2); c.restore(); this.ring(anchor, Math.max(23, 16 / scale), '#bed6ff55');
        this.label(editing ? 'ПЕРЕМЕСТИ ЯКОРЬ' : 'ЯКОРЬ', anchor.x, Math.max(16 / scale, anchor.y - Math.max(32, 23 / scale)), good ? palette.ice : palette.red, 'center', 9);
      }
      const moonGlow = c.createRadialGradient(E.MOON.x, E.MOON.y, 80, E.MOON.x, E.MOON.y, 118); moonGlow.addColorStop(0, '#b3c1db19'); moonGlow.addColorStop(1, '#b3c1db00'); c.fillStyle = moonGlow; c.fillRect(E.MOON.x - 120, E.MOON.y - 120, 240, 240);
      c.drawImage(this.moon, E.MOON.x - E.MOON.r, E.MOON.y - E.MOON.r, E.MOON.r * 2, E.MOON.r * 2); this.ring(E.MOON, E.MOON.r, '#bbc4d62b', .7);
      if (phase !== 2) {
        this.ring(E.NODE, E.NODE.r, phase === 0 ? '#b9d4ff77' : '#c1d5ff33'); this.ring(E.NODE, 9, palette.ice);
        c.strokeStyle = palette.ice; c.lineWidth = 1 / scale; c.beginPath(); for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { c.moveTo(E.NODE.x + Math.cos(a) * 16, E.NODE.y + Math.sin(a) * 16); c.lineTo(E.NODE.x + Math.cos(a) * 24, E.NODE.y + Math.sin(a) * 24); } c.stroke();
        if (phase === 0) this.label('ЗАХВАТИТЬ', E.NODE.x, E.NODE.y - 47, palette.ice);
      }
      if (phase === 2) {
        for (const [i, rock] of E.debrisAt(s.t).entries()) {
          c.save(); c.translate(rock.x, rock.y); c.rotate(i + s.t * .1); c.beginPath(); for (let j = 0; j < 8; j++) { const a = j / 8 * TAU, r = rock.r * (.8 + Math.sin(j * 7 + i) * .2); if (j === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fillStyle = '#343c50'; c.strokeStyle = '#8f9aae88'; c.lineWidth = 1; c.fill(); c.stroke(); c.restore();
          if (view.mode === 'plan') this.line([rock, E.debrisAt(3)[i]], '#ad98a455', .8, true);
        }
        this.ring(E.EXIT, E.EXIT.r, '#c0d9ff88', 1); this.ring(E.EXIT, E.EXIT.r + 8, '#b8d6ff22', 1); this.label('ВЫХОД', E.EXIT.x, E.EXIT.y - 65, palette.ice);
      }
      this.environment(view, t);
      this.fortress(s, t, reduced, battle);
      this.fleet(s, battle, t, reduced);
      if (phase === 1 && tactic === 'breach' && s.status !== 'won') {
        const a = Math.acos(55 / 205); c.beginPath(); c.arc(E.FORT.x, E.FORT.y, 205, -a, a); c.closePath(); c.fillStyle = '#b9d1ff0c'; c.fill(); c.strokeStyle = '#c5dafe36'; c.lineWidth = 1; c.stroke(); this.label('СЕКТОР ОГНЯ', 1005, 490, palette.ice, 'center', 9);
      }
      if (phase === 1 && tactic === 'rebound' && s.status !== 'won') { this.line([{x:680,y:255},{x:680,y:450}], '#e9c89a55', .8, true); this.label('РАЗВОРОТ', 615, 245, palette.gold, 'center', 9); }
      if (phase === 1 && tactic === 'escort') {
        if (s.status !== 'won') {
        const points = Array.from({ length: 46 }, (_, i) => E.allyAt(i / 5)); this.line(points, '#dbc29b88', 1, true);
        for (const at of [4.5, 7.5]) { const p = E.allyAt(at); this.ring(p, 17, '#e7c69a88'); this.label(at.toFixed(1) + ' с', p.x - 25, p.y + 24, palette.gold, 'center', 9); }
        }
        const ally = E.allyAt(s.flightT), next = E.allyAt(s.flightT + .1); this.ship({ ...ally, angle: Math.atan2(next.y - ally.y, next.x - ally.x) }, palette.gold, 1.25, 'atlas', t, s.flightT > 0 && s.status === 'running');
        if (s.status !== 'won') { this.ring(s, 145, '#abcaff44', .8); this.label('ЗВЕНО ' + s.allyHull + '/2', ally.x, ally.y - 28, palette.gold, 'center', 9); }
      }
      if (previous && view.mode === 'plan') this.line(previous.path, '#d3899930', 1, true);
      if (showForecast && prediction && view.mode === 'plan') {
        this.line(prediction.path, prediction.status === 'won' ? '#b4d2fb99' : '#bcc5d46b', 1.2, true);
        for (const p of prediction.path.filter((_, i) => i > 0 && i % 40 === 0)) { c.fillStyle = '#d8e5ff'; c.beginPath(); c.arc(p.x, p.y, 2 / scale, 0, TAU); c.fill(); }
        const p = prediction.finish; if (p) { this.ring(p, 7 / scale, prediction.status === 'won' ? '#c4dcff' : '#df99a9', 1); if (prediction.status !== 'won') this.line([{ x: p.x - 4 / scale, y: p.y - 4 / scale }, { x: p.x + 4 / scale, y: p.y + 4 / scale }], palette.red); }
      }
      const history = s.path.slice(-100); this.line(history, tactic === 'rebound' && phase === 1 ? '#e6bd8733' : '#aec9ff22', 5); this.line(history, tactic === 'rebound' && phase === 1 ? '#f0ce9bbb' : '#c6dbffaa', 1.5);
      if (view.mode === 'plan' && !editing) {
        const a = plan.angle * Math.PI / 180, length = Math.max(70, 64 / scale), tip = { x: s.x + Math.cos(a) * length, y: s.y + Math.sin(a) * length };
        this.line([s, tip], view.aiming ? '#dceaffdd' : '#c5d9f56b', view.aiming ? 1.8 : 1);
        for (const side of [-1, 1]) this.line([tip, { x: tip.x - Math.cos(a + side * .55) * 11 / scale, y: tip.y - Math.sin(a + side * .55) * 11 / scale }], '#d9e8ffbb', 1.5);
        this.ring(tip, 8 / scale, view.aiming ? '#d9e8ff99' : '#c1d5f133', 1);
        if (view.aiming) this.label(plan.angle.toFixed(1) + '°', tip.x, tip.y - 16 / scale, palette.ice, 'center', 11);
      }
      if (tactic === 'rebound' && phase === 1) {
        if (battle.breakAge === null) {
          this.glow(s.x, s.y, 28, 'gold', reduced ? .4 : .9); c.fillStyle = '#fff1d4'; c.beginPath(); c.arc(s.x, s.y, 4, 0, TAU); c.fill();
          const tail = history.slice(-10); this.line(tail, '#eabe802e', 9); this.line(tail, '#f5d8a9c9', 2);
        }
        this.ship({ ...E.NODE, angle: -.2 }, palette.ice, 1, 'raven', t, false);
      }
      else {
        const firing = !reduced && battle.effects.some(fx => fx.type === 'fire' && battle.time - fx.at < .07), a = Math.atan2(E.FORT.y-s.y,E.FORT.x-s.x);
        this.ship(firing ? {...s,x:s.x-Math.cos(a)*2.5,y:s.y-Math.sin(a)*2.5} : s, palette.ice, 1.12, 'raven', t, view.mode === 'running' && s.flightT > 0);
        if (this.width < 600) { this.ring(s, Math.max(15, 7/scale), '#d9e7ff55', .8); }
      }
      if (s.shield > 0) this.ring(s, 32, '#bad8ffbb', 2);
      this.ordnance(view);
      this.overview(view);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  root.EclipseRenderer = EclipseRenderer;
})(window);

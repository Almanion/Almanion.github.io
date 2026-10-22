(function (root) {
  'use strict';
  const E = root.EclipseEngine, B = root.EclipseBattle, TAU = Math.PI * 2;
  const palette = { ice: '#b5d4ff', gold: '#e4bd87', red: '#ec8e9e' };
  function seeded(n) { return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
  class EclipseRenderer {
    constructor(canvas) {
      this.canvas = canvas; this.c = canvas.getContext('2d'); this.scale = 1; this.ox = 0; this.oy = 0;
      const rand = seeded(179); this.stars = Array.from({ length: 340 }, () => ({ x: rand() * 2100 - 500, y: rand() * E.H, r: .3 + rand(), a: .12 + rand() * .55 }));
      this.fragments = B.shieldPieces(); this.glows = {}; this.motion = new Map(); this.motionKey = ''; this.motionStateTime = 0;
      this.scene = { moon: E.MOON, fort: E.FORT, node: E.NODE, exit: E.EXIT };
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
      if (E.isExpedition?.(view.state)) {
        for (const p of E.missionObjects(view.state)) {
          if (p.kind === 'tether') continue;
          const color = ['sensor','target'].includes(p.kind) ? '#eaa6a91e' : p.kind === 'dust' ? '#9e87c51b' : p.kind === 'asteroid' ? '#c4af96' : p.kind === 'colony' ? '#ceb57e' : p.kind === 'rift' ? '#b6a1f4' : p.kind === 'patrol' ? '#e5a2a9' : p.done ? '#718299' : '#b8d6ff';
          c.fillStyle = color; c.beginPath();
          if (p.line) { c.fillRect(p.x-2,20,4,E.H-40); continue; }
          if (p.kind === 'sensor') { c.moveTo(p.x,p.y); c.arc(p.x,p.y,p.r,p.angle-p.spread/2,p.angle+p.spread/2); c.closePath(); }
          else c.arc(p.x,p.y,Math.max(p.kind === 'dust' ? 0 : 12,p.r || 12),0,TAU);
          c.fill();
        }
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(view.state.x,view.state.y,16,0,TAU); c.fill();
      } else {
        c.fillStyle = '#45516d'; c.beginPath(); c.arc(this.scene.moon.x, this.scene.moon.y, this.scene.moon.r, 0, TAU); c.fill();
        if (this.scene.companion) { const p = this.scene.companion; c.fillStyle = '#7086a5'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
        for (const p of E.hazardsAt ? E.hazardsAt(view.state) : []) { c.fillStyle = '#c3a881'; c.fillRect(p.x - p.halfWidth, p.y - p.halfHeight, p.halfWidth * 2, p.halfHeight * 2); }
        for (const [p, color, r] of [[this.scene.fort, '#cfb89e', 35], [view.phase === 2 ? this.scene.exit : this.scene.node, '#9cbeff', 25], [view.state, '#ffffff', 20]]) { c.fillStyle = color; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill(); }
      }
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
      if (points.length < 2) return; const c = this.c; c.save(); c.strokeStyle = color; c.lineWidth = width / this.scale; c.setLineDash(dashed ? [5 / this.scale, 5 / this.scale] : []); c.beginPath(); points.forEach((p, i) => i && !p.jump ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); c.restore();
    }
    label(text, x, y, color = '#94a2bb', align = 'center', size = 10) {
      const c = this.c; c.save(); c.font = `500 ${Math.max(12, size / this.scale)}px Manrope, sans-serif`; c.textAlign = align; c.fillStyle = '#0b1123c9'; const w = c.measureText(text).width, offset = align === 'center' ? w / 2 : align === 'right' ? w : 0;
      if (this.expedition) {
        const left = (6 - this.ox) / this.scale, right = (this.width - 6 - this.ox) / this.scale;
        if (this.closeCamera && (x < left || x > right)) { c.restore(); return; }
        x = E.clamp(x, left + offset, right - w + offset);
      }
      c.fillRect(x - offset - 4, y - Math.max(12, size / this.scale), w + 8, Math.max(16, (size + 4) / this.scale)); c.fillStyle = color; c.fillText(text, x, y); c.restore();
    }
    ring(p, r, color, width = 1) {
      const c = this.c; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.strokeStyle = color; c.lineWidth = width / this.scale; c.stroke();
    }
    motionFor(key, p, { heading, power = 0, size = 1, snap = false, maxRate } = {}) {
      if (!this.motion.has(key)) this.motion.set(key, new B.MotionTrack());
      return this.motion.get(key).update(p, this.motionTime, { heading, power, size, snap, maxRate });
    }
    wake(track, color = 'ice', reduced = false) {
      if (reduced || track.samples.length < 2) return;
      const c = this.c, samples = track.samples;
      // Exhaust is emitted at historical world positions. A turn never swings the
      // entire wake around the hull, and old gas expands while its light decays.
      c.save(); c.globalCompositeOperation = 'lighter';
      const rgb = color === 'gold' ? '239,190,121' : '143,191,255';
      for (let i = 1; i < samples.length; i++) {
        const p = samples[i], q = samples[i - 1], age = this.motionTime - p.at, fade = Math.max(0, 1 - age / 1.45), spread = age * age * 3;
        const offset = a => Math.sin(a.at * 19 + i * 1.3) * spread;
        const a = { x: q.x - Math.sin(q.angle) * offset(q), y: q.y + Math.cos(q.angle) * offset(q) }, b = { x: p.x - Math.sin(p.angle) * offset(p), y: p.y + Math.cos(p.angle) * offset(p) };
        const strength = Math.min(p.power, q.power) * fade * fade;
        this.line([a, b], `rgba(${rgb},${strength * .12})`, (2.3 + age * 4) * p.size);
        this.line([a, b], `rgba(${rgb},${strength * .44})`, Math.max(.4, p.size * .7 * fade));
        if (i % 4 === 0) { c.globalAlpha = strength * .33; c.fillStyle = '#d8eaff'; c.beginPath(); c.arc(b.x, b.y, Math.max(.45, (1 + age) * p.size * .6), 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
      c.restore();
    }
    plume(p, track, power, size, color, reduced) {
      if (power < .015 || reduced) return;
      const c = this.c, a = track.angle, pulse = .83 + .12 * Math.sin(this.motionTime * 47 + p.x) + .05 * Math.sin(this.motionTime * 83 + p.y), length = (8 + power * 22) * size * pulse;
      c.save(); c.translate(p.x, p.y); c.rotate(a); c.translate(-12 * size, 0);
      const g = c.createLinearGradient(0, 0, -length, 0); g.addColorStop(0, '#f0f7ff'); g.addColorStop(.16, color === 'gold' ? '#ffd7a3d9' : '#a8d4ffdf'); g.addColorStop(.48, color === 'gold' ? '#e9b57880' : '#86b9ff75'); g.addColorStop(1, '#9bbfff00');
      c.fillStyle = g; c.beginPath(); c.moveTo(1, -2.3 * size); c.bezierCurveTo(-length * .3, -3.5 * size * pulse, -length * .6, -size, -length, Math.sin(this.motionTime * 26) * size); c.bezierCurveTo(-length * .55, size, -length * .25, 3.1 * size * pulse, 1, 2.3 * size); c.closePath(); c.fill(); c.restore();
      this.glow(p.x - Math.cos(a) * 13 * size, p.y - Math.sin(a) * 13 * size, (11 + power * 8) * size, color, .24 + power * .18);
    }
    ship(p, color, scale, model, t, power = 0, key = model) {
      const heading = p.angle ?? Math.atan2(p.vy || 0, p.vx || 1), track = this.motionFor(key, p, { heading, power: Number(power), size: scale, snap: this.motionSnap }), c = this.c;
      this.wake(track, color === palette.gold ? 'gold' : 'ice', this.reduced);
      this.plume(p, track, Number(power), scale, color === palette.gold ? 'gold' : 'ice', this.reduced);
      c.save(); c.translate(p.x, p.y); c.rotate(track.angle); c.scale(1, 1 - Math.min(.18, Math.abs(track.bank)));
      root.Orbital.Fleet.draw(c, 0, 0, 0, color, scale, false, t, model, { finish: 'satin', livery: 'panels' });
      if (!this.reduced && Math.abs(track.rate) > .12) {
        const side = -Math.sign(track.rate), pulse = .65 + .35 * Math.sin(this.motionTime * 31) ** 2;
        c.fillStyle = `rgba(204,229,255,${pulse * .7})`; c.beginPath(); c.moveTo(9 * scale, side * 5 * scale); c.lineTo(6 * scale, side * (8 + Math.min(6, Math.abs(track.rate) * 6)) * scale); c.lineTo(5 * scale, side * 5 * scale); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(-9 * scale, -side * 5 * scale); c.lineTo(-7 * scale, -side * 10 * scale); c.lineTo(-5 * scale, -side * 5 * scale); c.closePath(); c.fill();
      }
      c.restore();
    }
    flagship(p, thrust, track) {
      const c = this.c; c.save(); c.translate(p.x, p.y); c.rotate(p.angle); c.scale(1, 1 - Math.abs(track?.bank || 0) * .4);
      for (const y of [-13, 0, 13]) {
        if (thrust && !this.reduced) {
          const length = 10 + thrust * 31 * (.8 + .2 * Math.sin(this.motionTime * 36 + y));
          const gradient = c.createLinearGradient(-54, y, -54 - length, y); gradient.addColorStop(0, '#e8f3ff'); gradient.addColorStop(.25, '#a9d3ff9c'); gradient.addColorStop(1, '#9abfff00'); c.fillStyle = gradient;
          c.beginPath(); c.moveTo(-54, y - 2); c.quadraticCurveTo(-72, y - 4, -54 - length, y + Math.sin(this.motionTime * 29 + y)); c.quadraticCurveTo(-72, y + 4, -54, y + 2); c.closePath(); c.fill(); this.glow(-58, y, 16, 'ice', .35 * thrust);
        }
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
      const c = this.c, p = this.scene.fort; if (age === null || age < .25 || age > 4.1) return;
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
      const age = battle.breakAge, advance = B.fleetAdvance(state, age);
      for (let i = state.fleet - 1; i >= 0; i--) {
        const p = B.fleetAt(i, advance, this.scene), capital = i === 0;
        const burn = state.phase === 2 ? Math.max(0, 1 - state.t / .9) * .72 : age === null ? 0 : Math.sin(B.clamp((age - .7) / 3.5, 0, 1) * Math.PI) * .85;
        const correction = advance > 15 ? Math.min(.13, Math.abs(p.angle) * .2) : 0, power = Math.max(burn, correction);
        if (capital) {
          const track = this.motionFor('capital', p, { heading: p.angle, power, size: 4.4, snap: this.motionSnap, maxRate: .7 });
          this.wake(track, 'ice', reduced); this.flagship({ ...p, angle: track.angle }, power, track);
        }
        else this.ship(p, '#9aabbf', i === 1 ? 1.6 : .92, i === 1 ? 'zenith' : 'pilgrim', t, power, 'fleet-' + i);
        // Small escorts establish scale around the flagship, without extra health units.
        if (capital) {
          for (const side of [-1, 1]) {
            const x = -28, y = side * 29, angle = p.angle;
            this.ship({ x: p.x + Math.cos(angle) * x - Math.sin(angle) * y, y: p.y + Math.sin(angle) * x + Math.cos(angle) * y, angle }, '#9eafc7', .42, 'raven', t, power, 'wing-' + side);
          }
          if (state.phase !== 2 && age === null) this.label('ЗАРЯ', p.x, p.y - 44, '#b1bdcf', 'center', 8);
        }
      }
    }
    ordnance(view) {
      const { state: s, battle, reduced, mode } = view, c = this.c;
      if (s.phase < 2 && s.status === 'running' && mode !== 'plan') {
        const next = Math.floor((s.t + 1e-7) / 5) + 1, timeToHit = next * 5 - s.t;
        if (timeToHit < 1.12 && !s.jam) {
          const target = B.fleetAt(Math.max(0, s.fleet - 1), B.fleetAdvance(s, battle.breakAge), this.scene), charge = B.clamp((1.12 - timeToHit) / .42, 0, 1);
          if (timeToHit > .72) { this.ring(target, 24 + timeToHit * 6, '#ed9b9c66', 1); this.line([B.batteryAt(1, this.scene), target], '#ed9b9c25', .7, true); }
          for (let i = 0; i < 3; i++) {
            const from = B.batteryAt(i, this.scene); this.glow(from.x, from.y, 17 + charge * 20, 'red', reduced ? .25 : charge * .75);
            const bend = -Math.max(65, 150 - (target.y - 383) * .3) - (i - 1) * 12;
            if (!reduced) this.bolt(from, { x: target.x + (i - 1) * 9, y: target.y + (i - 1) * 5 }, (1 - timeToHit / .72) - i * .018, 'red', 1.7, bend);
          }
          const ownHit = view.prediction?.events.find(ev => ev.type === 'hit' && Math.abs(ev.t - next * 5) < .02);
          if (ownHit && !reduced) this.bolt(B.batteryAt(0, this.scene), ownHit, 1 - timeToHit / .65, 'red', 1.3);
        }
        if (s.phase === 1 && s.tactic === 'escort') for (const at of [4.5, 7.5]) {
          const progress = (s.flightT - (at - .65)) / .65;
          if (progress >= 0 && progress <= 1 && !reduced) this.bolt(B.batteryAt(2, this.scene), E.allyAt(at, s), progress, 'red', 2, -17);
        }
      }
      for (const fx of battle.effects) {
        const age = battle.time - fx.at;
        if (fx.type === 'fire') {
          if (!reduced) {
            const angle = Math.atan2(this.scene.fort.y - fx.y, this.scene.fort.x - fx.x);
            for (const side of [-1, 1]) { const muzzle = { x: fx.x - Math.sin(angle) * side * 5, y: fx.y + Math.cos(angle) * side * 5 }; this.bolt(muzzle, { x: this.scene.fort.x + side * 9, y: this.scene.fort.y }, age / .2, 'ice', 1); }
            this.glow(fx.x, fx.y, 22, 'ice', Math.max(0, 1 - age / .12));
          }
          this.explosion(this.scene.fort, age - .2, fx.seed, .28, 'ice', reduced);
        } else if (fx.type === 'torpedo') {
          if (!reduced) { this.bolt(fx, this.scene.fort, age / .65, 'gold', 2.5, -40); this.glow(fx.x, fx.y, 28, 'gold', Math.max(0, 1 - age / .2)); }
          this.explosion(this.scene.fort, age - .65, fx.seed, .6, 'gold', reduced);
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
        else if (['signal', 'jammed', 'objective'].includes(fx.type) && age < 1.8) {
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
          if (fx.tactic === 'escort' && !reduced) this.bolt(E.allyAt(9, s), this.scene.fort, age / .27, 'gold', 3.2, -10);
          if (fx.tactic === 'rebound') this.explosion(fx.from, age, fx.seed, .9, 'gold', reduced);
          this.explosion(this.scene.fort, age - .28, fx.seed, 1.5, 'ice', reduced);
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
      c.strokeStyle = '#b2b9d213'; c.beginPath(); c.ellipse(this.scene.moon.x, this.scene.moon.y, 230, 190, -.25, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(this.scene.fort.x, this.scene.fort.y, 202, 193, 0, 0, TAU); c.stroke();
      if (this.scene.theme === 'binary') {
        const p = this.scene.companion;
        const light = c.createRadialGradient(p.x, p.y, p.r, p.x, p.y, 220); light.addColorStop(0, '#6685d825'); light.addColorStop(1, '#4465ad00'); c.fillStyle = light; c.fillRect(p.x - 220, p.y - 220, 440, 440);
        c.save(); c.strokeStyle = '#b8c9eb18'; c.lineWidth = .8 / this.scale; c.setLineDash([2 / this.scale, 12 / this.scale]); c.beginPath(); c.ellipse(500, 270, 310, 210, -.5, 0, TAU); c.stroke(); c.restore();
      } else if (this.scene.theme === 'ark') {
        // Distant structures are subdued; the solid, lit shutters are the actual obstacles.
        c.save(); c.globalAlpha = .44; c.fillStyle = '#1d2739'; c.strokeStyle = '#62728c44'; c.lineWidth = 2 / this.scale;
        for (const side of [-1, 1]) {
          const x = side < 0 ? 1010 : 1060; c.fillRect(x, 90, 15, 500); c.strokeRect(x, 90, 15, 500);
          for (let y = 105; y < 590; y += 65) { c.beginPath(); c.moveTo(x, y); c.lineTo(x - 85, y + 30); c.lineTo(x, y + 60); c.stroke(); }
        }
        c.restore(); this.label('ОРБИТАЛЬНАЯ ВЕРФЬ', 1035, 55, '#7e8ba6', 'center', 8);
      }
    }
    body(p, companion = false) {
      const c = this.c, glow = c.createRadialGradient(p.x, p.y, p.r * .8, p.x, p.y, p.r * 1.3); glow.addColorStop(0, companion ? '#8eb9ff22' : '#b3c1db19'); glow.addColorStop(1, '#b3c1db00'); c.fillStyle = glow; c.fillRect(p.x - p.r * 1.35, p.y - p.r * 1.35, p.r * 2.7, p.r * 2.7);
      c.save(); c.translate(p.x, p.y); if (companion) c.rotate(.7); c.drawImage(this.moon, -p.r, -p.r, p.r * 2, p.r * 2); c.restore(); this.ring(p, p.r, companion ? '#bedbff66' : '#bbc4d62b', .7);
    }
    environment(view, t) {
      const { state: s, reduced, mode } = view, c = this.c;
      for (const p of E.checkpoints ? E.checkpoints(s) : []) {
        c.save(); c.globalAlpha = p.done ? .35 : 1; this.ring(p, p.r, p.done ? '#b6ceec44' : '#f0c79599', 1.2); this.glow(p.x, p.y, p.r, 'gold', p.done ? .08 : .22);
        if (p.id === 'capsule') {
          c.fillStyle = '#a9b9cb'; c.strokeStyle = '#f0d1a4'; c.lineWidth = .9 / this.scale; c.beginPath(); c.roundRect(p.x - 10, p.y - 5, 20, 10, 4); c.fill(); c.stroke(); c.fillStyle = '#daeaff'; c.fillRect(p.x - 3, p.y - 3, 5, 6);
        } else { c.strokeStyle = '#f0d1a4'; c.lineWidth = 1.4 / this.scale; c.beginPath(); c.moveTo(p.x - 10, p.y + 7); c.lineTo(p.x, p.y - 8); c.lineTo(p.x + 10, p.y + 7); c.stroke(); }
        this.label(p.done ? 'ПРИНЯТО' : p.id === 'capsule' ? 'ЗАБРАТЬ КАПСУЛУ' : 'ПРОЙТИ МЕТКУ', p.x - p.r - 8 / this.scale, p.y - p.r - 14, p.done ? '#a9bad3' : palette.gold, 'right', 9); c.restore();
      }
      const gates = E.hazardsAt ? E.hazardsAt(s) : [];
      for (const p of gates) {
        const x = p.x - p.halfWidth, y = p.y - p.halfHeight, w = p.halfWidth * 2, h = p.halfHeight * 2;
        c.save(); const metal = c.createLinearGradient(x, 0, x + w, 0); metal.addColorStop(0, '#333c4b'); metal.addColorStop(.45, '#88909e'); metal.addColorStop(.5, '#566274'); metal.addColorStop(1, '#242d3e'); c.fillStyle = metal; c.fillRect(x, y, w, h); c.strokeStyle = '#bdb7ad'; c.lineWidth = 1 / this.scale; c.strokeRect(x, y, w, h);
        c.beginPath(); c.rect(x, y, w, h); c.clip(); c.strokeStyle = '#202535aa'; c.lineWidth = 5; for (let sy = y - 20; sy < y + h + 20; sy += 20) { c.beginPath(); c.moveTo(x, sy); c.lineTo(x + w, sy + 15); c.stroke(); } c.restore();
        for (const end of [-1, 1]) { const sy = p.y + end * p.halfHeight; this.line([{x:x-4,y:sy},{x:x+w+4,y:sy}], '#f1c18ce0', 2); this.glow(p.x, sy, 19, 'gold', .32); }
        if (mode === 'plan') { const future = E.hazardsAt(s, s.t + 2)[gates.indexOf(p)]; if (future) this.line([p, future], '#e1c4a169', .8, true); }
      }
      if (gates.length === 2) this.label('ДВИЖУЩИЙСЯ ПРОЁМ', gates[0].x + 5, (gates[0].y + gates[0].halfHeight + gates[1].y - gates[1].halfHeight) / 2, palette.gold, 'center', 8);
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
      if (s.phase === 0 && !(E.checkpoints && E.checkpoints(s).some(p => E.distance(p, E.operation(s.operation).signal) < p.r))) {
        const p = E.operation(s.operation).signal; c.save(); c.globalAlpha = s.signal ? .3 : 1;
        this.glow(p.x,p.y,44,'gold',.25); this.ring(p,p.r,'#dfbd8970',1);
        c.translate(p.x,p.y); c.rotate(Math.PI/4); c.fillStyle = '#34364a'; c.strokeStyle = '#e3c797'; c.lineWidth = 1.2/this.scale; c.fillRect(-6,-6,12,12); c.strokeRect(-6,-6,12,12); c.restore();
        if (!s.signal) this.label('БОНУС',p.x,p.y-p.r-12,palette.gold,'center',8);
      }
    }
    fortress(state, t, reduced, battle) {
      const c = this.c, p = this.scene.fort, age = battle.breakAge, open = state.phase === 2 || age !== null && age > .32 || state.phase === 1 && state.status === 'won' && age === null;
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
        for (let i = 0; i < 3; i++) { const port = B.batteryAt(i, this.scene); c.fillStyle = '#222535'; c.fillRect(port.x - p.x - 8, port.y - p.y - 4, 17, 8); c.fillStyle = charging > .1 ? '#f8b2a0' : '#b49e97'; c.fillRect(port.x - p.x - 9, port.y - p.y - 2, 4, 4); }
      } else {
        c.strokeStyle = '#495777'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 102, 1.95, 2.35); c.stroke(); c.beginPath(); c.arc(0, 0, 102, 4.2, 4.45); c.stroke();
        for (let i = 0; i < 5; i++) { const a = i * 2.7; this.glow(Math.cos(a) * 52, Math.sin(a) * 52, 20 + i * 3, i % 2 ? 'gold' : 'smoke', .32); }
      }
      c.restore(); this.label(open ? 'ЩИТ ОТКЛЮЧЁН' : 'КРЕПОСТЬ', p.x, p.y + 141, open ? palette.ice : '#c7bda9', 'center', 9);
      if (state.phase < 2 && state.status !== 'won') this.label(state.jam ? 'ЗАЛП БУДЕТ ЗАГЛУШЁН' : 'ЗАЛП ' + (5 - state.t % 5).toFixed(1) + ' с', p.x, p.y - 136, state.jam ? palette.ice : palette.red, 'center', 9);
      if (state.charge > 0 && !open) { c.strokeStyle = '#d6e8ff'; c.lineWidth = 3 / this.scale; c.beginPath(); c.arc(p.x,p.y,42,-Math.PI/2,-Math.PI/2+TAU*state.charge/.8); c.stroke(); }
    }
    expeditionBackground(view, t) {
      const c = this.c, theme = view.state.operation;
      c.fillStyle = theme === 'archive' ? '#080b15' : theme === 'sisyphus' ? '#11131b' : '#0b1020'; c.fillRect(-2000,-2000,5000,5000);
      const light = c.createRadialGradient(theme === 'sisyphus' ? 1160 : 650, theme === 'archive' ? 420 : 260, 0, 700, 330, 850);
      light.addColorStop(0, theme === 'sisyphus' ? '#ad835b29' : theme === 'archive' ? '#65527324' : '#5643883e'); light.addColorStop(1,'#17233d00'); c.fillStyle = light; c.fillRect(-500,-500,2200,1600);
      for (const star of this.stars) { c.globalAlpha = star.a * (theme === 'archive' ? .35 : .8); c.fillStyle = star.r > 1 ? '#e9e2db' : '#9eaecb'; c.beginPath(); c.arc(star.x,star.y,star.r,0,TAU); c.fill(); } c.globalAlpha = 1;
      if (theme === 'seam') {
        // An interrupted observatory, far behind the playable beacons. Its two
        // pieces never masquerade as a solid obstacle or a collision boundary.
        c.save(); c.translate(615,340); c.rotate(-.32); c.strokeStyle = '#a8a5c321'; c.lineWidth = 13;
        for (const [from,to] of [[-.95,.9],[1.25,3.9],[4.25,5.05]]) { c.beginPath(); c.ellipse(0,0,350,245,0,from,to); c.stroke(); }
        c.strokeStyle = '#c0c6de21'; c.lineWidth = 1.2;
        for (let i = 0; i < 28; i++) { const a = i/28*TAU; if (i%7 === 0) continue; const x = Math.cos(a), y = Math.sin(a); this.line([{x:x*336,y:y*231},{x:x*362,y:y*258}],'#b0b6cf23',.8); }
        c.restore(); this.label('РАСКОЛОТАЯ ОБСЕРВАТОРИЯ',615,630,'#7e839e','center',8);
      } else if (theme === 'sisyphus') {
        const sun = c.createRadialGradient(1260,90,5,1260,90,300); sun.addColorStop(0,'#ffe9bd7a'); sun.addColorStop(.12,'#edc18d2b'); sun.addColorStop(1,'#d89b6000'); c.fillStyle = sun; c.fillRect(900,-200,700,700);
        c.save(); c.strokeStyle = '#bfb3a51b'; c.lineWidth = 1/this.scale; c.setLineDash([2/this.scale,13/this.scale]);
        c.beginPath(); c.ellipse(650,970,760,680,-.2,3.4,5.4); c.stroke(); c.restore();
      }
      c.strokeStyle = '#a6bddb08'; c.lineWidth = 1/this.scale; c.beginPath();
      for (let x = 50; x < E.W; x += 100) { c.moveTo(x,10); c.lineTo(x,E.H-10); } for (let y = 50; y < E.H; y += 100) { c.moveTo(10,y); c.lineTo(E.W-10,y); } c.stroke();
    }
    rift(p, t, reduced) {
      const c = this.c, r = p.r || 30, pulse = reduced ? 1 : .94+.06*Math.sin(t*2.6+p.x), color = p.active === false ? '#7b83a5' : '#c0b0f2';
      this.glow(p.x,p.y,r*3,'ice',p.active === false ? .08 : .2);
      c.save(); c.translate(p.x,p.y); c.rotate(p.angle || 0);
      const lens = c.createRadialGradient(0,0,1,0,0,r*1.3); lens.addColorStop(0,'#030815'); lens.addColorStop(.6,'#32306499'); lens.addColorStop(.78,'#a0bfffff'); lens.addColorStop(.86,'#a39bdd77'); lens.addColorStop(1,'#8d87d800');
      c.fillStyle = lens; c.beginPath(); c.ellipse(0,0,r*.48*pulse,r*1.25,0,0,TAU); c.fill();
      for (const side of [-1,1]) { c.beginPath(); c.moveTo(side*r*.2,-r*1.2); c.bezierCurveTo(side*r*.65,-r*.55,side*r*.62,r*.65,side*r*.14,r*1.2); c.strokeStyle = color; c.lineWidth = (side<0 ? 1.6 : .8)/this.scale; c.stroke(); }
      c.strokeStyle = '#b5b7e351'; c.lineWidth = .8/this.scale;
      for (const side of [-1,1]) { c.beginPath(); c.moveTo(0,side*r*1.2); c.lineTo(-r*.15,side*r*1.65); c.lineTo(r*.18,side*r*2.05); c.lineTo(-r*.04,side*r*2.5); c.stroke(); }
      c.restore(); this.ring(p,r,'#b6b6e951',.7);
      const label = this.width<600 ? (p.exit ? '↗ ' : '')+(p.label || '').replace(/^(Разлом|Выход)\s+/,'') : p.label || 'РАЗЛОМ';
      this.label(label,p.x+r+9/this.scale,p.y+4/this.scale,color,'left',9);
      if (p.exit && p.active !== false) {
        const a=p.angle || 0, tip={x:p.x+Math.cos(a)*(r+40),y:p.y+Math.sin(a)*(r+40)};
        this.line([{x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r},tip],'#ccbdf386',.8);
        for (const side of [-1,1]) this.line([tip,{x:tip.x-Math.cos(a+side*.5)*10,y:tip.y-Math.sin(a+side*.5)*10}],'#ccbdf3a6',.8);
      }
    }
    relay(p) {
      const c = this.c, r = p.r || 28, active = p.active !== false && !p.done, color = p.done ? '#8c9cb7' : active ? '#cbe2ff' : '#8886a4';
      this.ring(p,r,p.done ? '#a5bed641' : active ? '#cadbff8a' : '#9b96b543',active ? 1.4 : .8);
      this.glow(p.x,p.y,r*1.5,'ice',p.done ? .16 : active ? .25 : .06);
      c.save(); c.translate(p.x,p.y); c.rotate(Math.PI/4); c.fillStyle = '#1d2941'; c.strokeStyle = color; c.lineWidth = 1/this.scale; c.fillRect(-10,-10,20,20); c.strokeRect(-10,-10,20,20); c.fillStyle = color; c.fillRect(-3,-3,6,6); c.restore();
      for (const side of [-1,1]) this.line([{x:p.x+side*13,y:p.y},{x:p.x+side*23,y:p.y}],color,.8);
      this.label((p.done ? '✓ ' : '')+(p.label || 'МАЯК'),p.x,p.y+r+20,color,'center',9);
    }
    asteroid(p, state, future) {
      const c = this.c, r = p.r || 38, random = seeded(361);
      if (future) this.line([p,future],p.safe ? '#b5d5ff75' : '#e6ac9c66',1,true);
      c.save(); c.translate(p.x,p.y); c.rotate(this.reduced ? 0 : state.t*.025); c.beginPath();
      for (let i = 0; i < 14; i++) { const a = i/14*TAU, radius = r*(.9+random()*.1); i ? c.lineTo(Math.cos(a)*radius,Math.sin(a)*radius) : c.moveTo(radius,0); } c.closePath();
      const rock = c.createLinearGradient(r,-r,-r,r); rock.addColorStop(0,'#c0ac91'); rock.addColorStop(.3,'#8a8179'); rock.addColorStop(.65,'#414651'); rock.addColorStop(1,'#202b3e'); c.fillStyle = rock; c.strokeStyle = '#e4cdae7a'; c.lineWidth = 1/this.scale; c.fill(); c.stroke(); c.clip();
      for (let i = 0; i < 24; i++) { const a = random()*TAU, d = Math.sqrt(random())*r, cr = 1+random()*r*.17, x = Math.cos(a)*d, y = Math.sin(a)*d; c.beginPath(); c.ellipse(x,y,cr,cr*.65,a,0,TAU); c.fillStyle = '#111b2c4d'; c.fill(); c.strokeStyle = '#eddbc330'; c.lineWidth = .7; c.stroke(); }
      c.restore(); this.ring(p,r+4,p.safe ? '#c7dbff55' : '#edb39455',.8);
      this.label(p.label || 'АСТЕРОИД',p.x,p.y-r-17,p.safe ? palette.ice : palette.gold,'center',9);
    }
    colony(p) {
      const c = this.c, r = p.r || 60;
      this.glow(p.x,p.y,r*2.2,'gold',.17); c.save(); c.translate(p.x,p.y);
      const glass = c.createRadialGradient(r*.4,-r*.5,0,0,0,r); glass.addColorStop(0,'#7a8ea5'); glass.addColorStop(.4,'#263952'); glass.addColorStop(1,'#111c2c');
      c.fillStyle = glass; c.beginPath(); c.arc(0,0,r,0,TAU); c.fill(); c.save(); c.clip();
      for (let row = -3; row <= 3; row++) for (let col = -4; col <= 4; col++) { const x = col*r*.19, y = row*r*.22, tall = ((col*3+row*7+39)%5+2)*r*.055; c.fillStyle = '#10182b'; c.fillRect(x-4,y-tall,8,tall+8); c.fillStyle = '#f2d3a5b0'; for (let k = 0; k < 3; k++) c.fillRect(x-2,y-tall+4+k*4,1.4,1.2); }
      c.strokeStyle = '#a0b9da4a'; c.lineWidth = .8; for (const width of [.4,.75]) { c.beginPath(); c.ellipse(0,0,r*width,r,0,0,TAU); c.stroke(); } c.restore();
      c.strokeStyle = '#e7d8be99'; c.lineWidth = 1.4/this.scale; c.beginPath(); c.arc(0,0,r,-1.4,1.5); c.stroke(); c.strokeStyle = '#8ba4c33d'; c.beginPath(); c.ellipse(0,0,r*1.23,r*.34,-.28,0,TAU); c.stroke(); c.restore();
      this.label(p.label || 'КОЛОНИЯ',p.x,p.y+r+22,palette.gold,'center',9);
    }
    archiveStation(p) {
      const c = this.c, zone = p.r || 105, r = Math.min(38,zone*.36);
      c.save(); c.translate(p.x,p.y); c.rotate(-.2); this.glow(0,0,r*2,'ice',p.done ? .25 : .08);
      for (const side of [-1,1]) { c.beginPath(); c.moveTo(-r*.15,-r*.2); c.lineTo(side*r*1.15,-r*.9); c.lineTo(side*r*.7,r*.65); c.lineTo(0,r*.25); c.closePath(); c.fillStyle = '#25273a'; c.strokeStyle = '#8a86a75e'; c.lineWidth = 1/this.scale; c.fill(); c.stroke(); this.line([{x:side*r*.7,y:-r*.55},{x:side*r*.45,y:r*.35}],'#b9acd480',.8); }
      c.fillStyle = '#0a1120'; c.strokeStyle = '#b8c6e6'; c.lineWidth = 1/this.scale; c.beginPath(); c.moveTo(0,-r); c.lineTo(r*.34,0); c.lineTo(0,r*.8); c.lineTo(-r*.34,0); c.closePath(); c.fill(); c.stroke(); c.fillStyle = p.done ? '#dbeaff' : '#b9acd4'; c.fillRect(-2,-r*.35,4,r*.65); c.restore();
      this.ring(p,zone,'#b4b3d375',.9);
      if (p.progress>0) { c.beginPath(); c.arc(p.x,p.y,zone,-Math.PI/2,-Math.PI/2+TAU*Math.min(1,p.progress)); c.strokeStyle = '#d2e5ff'; c.lineWidth = 2/this.scale; c.stroke(); }
      this.label(p.label || 'АРХИВ',p.x,p.y-zone-20,palette.ice,'center',9);
      this.label(p.done ? 'ДАННЫЕ ПОЛУЧЕНЫ' : 'ЗОНА ЗАГРУЗКИ',p.x,p.y+zone+17,'#aaa5c3','center',8);
    }
    sensor(p, state) {
      const c = this.c, spread = p.spread || .6, angle = p.angle || 0, danger = state.detection > 45;
      c.save(); c.beginPath(); c.moveTo(p.x,p.y); c.arc(p.x,p.y,p.r,angle-spread/2,angle+spread/2); c.closePath();
      const cone = c.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r); cone.addColorStop(0,danger ? '#fa8b9b24' : '#c9a3dc22'); cone.addColorStop(1,danger ? '#fa8b9b0d' : '#b8a4d90b'); c.fillStyle = cone; c.fill(); c.strokeStyle = danger ? '#efa0ab83' : '#c8aed86b'; c.lineWidth = .8/this.scale; c.stroke();
      c.setLineDash([2/this.scale,7/this.scale]); c.strokeStyle = '#ccbbdb2e'; c.beginPath(); c.arc(p.x,p.y,p.r*.55,angle-spread/2,angle+spread/2); c.stroke(); c.restore();
    }
    dust(p) {
      const c = this.c, r = p.r || 90;
      const cloud = c.createRadialGradient(p.x-r*.22,p.y-r*.3,0,p.x,p.y,r); cloud.addColorStop(0,'#65557e4d'); cloud.addColorStop(.6,'#3936504a'); cloud.addColorStop(.9,'#29283d2f'); cloud.addColorStop(1,'#161b2a05'); c.fillStyle = cloud; c.beginPath(); c.arc(p.x,p.y,r,0,TAU); c.fill();
      c.save(); c.setLineDash([2/this.scale,10/this.scale]); this.ring(p,r,'#b1a3cd4b',.7); c.restore();
      const rand = seeded(Math.round(p.x*17+p.y)); c.fillStyle = '#b1a5ba42'; for (let i = 0; i < 35; i++) { const a = rand()*TAU, d = Math.sqrt(rand())*r*.95; c.beginPath(); c.arc(p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,.3+rand(),0,TAU); c.fill(); }
      this.label(p.label || 'ПЫЛЕВОЕ УКРЫТИЕ',p.x,p.y+r+15,'#9e93b3','center',8);
    }
    tether(p, reduced) {
      const c = this.c, tension = B.clamp((p.tension || 0)/(p.maxTension || 1),0,1), color = tension > .72 ? '#f1a2a7' : '#d4dbe8';
      c.save(); const dx = p.toX-p.x, dy = p.toY-p.y, length = Math.hypot(dx,dy)||1, sag = (1-tension)*Math.min(16,length*.055), offset = reduced ? 0 : Math.sin(this.motionTime*13)*Math.min(2,tension*2);
      const mid = {x:(p.x+p.toX)/2-dy/length*(sag+offset),y:(p.y+p.toY)/2+dx/length*(sag+offset)};
      for (const [width,ink] of [[4,'#0c1429a6'],[1.1,color]]) { c.strokeStyle = ink; c.lineWidth = width/this.scale; c.beginPath(); c.moveTo(p.x,p.y); c.quadraticCurveTo(mid.x,mid.y,p.toX,p.toY); c.stroke(); }
      for (const point of [p,{x:p.toX,y:p.toY}]) this.ring(point,5/this.scale,color,.9); c.restore();
      this.label('ТРОС · '+Math.round(tension*100)+'%',mid.x,mid.y-14/this.scale,color,'center',8);
    }
    expeditionEffects(view) {
      const c = this.c, {battle,reduced} = view;
      for (const fx of battle.effects) {
        const age = battle.time-fx.at, life = Math.max(0,1-age/1.6); if (!life) continue;
        if (['portal','objective','download','won','quiet'].includes(fx.type)) {
          const portal = fx.type === 'portal', color = portal ? '#ccbcff' : fx.type === 'quiet' ? '#a7adcf' : '#c3ddff', radius = reduced ? 28 : 12+age*(portal ? 80 : 55);
          c.save(); c.globalAlpha = life; this.ring(fx,radius,color,1.3); this.ring(fx,radius*.7,color+'55',.6); this.glow(fx.x,fx.y,65,'ice',life*.28);
          if (portal && Number.isFinite(fx.toX) && Number.isFinite(fx.toY)) { this.ring({x:fx.toX,y:fx.toY},radius,color,.9); this.glow(fx.toX,fx.toY,60,'ice',life*.3); }
          if (!reduced) for (let i = 0; i < 10; i++) { const a = i/10*TAU+fx.seed, d = 12+age*(24+i*3); c.fillStyle = color; c.beginPath(); c.arc(fx.x+Math.cos(a)*d,fx.y+Math.sin(a)*d,.7/this.scale,0,TAU); c.fill(); } c.restore();
        } else if (['grapple','release','tether-warning','tether-break','scan','alert'].includes(fx.type)) {
          c.save(); c.globalAlpha = life*.7; const color = ['alert','tether-warning','tether-break'].includes(fx.type) ? '#efabb5' : '#c6d9f5'; this.ring(fx,reduced ? 25 : 13+age*45,color,1); this.glow(fx.x,fx.y,35,fx.type === 'alert' ? 'red' : 'ice',life*.3); c.restore();
        } else if (fx.type === 'lost') this.explosion(fx,age,fx.seed,.7,'gold',reduced);
        else if (fx.type === 'shield' && age < 1.2) { c.save(); c.globalAlpha = life; this.ring(fx,32,'#d1e4ff',1.5); c.restore(); }
      }
    }
    drawExpedition(view, t) {
      const {state:s,prediction,previous,showForecast,plan,reduced,battle} = view, c = this.c, scale = this.scale, objects = E.missionObjects(s);
      this.expeditionBackground(view,t);
      for (const p of objects) if (p.kind === 'dust') this.dust(p);
      for (const p of objects) if (p.kind === 'sensor' && p.active !== false) this.sensor(p,s);
      const future = E.missionObjects(s,s.t+.08);
      for (const p of objects) {
        if (p.kind === 'rift') { this.rift(p,t,reduced); if (view.mode === 'plan' && Number.isFinite(p.pairedX) && Number.isFinite(p.pairedY)) this.line([p,{x:p.pairedX,y:p.pairedY}],'#a49adf25',.7,true); }
        else if (p.kind === 'relay') this.relay(p);
        else if (p.kind === 'asteroid') {
          let time=24; for (const [position,velocity,edge] of [[p.x,p.vx,E.W],[p.y,p.vy,E.H]]) if (Math.abs(velocity)>.01) time=Math.min(time,((velocity>0?edge:0)-position)/velocity);
          this.asteroid(p,s,view.mode === 'plan' || s.tether?.attached ? {x:p.x+p.vx*time,y:p.y+p.vy*time} : null);
        }
        else if (p.kind === 'colony') this.colony(p);
        else if (p.kind === 'terminal') this.archiveStation(p);
        else if (p.kind === 'patrol') { const next=future.find(other=>other.id===p.id), angle=next ? Math.atan2(next.y-p.y,next.x-p.x) : p.angle; this.ship({...p,angle},'#bdadc7',.95,'pilgrim',t,view.mode === 'running' ? .12 : 0,'patrol-'+p.id); this.ring(p,p.r || 14,'#e2b5c357',.7); this.line([p,{x:p.x+Math.cos(p.angle)*29,y:p.y+Math.sin(p.angle)*29}],'#d8badba1',1); }
        else if (p.kind === 'wreck') {
          c.save(); c.translate(p.x,p.y); c.rotate(p.angle || .45); c.fillStyle = '#394153'; c.strokeStyle = '#aaa1b66b'; c.lineWidth = .8/scale; c.beginPath();
          for (let i=0;i<9;i++) { const angle=i/9*TAU, radius=p.r*(i%3 === 0 ? .86 : 1); i ? c.lineTo(Math.cos(angle)*radius,Math.sin(angle)*radius) : c.moveTo(radius,0); } c.closePath(); c.fill(); c.stroke();
          this.line([{x:-p.r*.6,y:-p.r*.25},{x:p.r*.65,y:-p.r*.25}],'#c3bdd578',.8); this.line([{x:-p.r*.4,y:p.r*.25},{x:p.r*.7,y:p.r*.25}],'#141b2c',2); c.restore(); this.ring(p,p.r,'#c2a4b74a',.7);
        }
        else if (p.kind === 'target') { c.save(); c.setLineDash([3/scale,6/scale]); this.ring(p,p.r,p.active === false ? '#a9bfd12c' : '#e5a3a366',.8); c.restore(); this.label(p.label || 'ОПАСНЫЙ КОРИДОР',p.x,p.y-p.r-14,p.active === false ? '#8d9bae' : '#d9a3a6','center',8); }
        else if (p.kind === 'exit' && p.line) { this.line([{x:p.x,y:25},{x:p.x,y:E.H-25}],p.active === false ? '#a4b3c733' : '#c7dcff75',.8,true); this.label(p.label || 'КОНТРОЛЬНЫЙ РУБЕЖ',p.x,45,p.active === false ? '#8e99ad' : palette.ice,'center',8); }
        else if (p.kind === 'exit') { this.ring(p,p.r,p.active === false ? '#a4b3c743' : '#d2e3ff9a',1.2); this.ring(p,p.r+7,'#c0d6f72b',.6); if (p.active !== false) this.glow(p.x,p.y,p.r*1.7,'ice',.1); this.label(p.label || 'ВЫХОД',p.x,p.y-p.r-13,p.active === false ? '#8e99ad' : palette.ice,'center',9); }
      }
      if (previous && view.mode === 'plan') this.line(previous.path,'#d3899930',1,true);
      if (showForecast && prediction && ['plan','paused'].includes(view.mode)) {
        const path = view.mode === 'plan' ? prediction.path : [s,...prediction.path.filter(p=>p.t>s.t)]; this.line(path,prediction.status === 'won' ? '#c8ddff99' : '#a3b2c66b',1.2,true);
        const finish = prediction.finish; if (finish) this.ring(finish,6/scale,prediction.status === 'won' ? '#cce1ff' : '#d69aa9',1);
      }
      this.line(s.path.slice(-180),'#aec9ff2b',.7);
      for (const p of objects) if (p.kind === 'tether') this.tether(p,reduced);
      if (view.mode === 'plan') {
        const a = plan.angle*Math.PI/180, length = Math.max(70,64/scale), tip = {x:s.x+Math.cos(a)*length,y:s.y+Math.sin(a)*length};
        this.line([s,tip],view.aiming ? '#e1ecffdc' : '#c2d6f36b',view.aiming ? 1.8 : 1); this.ring(tip,8/scale,'#d9e8ff66',.8);
        for (const side of [-1,1]) this.line([tip,{x:tip.x-Math.cos(a+side*.55)*11/scale,y:tip.y-Math.sin(a+side*.55)*11/scale}],'#d9e8ffbb',1.2);
        if (view.aiming) this.label(plan.angle.toFixed(1)+'°',tip.x,tip.y-16/scale,palette.ice,'center',11);
      }
      const portals = s.events.filter(ev=>ev.type === 'portal').length;
      if (this.playerPortalCount !== portals) { this.motion.delete('player'); this.playerPortalCount = portals; }
      const burst = battle.effects.filter(fx=>fx.type === 'boost' && battle.time-fx.at<.65).reduce((v,fx)=>Math.max(v,1-(battle.time-fx.at)/.65),0);
      const power = view.mode === 'running' && s.flightT>0 ? Math.max(Math.max(0,1-s.flightT/.72),burst) : 0;
      this.ship(s,palette.ice,1.12,'raven',t,power,'player');
      const brake = battle.effects.filter(fx=>fx.type === 'brake' && battle.time-fx.at<.48).reduce((v,fx)=>Math.max(v,1-(battle.time-fx.at)/.48),0);
      if (brake>0) { const angle = this.motion.get('player').angle; this.plume({x:s.x+Math.cos(angle)*9,y:s.y+Math.sin(angle)*9},{angle:angle+Math.PI},brake,.6,'ice',reduced); }
      if (s.quiet) { this.ring(s,23,'#ada5d980',.8); this.label('ТИХИЙ ХОД',s.x,s.y-31/scale,'#bdb4d9','center',8); }
      if (s.shield>0) this.ring(s,32,'#bad8ffbb',2);
      if (this.width<600) this.ring(s,Math.max(15,7/scale),'#d9e7ff55',.8);
      this.expeditionEffects(view); this.overview(view); c.setTransform(1,0,0,1,0,0);
    }
    draw(view, clock) {
      const { state: s, prediction, phase, tactic, plan, reduced, showForecast, editing, previous, battle } = view;
      if (!s) return;
      this.expedition = !!E.isExpedition?.(s);
      this.scene = E.scene ? E.scene(s) : this.scene;
      const key = [s.operation, phase, tactic].join(':');
      if (this.motionKey !== key || s.t < this.motionStateTime || battle.time < this.motionTime) { this.motion.clear(); this.motionKey = key; this.playerPortalCount = 0; }
      this.motionStateTime = s.t; this.motionTime = battle.time; this.motionSnap = view.mode === 'plan'; this.reduced = reduced;
      this.camera(view); const c = this.c, t = reduced ? 0 : clock, scale = this.scale;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.width, this.height); c.translate(this.ox, this.oy); c.scale(scale, scale);
      if (E.isExpedition?.(s)) { this.drawExpedition(view,t); return; }
      if (!reduced && battle.breakAge !== null) {
        const a = battle.breakAge - .32, shake = a > 0 && a < .65 ? 1.7 * (1 - a / .65) : 0;
        c.translate(Math.sin(a * 53) * shake / scale, Math.cos(a * 43) * shake * .65 / scale);
      }
      this.background(t, reduced);
      // The moon's geometric shadow is the same occlusion used by the simulation.
      if (phase === 0) {
        const angle = Math.atan2(this.scene.moon.y - this.scene.fort.y, this.scene.moon.x - this.scene.fort.x), da = Math.asin(this.scene.moon.r / E.distance(this.scene.moon, this.scene.fort));
        c.beginPath(); c.moveTo(this.scene.fort.x, this.scene.fort.y); c.lineTo(this.scene.fort.x + Math.cos(angle - da) * 1400, this.scene.fort.y + Math.sin(angle - da) * 1400); c.lineTo(this.scene.fort.x + Math.cos(angle + da) * 1400, this.scene.fort.y + Math.sin(angle + da) * 1400); c.closePath(); c.fillStyle = '#04091480'; c.fill(); this.label('ТЕНЬ', this.scene.moon.x + Math.cos(angle) * (this.scene.moon.r + 80), this.scene.moon.y + Math.sin(angle) * (this.scene.moon.r + 80), '#9da8bb', 'center', 9);
      }
      if (phase === 1 && s.status !== 'won') {
        c.save(); c.strokeStyle = '#dcc39a22'; c.setLineDash([3 / scale, 6 / scale]); c.lineWidth = 1 / scale; c.strokeRect(540, 65, 460, 505); c.restore();
        if (editing) { this.ring(this.scene.fort, 118, '#ed8f9d44'); this.ring(this.scene.moon, this.scene.moon.r + 45, '#ed8f9d44'); if (this.scene.companion) this.ring(this.scene.companion, this.scene.companion.r + 35, '#ed8f9d44'); }
        const anchor = { x: plan.ax, y: plan.ay }, good = E.validAnchor(plan, s);
        const field = c.createRadialGradient(anchor.x, anchor.y, 4, anchor.x, anchor.y, 160); field.addColorStop(0, '#99b9ed29'); field.addColorStop(1, '#99b9ed00'); c.fillStyle = field; c.fillRect(anchor.x - 160, anchor.y - 160, 320, 320);
        for (const r of [40, 78, 120]) this.ring(anchor, r, '#9fbef229', .6);
        c.save(); c.translate(anchor.x, anchor.y); c.rotate(Math.PI / 4); c.fillStyle = '#17233c'; c.strokeStyle = good ? palette.ice : palette.red; c.lineWidth = 1.5 / scale; const r = Math.max(10, 8 / scale); c.fillRect(-r, -r, r * 2, r * 2); c.strokeRect(-r, -r, r * 2, r * 2); c.restore(); this.ring(anchor, Math.max(23, 16 / scale), '#bed6ff55');
        this.label(editing ? 'ПЕРЕМЕСТИ ЯКОРЬ' : 'ЯКОРЬ', anchor.x, Math.max(16 / scale, anchor.y - Math.max(32, 23 / scale)), good ? palette.ice : palette.red, 'center', 9);
      }
      this.body(this.scene.moon); if (this.scene.companion) this.body(this.scene.companion, true);
      if (phase !== 2) {
        this.ring(this.scene.node, this.scene.node.r, phase === 0 ? '#b9d4ff77' : '#c1d5ff33'); this.ring(this.scene.node, 9, palette.ice);
        c.strokeStyle = palette.ice; c.lineWidth = 1 / scale; c.beginPath(); for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { c.moveTo(this.scene.node.x + Math.cos(a) * 16, this.scene.node.y + Math.sin(a) * 16); c.lineTo(this.scene.node.x + Math.cos(a) * 24, this.scene.node.y + Math.sin(a) * 24); } c.stroke();
        if (phase === 0) this.label('ЗАХВАТИТЬ', this.scene.node.x, this.scene.node.y - 47, palette.ice);
      }
      if (phase === 2) {
        for (const [i, rock] of E.debrisAt(s.t, s).entries()) {
          c.save(); c.translate(rock.x, rock.y); c.rotate(i + s.t * .1); c.beginPath(); for (let j = 0; j < 8; j++) { const a = j / 8 * TAU, r = rock.r * (.8 + Math.sin(j * 7 + i) * .2); if (j === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fillStyle = '#343c50'; c.strokeStyle = '#8f9aae88'; c.lineWidth = 1; c.fill(); c.stroke(); c.restore();
          if (view.mode === 'plan') this.line([rock, E.debrisAt(s.t + 3, s)[i]], '#ad98a455', .8, true);
        }
        this.ring(this.scene.exit, this.scene.exit.r, '#c0d9ff88', 1); this.ring(this.scene.exit, this.scene.exit.r + 8, '#b8d6ff22', 1); this.label('ВЫХОД', this.scene.exit.x, this.scene.exit.y - 65, palette.ice);
      }
      this.environment(view, t);
      this.fortress(s, t, reduced, battle);
      this.fleet(s, battle, t, reduced);
      if (phase === 1 && tactic === 'breach' && s.status !== 'won') {
        const a = Math.acos(55 / 205); c.beginPath(); c.arc(this.scene.fort.x, this.scene.fort.y, 205, -a, a); c.closePath(); c.fillStyle = '#b9d1ff0c'; c.fill(); c.strokeStyle = '#c5dafe36'; c.lineWidth = 1; c.stroke(); this.label('СЕКТОР ОГНЯ', this.scene.fort.x + 135, this.scene.fort.y + 165, palette.ice, 'center', 9);
      }
      if (phase === 1 && tactic === 'rebound' && s.status !== 'won') { const x = this.scene.fort.x - 190, y = this.scene.fort.y; this.line([{x,y:y-70},{x,y:y+125}], '#e9c89a55', .8, true); this.label('РАЗВОРОТ', x - 65, y - 80, palette.gold, 'center', 9); }
      if (phase === 1 && tactic === 'escort') {
        if (s.status !== 'won') {
        const points = Array.from({ length: 46 }, (_, i) => E.allyAt(i / 5, s)); this.line(points, '#dbc29b88', 1, true);
        for (const at of [4.5, 7.5]) { const p = E.allyAt(at, s); this.ring(p, 17, '#e7c69a88'); this.label(at.toFixed(1) + ' с', p.x - 25, p.y + 24, palette.gold, 'center', 9); }
        }
        const ally = E.allyAt(s.flightT, s), before = E.allyAt(Math.max(0, Math.min(8.92, s.flightT - .08)), s), next = E.allyAt(Math.min(9, s.flightT + .08), s);
        if (s.status === 'won' && battle.breakAge !== null) { const end = E.allyAt(9, s), tangent = E.allyAt(8.9, s); ally.x += (end.x - tangent.x) * battle.breakAge * 10; ally.y += (end.y - tangent.y) * battle.breakAge * 10; }
        const allyPower = s.flightT > 0 && s.status === 'running' ? Math.max(0, 1 - s.flightT / .9) * .8 + Math.max(0, 1 - Math.abs(s.flightT - 4.5) / .65) * .23 : 0;
        this.ship({ ...ally, angle: Math.atan2(next.y - before.y, next.x - before.x) }, palette.gold, 1.25, 'atlas', t, allyPower, 'bomber');
        if (s.status !== 'won') { this.ring(s, 145, '#abcaff44', .8); this.label('ЗВЕНО ' + s.allyHull + '/2', ally.x, ally.y - 28, palette.gold, 'center', 9); }
      }
      if (previous && view.mode === 'plan') this.line(previous.path, '#d3899930', 1, true);
      if (showForecast && prediction && (view.mode === 'plan' || view.mode === 'paused' && s.status === 'running')) {
        const route = view.mode === 'plan' ? prediction.path : [{ x: s.x, y: s.y, t: s.t }, ...prediction.path.filter(p => p.t > s.t)];
        this.line(route, prediction.status === 'won' ? '#b4d2fb99' : '#bcc5d46b', 1.2, true);
        for (const p of route.filter((_, i) => i > 0 && i % 40 === 0)) { c.fillStyle = '#d8e5ff'; c.beginPath(); c.arc(p.x, p.y, 2 / scale, 0, TAU); c.fill(); }
        const p = prediction.finish; if (p) { this.ring(p, 7 / scale, prediction.status === 'won' ? '#c4dcff' : '#df99a9', 1); if (prediction.status !== 'won') this.line([{ x: p.x - 4 / scale, y: p.y - 4 / scale }, { x: p.x + 4 / scale, y: p.y + 4 / scale }], palette.red); }
      }
      const history = s.path.slice(-100);
      // Flight telemetry is a quiet map reference, distinct from luminous exhaust.
      if (history.length > 1) this.line(history, tactic === 'rebound' && phase === 1 ? '#ddbd8755' : '#aec9ff2b', .7);
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
        this.ship({ ...this.scene.node, angle: -.2 }, palette.ice, 1, 'raven', t, false);
      }
      else {
        const burst = battle.effects.filter(fx => fx.type === 'boost' && battle.time - fx.at < .65).reduce((max, fx) => Math.max(max, 1 - (battle.time - fx.at) / .65), 0);
        const power = view.mode === 'running' && s.flightT > 0 ? Math.max(Math.max(0, 1 - s.flightT / .72), burst) : 0;
        this.ship(s, palette.ice, 1.12, 'raven', t, power, 'player');
        const brake = battle.effects.filter(fx => fx.type === 'brake' && battle.time - fx.at < .48).reduce((max, fx) => Math.max(max, 1 - (battle.time - fx.at) / .48), 0);
        if (brake > 0) { const angle = this.motion.get('player').angle, nose = { x: s.x + Math.cos(angle) * 9, y: s.y + Math.sin(angle) * 9 }; this.plume(nose, { angle: angle + Math.PI }, brake, .6, 'ice', reduced); }
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

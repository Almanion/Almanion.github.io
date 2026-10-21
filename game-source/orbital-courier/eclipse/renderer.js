(function (root) {
  'use strict';
  const E = root.EclipseEngine, TAU = Math.PI * 2;
  const palette = { ice: '#b5d4ff', gold: '#e4bd87', red: '#ec8e9e' };
  function seeded(n) { return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
  class EclipseRenderer {
    constructor(canvas) {
      this.canvas = canvas; this.c = canvas.getContext('2d'); this.scale = 1; this.ox = 0; this.oy = 0;
      const rand = seeded(179); this.stars = Array.from({ length: 340 }, () => ({ x: rand() * 2100 - 500, y: rand() * E.H, r: .3 + rand(), a: .12 + rand() * .55 }));
      this.moon = this.moonTexture(); this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
      this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr); this.dpr = dpr;
      this.scale = Math.min(this.width / E.W, this.height / E.H); this.ox = (this.width - E.W * this.scale) / 2; this.oy = (this.height - E.H * this.scale) / 2;
    }
    point(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect(); return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
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
    background(t, reduced) {
      const c = this.c; c.fillStyle = '#0c111e'; c.fillRect(-2000, -2000, 5000, 5000);
      const nebula = c.createRadialGradient(830, 390, 30, 830, 390, 700); nebula.addColorStop(0, '#33334c80'); nebula.addColorStop(.45, '#1b244250'); nebula.addColorStop(1, '#10152500'); c.fillStyle = nebula; c.fillRect(-2000, -2000, 5000, 5000);
      const world = c.createRadialGradient(1080, 980, 110, 960, 950, 430); world.addColorStop(0, '#0e192d'); world.addColorStop(.86, '#23334c'); world.addColorStop(.97, '#4b5e7c'); world.addColorStop(1, '#b4c3d000'); c.fillStyle = world; c.beginPath(); c.arc(960, 950, 430, 0, TAU); c.fill();
      for (const s of this.stars) { c.globalAlpha = s.a * (reduced ? 1 : .86 + .14 * Math.sin(t * .6 + s.x)); c.fillStyle = s.r > 1 ? '#e0dbda' : '#9aa9c9'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); } c.globalAlpha = 1;
      c.strokeStyle = '#a6bddb09'; c.lineWidth = 1 / this.scale; c.beginPath(); for (let x = 50; x < E.W; x += 100) { c.moveTo(x, 10); c.lineTo(x, E.H - 10); } for (let y = 50; y < E.H; y += 100) { c.moveTo(10, y); c.lineTo(E.W - 10, y); } c.stroke();
      c.strokeStyle = '#b2b9d213'; c.beginPath(); c.ellipse(E.MOON.x, E.MOON.y, 230, 190, -.25, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(E.FORT.x, E.FORT.y, 202, 193, 0, 0, TAU); c.stroke();
    }
    fortress(state, t, reduced) {
      const c = this.c, p = E.FORT, open = state.phase === 2 || state.phase === 1 && state.status === 'won';
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
      if (!open) { c.strokeStyle = '#e0b68d99'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 111, Math.PI - 1.16, Math.PI + 1.16); c.stroke(); c.lineWidth = 10; c.strokeStyle = '#d6ac7340'; c.stroke(); for (let a = Math.PI - 1.12; a < Math.PI + 1.12; a += .18) { c.beginPath(); c.arc(0, 0, 119, a, a + .06); c.lineWidth = .8; c.strokeStyle = '#e4d3a655'; c.stroke(); } }
      else { c.strokeStyle = '#b0d0ff55'; c.lineWidth = 1; c.setLineDash([3, 9]); c.beginPath(); c.arc(0, 0, 112, 0, TAU); c.stroke(); }
      c.restore(); this.label(open ? 'ЩИТ ОТКЛЮЧЁН' : 'КРЕПОСТЬ', p.x, p.y + 141, open ? palette.ice : '#c7bda9', 'center', 9);
      if (state.phase < 2 && state.status !== 'won') this.label('ЗАЛП ' + (5 - state.t % 5).toFixed(1) + ' с', p.x, p.y - 136, palette.red, 'center', 9);
    }
    draw(view, clock) {
      const { state: s, prediction, phase, tactic, plan, reduced, showForecast, editing, previous } = view;
      if (!s) return; const c = this.c, t = reduced ? 0 : clock, scale = this.scale;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.width, this.height); c.translate(this.ox, this.oy); c.scale(scale, scale);
      this.background(t, reduced);
      // The moon's geometric shadow is the same occlusion used by the simulation.
      if (phase === 0) {
        const angle = Math.atan2(E.MOON.y - E.FORT.y, E.MOON.x - E.FORT.x), da = Math.asin(E.MOON.r / E.distance(E.MOON, E.FORT));
        c.beginPath(); c.moveTo(E.FORT.x, E.FORT.y); c.lineTo(E.FORT.x + Math.cos(angle - da) * 1400, E.FORT.y + Math.sin(angle - da) * 1400); c.lineTo(E.FORT.x + Math.cos(angle + da) * 1400, E.FORT.y + Math.sin(angle + da) * 1400); c.closePath(); c.fillStyle = '#04091480'; c.fill(); this.label('ТЕНЬ', 205, 365, '#9da8bb', 'center', 9);
      }
      if (phase === 1) {
        c.save(); c.strokeStyle = '#dcc39a22'; c.setLineDash([3 / scale, 6 / scale]); c.lineWidth = 1 / scale; c.strokeRect(540, 65, 460, 505); c.restore();
        if (editing) { this.ring(E.FORT, 118, '#ed8f9d44'); this.ring(E.MOON, E.MOON.r + 45, '#ed8f9d44'); }
        const anchor = { x: plan.ax, y: plan.ay }, good = E.validAnchor(plan);
        const field = c.createRadialGradient(anchor.x, anchor.y, 4, anchor.x, anchor.y, 160); field.addColorStop(0, '#99b9ed29'); field.addColorStop(1, '#99b9ed00'); c.fillStyle = field; c.fillRect(anchor.x - 160, anchor.y - 160, 320, 320);
        for (const r of [40, 78, 120]) this.ring(anchor, r, '#9fbef229', .6);
        c.save(); c.translate(anchor.x, anchor.y); c.rotate(Math.PI / 4); c.fillStyle = '#17233c'; c.strokeStyle = good ? palette.ice : palette.red; c.lineWidth = 1.5 / scale; const r = Math.max(10, 8 / scale); c.fillRect(-r, -r, r * 2, r * 2); c.strokeRect(-r, -r, r * 2, r * 2); c.restore(); this.ring(anchor, Math.max(23, 16 / scale), '#bed6ff55');
        this.label(editing ? 'ПЕРЕМЕСТИ ЯКОРЬ' : 'ЯКОРЬ', anchor.x, anchor.y - Math.max(32, 23 / scale), good ? palette.ice : palette.red, 'center', 9);
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
      this.fortress(s, t, reduced);
      // The assault fleet advances after the shield is down.
      for (let i = 0; i < 6; i++) {
        if(i >= s.fleet) continue;
        const advance = phase === 2 ? Math.min(s.t, 10) * 17 : 0, x = 55 + i % 2 * 58 + advance, y = 395 + i * 40;
        this.line([{ x: x - 55, y: y + 8 }, { x, y }], '#c5af8c33', 1);
        this.ship({ x, y, angle: -.12 }, '#c3ae92', i === 2 ? 1.35 : .85, i === 2 ? 'atlas' : 'pilgrim', t, phase === 2);
      }
      if (phase === 1 && tactic === 'breach') {
        const a = Math.acos(55 / 205); c.beginPath(); c.arc(E.FORT.x, E.FORT.y, 205, -a, a); c.closePath(); c.fillStyle = '#b9d1ff0c'; c.fill(); c.strokeStyle = '#c5dafe36'; c.lineWidth = 1; c.stroke(); this.label('СЕКТОР ОГНЯ', 1005, 490, palette.ice, 'center', 9);
      }
      if (phase === 1 && tactic === 'rebound') { this.line([{x:680,y:255},{x:680,y:450}], '#e9c89a55', .8, true); this.label('РАЗВОРОТ', 615, 245, palette.gold, 'center', 9); }
      if (phase === 1 && tactic === 'escort') {
        const points = Array.from({ length: 46 }, (_, i) => E.allyAt(i / 5)); this.line(points, '#dbc29b88', 1, true);
        for (const at of [4.5, 7.5]) { const p = E.allyAt(at); this.ring(p, 17, '#e7c69a88'); this.label(at.toFixed(1) + ' с', p.x - 25, p.y + 24, palette.gold, 'center', 9); }
        const ally = E.allyAt(s.t), next = E.allyAt(s.t + .1); this.ship({ ...ally, angle: Math.atan2(next.y - ally.y, next.x - ally.x) }, palette.gold, 1.25, 'atlas', t, s.status === 'running');
        this.ring(s, 145, '#abcaff44', .8); this.label('ЗВЕНО ' + s.allyHull + '/2', ally.x, ally.y - 28, palette.gold, 'center', 9);
      }
      if (previous && view.mode === 'plan') this.line(previous.path, '#d3899930', 1, true);
      if (showForecast && prediction && view.mode === 'plan') {
        this.line(prediction.path, prediction.status === 'won' ? '#b4d2fb99' : '#bcc5d46b', 1.2, true);
        for (const p of prediction.path.filter((_, i) => i > 0 && i % 40 === 0)) { c.fillStyle = '#d8e5ff'; c.beginPath(); c.arc(p.x, p.y, 2 / scale, 0, TAU); c.fill(); }
        const p = prediction.finish; if (p) { this.ring(p, 7 / scale, prediction.status === 'won' ? '#c4dcff' : '#df99a9', 1); if (prediction.status !== 'won') this.line([{ x: p.x - 4 / scale, y: p.y - 4 / scale }, { x: p.x + 4 / scale, y: p.y + 4 / scale }], palette.red); }
      }
      const history = s.path.slice(-100); this.line(history, tactic === 'rebound' && phase === 1 ? '#e6bd8733' : '#aec9ff22', 5); this.line(history, tactic === 'rebound' && phase === 1 ? '#f0ce9bbb' : '#c6dbffaa', 1.5);
      if (tactic === 'rebound' && phase === 1) { c.fillStyle = '#ffe3af'; c.shadowColor = '#edc28a'; c.shadowBlur = reduced ? 0 : 14; c.beginPath(); c.arc(s.x, s.y, 5, 0, TAU); c.fill(); c.shadowBlur = 0; this.ship({ ...E.NODE, angle: -.2 }, palette.ice, 1, 'raven', t, false); }
      else this.ship(s, palette.ice, 1.12, 'raven', t, view.mode === 'running');
      if (s.shield > 0) this.ring(s, 32, '#bad8ffbb', 2);
      for (const ev of s.events.slice(-6)) {
        const age = s.t - ev.t; if (age > .7 || reduced && age > .12) continue;
        if (ev.type === 'fire') this.line([ev, E.FORT], '#c8e3ffb0', 1.2);
        if (ev.type === 'salvo' && phase < 2) this.line([E.FORT, { x: 113, y: 595 }], '#e7a7a0' + (reduced ? '25' : '80'), reduced ? 1 : 2);
        if (ev.type === 'hit' || ev.type === 'blocked' || ev.type === 'ally-hit') this.line([E.FORT, ev], '#e7a7a080', 1);
        if (['hit', 'ally-hit', 'protect', 'blocked'].includes(ev.type)) this.ring(ev, 24 + age * 50, ev.type === 'hit' || ev.type === 'ally-hit' ? palette.red : palette.ice, 1);
      }
      if (s.status === 'won' && phase === 1) { this.line([{ x: 80, y: 475 }, E.FORT], '#e7c69a66', 2); this.ring(E.FORT, 95, '#e8c18c88', 1); }
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  root.EclipseRenderer = EclipseRenderer;
})(window);

"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test");
const route = "/games/signal-frontier/";

test("presentation is read-only; poses follow travel and paused/reduced frames stay still", async () => {
  const browser = await chromium.launch({ args: ["--disable-gpu"] });
  const page = await browser.newPage();
  try {
    await page.goto(route);
    const result = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      // Exact repeat-frame comparison must stay on one raster backend.
      canvas.getContext("2d", { alpha: false, willReadFrequently: true });
      const E = SignalEngine,
        s = E.make("frontier-2"),
        v = new SignalView(canvas);
      const ui = { mode: "tactical", reduced: false, group: 1, touch: true };
      const original = JSON.stringify(s);
      for (let i = 0; i < 180; i++) v.render(s, ui, 1 / 60);
      const idlePhase = v.poses.get(s.heroId).phase;
      for (let i = 0; i < 30; i++) v.render(s, ui, 1 / 60);
      const idleStill = v.poses.get(s.heroId).phase === idlePhase;
      const pure = original === JSON.stringify(s);
      const a = v.canvas.toDataURL();
      for (let i = 0; i < 30; i++) v.render(s, ui, 1 / 60);
      const pausedStill = a === v.canvas.toDataURL();
      E.hero(s).x += 12;
      s.t += 1 / 60;
      v.render(s, ui, 1 / 60);
      const moved = v.poses.get(s.heroId).phase > idlePhase;
      // Render every archetype, dead/constructing states and the projectile arc.
      for (const [i, kind] of Object.keys(E.C).entries())
        for (const dead of [false, true]) {
          const u = {
            ...s.units[0],
            id: 100 + i,
            kind,
            hp: dead ? 0 : E.C[kind].hp,
            build: kind === "outpost" ? 3 : 0,
            flash: 0.05,
            wind: 0.3,
            target: { x: 1000, y: 500 },
          };
          v.unit(v.c, u, s, ui);
        }
      for (let i = 0; i < 160; i++)
        v.add(
          [
            { type: "blast", x: 400, y: 500 },
            { type: "destroy", x: 430, y: 500, kind: "rifle" },
          ],
          false,
        );
      const bounded = v.fx.length <= 96 && v.scars.length <= 40;
      ui.reduced = true;
      v.render(s, ui, 1 / 60);
      const reduced = v.canvas.toDataURL();
      for (let i = 0; i < 30; i++) v.render(s, ui, 1 / 60);
      const reducedStill =
        reduced === v.canvas.toDataURL() && v.fx.length === 0 && v.shake === 0;
      v.reset();
      return {
        pure,
        idleStill,
        moved,
        pausedStill,
        reducedStill,
        bounded,
        reset: v.poses.size === 0 && v.scars.length === 0 && v.fx.length === 0,
      };
    });
    expect(result).toEqual({
      pure: true,
      idleStill: true,
      moved: true,
      pausedStill: true,
      reducedStill: true,
      bounded: true,
      reset: true,
    });
  } finally {
    await browser.close();
  }
});

test("rendered sound has distinct layers, direction, headroom, a silent tail and bounded voices", async ({
  page,
}) => {
  await page.goto(route);
  const report = await page.evaluate(async () => {
    async function render(events, volume = 100, active = false) {
      const ctx = new OfflineAudioContext(2, 44100, 22050),
        audio = new SignalAudio({ context: ctx, volume: () => volume });
      audio.setup();
      if (active)
        audio.update(SignalEngine.make("frontier-6"), "playing", volume);
      for (const e of events) audio.play({ x: 0, y: 0, ...e });
      const during = audio.voices.size,
        buffer = await ctx.startRendering();
      await new Promise((r) => setTimeout(r, 0));
      let peak = 0,
        tail = 0,
        finite = true,
        energy = [0, 0];
      for (let c = 0; c < 2; c++)
        for (const [i, value] of buffer.getChannelData(c).entries()) {
          finite &&= Number.isFinite(value);
          peak = Math.max(peak, Math.abs(value));
          energy[c] += value * value;
          if (i > 38000) tail = Math.max(tail, Math.abs(value));
        }
      return { peak, tail, finite, energy, during, after: audio.voices.size };
    }
    const events = [
      ...["hero", "rifle", "sentinel", "runner"].map((kind) => ({
        type: "shot",
        kind,
        team: kind === "sentinel" ? 1 : 0,
      })),
      ...[
        "mortar",
        "rocket",
        "flame",
        "blast",
        "destroy",
        "hit",
        "hurt",
        "shield",
        "dash",
        "reload",
        "order",
        "collect",
        "build",
        "post-ready",
        "breach",
        "raid",
        "end",
        "step",
        "charge",
      ].map((type) => ({ type })),
    ];
    const sounds = [];
    for (const e of events)
      sounds.push({ name: e.kind || e.type, ...(await render([e])) });
    return {
      sounds,
      left: await render([{ type: "shot", kind: "hero", x: -600 }]),
      right: await render([{ type: "shot", kind: "hero", x: 600 }]),
      mute: await render(events, 0),
      crowd: await render(
        Array.from({ length: 40 }, (_, id) => ({ type: "charge", id })),
      ),
      ambience: await render([], 100, true),
    };
  });
  for (const sound of report.sounds) {
    expect(sound.finite, sound.name).toBe(true);
    expect(sound.peak, sound.name).toBeGreaterThan(0.00001);
    expect(sound.peak, sound.name).toBeLessThan(0.8);
    expect(sound.tail, sound.name).toBeLessThan(0.00001);
    expect(sound.after, sound.name).toBe(0);
  }
  expect(
    new Set(report.sounds.map((s) => s.energy[0].toFixed(5))).size,
  ).toBeGreaterThan(15);
  expect(report.left.energy[0]).toBeGreaterThan(report.left.energy[1] * 5);
  expect(report.right.energy[1]).toBeGreaterThan(report.right.energy[0] * 5);
  expect(report.mute.peak).toBe(0);
  expect(report.mute.during).toBe(0);
  expect(report.crowd.during).toBe(24);
  expect(report.crowd.after).toBe(0);
  expect(report.crowd.peak).toBeLessThan(0.8);
  expect(report.ambience.peak).toBeGreaterThan(0.00001);
  expect(report.ambience.peak).toBeLessThan(0.1);
});

test("missing audio support does not block play, pause or settings", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(route);
  await page.locator("#start").click();
  await page.locator("#tactical").click();
  await expect
    .poll(() => page.evaluate(() => SignalGame.snapshot().t))
    .toBeGreaterThan(0.1);
  await page.locator("#menu-button").click();
  await page.locator('#pause-content [data-open="settings"]').click();
  await page.locator("#volume").fill("50");
  await page.locator("#volume").dispatchEvent("change");
  expect(await page.evaluate(() => SignalGame.audioState())).toBe(
    "uninitialized",
  );
  expect(errors).toEqual([]);
});

for (const browserType of [chromium, webkit])
  test(`${browserType.name()} touch: sound starts on play, pauses completely and resumes at saved volume`, async () => {
    const browser = await browserType.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173" + route);
      test.skip(
        !(await page.evaluate(() =>
          Boolean(window.AudioContext || window.webkitAudioContext),
        )),
        "This browser build has no Web Audio API; audio requires device verification.",
      );
      expect(await page.evaluate(() => SignalGame.audioState())).toBe(
        "uninitialized",
      );
      await page.locator("#start").tap();
      await page.locator("#tactical").tap();
      await expect
        .poll(() => page.evaluate(() => SignalGame.audioState()))
        .toBe("running");
      expect(await page.evaluate(() => SignalGame.audio().ambience)).toBe(
        0.045,
      );
      await page.locator("#menu-button").tap();
      await expect
        .poll(() => page.evaluate(() => SignalGame.audioState()))
        .toBe("suspended");
      expect(await page.evaluate(() => SignalGame.audio().ambience)).toBe(0);
      expect(await page.evaluate(() => SignalGame.audio().voices)).toBe(0);
      await page.locator('#pause-content [data-open="settings"]').tap();
      await page.locator("#volume").fill("23");
      await page.locator("#volume").dispatchEvent("change");
      await page.locator("#settings-back").tap();
      await page.locator("#resume").tap();
      await expect
        .poll(() =>
          page.evaluate(() => Math.round(SignalGame.audio().volume * 100)),
        )
        .toBe(23);
      await expect
        .poll(() => page.evaluate(() => SignalGame.audioState()))
        .toBe("running");
    } finally {
      await context.close();
      await browser.close();
    }
  });
for (const [width, height] of [
  [390, 844],
  [1440, 900],
])
  test(`camera culling keeps identical pixels and travel poses at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(route);
    const result = await page.evaluate(() => {
      const s = SignalEngine.make("frontier-6"),
        before = JSON.stringify(s),
        clipped = new SignalView(document.createElement("canvas")),
        reference = new SignalView(document.createElement("canvas")),
        ui = { mode: "tactical", reduced: true, touch: true, group: 1 };
      reference.inView = () => true;
      let drawn = 0,
        full = 0;
      const draw = clipped.unit.bind(clipped),
        all = reference.unit.bind(reference);
      clipped.unit = (...args) => {
        drawn++;
        return draw(...args);
      };
      reference.unit = (...args) => {
        full++;
        return all(...args);
      };
      const equal = [];
      // Centre, both forts, home, map corners and two zoom levels: includes tall walls and shadows.
      for (const [x, y, zoom] of [
        [1100, 1280, 0.45],
        [1100, 1280, 1.3],
        [1810, 330, 1.3],
        [1750, 2270, 1.3],
        [200, 1700, 1.3],
        [0, 0, 1],
        [2240, 0, 1],
        [0, 2560, 1],
        [2240, 2560, 1],
      ]) {
        for (const v of [clipped, reference]) {
          v.tactical = { overview: false, x, y, zoom };
          v.render(s, ui, 1 / 60);
        }
        const a = new Uint32Array(
            clipped.c.getImageData(
              0,
              0,
              clipped.canvas.width,
              clipped.canvas.height,
            ).data.buffer,
          ),
          b = new Uint32Array(
            reference.c.getImageData(
              0,
              0,
              reference.canvas.width,
              reference.canvas.height,
            ).data.buffer,
          );
        equal.push(a.every((pixel, i) => pixel === b[i]));
      }
      return {
        equal,
        untouched: JSON.stringify(s) === before,
        drawn,
        full,
        poses: [...clipped.poses].every(
          ([id, p]) =>
            JSON.stringify(p) === JSON.stringify(reference.poses.get(id)),
        ),
      };
    });
    expect(result.equal).toEqual(Array(9).fill(true));
    expect(result.untouched).toBe(true);
    expect(result.poses).toBe(true);
    expect(result.drawn).toBeLessThan(result.full / 2);
  });

"use strict";
const { test, expect } = require("@playwright/test");
const E = require("../game-source/signal-frontier/src/engine");

async function openModelStudio(page, query = "") {
  // The design studio is a local authoring tool, excluded from the public site.
  // Serve its real files to these browser checks without publishing source code.
  const path = require("node:path"),
    root = path.resolve(__dirname, "../game-source/signal-frontier"),
    files = new Set(["design/MODEL_STUDIO.html", "design/model-studies.js", "design/model-studio.js",
      ...["terrain", "districts", "campaign", "recon", "construction", "support", "engine", "unit-models", "view"].map(n => "src/" + n + ".js")]);
  await page.route("**/game-source/signal-frontier/**", route => {
    const relative = new URL(route.request().url()).pathname.split("/game-source/signal-frontier/")[1];
    return files.has(relative) ? route.fulfill({ path: path.join(root, relative), contentType: relative.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8" }) : route.continue();
  });
  await page.goto("/game-source/signal-frontier/design/MODEL_STUDIO.html" + query);
}

async function studio(page) {
  await page.goto("/games/signal-frontier/");
  await page.evaluate(() => {
    window.modelState = SignalEngine.make("frontier-8");
    window.modelUnit = (kind, changes = {}) => ({
      id: 1001,
      kind,
      team: [
        "hero",
        "rifle",
        "drone",
        "scout",
        "artillery",
        "base",
        "outpost",
        "barracks",
        "foundry",
        "arsenal",
      ].includes(kind)
        ? 0
        : 1,
      hp: SignalEngine.C[kind].hp,
      x: 0,
      y: 0,
      angle: 0,
      flash: 0,
      hit: 0,
      wind: 0,
      build: 0,
      jobs: [],
      path: [],
      sector: "north",
      ...changes,
    });
    window.modelView = new SignalView(document.createElement("canvas"));
    modelView.mapId = "classic";
    window.modelRaster = (u, options = {}) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const c = canvas.getContext("2d", { willReadFrequently: true });
      c.translate(128, 176);
      c.scale(1.15, 1.15 * 0.73);
      const ui = { mode: "playing", reduced: true, ...options.ui },
        pose = { phase: 0, move: 0, angle: u.angle, ...options.pose },
        s = options.state || modelState;
      modelView[options.cached ? "unitSprite" : "unitModel"](c, u, s, ui, pose);
      return c.getImageData(0, 0, 256, 256).data;
    };
    window.modelHash = (data, silhouette = false) => {
      let hash = 2166136261;
      for (let i = 0; i < data.length; i += silhouette ? 4 : 1) {
        const n = silhouette ? +(data[i + 3] > 30) : data[i];
        hash = Math.imul(hash ^ n, 16777619);
      }
      return hash >>> 0;
    };
  });
}

test("all current models keep distinct silhouettes at eight directions and do not mutate an operation", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const types = SignalUnitModels.types,
      before = JSON.stringify(modelState),
      duplicate = [],
      clipped = [],
      empty = [];
    for (let direction = 0; direction < 8; direction++) {
      const seen = new Map();
      for (const kind of types) {
        const u = modelUnit(kind, { angle: (direction * Math.PI) / 4 }),
          saved = JSON.stringify(u),
          pixels = modelRaster(u),
          hash = modelHash(pixels, true);
        if (seen.has(hash)) duplicate.push([direction, kind, seen.get(hash)]);
        seen.set(hash, kind);
        let opaque = 0,
          border = 0;
        for (let i = 3; i < pixels.length; i += 4)
          if (pixels[i] > 20) {
            opaque++;
            const k = (i - 3) / 4,
              x = k % 256,
              y = Math.floor(k / 256);
            if (x < 2 || x > 253 || y < 2 || y > 253) border++;
          }
        if (opaque < 100) empty.push(kind);
        if (border) clipped.push([kind, direction]);
        if (JSON.stringify(u) !== saved) throw Error("Model changed " + kind);
      }
    }
    return {
      types: [...types].sort(),
      expected: Object.keys(SignalEngine.C).sort(),
      duplicate,
      clipped,
      empty,
      pure: before === JSON.stringify(modelState),
    };
  });
  expect(result.types).toEqual(result.expected);
  expect(result.duplicate).toEqual([]);
  expect(result.clipped).toEqual([]);
  expect(result.empty).toEqual([]);
  expect(result.pure).toBe(true);
});

test("reload, cargo, lock-on and deployed poses follow real state and refresh reused artwork", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const hash = (u, options) => modelHash(modelRaster(u, options)),
      h = modelUnit("hero"),
      out = {};
    const original = JSON.stringify(modelState);
    const heroStates = [];
    for (const reload of [0, 1, 0.5]) {
      const state = { ...modelState, reload };
      const cached = modelRaster(h, { state, cached: true }),
        direct = modelRaster(h, { state });
      let diff = 0;
      for (let i = 0; i < cached.length; i++)
        diff += Math.abs(cached[i] - direct[i]);
      heroStates.push({ hash: modelHash(cached), error: diff / cached.length });
    }
    out.heroStates = heroStates;
    out.channel =
      hash(h) !==
      hash(h, {
        state: {
          ...modelState,
          terminal: { ...modelState.terminal, channeling: true },
        },
      });
    const drone = modelUnit("drone");
    out.cargo = hash(drone) !== hash({ ...drone, cargo: 4 });
    out.worker = hash(drone) !== hash({ ...drone, work: "gather" });
    out.walk =
      hash(modelUnit("rifle")) !==
      hash(modelUnit("rifle"), { pose: { phase: Math.PI / 2, move: 1 } });
    out.unarmed = ["scout", "drone"].every(
      (k) =>
        hash(modelUnit(k)) ===
        hash(modelUnit(k, { flash: 0.1 }), { ui: { reduced: false } }),
    );
    const warning = (k) =>
      modelUnit(k, {
        wind: 0.4,
        combat: { angle: 0, mode: "aim", time: 0.4, total: 0.8 },
      });
    out.lock = hash(modelUnit("rocket")) !== hash(warning("rocket"));
    out.recovery =
      hash(modelUnit("rocket")) !==
      hash(modelUnit("rocket", { cool: SignalEngine.C.rocket.rate }));
    out.fuse = hash(modelUnit("bomber")) !== hash(warning("bomber"));
    out.mortar =
      hash(modelUnit("mortar")) !==
      hash(modelUnit("mortar"), {
        ui: { reduced: false },
        pose: { phase: 0.8, move: 1 },
      });
    out.bases =
      hash(modelUnit("bastion")) !==
      hash(modelUnit("bastion", { sector: "south" }));
    out.pure = JSON.stringify(modelState) === original;
    return out;
  });
  expect(new Set(result.heroStates.map((s) => s.hash)).size).toBe(3);
  for (const s of result.heroStates) expect(s.error).toBeLessThan(0.04);
  for (const key of [
    "channel",
    "cargo",
    "worker",
    "walk",
    "unarmed",
    "lock",
    "recovery",
    "fuse",
    "mortar",
    "bases",
    "pure",
  ])
    expect(result[key], key).toBe(true);
});

test("animated attack preparation refreshes through the sprite cache at eight directions", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const results = [];
    for (const modern of [true, false])
      for (const kind of ["runner", "rocket", "flamer", "bomber"])
        for (let i = 0; i < 8; i++) {
          const hashes = [],
            angle = (i * Math.PI) / 4,
            total = modern
              ? kind === "runner"
                ? 0.24
                : 0.8
              : kind === "runner"
                ? 0.22
                : 0.65;
          for (const progress of [0.1, 0.55, 0.9]) {
            const u = modelUnit(kind, {
                angle,
                wind: total * (1 - progress),
                combat: modern
                  ? {
                      mode: "aim",
                      angle,
                      total,
                      time: total * (1 - progress),
                    }
                  : undefined,
              }),
              original = JSON.stringify(u),
              options = { ui: { reduced: false } },
              cached = modelRaster(u, { ...options, cached: true }),
              direct = modelRaster(u, options);
            let difference = 0;
            for (let j = 0; j < cached.length; j++)
              difference += Math.abs(cached[j] - direct[j]);
            hashes.push(modelHash(cached));
            if (JSON.stringify(u) !== original)
              throw Error("Attack artwork changed the unit");
            results.push({ kind, i, error: difference / cached.length });
          }
          results.push({ kind, i, phases: new Set(hashes).size });
        }
    return results;
  });
  for (const row of result) {
    if (row.error !== undefined)
      expect(row.error, `${row.kind} ${row.i}`).toBeLessThan(0.04);
    if (row.phases !== undefined)
      expect(row.phases, `${row.kind} ${row.i}`).toBe(3);
  }
});

test("unchanging aiming poses reuse their artwork while still matching direct drawing", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const original = modelView.unitModel,
      rows = [];
    let paints = 0;
    modelView.unitModel = function (...args) {
      paints++;
      return original.apply(this, args);
    };
    try {
      for (const kind of [
        "rifle",
        "sentinel",
        "warden",
        "artillery",
        "tank",
        "mortar",
      ]) {
        const u = modelUnit(kind, {
          wind: 0.5,
          combat: { mode: "aim", angle: 0, time: 0.5, total: 0.8 },
        });
        modelRaster(u, { cached: true });
        // Exact artwork is admitted after its first repeat, so changing poses
        // do not allocate an image that will never be reused.
        modelRaster(u, { cached: true });
        const before = paints;
        u.wind = 0.2;
        u.combat.time = 0.2;
        const cached = modelRaster(u, { cached: true }),
          reused = paints === before,
          direct = modelRaster(u);
        let difference = 0;
        for (let i = 0; i < cached.length; i++)
          difference += Math.abs(cached[i] - direct[i]);
        rows.push({ kind, reused, error: difference / cached.length });
      }
    } finally {
      modelView.unitModel = original;
    }
    return rows;
  });
  for (const row of result) {
    expect(row.reused, row.kind).toBe(true);
    expect(row.error, row.kind).toBeLessThan(0.04);
  }
});

test("runner and rocket keep distinct movement, strike and wreck poses without state changes", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const before = JSON.stringify(modelState),
      rows = [];
    for (const kind of ["runner", "rocket"])
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4,
          unit = modelUnit(kind, { angle }),
          ui = { reduced: false },
          hashes = [
            modelHash(modelRaster(unit, { ui })),
            modelHash(modelRaster(unit, { ui, pose: { phase: 1.1, move: 1 } })),
            modelHash(
              modelRaster(
                {
                  ...unit,
                  wind: 0.1,
                  combat: { angle, mode: "aim", total: 0.8, time: 0.1 },
                },
                { ui },
              ),
            ),
            modelHash(modelRaster({ ...unit, flash: 0.065 }, { ui })),
            modelHash(modelRaster({ ...unit, hp: 0 }, { ui })),
          ];
        rows.push({ kind, i, poses: new Set(hashes).size });
      }
    return { rows, pure: before === JSON.stringify(modelState) };
  });
  expect(result.pure).toBe(true);
  for (const row of result.rows)
    expect(row.poses, `${row.kind} ${row.i}`).toBe(5);
});

test("construction apron points along the real exit and memory freezes activity and damage", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      result = { stages: [], memory: [], east: 0 };
    for (const kind of ["barracks", "foundry", "arsenal", "outpost"]) {
      const hashes = [];
      for (const progress of [0, 0.4, 0.75, 1]) {
        const u = modelUnit(kind, {
          build: E.development.items(modelState)[kind].time * (1 - progress),
          construction: { turn: 0 },
        });
        hashes.push(modelHash(modelRaster(u)));
      }
      result.stages.push(new Set(hashes).size);
      const u = modelUnit(kind, {
          construction: { turn: 1 },
          hp: E.C[kind].hp * 0.6,
        }),
        ui = { memory: true },
        a = modelHash(modelRaster(u, { ui })),
        b = modelHash(
          modelRaster(
            {
              ...u,
              jobs: [{ action: "weapons", duration: 10, remaining: 1 }],
              flash: 0.1,
              hit: 0.1,
            },
            { ui, state: { ...modelState, t: modelState.t + 99 } },
          ),
        );
      result.memory.push(a === b);
    }
    const u = modelUnit("barracks", { construction: { turn: 1 } }),
      pixels = modelRaster(u);
    let sum = 0,
      count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        pixels[i] > 130 &&
        pixels[i] < 190 &&
        pixels[i + 1] > 220 &&
        pixels[i + 2] > 190 &&
        pixels[i + 3] > 100
      ) {
        sum += ((i / 4) % 256) - 128;
        count++;
      }
    result.east = count ? sum / count : -999;
    result.exit = E.construction.exit(u).x > u.x;
    return result;
  });
  expect(result.stages).toEqual([4, 4, 4, 4]);
  expect(result.memory).toEqual([true, true, true, true]);
  expect(result.exit).toBe(true);
  expect(result.east).toBeGreaterThan(20);
});

test("unfinished healthy buildings show assembly and real damage independently", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    return ["barracks", "foundry", "arsenal", "outpost"].map((kind) => {
      const progress = 0.35,
        nominal = SignalEngine.C[kind].hp * (0.25 + 0.75 * progress),
        u = modelUnit(kind, {
          hp: nominal,
          build:
            SignalEngine.development.items(modelState)[kind].time *
            (1 - progress),
          construction: { turn: 0 },
        }),
        hash = (unit) =>
          modelHash(modelRaster(unit).subarray(0, 205 * 256 * 4)),
        healthy = hash(u),
        full = hash({ ...u, hp: SignalEngine.C[kind].hp }),
        hurt = hash({ ...u, hp: nominal * 0.2 });
      return { healthy: healthy === full, damaged: hurt !== healthy };
    });
  });
  expect(result).toEqual(
    Array.from({ length: 4 }, () => ({ healthy: true, damaged: true })),
  );
});

test("wrecks fade in operation time while the hero remains visible and pause stays deterministic", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const v = modelView,
      u = modelUnit("runner", { hp: 0 }),
      hero = modelUnit("hero", { hp: 0, id: 1002 }),
      t = modelState.t,
      before = JSON.stringify(modelState),
      start = v.wreckOpacity(u, modelState),
      paused = v.wreckOpacity(u, modelState),
      fade = v.wreckOpacity(u, { ...modelState, t: t + 10 }),
      end = v.wreckOpacity(u, { ...modelState, t: t + 13 }),
      important = v.wreckOpacity(hero, { ...modelState, t: t + 100 });
    v.reset();
    return {
      start,
      paused,
      fade,
      end,
      important,
      reset: v.modelDeaths.size,
      pure: before === JSON.stringify(modelState),
    };
  });
  expect(result).toEqual({
    start: 1,
    paused: 1,
    fade: 2 / 3,
    end: 0,
    important: 1,
    reset: 0,
    pure: true,
  });
});

test("production doors open on a real release event, freeze in pause and stay closed in memory", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const u = modelUnit("barracks"),
      before = modelHash(modelRaster(u)),
      state = JSON.stringify(modelState);
    modelView.modelClock = modelState.t;
    modelView.add(
      [{ type: "reinforce", x: u.x, y: u.y, action: "rifle" }],
      true,
    );
    const opened = modelHash(modelRaster(u)),
      paused = modelHash(modelRaster(u)),
      memory = modelHash(modelRaster(u, { ui: { memory: true } })),
      closed = modelHash(
        modelRaster(u, { state: { ...modelState, t: modelState.t + 1 } }),
      );
    return {
      opened: opened !== before,
      paused: paused === opened,
      memory: memory === before,
      closed: closed === before,
      pure: state === JSON.stringify(modelState),
    };
  });
  expect(result).toEqual({
    opened: true,
    paused: true,
    memory: true,
    closed: true,
    pure: true,
  });
});

test("a moving pose freezes immediately in pause and resumes without running against a blocked route", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const u = modelUnit("rifle"),
      v = modelView,
      s = { ...modelState, t: 0 },
      before = JSON.stringify(modelState);
    v.pose(u, s, { reduced: false });
    u.x = 3;
    s.t = 1 / 60;
    const moving = v.pose(u, s, { reduced: false }),
      pixels = modelHash(
        modelRaster(u, { pose: moving, ui: { reduced: false } }),
      ),
      paused = v.pose(u, s, { reduced: false }),
      same = modelHash(
        modelRaster(u, { pose: paused, ui: { reduced: false } }),
      );
    s.t += 1 / 60;
    const stopped = v.pose(u, s, { reduced: false });
    return {
      moving: moving.move > 0,
      frozen:
        JSON.stringify(moving) === JSON.stringify(paused) && pixels === same,
      stopped: stopped.move === 0,
      pure: before === JSON.stringify(modelState),
    };
  });
  expect(result).toEqual({
    moving: true,
    frozen: true,
    stopped: true,
    pure: true,
  });
});

test("receivers move only after an observed cargo transfer and memory does not expose the mechanism", async ({
  page,
}) => {
  await studio(page);
  const result = await page.evaluate(() => {
    const node = modelUnit("outpost", { id: 100, construction: { turn: 0 } }),
      drone = modelUnit("drone", {
        id: 101,
        node: 100,
        cargo: 4,
        x: 50,
        work: "return",
      }),
      s = { ...modelState, t: 0, units: [node, drone] },
      ui = { reduced: false },
      hash = () => modelHash(modelRaster(node, { state: s, ui }));
    modelView.deliveryActivity(s);
    const initial = hash();
    s.t = 0.1;
    modelView.deliveryActivity(s);
    const waiting = hash();
    drone.cargo = 0;
    s.t = 0.2;
    modelView.deliveryActivity(s);
    s.t = 0.4;
    modelView.deliveryActivity(s);
    const state = JSON.stringify(s),
      received = hash(),
      paused = hash(),
      memory = modelHash(
        modelRaster(node, { state: s, ui: { ...ui, memory: true } }),
      );
    s.t = 2;
    modelView.deliveryActivity(s);
    return {
      waiting: initial === waiting,
      received: received !== initial,
      paused: received === paused,
      memory: memory === initial,
      closed: hash() === initial,
      pure: state === JSON.stringify({ ...s, t: 0.4 }),
    };
  });
  expect(result).toEqual({
    waiting: true,
    received: true,
    paused: true,
    memory: true,
    closed: true,
    pure: true,
  });
});

test("design studio covers every current model and all 27 visual studies without changing the engine registry", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openModelStudio(page);
  await page.waitForFunction(() => window.SignalModelStudio);
  const result = await page.evaluate(() => {
    SignalModelStudio.pause();
    const original = JSON.stringify(SignalEngine.C),
      all = SignalModelStudio.all,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const c = canvas.getContext("2d", { willReadFrequently: true }),
      failures = [];
    for (const spec of all)
      for (let i = 0; i < 8; i++)
        for (const mode of ["idle", "move", "action", "damaged", "wreck"]) {
          c.setTransform(1, 0, 0, 1, 0, 0);
          c.clearRect(0, 0, 256, 256);
          const scale = Math.min(
            190 / (spec.w + 32),
            170 / (spec.h * 0.73 + spec.height + 30),
          );
          c.translate(128, 170);
          c.scale(scale, scale * 0.73);
          SignalModelStudio.draw(c, spec, {
            mode,
            angle: (i * Math.PI) / 4,
            progress: 0.55,
            time: 1.3,
          });
          const pixels = c.getImageData(0, 0, 256, 256).data;
          let opaque = 0,
            border = 0;
          for (let j = 3; j < pixels.length; j += 4)
            if (pixels[j] > 30) {
              opaque++;
              const x = ((j - 3) / 4) % 256,
                y = Math.floor((j - 3) / 4 / 256);
              if (x < 2 || x > 253 || y < 2 || y > 253) border++;
            }
          if (opaque < 20 || border)
            failures.push({ id: spec.id, mode, i, opaque, border });
        }
    return {
      current: all
        .filter((s) => s.group === "current")
        .map((s) => s.id)
        .sort(),
      studies: all.filter((s) => s.group !== "current").length,
      unchanged: original === JSON.stringify(SignalEngine.C),
      failures,
    };
  });
  expect(result.current).toEqual(Object.keys(E.C).sort());
  expect(result.studies).toBe(27);
  expect(result.unchanged).toBe(true);
  expect(result.failures).toEqual([]);
  expect(errors).toEqual([]);
});

test("the model studio fits a phone and its phase and direction controls freeze a real image", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openModelStudio(page, "?model=repair");
  await page.waitForFunction(() => window.SignalModelStudio);
  await page.evaluate(() => SignalModelStudio.pause());
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#mode").selectOption("action");
  const before = await page
    .locator("#model-canvas")
    .evaluate((c) => c.toDataURL());
  await page
    .getByRole("button", { name: "Направление 90 градусов", exact: true })
    .click();
  expect(
    await page.locator("#model-canvas").evaluate((c) => c.toDataURL()),
  ).not.toBe(before);
  await page.locator("#progress").evaluate((input) => {
    input.value = "80";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const paused = await page
    .locator("#model-canvas")
    .evaluate((c) => c.toDataURL());
  await page.waitForTimeout(150);
  expect(
    await page.locator("#model-canvas").evaluate((c) => c.toDataURL()),
  ).toBe(paused);
  await expect(page.locator("#play")).toHaveAttribute("aria-pressed", "false");
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [320, 568],
  [844, 390],
]) {
  test(`models preserve pause and the actual viewport ${width}x${height}`, async ({
    browser,
  }, info) => {
    // Native Windows browser teardown can outlast screenshot generation.
    test.setTimeout(90000);
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: width < 900 ? 2 : 1,
      isMobile: width < 900,
      hasTouch: width < 900,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
      await page.clock.pauseAt(new Date("2026-10-29T12:00:01Z"));
      const s = E.make("frontier-8");
      await page.addInitScript(
        (s) =>
          localStorage.setItem(
            "signal-frontier-v1",
            JSON.stringify({
              save: s,
              settings: { reduced: false, volume: 0 },
            }),
          ),
        s,
      );
      await page.goto("/games/signal-frontier/");
      await page.locator("#continue").click();
      await page.keyboard.press("Tab");
      await page.clock.runFor(4000);
      const before = await page.evaluate(() => ({
        state: SignalGame.snapshot(),
        image: document.querySelector("#field").toDataURL(),
      }));
      await page.clock.runFor(2000);
      expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(
        before.state,
      );
      expect(
        await page.evaluate(() => document.querySelector("#field").toDataURL()),
      ).toBe(before.image);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath("models-in-game.png") });
    } finally {
      await context.close();
    }
  });
}

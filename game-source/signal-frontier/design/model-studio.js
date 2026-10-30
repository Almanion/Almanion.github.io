(function (root) {
  "use strict";
  const E = root.SignalEngine,
    view = new root.SignalView(document.createElement("canvas")),
    studies = root.SignalModelStudies.create(root.SignalView.artwork),
    state = E.make("frontier-8"),
    names = {
      hero: "Герой",
      rifle: "Стрелок",
      scout: "Дозорный игрока",
      drone: "Рабочий дрон",
      artillery: "Артиллерия",
      sentinel: "Дозорный противника",
      runner: "Бегун",
      warden: "Страж",
      rocket: "Ракетчик",
      flamer: "Огнемётчик",
      bomber: "Подрывник",
      tank: "Танк противника",
      mortar: "Осадный миномёт",
      base: "База экспедиции",
      outpost: "Добывающий узел",
      barracks: "Казарма",
      foundry: "Тяжёлый цех",
      arsenal: "Арсенал",
      bastion: "Бастион",
      turret: "Стационарная установка",
      jammer: "Подавитель",
      citadel: "Цитадель",
    },
    current = Object.keys(names).map((id) => {
      const shape = E.construction.shapes[id];
      return {
        id,
        name: names[id],
        group: "current",
        w: shape ? shape[0] * 40 : E.C[id].r * 2 + 35,
        h: shape ? shape[1] * 40 : E.C[id].r * 2 + 24,
        height: id === "citadel" ? 80 : id === "base" ? 70 : 50,
      };
    }),
    all = [...current, ...studies.specs],
    $ = (id) => document.getElementById(id),
    canvas = $("model-canvas"),
    group = $("group"),
    model = $("model"),
    mode = $("mode"),
    angle = $("angle"),
    progress = $("progress"),
    play = $("play"),
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  view.mapId = "classic";
  let running = !reduced,
    time = 0,
    previous = 0,
    request = 0;
  const ally = new Set([
    "hero",
    "rifle",
    "scout",
    "drone",
    "artillery",
    "base",
    "outpost",
    "barracks",
    "foundry",
    "arsenal",
  ]);
  function sample(c, spec, options = {}) {
    const m = options.mode || mode.value,
      a = options.angle ?? (Number(angle.value) * Math.PI) / 180,
      t = options.time ?? time,
      q =
        options.progress ??
        (running ? (t % 3) / 3 : Number(progress.value) / 100);
    if (spec.group !== "current")
      return studies.draw(c, spec.id, {
        mode: m,
        angle: a,
        time: t,
        progress: q,
      });
    const id = spec.id,
      def = E.C[id],
      moving = m === "move" && def.speed > 0,
      action = m === "action",
      build = m === "build" && E.construction.shapes[id],
      total =
        id === "runner"
          ? 0.24
          : id === "rocket"
            ? 0.8
            : id === "mortar"
              ? 1.4
              : 0.65,
      u = {
        id: 1001,
        kind: id,
        x: 0,
        y: 0,
        team: ally.has(id) ? 0 : 1,
        hp: m === "wreck" ? 0 : m === "damaged" ? def.hp * 0.3 : def.hp,
        angle: a,
        wind: action ? total * (1 - q) : 0,
        flash: 0,
        hit: 0,
        build: build ? E.development.items(state)[id].time * (1 - q) : 0,
        jobs:
          action && !def.speed
            ? [
                {
                  action: id === "arsenal" ? "weapons" : "rifle",
                  duration: 10,
                  remaining: 10 * (1 - q),
                },
              ]
            : [],
        cargo: id === "drone" && m !== "wreck" ? 4 : 0,
        work: action ? "gather" : "idle",
        sector: "north",
        path: [],
        combat: {
          mode: action ? "aim" : "idle",
          angle: a,
          time: total * (1 - q),
          total,
        },
        ...(E.construction.shapes[id] ? { construction: { turn: 0 } } : {}),
      },
      s = { ...state, t, reload: id === "hero" && action ? 1.1 * (1 - q) : 0 },
      pose = {
        phase:
          ((t * E.C[id].speed) / (root.SignalUnitModels.gaits[id] || 32)) *
          Math.PI *
          2,
        cycle: root.SignalUnitModels.gaits[id] || 32,
        move: moving ? 1 : 0,
        angle: a,
        left: moving ? t * def.speed : 0,
        right: moving ? t * def.speed : 0,
      };
    if (!def.speed) {
      const shape = E.construction.shapes[id],
        frame = shape
          ? { w: shape[0] * 40, h: shape[1] * 40, a, progress: build ? q : 1 }
          : null;
      root.SignalView.artwork.draw(
        c,
        u,
        s,
        { reduced: false, mode: "playing" },
        pose,
        view.muzzle,
        frame,
        action ? q : 0,
        action ? Math.sin(q * Math.PI) : 0,
      );
    } else
      root.SignalView.artwork.draw(
        c,
        u,
        s,
        { reduced: false, mode: "playing" },
        pose,
        view.muzzle,
      );
  }
  function paint(target, spec, small = false, a) {
    const rect = target.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2),
      w = Math.max(1, Math.round(rect.width * dpr)),
      h = Math.max(1, Math.round((small ? 120 : rect.height) * dpr));
    if (target.width !== w || target.height !== h) {
      target.width = w;
      target.height = h;
    }
    const c = target.getContext("2d"),
      scale = Math.min(
        (w * 0.79) / (spec.w + 24),
        (h * 0.78) / (spec.h * 0.73 + spec.height + 28),
      );
    c.clearRect(0, 0, w, h);
    c.save();
    c.translate(w / 2, h * 0.68);
    c.scale(scale, scale * 0.73);
    c.fillStyle = "#0a1c2270";
    c.beginPath();
    c.ellipse(0, 8, spec.w * 0.46, spec.h * 0.4, 0, 0, Math.PI * 2);
    c.fill();
    sample(c, spec, { angle: a });
    c.restore();
  }
  function draw() {
    const spec = all.find(
      (s) => s.group === group.value && s.id === model.value,
    );
    if (!spec) return;
    paint(canvas, spec);
    for (const [i, button] of [...$("views").children].entries()) {
      paint(button.querySelector("canvas"), spec, true, (i * Math.PI) / 4);
      button.setAttribute(
        "aria-pressed",
        String(
          Math.abs(((Number(angle.value) - i * 45 + 540) % 360) - 180) < 22.5,
        ),
      );
    }
    canvas.setAttribute(
      "aria-label",
      spec.name + " — " + mode.selectedOptions[0].textContent,
    );
  }
  function tick(now) {
    request = 0;
    if (running && !document.hidden) {
      if (previous) time += Math.min(0.05, (now - previous) / 1000);
      previous = now;
      progress.value = String(Math.round(((time % 3) / 3) * 100));
      draw();
      request = requestAnimationFrame(tick);
    }
  }
  function playback() {
    play.textContent = running ? "Остановить анимацию" : "Продолжить анимацию";
    play.setAttribute("aria-pressed", String(running));
    previous = 0;
    if (request) cancelAnimationFrame(request);
    request = 0;
    draw();
    if (running && !document.hidden) request = requestAnimationFrame(tick);
  }
  function selection() {
    const spec = all.find(
      (s) => s.group === group.value && s.id === model.value,
    );
    $("state-note").textContent =
      spec.group === "current"
        ? "Модель действующей игры. Действия в просмотре показаны на отдельном образце."
        : "Визуальный прототип по спецификации. В прохождение пока не добавлен.";
    for (const option of mode.options)
      option.disabled =
        (option.value === "move" &&
          (["building", "planned"].includes(spec.group) ||
            (spec.group === "boss" && spec.id !== "commander") ||
            (spec.group === "current" && !E.C[spec.id].speed))) ||
        (option.value === "build" &&
          !["building", "planned"].includes(spec.group) &&
          !E.construction.shapes[spec.id]);
    if (mode.selectedOptions[0].disabled) mode.value = "idle";
    time = 0;
    draw();
  }
  function populate(id) {
    model.replaceChildren(
      ...all
        .filter((s) => s.group === group.value)
        .map((s) => {
          const option = document.createElement("option");
          option.value = s.id;
          option.textContent = s.name;
          return option;
        }),
    );
    if (id && [...model.options].some((o) => o.value === id)) model.value = id;
    selection();
  }
  for (let i = 0; i < 8; i++) {
    const button = document.createElement("button"),
      thumb = document.createElement("canvas"),
      label = document.createElement("span");
    button.className = "direction";
    button.setAttribute("aria-label", "Направление " + i * 45 + " градусов");
    label.textContent = i * 45 + "°";
    thumb.setAttribute("aria-hidden", "true");
    button.append(thumb, label);
    button.addEventListener("click", () => {
      angle.value = String(i * 45);
      draw();
    });
    $("views").append(button);
  }
  group.addEventListener("change", () => populate());
  model.addEventListener("change", selection);
  mode.addEventListener("change", draw);
  angle.addEventListener("input", draw);
  progress.addEventListener("input", () => {
    running = false;
    time = (Number(progress.value) / 100) * 3;
    playback();
  });
  play.addEventListener("click", () => {
    running = !running;
    playback();
  });
  addEventListener("resize", draw);
  document.addEventListener("visibilitychange", playback);
  const chosen = new URLSearchParams(location.search).get("model"),
    spec = all.find((s) => s.id === chosen);
  if (spec) group.value = spec.group;
  populate(chosen);
  playback();
  root.SignalModelStudio = {
    all,
    draw: sample,
    select(id, selectedMode = "idle") {
      const spec = all.find((s) => s.id === id);
      if (!spec) throw Error(id);
      group.value = spec.group;
      populate(id);
      mode.value = selectedMode;
      running = false;
      playback();
    },
    pause() {
      running = false;
      playback();
    },
  };
})(window);

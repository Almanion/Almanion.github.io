(function () {
  "use strict";
  const E = window.SignalEngine,
    $ = (id) => document.getElementById(id),
    canvas = $("field"),
    view = new SignalView(canvas),
    KEY = "signal-frontier-v1",
    coarse = matchMedia("(pointer:coarse)"),
    motionPref = matchMedia("(prefers-reduced-motion:reduce)");
  let state = E.make(),
    mode = "menu",
    group = 1,
    aim = { x: 700, y: 650 },
    mousePoint = null,
    saved = null,
    settings = { volume: 40, reduced: motionPref.matches },
    lastMode = "playing",
    dialogOrigin = "menu",
    saveAvailable = true,
    noticeUntil = 0,
    lastSaved = 0,
    lastUI = 0,
    lastFrame = performance.now(),
    acc = 0,
    phase = -1,
    resultShown = false;
  const keys = new Set(),
    input = { fire: false, dash: false, reload: false, interact: false },
    moveStick = { x: 0, y: 0, id: null },
    aimStick = { x: 1, y: 0, id: null, active: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && raw.length < 400000) {
      const data = JSON.parse(raw);
      saved = E.restore(data.save);
      if (data.settings) {
        if (Number.isFinite(data.settings.volume))
          settings.volume = E.clamp(data.settings.volume, 0, 100);
        if (typeof data.settings.reduced === "boolean")
          settings.reduced = data.settings.reduced;
      }
    }
  } catch (_) {
    saveAvailable = false;
  }
  class AudioBus {
    constructor() {
      this.ctx = null;
      this.last = {};
    }
    start() {
      try {
        if (!this.ctx)
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state !== "closed") this.ctx.resume().catch(() => {});
      } catch (_) {}
    }
    stop() {
      if (this.ctx && this.ctx.state !== "closed")
        this.ctx.suspend().catch(() => {});
    }
    play(e) {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== "running" || !settings.volume) return;
      const type = e.type,
        now = ctx.currentTime;
      if (now - (this.last[type] ?? -100) < (type === "shot" ? 0.065 : 0.1))
        return;
      const configs = {
        shot: [e.team ? 150 : 260, 0.065, 0.025, "triangle"],
        mortar: [65, 0.23, 0.12, "sine"],
        hit: [390, 0.035, 0.025, "triangle"],
        hurt: [90, 0.18, 0.1, "sine"],
        destroy: [48, 0.32, 0.12, "triangle"],
        blast: [42, 0.4, 0.1, "triangle"],
        dash: [240, 0.1, 0.04, "sine"],
        reload: [640, 0.06, 0.025, "sine"],
        online: [530, 0.5, 0.07, "sine"],
        order: [720, 0.055, 0.03, "sine"],
        end: [state.status === "won" ? 420 : 95, 0.6, 0.1, "sine"],
      };
      const a = configs[type];
      if (!a) return;
      this.last[type] = now;
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.type = a[3];
      osc.frequency.setValueAtTime(a[0], now);
      osc.frequency.exponentialRampToValueAtTime(
        type === "online" ? 1060 : Math.max(25, a[0] * 0.4),
        now + a[1],
      );
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(
        (a[2] * settings.volume) / 100 + 0.0001,
        now + 0.008,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + a[1]);
      osc.connect(gain);
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = E.clamp((e.x - E.hero(state).x) / 700, -0.7, 0.7);
        gain.connect(pan);
        pan.connect(ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
          pan.disconnect();
        };
      } else {
        gain.connect(ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      }
      osc.start(now);
      osc.stop(now + a[1] + 0.02);
    }
  }
  const sound = new AudioBus();
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ settings, save: saved }));
      saveAvailable = true;
    } catch (_) {
      if (saveAvailable)
        notice("Не удалось сохранить прогресс на этом устройстве");
      saveAvailable = false;
    }
  }
  function save() {
    if (mode !== "menu") saved = E.snapshot(state);
    persist();
  }
  function notice(text) {
    $("notice").textContent = text;
    $("notice").classList.add("visible");
    noticeUntil = performance.now() + 4200;
  }
  function resetInput() {
    keys.clear();
    input.fire = input.dash = input.reload = input.interact = false;
    for (const s of [moveStick, aimStick]) {
      s.id = null;
      s.x = 0;
      s.y = 0;
      s.active = false;
    }
    for (const el of [$("move-stick"), $("aim-stick")]) {
      el.querySelector("span").style.transform = "";
      el.classList.remove("active");
    }
  }
  function setMode(next) {
    resetInput();
    mode = next;
    document.body.dataset.mode = mode;
    $("home").hidden = mode !== "menu";
    $("hud").hidden = mode === "menu";
    $("tactical-panel").hidden = mode !== "tactical";
    $("tactical").setAttribute("aria-pressed", String(mode === "tactical"));
    $("tactical").querySelector("span").textContent =
      mode === "tactical" ? "В бой" : "Приказы";
    canvas.style.cursor =
      mode === "playing" && !coarse.matches ? "none" : "default";
    if (mode === "playing") sound.start();
    else if (mode !== "tactical") sound.stop();
    acc = 0;
    updateUI();
  }
  function updateHome() {
    $("continue").hidden = !saved || saved.status !== "playing";
    $("new-game").hidden = !saved || saved.status !== "playing";
    $("start").hidden = !!saved && saved.status === "playing";
  }
  function begin(resume = false) {
    state = resume && saved ? E.restore(saved) : E.make();
    if (!state) state = E.make();
    group = 1;
    phase = -1;
    resultShown = false;
    aim = { x: E.hero(state).x + 280, y: E.hero(state).y - 80 };
    mousePoint = null;
    view.fx = [];
    view.camera.x = 720;
    view.camera.y = 500;
    view.camera.scale = 0.7;
    if ($("dialog").open) $("dialog").close();
    sound.start();
    setMode(resume ? "playing" : "tactical");
    save();
  }
  function toggleTactical() {
    if (!["playing", "tactical"].includes(mode)) return;
    setMode(mode === "playing" ? "tactical" : "playing");
    save();
  }
  function chooseGroup(n) {
    if (n === 2 && !state.units.some((u) => u.group === 2 && u.hp > 0)) return;
    group = n;
    for (const [id, g] of [
      ["group-one", 1],
      ["group-two", 2],
    ]) {
      $(id).classList.toggle("selected", g === group);
      $(id).setAttribute("aria-pressed", String(g === group));
    }
  }
  function openDialog(which) {
    const dialog = $("dialog");
    if (!dialog.open) {
      dialogOrigin = mode;
      lastMode =
        mode === "tactical" ? "tactical" : mode === "menu" ? "menu" : "playing";
      if (mode !== "menu") save();
      setMode(mode === "menu" ? "menu" : "paused");
    }
    for (const section of dialog.querySelectorAll("section"))
      section.hidden = section.id !== which + "-content";
    if (!dialog.open) dialog.showModal();
    $("close-dialog").hidden = which === "result";
    if (which === "settings") {
      $("volume").value = settings.volume;
      $("volume-value").textContent = settings.volume + "%";
      $("motion").checked = settings.reduced;
    }
  }
  function closeDialog() {
    if (state.status !== "playing" && mode !== "menu") return;
    $("dialog").close();
    setMode(lastMode);
  }
  function backFromDetail() {
    if (dialogOrigin === "menu") closeDialog();
    else openDialog("pause");
  }
  function home() {
    save();
    $("dialog").close();
    setMode("menu");
    updateHome();
  }
  function reportEnd() {
    resultShown = true;
    save();
    openDialog("result");
    $("result-title").textContent =
      state.status === "won" ? "Узел удержан" : "Операция потеряна";
    $("result-description").textContent =
      state.status === "won"
        ? "Цитадель подавлена. Канал связи открыт для следующей высадки."
        : E.hero(state).hp <= 0
          ? "Связь с разведчиком потеряна. Используйте укрытия и рывок; огневая группа может прикрыть проход."
          : "Посадочный модуль уничтожен. Оставьте прикрытие на западном фланге.";
    $("result-time").textContent = formatTime(state.t);
    const allies = state.units.filter(
      (u) => u.team === 0 && u.group && u.hp > 0,
    );
    $("result-squad").textContent =
      allies.length + " / " + (state.phase === 3 ? 4 : 3);
  }
  function formatTime(t) {
    return (
      Math.floor(t / 60) + ":" + String(Math.floor(t) % 60).padStart(2, "0")
    );
  }
  function updateUI() {
    const h = E.hero(state),
      n = state.phase;
    if (n !== phase) {
      phase = n;
      $("phase").textContent = "0" + (n + 1) + " / 04";
      $("objective-text").textContent = [
        "Уничтожить глушитель",
        "Восстановить узел",
        "Защитить узел",
        "Подавить цитадель",
      ][n];
      $("objective-sub").textContent = [
        "Обход через северный проход",
        "Удерживайте действие рядом с узлом",
        "Не подпускайте противника к узлу",
        "Артиллерия готова к приказам",
      ][n];
      if (n === 1) notice("Глушитель снят. Узел связи доступен");
      if (n === 2) notice("Идёт запуск узла. Противник идёт с юга");
      if (n === 3) notice("Канал открыт. Артиллерия на позиции");
    }
    if (n === 2)
      $("objective-sub").textContent =
        "Запуск канала · " + Math.floor(state.relay.stability * 100) + "%";
    $("health-fill").style.width =
      Math.max(0, (h.hp / E.C.hero.hp) * 100) + "%";
    $("health-fill").parentElement.classList.toggle("danger", h.hp < 50);
    $("health-value").textContent = Math.ceil(h.hp);
    $("ammo").textContent = state.ammo;
    $("reload-status").textContent =
      state.reload > 0 ? "Перезарядка…" : "Импульсная винтовка";
    $("dash-cooldown").style.width = (state.dash / 3.2) * 100 + "%";
    $("dash").disabled = state.dash > 0;
    $("reload").disabled = state.reload > 0 || state.ammo === 12;
    const near =
      state.phase === 1 && E.dist(h, state.relay) < 75 && mode === "playing";
    $("interact-panel").hidden = !near;
    $("interact-progress").style.width = state.relay.charge * 100 + "%";
    const rifles = state.units.filter((u) => u.group === 1 && u.hp > 0).length,
      art = state.units.some((u) => u.group === 2 && u.hp > 0);
    $("rifle-count").textContent = rifles + " / 3";
    $("group-one").disabled = !rifles;
    $("group-two").disabled = !art;
    $("artillery-status").textContent = art
      ? "На позиции"
      : state.phase === 3
        ? "Потеряна"
        : "Нужна связь";
    if (performance.now() > noticeUntil)
      $("notice").classList.remove("visible");
  }
  $("start").onclick = () => begin();
  $("continue").onclick = () => begin(true);
  $("new-game").onclick = () => begin();
  $("tactical").onclick = toggleTactical;
  $("group-one").onclick = () => chooseGroup(1);
  $("group-two").onclick = () => chooseGroup(2);
  $("menu-button").onclick = () => openDialog("pause");
  $("resume").onclick = closeDialog;
  $("close-dialog").onclick = closeDialog;
  $("help-back").onclick = backFromDetail;
  $("settings-back").onclick = backFromDetail;
  $("restart").onclick = () => begin();
  $("retry").onclick = () => begin();
  $("to-home").onclick = home;
  $("result-home").onclick = home;
  for (const button of document.querySelectorAll("[data-open]"))
    button.onclick = () => openDialog(button.dataset.open);
  $("dialog").addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDialog();
  });
  $("volume").oninput = (e) => {
    settings.volume = +e.target.value;
    $("volume-value").textContent = settings.volume + "%";
    persist();
  };
  $("volume").onchange = () => {
    sound.start();
    sound.play({ type: "order", x: E.hero(state).x });
  };
  $("motion").onchange = (e) => {
    settings.reduced = e.target.checked;
    persist();
  };
  $("dash").onclick = () => {
    if (mode === "playing") input.dash = true;
  };
  $("reload").onclick = () => {
    if (mode === "playing") input.reload = true;
  };
  $("interact").addEventListener("pointerdown", (e) => {
    if (mode === "playing") {
      input.interact = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    $("interact").addEventListener(type, () => (input.interact = false));
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") {
      mousePoint = { x: e.clientX, y: e.clientY };
      aim = view.world(e.clientX, e.clientY);
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (mode === "tactical") {
      const p = view.world(e.clientX, e.clientY);
      if (p.x < 24 || p.y < 24 || p.x > E.W - 24 || p.y > E.H - 24) return;
      const success = E.order(state, group, p.x, p.y);
      view.add(state.events, settings.reduced);
      if (success) {
        sound.start();
        sound.play({ type: "order", ...p });
      }
      state.events = [];
      save();
    } else if (mode === "playing" && e.pointerType !== "touch") {
      mousePoint = { x: e.clientX, y: e.clientY };
      aim = view.world(e.clientX, e.clientY);
      input.fire = true;
      canvas.setPointerCapture(e.pointerId);
    }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(type, () => (input.fire = false));
  for (const [id, stick, isAim] of [
    ["move-stick", moveStick, false],
    ["aim-stick", aimStick, true],
  ]) {
    const el = $(id);
    function move(e) {
      if (e.pointerId !== stick.id) return;
      const r = el.getBoundingClientRect(),
        dx = e.clientX - r.x - r.width / 2,
        dy = e.clientY - r.y - r.height / 2,
        len = Math.hypot(dx, dy),
        max = r.width * 0.34,
        ratio = Math.min(1, len / max);
      stick.x = len ? (dx / len) * ratio : 0;
      stick.y = len ? (dy / len) * ratio : 0;
      stick.active = len > max * 0.24;
      el.querySelector("span").style.transform =
        `translate(${stick.x * max}px,${stick.y * max}px)`;
      el.classList.toggle("active", stick.active);
      e.preventDefault();
    }
    el.addEventListener("pointerdown", (e) => {
      if (mode !== "playing" || stick.id !== null) return;
      stick.id = e.pointerId;
      el.setPointerCapture(e.pointerId);
      move(e);
    });
    el.addEventListener("pointermove", move);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      el.addEventListener(type, (e) => {
        if (stick.id === e.pointerId) {
          stick.id = null;
          stick.x = stick.y = 0;
          stick.active = false;
          el.querySelector("span").style.transform = "";
          el.classList.remove("active");
        }
      });
  }
  addEventListener("keydown", (e) => {
    if (e.repeat && ["Tab", "Escape"].includes(e.code)) {
      e.preventDefault();
      return;
    }
    if ($("dialog").open || mode === "menu") return;
    if (e.code === "Escape") {
      e.preventDefault();
      openDialog("pause");
      return;
    }
    if (e.code === "Tab") {
      e.preventDefault();
      toggleTactical();
      return;
    }
    if (mode === "tactical") {
      if (e.code === "Digit1") chooseGroup(1);
      if (e.code === "Digit2") chooseGroup(2);
      return;
    }
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ShiftLeft",
        "ShiftRight",
        "KeyR",
        "KeyE",
      ].includes(e.code)
    ) {
      e.preventDefault();
      keys.add(e.code);
      if (e.code.startsWith("Shift") && !e.repeat) input.dash = true;
      if (e.code === "KeyR" && !e.repeat) input.reload = true;
    }
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  function background() {
    resetInput();
    if (["playing", "tactical"].includes(mode)) openDialog("pause");
  }
  addEventListener("blur", background);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) background();
  });
  addEventListener("pagehide", () => {
    save();
    sound.stop();
  });
  addEventListener("resize", () => {
    view.resize();
    resetInput();
  });
  function tick(now) {
    const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (mode === "playing") {
      acc += elapsed;
      while (acc >= E.DT && state.status === "playing") {
        const h = E.hero(state),
          mx =
            (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
            (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
          my =
            (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
            (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
        if (mousePoint && !coarse.matches)
          aim = view.world(mousePoint.x, mousePoint.y);
        if (aimStick.active)
          aim = {
            x: h.x + aimStick.x * 600,
            y: h.y + (aimStick.y * 600) / 0.73,
          };
        E.step(state, {
          x: mx + moveStick.x,
          y: my + moveStick.y / 0.73,
          aim,
          fire: input.fire || aimStick.active,
          dash: input.dash,
          reload: input.reload,
          interact: input.interact || keys.has("KeyE"),
        });
        input.dash = input.reload = false;
        for (const e of state.events) sound.play(e);
        view.add(state.events, settings.reduced);
        acc -= E.DT;
      }
      if (state.status !== "playing" && !resultShown) reportEnd();
      if (now - lastSaved > 3000) {
        save();
        lastSaved = now;
      }
    }
    if (now - lastUI > 80) {
      updateUI();
      lastUI = now;
    }
    view.render(
      state,
      {
        mode,
        group,
        aim,
        reduced: settings.reduced,
        touch: coarse.matches || innerWidth < 700,
      },
      elapsed,
    );
    requestAnimationFrame(tick);
  }
  updateHome();
  setMode("menu");
  requestAnimationFrame(tick);
  // Read-only telemetry supports diagnostics without changing the operation.
  window.SignalGame = Object.freeze({
    snapshot: () => E.snapshot(state),
    mode: () => mode,
    screen: (x, y) => view.screen(x, y),
    storageKey: KEY,
    audioState: () => sound.ctx?.state || "uninitialized",
  });
})();

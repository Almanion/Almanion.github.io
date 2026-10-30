(function () {
  "use strict";
  const E = window.SignalEngine,
    $ = (id) => document.getElementById(id),
    canvas = $("field"),
    view = new SignalView(canvas),
    miniCanvas = $("minimap-canvas"),
    minimap = new SignalMiniMap.MiniMap(miniCanvas),
    KEY = "signal-frontier-v1",
    coarse = matchMedia("(pointer:coarse)"),
    motionPref = matchMedia("(prefers-reduced-motion:reduce)");
  let state = E.make("frontier-9"),
    mode = "menu",
    group = 1,
    selected = [],
    selectionVisible = false,
    orderDrag = null,
    orderMode = false,
    selectedBuilding = null,
    placement = null,
    mapArea = null,
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
    lastDraw = lastFrame,
    nextDraw = lastFrame,
    renderDirty = true,
    noticeTimer = 0,
    acc = 0,
    phase = -1,
    resultShown = false;
  let combatFocus = null,
    miniDrag = null,
    miniRect = null;
  const mapPointers = new Map();
  const controlGroups = new Map();
  let dockTab = "shop", selectionPanel, mobileDockView = "selection", productionContext = null;
  const actionPointers = new Map();
  let edge = null,
    pinch = null,
    buildingPress = null,
    rallyBuilding = null;
  const siteLocks = {},
    keys = new Set(),
    input = { fire: false, dash: false, reload: false, interact: false },
    moveStick = { x: 0, y: 0, id: null },
    aimStick = { x: 1, y: 0, id: null, active: false };
  let localStore = null,
    storageConflict = false,
    account = null;
  try {
    localStore = new SignalLocalStore(localStorage, KEY);
    const raw = localStore.baseline;
    if (raw && raw.length <= 2000000) {
      const data = JSON.parse(raw);
      saved = E.restore(data.save);
      if (data.settings) {
        if (Number.isFinite(data.settings.volume))
          settings.volume = E.clamp(data.settings.volume, 0, 100);
        if (typeof data.settings.reduced === "boolean")
          settings.reduced = data.settings.reduced;
        if (typeof data.settings.minimapFold === "boolean")
          settings.minimapFold = data.settings.minimapFold;
        if (
          data.settings.controlGroups &&
          typeof data.settings.controlGroups === "object"
        )
          for (const [key, ids] of Object.entries(data.settings.controlGroups))
            if (/^[0-9]$/.test(key) && Array.isArray(ids))
              controlGroups.set(
                Number(key),
                [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 512),
              );
      }
    }
  } catch (_) {
    saveAvailable = false;
  }
  const sound = new SignalAudio({ volume: () => settings.volume });
  function persist() {
    try {
      settings.controlGroups = Object.fromEntries(controlGroups);
      if (!localStore) localStore = new SignalLocalStore(localStorage, KEY);
      if (!localStore.write({ settings, save: saved })) {
        if (!storageConflict) {
          storageConflict = true;
          queueMicrotask(showStorageConflict);
        }
        return;
      }
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
    if (saveAvailable && !storageConflict) {
      account?.localChanged();
      if (mode !== "playing") account?.changed();
    }
  }
  function showStorageConflict() {
    storageConflict = true;
    if (mode !== "menu") setMode("tactical");
    openDialog("storage");
  }
  addEventListener("storage", (e) => {
    if (e.key === KEY && localStore?.stale()) showStorageConflict();
  });
  function loadOperation(text) {
    const next = E.restore(JSON.parse(text));
    if (!next) throw Error("Не удалось прочитать сохранение.");
    if (placement) cancelPlacement();
    saved = next;
    state = E.restore(next);
    // Object ids are local to an operation, so another save cannot inherit them.
    controlGroups.clear();
    settings.controlGroups = {};
    resultShown = false;
    phase = -1;
    group = 1;
    resetInput();
    selected = [];
    selectedBuilding = null;
    selectionVisible = false;
    view.reset(state);
    minimap.reset();
    persist();
    updateHome();
    updateUI();
  }
  function notice(text) {
    $("notice").textContent = text;
    $("notice").classList.add("visible");
    noticeUntil = performance.now() + 4200;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(
      () => $("notice").classList.remove("visible"),
      4200,
    );
  }
  function resetInput() {
    cancelMiniGesture();
    closeMiniLegend();
    keys.clear();
    cancelSelection();
    input.tapFire = false;
    buildingPress = rallyBuilding = null;
    orderMode = false;
    for (const id of mapPointers.keys())
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    mapPointers.clear();
    edge = pinch = null;
    input.fire = input.dash = input.reload = input.interact = false;
    clearStick(moveStick, $("move-stick"));
    clearStick(aimStick, $("aim-stick"));
    for (const [pointer, button] of actionPointers) {
      button.classList.remove("pressed");
      if (button.hasPointerCapture(pointer))
        button.releasePointerCapture(pointer);
    }
    actionPointers.clear();
  }
  function setMode(next) {
    if (placement && next !== "tactical") cancelPlacement();
    if (
      mode === "playing" &&
      next === "tactical" &&
      ["highlands", "districts"].includes(E.map(state).id)
    ) {
      view.tactical = {
        overview: false,
        x: view.camera.x,
        y: view.camera.y,
        zoom: view.camera.scale,
      };
    }
    resetInput();
    combatFocus = null;
    mode = next;
    document.body.dataset.mode = mode;
    $("home").hidden = mode !== "menu";
    $("hud").hidden = mode === "menu";
    $("command-dock").hidden = !["playing", "tactical"].includes(mode) || !!placement;
    if (next === "tactical") dockTab = "shop";
    $("minimap-panel").hidden = !["playing", "tactical"].includes(mode);
    $("map-tools").hidden = !["playing", "tactical"].includes(mode);
    $("tactical").setAttribute("aria-pressed", String(mode === "tactical"));
    $("tactical").querySelector("span").textContent =
      mode === "tactical" ? "В бой" : "Приказы";
    sound.update(E.observe(state), mode, settings.volume);
    if (mode === "playing") sound.start();
    else if (mode !== "tactical") sound.stop();
    acc = 0;
    updateUI();
    measureMapArea();
  }
  function measureMapArea() {
    layoutMiniMap();
    if (!["playing", "tactical"].includes(mode)) return;
    const panel = (placement ? $("placement-panel") : $("command-dock")).getBoundingClientRect(),
      topbar = document.querySelector(".topbar").getBoundingClientRect(),
      objective = document.querySelector(".objective").getBoundingClientRect();
    const obstructions = [panel.top];
    if (!placement) {
      if (!$("control-groups").hidden) obstructions.push($("control-groups").getBoundingClientRect().top);
      if (mode === "playing") obstructions.push($("combat-vitals").getBoundingClientRect().top);
    }
    const next = {
      x: 14, y: Math.max(topbar.bottom, objective.bottom) + 12,
      right: innerWidth - 14,
      bottom: Math.min(...obstructions) - 12,
    };
    if (JSON.stringify(next) !== JSON.stringify(mapArea)) renderDirty = true;
    mapArea = next;
  }
  let mapMeasureFrame = 0;
  const mapLayout = new ResizeObserver(() => {
    // Read geometry after the browser finishes this layout notification batch.
    cancelAnimationFrame(mapMeasureFrame);
    mapMeasureFrame = requestAnimationFrame(measureMapArea);
  });
  for (const el of [
    $("command-dock"),
    $("control-groups"),
    $("combat-vitals"),
    $("map-tools"),
    document.querySelector(".objective"),
  ])
    mapLayout.observe(el);
  mapLayout.observe($("dialog"));
  mapLayout.observe($("placement-panel"));
  mapLayout.observe($("minimap-panel"));
  function updateHome() {
    $("continue").hidden = !saved || saved.status !== "playing";
    $("new-game").hidden = !saved || saved.status !== "playing";
    $("start").hidden = !!saved && saved.status === "playing";
  }
  function begin(resume = false) {
    minimap.reset();
    if (!resume) {
      controlGroups.clear();
      settings.controlGroups = {};
    }
    state = resume && saved ? E.restore(saved) : E.make("frontier-9");
    if (!state) state = E.make("frontier-9");
    development.select();
    group = 1;
    selected = [];
    selectedBuilding = null;
    selectionVisible = false;
    phase = -1;
    resultShown = false;
    aim = { x: E.hero(state).x + 280, y: E.hero(state).y - 80 };
    mousePoint = null;
    view.reset(state);
    view.camera.x = E.hero(state).x;
    view.camera.y =
      E.hero(state).y -
      E.elevation(E.hero(state).x, E.hero(state).y, E.map(state));
    view.camera.scale = 0.7;
    if ($("dialog").open) $("dialog").close();
    sound.start();
    setMode(resume ? "playing" : "tactical");
    save();
  }
  function toggleTactical() {
    if ($("dialog").open && $("dialog").dataset.panel === "development") {
      $("dialog").close();
      document.body.classList.remove("development-open");
    }
    if (!["playing", "tactical"].includes(mode)) return;
    setMode(mode === "playing" ? "tactical" : "playing");
    save();
  }
  $("control-groups").addEventListener("click", (e) => {
    const button = e.target.closest("[data-control-group]");
    if (button) recallGroup(Number(button.dataset.controlGroup), e.shiftKey);
  });
  function selectable(u) {
    return !u.team && u.hp > 0 &&
      ([1, 2].includes(u.group) || u.kind === "drone" ||
        ["base", "outpost", "barracks", "foundry", "arsenal", "bunker", "logistics"].includes(u.kind));
  }
  function refreshControlGroups(members) {
    const live = new Map(state.units.filter(selectable).map((u) => [u.id, u])),
      selectedIds = new Set(members.map((u) => u.id)),
      el = $("control-groups");
    if (mode !== "menu") {
      let changed = false;
      for (const [n, ids] of controlGroups) {
        const alive = ids.filter((id) => live.has(id));
        if (alive.length !== ids.length) changed = true;
        if (alive.length) controlGroups.set(n, alive);
        else { controlGroups.delete(n); changed = true; }
      }
      if (changed) settings.controlGroups = Object.fromEntries(controlGroups);
    }
    const buttons = new Map([...el.children].map((b) => [Number(b.dataset.controlGroup), b]));
    let index = 0;
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
      const ids = controlGroups.get(n);
      if (!ids?.length) { buttons.get(n)?.remove(); continue; }
      let button = buttons.get(n);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.controlGroup = n;
        button.innerHTML = `<kbd>${n}</kbd><small aria-hidden="true"></small>`;
        button.setAttribute("aria-keyshortcuts", String(n));
      }
      if (el.children[index] !== button) el.insertBefore(button, el.children[index] || null);
      index++;
      const count = button.querySelector("small"),
        active = ids.length === selectedIds.size && ids.every((id) => selectedIds.has(id)),
        buildings = ids.filter((id) => !E.C[live.get(id)?.kind]?.speed).length,
        label = `Группа ${n} · объектов: ${ids.length} · войск: ${ids.length - buildings} · зданий: ${buildings}`;
      if (count.textContent !== String(ids.length)) count.textContent = ids.length;
      if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
      if (button.getAttribute("aria-pressed") !== String(active)) button.setAttribute("aria-pressed", String(active));
      const title = `${label}. ${n} — выбрать · Shift + ${n} — добавить к выделению · Ctrl + ${n} — заменить группу`;
      if (button.title !== title) button.title = title;
    }
    el.hidden = !controlGroups.size || !["playing", "tactical"].includes(mode) || !!placement || $("dialog").open;
    if (document.body.classList.contains("has-control-groups") !== !el.hidden) {
      document.body.classList.toggle("has-control-groups", !el.hidden);
      measureMapArea();
    }
  }
  function assignGroup(n, add) {
    const ids = selectedUnits().map((u) => u.id), before = controlGroups.get(n) || [];
    if (!ids.length && add) return;
    if (ids.length) controlGroups.set(n, [...new Set([...(add ? before : []), ...ids])]);
    else controlGroups.delete(n);
    settings.controlGroups = Object.fromEntries(controlGroups);
    save();
    refreshSelection();
    notice(ids.length ? `Группа ${n} сохранена · объектов: ${controlGroups.get(n).length}` : `Группа ${n} очищена`);
  }
  function recallGroup(n, add) {
    if (!controlGroups.has(n)) return;
    if ($("dialog").open && $("dialog").dataset.panel === "development") closeDialog();
    cancelMapGesture();
    selectHits(controlGroups.get(n), add);
  }
  function refreshSelection() {
    const members = selectedUnits(),
      building = state.units.find((u) => u.id === selectedBuilding && u.hp > 0),
      workers = members.filter((u) => u.kind === "drone"),
      onlyWorkers = workers.length > 0 && workers.length === members.length,
      servicing = workers.filter((u) => u.workerTask?.kind === "repair");
    if (!building) selectedBuilding = null;
    const producer =
      building && ["barracks", "foundry"].includes(building.kind);
    const tracking = (u) =>
      E.C[u.kind].speed ? u.order?.followId : u.rally?.followId;
    const following = members.map(tracking).find((id) => id !== undefined),
      leader =
        following !== undefined &&
        members.every((u) => u.id === following || tracking(u) === following)
          ? state.units.find((u) => u.id === following && u.hp > 0)
          : null;
    const leaderName = leader?.kind === "hero" ? "разведчиком" : "бойцом";
    const selectionText = building
      ? {
          barracks: "Казармы",
          foundry: "Тяжёлый цех",
          base: "База",
          outpost: E.construction.enabled(state) ? "Экстрактор" : "Узел",
          arsenal: "Арсенал",
          bunker: "Бункер",
          logistics: "Узел снабжения",
        }[building.kind]
      : onlyWorkers
        ? (workers.length === 1 ? "Зонд" : "Зонды: " + workers.length) +
          (servicing.length ? " · ремонт" : workers.some((u) => u.buildingId) ? " · стройка" : "")
      : members.length
        ? "Выбрано: " + members.length + (leader ? " · следуют" : "")
        : "Нет выбранных войск";
    if ($("selection-count").textContent !== selectionText)
      $("selection-count").textContent = selectionText;
    $("order-move").disabled = !members.length && !producer;
    $("order-move").querySelector("span").textContent =
      onlyWorkers ? "Приказ" : members.length && members.every((u) => !E.C[u.kind].speed)
        ? "Сбор"
        : "Идти";
    refreshControlGroups(members);
    refreshDock(members);
    $("order-move").setAttribute(
      "aria-pressed",
      String(orderMode || !!rallyBuilding),
    );
    $("order-cancel").hidden =
      !orderMode && !rallyBuilding && !building && !members.length;
    $("order-cancel").querySelector("span").textContent =
      orderMode || rallyBuilding ? "Отмена" : workers.some((u) => u.workerTask || u.buildingId)
        ? "К добыче" : "Снять";
    const touch = coarse.matches || innerWidth < 700;
    $("tactical-hint").textContent =
      !members.length ? touch ? "Два пальца — карта · здание — управление" : "WASD — движение · ЛКМ — огонь" : onlyWorkers
        ? orderMode
          ? "Ресурс — добывать · постройка — ремонт · земля — перейти"
          : touch ? "Касание ресурса — добыча · «Приказ» → здание — ремонт"
            : "Ресурс — добыча · ПКМ по своей постройке — ремонт"
      : orderMode || rallyBuilding
        ? producer
          ? "Укажите точку сбора · Отмена"
          : "Земля — идти · свой — следовать · экстрактор — лечиться"
        : leader
          ? "Следуют за " +
            leaderName +
            (touch ? " · «Идти» — новый приказ" : " · ПКМ — новый приказ")
          : touch
            ? "Касание / рамка — выбор · два пальца — карта"
            : "ПКМ: идти / следовать / атака · экстрактор — лечиться";
    document.body.classList.toggle("issuing-order", mode === "playing" && (orderMode || !!rallyBuilding));
  }
  function refreshDock(members = selectedUnits()) {
    const active = ["playing", "tactical"].includes(mode) && !placement,
      shop = mode === "tactical" && dockTab === "shop",
      panel = $("command-dock"), next = shop ? "shop" : "selection",
      changed = panel.hidden !== !active || panel.dataset.view !== next;
    if (panel.hidden !== !active) panel.hidden = !active;
    if (panel.dataset.view !== next) panel.dataset.view = next;
    if ($("development-content").hidden !== !shop) $("development-content").hidden = !shop;
    if ($("selection-content").hidden !== shop) $("selection-content").hidden = shop;
    $("dock-shop").hidden = false;
    if ($("dock-shop").getAttribute("aria-pressed") !== String(shop)) $("dock-shop").setAttribute("aria-pressed", String(shop));
    if ($("dock-count").textContent !== String(members.length)) $("dock-count").textContent = members.length;
    $("dock-count").hidden = !members.length;
    panel.dataset.empty = String(!members.length);
    const label = mode === "tactical" ? "Пауза" : "Бой";
    if ($("dock-mode").textContent !== label) $("dock-mode").textContent = label;
    if (active && !shop) selectionPanel?.render();
    else if (selectionPanel) selectionPanel.renderProduction(state, null);
    const narrow = matchMedia("(max-width: 759px) and (orientation: portrait)").matches,
      production = narrow && document.body.classList.contains("has-production") && !shop;
    $("dock-production").hidden = !production;
    const showingProduction = production && mobileDockView === "production";
    panel.dataset.mobileView = showingProduction ? "production" : "selection";
    $("dock-production").setAttribute("aria-pressed", String(showingProduction));
    $("dock-selection").setAttribute("aria-pressed", String(!shop && !showingProduction));
    if (changed) measureMapArea();
  }
  function selectedUnits() {
    const ids = new Set(selected || []);
    return state.units.filter(
      (u) =>
        selectable(u) &&
        ids.has(u.id),
    );
  }
  function cancelSelection(release = true) {
    const drag = orderDrag;
    orderDrag = null;
    $("selection-box").hidden = true;
    if (release && drag && canvas.hasPointerCapture(drag.id))
      canvas.releasePointerCapture(drag.id);
  }
  function paintSelection() {
    const box = $("selection-box"),
      d = orderDrag;
    box.hidden = !d?.moved;
    if (!d) return;
    box.style.left = Math.min(d.startX, d.x) + "px";
    box.style.top = Math.min(d.startY, d.y) + "px";
    box.style.width = Math.abs(d.x - d.startX) + "px";
    box.style.height = Math.abs(d.y - d.startY) + "px";
  }
  function cancelMapGesture() {
    cancelSelection();
    const ids = [...mapPointers.keys()];
    mapPointers.clear();
    edge = pinch = null;
    for (const id of ids)
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function clearSelection() {
    cancelMapGesture();
    selected = [];
    selectedBuilding = rallyBuilding = null;
    selectionVisible = true;
    orderMode = false;
    refreshSelection();
  }
  function troopAt(e, enemy = false, includeHero = false) {
    const pad = e.pointerType === "touch" ? 24 : 14;
    // An overview must not turn a distant enemy into a large invisible target.
    const hitPad = enemy
      ? Math.max(4, Math.min(pad, 30 * view.camera.scale))
      : pad;
    return state.units
      .filter((u) => !enemy || E.visible(state, 0, u))
      .filter(
        (u) =>
          u.hp > 0 && !u.care?.inside &&
          (enemy
            ? u.team
            : !u.team &&
              ([1, 2].includes(u.group) || u.kind === "drone" || (includeHero && u.kind === "hero"))),
      )
      .map((u) => {
        const p = view.screen(u.x, u.y);
        return {
          u,
          d: Math.hypot(
            e.clientX - p.x,
            (e.clientY - p.y + 8 * view.camera.scale) / 0.85,
          ),
          r: Math.max(hitPad, E.C[u.kind].r * view.camera.scale),
        };
      })
      .filter((v) => v.d <= v.r)
      .sort((a, b) => a.d - b.d)[0]?.u;
  }
  function resourceAt(e) {
    if (!E.support.enabled(state) || !selectedUnits().some((u) => u.kind === "drone")) return null;
    return state.campaign.mines.filter((m) => E.explored(state, 0, m)).map((m) => {
      const p = view.screen(m.x, m.y);
      return { ...m, kind: "resource", distance: Math.hypot(e.clientX - p.x, e.clientY - p.y + 8 * view.camera.scale) };
    }).filter((m) => m.distance <= Math.max(e.pointerType === "touch" ? 28 : 18, 48 * view.camera.scale))
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }
  function orderTargetAt(e) {
    const resource = resourceAt(e);
    if (resource) return resource;
    const ally = troopAt(e, false, true) || buildingAt(e),
      enemy = troopAt(e, true);
    if (!ally || !enemy) return ally || enemy;
    const distance = (u) => {
      const p = view.screen(u.x, u.y);
      return Math.hypot(
        e.clientX - p.x,
        (e.clientY - p.y + 8 * view.camera.scale) / 0.85,
      );
    };
    return distance(ally) < distance(enemy) ? ally : enemy;
  }
  function issueOrder(point, target = null) {
    const producer = rallyBuilding || selectedBuilding;
    if (target) point = { x: target.x, y: target.y };
    const map = E.map(state);
    if (
      point.x < 24 ||
      point.y < 24 ||
      point.x > map.W - 24 ||
      point.y > map.H - 24
    )
      return false;
    if (!producer && !selectedUnits().length) {
      if (E.support.enabled(state) && E.support.facility(target)) return careAction("admit", target.id, [state.heroId]);
      return false;
    }
    const ids = rallyBuilding
      ? [rallyBuilding]
      : selectedUnits().map((u) => u.id);
    if (!ids.length && producer) ids.push(producer);
    const mining = target?.kind === "resource" ? E.support.assignResource(state, ids, target.id) : null;
    const success = mining ? mining.allowed : E.commandSelection(state, ids, point, target?.id ?? null);
    if (success) {
      rallyBuilding = null;
      orderMode = false;
      view.add(E.knownEvents(state), settings.reduced);
      sound.start();
      sound.play({ type: "order", ...point });
      state.events = [];
      save();
      if (mining) notice(`Добыча назначена · зондов ${mining.count} из ${mining.requested}`);
      else if (target?.kind === "bunker" && state.units.some((u) => ids.includes(u.id) && u.care?.facility === target.id))
        notice("Ко входу бункера · дальность и обзор внутри +25%");
      else if (target?.kind === "outpost" && state.units.some((u) => ids.includes(u.id) && u.care?.facility === target.id))
        notice("Ко входу экстрактора · лечение внутри · 8 прочности/с");
      else if (target && state.units.some((u) => ids.includes(u.id) && u.workerTask?.targetId === target.id))
        notice("Зонд назначен на ремонт · 12 прочности/с · 1 сплава за 8 прочности");
      else if (
        target &&
        !target.team &&
        (target.kind === "hero" || [1, 2].includes(target.group))
      )
        notice(
          "Следовать за " + (target.kind === "hero" ? "разведчиком" : "бойцом"),
        );
    } else
      notice(
        mining ? (mining.reason === "empty-resource" ? "Месторождение истощено" : "Нет доступного экстрактора: проверьте места для зондов и путь")
        : target?.kind === "bunker" && selectedUnits().some(E.support.patient) ? "Нужны готовый бункер, свободное место из четырёх и путь ко входу"
        : target?.kind === "outpost" && selectedUnits().some(E.support.patient) ? "Нужны раненые бойцы, свободное место лечения и путь ко входу"
        : producer
          ? "Здесь нельзя поставить точку сбора"
          : ids.some((id) => state.units.some((u) => u.id === id && u.kind === "drone"))
            ? target?.team ? "Зонды ремонтируют только свои постройки"
              : target && E.construction.repairable(target) && target.hp >= E.C[target.kind].hp
                ? "Корпус не повреждён" : "Нет пути или все места ремонта заняты"
          : target && !target.team
            ? "Для следования выберите других бойцов · ведущий не должен следовать за ними"
            : "Нет доступного пути",
      );
    refreshSelection();
    return success;
  }
  function selectHits(hits, add, toggle = false) {
    const before = add ? selectedUnits().map((u) => u.id) : [];
    selected =
      toggle && hits.length === 1 && before.includes(hits[0])
        ? before.filter((id) => id !== hits[0])
        : [...new Set([...before, ...hits])];
    selectedBuilding =
      selected.length === 1 &&
      state.units.some((u) => u.id === selected[0] && !E.C[u.kind].speed)
        ? selected[0]
        : null;
    rallyBuilding = null;
    selectionVisible = true;
    orderMode = false;
    refreshSelection();
  }
  let lastEntityTap = null;
  function selectType(kind, add = false) {
    const hits = state.units.filter((u) => {
      if (!selectable(u) || u.care?.inside || u.kind !== kind || !E.visible(state, 0, u)) return false;
      const p = view.screen(u.x, u.y), y = p.y - 8 * view.camera.scale;
      if (p.x < 0 || p.x >= innerWidth || y < 0 || y >= innerHeight) return false;
      const el = document.elementFromPoint(p.x, y);
      return el === canvas || !!el?.closest(".stick");
    });
    selectHits(hits.map((u) => u.id), add);
    notice("Выбран тип на экране · " + hits.length);
  }
  function selectEntity(u, e, add = false) {
    if (u.kind === "resource") { issueOrder(u, u); lastEntityTap = null; return; }
    const now = performance.now(), previous = lastEntityTap;
    lastEntityTap = { id: u.id, time: now, x: e.clientX, y: e.clientY };
    if (previous?.id === u.id && now - previous.time < 360 &&
      Math.hypot(e.clientX - previous.x, e.clientY - previous.y) < 28) {
      lastEntityTap = null; selectType(u.kind, add);
    } else if (!E.C[u.kind].speed && !add) openBuilding(u);
    else selectHits([u.id], add, true);
  }
  function careAction(action, id, ids = [state.heroId]) {
    let success = false, message;
    const bunker = state.units.some((u) => u.id === id && u.kind === "bunker");
    if (action === "admit") {
      const result = E.support.admit(state, ids, id); success = result.allowed;
      message = bunker ? result.reason === "bunker-full" ? "Все четыре места бункера заняты" : "Бункер недоступен или нет пути ко входу" : result.reason === "infirmary-full" ? "Все четыре места лечения заняты" : "Боец здоров или нет пути ко входу";
    } else if (action === "exit") {
      const u = state.units.find((u) => u.id === id);
      if (u?.care) { u.care.exit = true; E.support.leave(state, u); success = true; }
    } else success = E.support.evacuate(state, id);
    notice(success ? action === "admit" ? bunker ? "Занять бункер · дальность и обзор внутри +25%" : "Лечение внутри экстрактора · 8 прочности/с" : "Приказ на выход · освободите вход, если он занят" : message || "Нет бойцов внутри");
    if (success) {
      E.refreshRecon(state); view.add(E.knownEvents(state), settings.reduced); state.events = [];
      save(); renderDirty = true; updateUI();
    }
    return success;
  }
  function finishSelection(d, e) {
    if (d.moved) {
      const left = Math.min(d.startX, d.x),
        right = Math.max(d.startX, d.x),
        top = Math.min(d.startY, d.y),
        bottom = Math.max(d.startY, d.y);
      const hits = state.units
        .filter((u) => {
          if (
            u.team ||
            u.hp <= 0 || u.care?.inside ||
            (![1, 2].includes(u.group) && u.kind !== "drone" &&
              !["base", "outpost", "barracks", "foundry", "arsenal", "bunker", "logistics"].includes(
                u.kind,
              ))
          )
            return false;
          const p = view.screen(u.x, u.y),
            r = E.C[u.kind].r * view.camera.scale;
          return (
            p.x + r >= left &&
            p.x - r <= right &&
            p.y + r * 0.73 >= top &&
            p.y - r * 0.73 <= bottom
          );
        })
        .map((u) => u.id);
      selectHits(hits, d.add);
    } else if (onField(e)) {
      if (mode === "playing")
        issueOrder(view.world(e.clientX, e.clientY), orderTargetAt(e));
      else {
        const unit = resourceAt(e) || troopAt(e) || buildingAt(e);
        if (unit) selectEntity(unit, e, d.add);
        else if (!d.add) clearSelection();
      }
    }
  }
  function onField(e) {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    return (
      e.clientX >= 0 &&
      e.clientX < innerWidth &&
      e.clientY >= 0 &&
      e.clientY < innerHeight &&
      (hit === canvas || (mode === "playing" && e.pointerType !== "touch" &&
        !!hit?.closest("#touch-controls .stick")))
    );
  }
  function openDialog(which) {
    if (which === "development" && !storageConflict) {
      if ($("dialog").open) $("dialog").close();
      if (mode !== "tactical") setMode("tactical");
      dockTab = "shop";
      refreshDock(selectedUnits());
      development.render();
      measureMapArea();
      return;
    }
    const dialog = $("dialog");
    if (storageConflict && which !== "storage") which = "storage";
    const drawer = which === "development" && !storageConflict;
    if (dialog.open && (dialog.dataset.panel === "development") !== drawer)
      dialog.close();
    if (!dialog.open) {
      dialogOrigin = mode;
      lastMode =
        mode === "tactical" ? "tactical" : mode === "menu" ? "menu" : "playing";
      if (mode !== "menu") save();
      if (drawer) lastMode = "tactical";
      setMode(drawer ? "tactical" : mode === "menu" ? "menu" : "paused");
      account?.changed();
    }
    dialog.dataset.panel = which;
    dialog.classList.toggle("dock", drawer);
    for (const section of dialog.querySelectorAll("section"))
      section.hidden = section.id !== which + "-content";
    if (!dialog.open) drawer ? dialog.show() : dialog.showModal();
    document.body.classList.toggle("development-open", drawer);
    $("close-dialog").hidden = which === "result";
    if (which === "account") account.render();
    if (which === "supply") updateSupply();
    if (which === "development") {
      development.render();
      measureMapArea();
    }
    if (which === "help")
      $("economy-help").textContent = E.construction.enabled(state)
        ? "В «Стройке» или «Добыче» выберите «Экстрактор» размером 4×4 и поставьте у свободного разведанного месторождения. Золотая линия показывает путь дронов: поверните выход к источнику, чтобы сократить доставку. R или кнопка поворота перебирает четыре стороны. Один дрон отправится строить; погибшего строителя можно заменить в карточке здания. Для добычи закажите зондов или выделите существующих и нажмите на ресурс: они выберут ближайший доступный экстрактор. " + (E.development.logistics(state) ? "На одном источнике работают до шести зондов; лишние ищут свободное месторождение с экстрактором. Узел снабжения стоит 90 сплава, строится 24 секунды и добавляет 12 снабжения армии и 4 места для зондов. Стартовые лимиты — 24 и 16, максимальные — 120 и 48 при восьми узлах. Боец и дозорный занимают 1 снабжения, артиллерия — 4. Очереди резервируют места заранее. Потеря узла сохраняет войска, но при превышении лимита приостанавливает производство." : "У каждого узла четыре рабочих места.") + " Выбранных бойцов можно направить ПКМ в экстрактор, на телефоне — кнопкой «Идти» и касанием здания. Внутри четыре места лечения, стрелять нельзя; после полного восстановления бойцы автоматически выходят, а если выход занят — ждут свободного места. Вкладка «Лечение» позволяет отправить разведчика или вывести пациентов досрочно. В разделе «Стройка» есть бункер на четыре бойца: отправьте их ПКМ или кнопкой приказа. Внутри дальность и обзор повышаются на 25%; огонь ведётся с крыши, лечения нет. Выберите бункер: нажатие на портрет выводит бойца, «Вывести всех» освобождает гарнизон. Разведчик стреляет вручную и выходит при движении. Двойное нажатие выбирает все объекты этого типа на видимой части экрана. На телефоне подтвердите место кнопкой; на компьютере — щелчком. Shift + ЛКМ размещает несколько зданий, Esc отменяет. У каждого производства своя очередь и точка сбора. Арсенал после II ступени открывает улучшения. Для III ступени нужны два экстрактора и подавленная внешняя база. Зондов можно выделить и отправить чинить своё повреждённое здание: ПКМ, а на телефоне — «Приказ» и касание здания. Ремонт расходует 1 сплава на 8 прочности; завершив его, зонд вернётся к добыче. «К добыче» отзывает работника. Стройка, ремонт и очереди продолжаются после выхода из паузы."
        : E.development.expedition(state)
          ? "Разверните добычу и казармы. Второй узел и подавление северного бастиона или южного арсенала откроют оперативный контур. Вражеские базы собирают отряды; их уничтожение прекращает подкрепления. Выберите осаду с артиллерией или проникновение через терминал. Нажмите на своё здание, чтобы открыть очередь. Очереди работают только вне паузы."
          : E.development.extended(state)
            ? "Дроны доставляют сплав в узлы. Развивайте добычу и казармы, исследуйте сеть управления. Второй добывающий узел и уничтоженный глушитель либо южная батарея откроют оперативный контур — артиллерию и проникновение. В разделе добычи доступны защита узлов и ремонт. Очереди работают только вне паузы."
            : state.campaign
              ? "Дроны доставляют сплав из конечных месторождений. Постройте казармы и добывающий узел, затем исследуйте сеть управления. Выберите тяжёлый цех для осады или модуль проникновения. Очереди работают только в бою. Приказ группе задаёт точку сбора подкреплений."
              : "Сплав находится в контейнерах. Опорные пункты восстанавливают отряд; снабжение позволяет выбрать артиллерию или модуль взлома.";
    if (which === "settings") {
      $("volume").value = settings.volume;
      $("volume-value").textContent = settings.volume + "%";
      $("motion").checked = settings.reduced;
    }
  }
  function closeDialog() {
    if (storageConflict) return;
    if (state.status !== "playing" && mode !== "menu") return;
    $("dialog").close();
    document.body.classList.remove("development-open");
    setMode(lastMode);
    account?.changed();
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
    sound.update(E.observe(state), mode, settings.volume);
    openDialog("result");
    $("result-title").textContent =
      state.status === "won" ? "Цитадель подавлена" : "Операция потеряна";
    $("result-description").textContent =
      state.status === "won"
        ? state.approach === "infiltration"
          ? "Обход через терминал. Отряд прошёл оборону под прикрытием взлома."
          : "Осада через узел связи. Коридор для следующей высадки открыт."
        : E.hero(state).hp <= 0
          ? "Связь с разведчиком потеряна. Используйте укрытия и рывок; огневая группа может прикрыть проход."
          : "Посадочный модуль уничтожен. Оставьте прикрытие на западном фланге.";
    $("result-time").textContent = formatTime(state.t);
    const allies = state.units.filter(
      (u) => u.team === 0 && u.group && u.hp > 0,
    );
    $("result-squad").textContent =
      allies.length +
      " / " +
      (state.units.filter((u) => u.team === 0 && u.group).length + (state.campaign?.retired?.allies || 0));
    $("result-spent").textContent =
      state.economy.spent - state.economy.recovered;
    const endedState = state;
    sound.start().then(() => {
      if (state !== endedState || !resultShown) return;
      sound.play({ type: "end", x: E.hero(state).x, y: E.hero(state).y });
      setTimeout(() => {
        if (state === endedState && resultShown && mode === "paused")
          sound.stop();
      }, 1500);
    });
  }
  function formatTime(t) {
    return (
      Math.floor(t / 60) + ":" + String(Math.floor(t) % 60).padStart(2, "0")
    );
  }
  function updateUI() {
    renderDirty = true;
    if (selected) selected = selectedUnits().map((u) => u.id);
    refreshSelection();
    const h = E.hero(state),
      n = state.phase;
    const task = E.objective(state);
    const titles = {
      develop: "Развернуть казармы",
      expand: "Расширить добычу",
      network: "Связать узлы",
      "expand-network": "Закрепиться во втором секторе",
      secure: "Подавить вражеский опорный пункт",
      fortress: "Подавить вражескую базу",
      command: "Подготовить наступление",
      jammer: "Отключить защиту",
      relay: "Запустить узел",
      defend: "Удержать узел",
      terminal: "Взломать терминал",
      citadel: "Подавить цитадель",
    };
    const hints = {
      develop: "Развитие · производство",
      expand: "Разведчик строит узел у месторождения",
      network: "Развитие · исследуйте сеть управления",
      "expand-network": "Постройте второй добывающий узел",
      secure: "Южная батарея или северный глушитель",
      fortress: "Северный бастион или южный арсенал",
      command: "Развитие · исследуйте оперативный контур",
      jammer: "Глушитель или обход через терминал",
      relay: "Удерживайте действие рядом с узлом",
      defend:
        "Запуск канала · " + Math.floor(state.relay.stability * 100) + "%",
      terminal: "Удерживайте взлом; отряд прикрывает",
      citadel:
        state.terminal.window > 0
          ? state.terminal.channeling
            ? "Удерживайте взлом; отряд атакует"
            : "Защита вернётся через " + Math.ceil(state.terminal.window) + " с"
          : state.units.some((u) => u.kind === "artillery" && u.hp > 0)
            ? "Прикажите артиллерии выдвинуться"
            : "Артиллерия доступна в снабжении",
    };
    if (
      state.campaign &&
      task.id === "citadel" &&
      !state.terminal.window &&
      !E.living(state, "artillery")
    )
      hints.citadel = E.living(state, "foundry")
        ? "Развитие · закажите артиллерию"
        : "Развитие · постройте тяжёлый цех";
    if (E.construction.enabled(state)) {
      hints.develop = "Развитие → Стройка · выберите площадку";
      hints.expand = "Развитие → Экстрактор · разместите у свободной жилы";
      hints["expand-network"] = "Постройте экстрактор у второй свободной жилы";
    }
    $("objective-text").textContent = titles[task.id];
    $("objective-sub").textContent = hints[task.id];
    if (n !== phase) {
      phase = n;
      if (state.approach === "siege") {
        if (n === 1) notice("Глушитель снят. Узел связи доступен");
        if (n === 2)
          notice(
            state.campaign
              ? "Идёт запуск. Удерживайте сектор вокруг узла"
              : "Идёт запуск узла. Противник идёт с юга",
          );
        if (n === 3) notice("Канал открыт. Доступна артиллерия");
      }
    }
    $("field-alloy").textContent = state.economy.alloy;
    const economy = state.campaign ? E.development.summary(state) : null;
    $("field-capacity").textContent = economy
      ? `${economy.population - economy.armyReserved} / ${economy.capacity}`
      : selectedUnits().length;
    $("worker-capacity-counter").hidden = !economy;
    if (economy) {
      $("field-workers").textContent = `${economy.workers} / ${economy.workerCapacity}`;
      for (const [id, reserved, used, capacity] of [
        ["army", economy.armyReserved, economy.population, economy.capacity],
        ["worker", economy.workerReserved, economy.workers + economy.workerReserved, economy.workerCapacity],
      ]) {
        $(id + "-reserved").hidden = !reserved;
        $(id + "-reserved").textContent = "+" + reserved + " в очереди";
        $(id + "-capacity-counter").classList.toggle("capacity-full", used >= capacity);
        $(id + "-capacity-counter").title = `${used} занято с очередью из ${capacity}` +
          (E.development.logistics(state) ? ` · максимум ${id === "army" ? 120 : 48}` : "");
      }
    }
    $("map-overview").setAttribute(
      "aria-pressed",
      String(mode === "tactical" && view.tactical.overview),
    );
    $("health-fill").style.transform = `scaleX(${E.clamp(h.hp / E.C.hero.hp, 0, 1)})`;
    $("health-meter").classList.toggle("danger", h.hp < E.C.hero.hp / 3);
    $("health-meter").setAttribute("aria-valuenow", Math.max(0, Math.ceil(h.hp)));
    $("health-meter").setAttribute("aria-valuemax", E.C.hero.hp);
    $("ammo-fill").style.transform = `scaleX(${state.ammo / 12})`;
    $("ammo-meter").setAttribute("aria-valuenow", state.ammo);
    $("ammo-meter").setAttribute("aria-valuetext", state.reload > 0
      ? `${state.ammo} из 12 · перезарядка` : `${state.ammo} из 12`);
    $("reload-fill").style.transform = `scaleX(${state.reload > 0 ? E.clamp(1 - state.reload / 1.1, 0, 1) : 0})`;
    $("dash-cooldown").style.width = (state.dash / 3.2) * 100 + "%";
    $("dash").style.setProperty("--cooldown", (state.dash / 3.2) * 100 + "%");
    $("reload").style.setProperty(
      "--cooldown",
      (state.reload / 1.1) * 100 + "%",
    );
    $("dash").disabled = state.dash > 0;
    $("reload").disabled = state.reload > 0 || state.ammo === 12;
    const act = E.interaction(state);
    $("interact-panel").hidden = !act || mode !== "playing";
    $("interact").disabled = !!act && !act.allowed;
    if (act) {
      $("interact-label").textContent =
        act.type === "cache"
          ? "Забрать сплав · +" +
            (state.campaign ? E.development.rules(state).cache : 40)
          : act.type === "terminal"
            ? act.allowed
              ? state.terminal.window > 0
                ? "Удерживать взлом"
                : "Взломать терминал"
              : "Нужен модуль взлома"
            : "Запустить узел";
      $("interact-progress").style.width = act.progress * 100 + "%";
      const label = $("interact-label").textContent + (act.allowed ? " · удерживайте E или кнопку" : "");
      $("interact").title = label;
      $("interact").setAttribute("aria-label", label);
      if ($("interact").dataset.type !== act.type) {
        $("interact").dataset.type = act.type;
        $("interact-icon").setAttribute("d", ({
          cache: "m4 9 8-4 8 4v10l-8 3-8-3Zm0 0 8 4 8-4m-8 4v9M12 1v7m-3-3 3 3 3-3",
          relay: "M12 10v10m-4 1h8M8 5a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 2a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14M12 7v4m-2-2h4",
          terminal: "M8 4H4v16h4m8-16h4v16h-4M9 9l-3 3 3 3m6-6 3 3-3 3m-2-7-2 10",
        })[act.type]);
      }
    }
    $("interact").classList.toggle("pressed", !!act?.allowed && (input.interact || keys.has("KeyE")));
    $("recon-help").hidden = !E.fogged(state);
    if ($("dialog").open && !$("supply-content").hidden) updateSupply();
    if (mode === "tactical" && !$("development-content").hidden) development.render();
    if (performance.now() > noticeUntil)
      $("notice").classList.remove("visible");
  }
  const reasons = {
    unexplored: "Сначала разведайте площадку",
    "scout-limit": "В отряде уже четыре дозорных",
    network: "Исследуйте сеть управления",
    command: "Исследуйте оперативный контур",
    "second-node": "Нужны два готовых добывающих узла",
    secure: "Уничтожьте южную батарею или глушитель",
    intact: "Корпус не повреждён",
    barracks: "Нужны готовые казармы",
    foundry: "Нужен готовый тяжёлый цех",
    expansion: "Постройте добывающий узел",
    get "worker-limit"() { return E.development.logistics(state)
      ? E.development.workerCapacity(state) === 48 ? "Достигнут предел: 48 зондов" : "Достигнут лимит зондов: постройте узел снабжения"
      : "Нет свободных мест для зондов на этом узле"; },
    get capacity() { return E.development.logistics(state)
      ? E.development.capacity(state) === 120 ? "Достигнут предел: 120 снабжения" : "Не хватает снабжения: постройте узел снабжения"
      : "Не хватает мест в отряде: постройте добывающий узел"; },
    "supply-maximum": "Максимум: 8 узлов, 120 снабжения и 48 зондов",
    queue: "Очередь заполнена",
    exhausted: "Месторождение исчерпано",
    researching: "Уже в очереди",
    order: "Заказ уже завершён или отменён",
    ended: "Операция завершена",
    funds: "Недостаточно сплава",
    distance: "Подведите разведчика к площадке",
    hostiles: "Сначала очистите площадку",
    relay: "Сначала запустите узел связи",
    post: "Нужен готовый опорный пункт",
    installed: "Модуль установлен",
    "squad-full": "Все три бойца в строю",
    "artillery-limit": "Орудие уже в строю",
    "post-limit": "Уже построены два пункта",
    blocked: "Освободите место для высадки",
    fortress: "Подавите северный бастион или южный арсенал",
    limit: "Лимит подкреплений",
    arsenal: "Нужен готовый арсенал",
    builder: "Нужен свободный дрон",
    "builder-route": "Дрон не может добраться до стройки",
    "repair-target": "Выберите готовую повреждённую постройку союзников",
    "repair-crew": "У здания уже работают четыре зонда",
    "no-vision": "Площадка должна быть видна сейчас",
    support: "Нужна ровная площадка вдали от обрыва и перехода",
    occupied: "Площадка занята · оставьте свободное место вокруг",
    "objective-space": "Оставьте доступ к руде и объектам операции",
    "ore-distance":
      "Экстрактору нужно разведанное месторождение в пределах 320",
    "occupied-mine": "У этого месторождения уже есть экстрактор",
    "ore-clearance": "Отодвиньте экстрактор: нужен проход между зданием и месторождением",
    "ore-route": "Дроны не смогут добраться от выхода до месторождения",
    exit: "Освободите выход здания",
    passage: "Постройка перекроет проход",
    placement: "Выберите место на карте",
    construction: "Стройка уже завершена или уничтожена",
  };
  const development = new SignalDevelopmentPanel($("development-panel"), {
    state: () => state,
    buy, care: careAction,
    place: beginPlacement,
    layout: measureMapArea,
    select: (id) => {
      selectedBuilding = id;
      if (id !== null) {
        selected = [id];
        selectionVisible = true;
      }
      refreshSelection();
    },
    reason: (code) =>
      code === "squad-full"
        ? "Лимит огневой группы"
        : code === "artillery-limit"
          ? "Лимит тяжёлой группы"
          : reasons[code] || "Недоступно",
    rally: (id) => {
      selectedBuilding = rallyBuilding = id;
      selected = [id];
      refreshSelection();
    },
    focus: (x, y) => {
      if (E.explored(state, 0, { x, y })) view.focus(x, y);
      else notice("Сначала разведайте район");
    },
  });
  selectionPanel = new SignalSelectionPanel($("selection-content"), {
    state: () => state, members: selectedUnits, buy, care: careAction, selectType,
    production: $("combat-production"), combat: () => mode === "playing", reason: (code) => reasons[code],
    productionState: (active) => {
      // Selection normalization may reorder IDs on the next tick; keep the user's tab.
      const key = active ? selectedUnits().map((u) => u.id).join(",") : null;
      if (key !== productionContext) { productionContext = key; mobileDockView = active ? "production" : "selection"; }
    },
    select: (ids) => selectHits(ids, false),
    inspect: (id) => {
      development.select(id);
      openDialog("development");
    },
  });
  function updateSupply() {
    $("supply-alloy").textContent = state.economy.alloy;
    const descriptions = {
      artillery: "Тяжёлый огонь против брони цитадели",
      hack: "Взлом терминала отключает щит и орудие",
      rifle: "Один боец в огневую группу",
    };
    for (const action of ["artillery", "hack", "rifle"]) {
      const offer = E.supplyStatus(state, action);
      $("buy-" + action).disabled = !offer.allowed;
      $(action + "-reason").textContent = offer.allowed
        ? descriptions[action]
        : reasons[offer.reason] || "Недоступно";
      $(action + "-price").textContent =
        offer.reason === "installed" ? "✓" : E.COSTS[action];
    }
    for (const pad of E.PADS) {
      const post = state.units.find(
          (u) => u.kind === "outpost" && u.site === pad.id && u.hp > 0,
        ),
        button = $("site-" + pad.id);
      const offer = E.supplyStatus(state, post ? "salvage" : "outpost", pad.id);
      button.disabled =
        !offer.allowed || performance.now() < (siteLocks[pad.id] || 0);
      button.textContent = post
        ? post.build > 0
          ? "Отменить · +25"
          : "Разобрать · +25"
        : "Построить · 50";
      $("site-" + pad.id + "-status").textContent = post
        ? post.build > 0
          ? E.dist(E.hero(state), post) > 210
            ? "Стройка ждёт разведчика"
            : "Строительство · " + Math.floor((1 - post.build / 6) * 100) + "%"
          : "Работает · " + Math.ceil(post.hp) + " / " + E.C.outpost.hp
        : offer.allowed
          ? "Площадка доступна"
          : reasons[offer.reason] || "Недоступно";
    }
  }
  function cancelPlacement() {
    placement = null;
    document.body.classList.remove("placing");
    $("placement-panel").hidden = true;
    $("command-dock").hidden = !["playing", "tactical"].includes(mode);
    refreshSelection();
    resetInput();
    measureMapArea();
    renderDirty = true;
  }
  function previewPlacement(point) {
    if (!placement || !point) return;
    placement.anchor = { x: point.x, y: point.y };
    const p = E.construction.snap(
      placement.kind,
      point.x,
      point.y,
      placement.turn,
    );
    if (!p) return;
    const key = [p.x, p.y, placement.turn, state.economy.alloy, state.t].join(
      ":",
    );
    if (key === placement.key) return;
    placement.key = key;
    placement.point = { x: p.x, y: p.y, turn: placement.turn };
    placement.result = E.construction.check(
      state,
      placement.kind,
      placement.point,
    );
    const o = placement.result;
    $("placement-status").textContent = o.allowed
      ? placement.kind === "outpost"
        ? "Место подходит · золотом — путь дронов к источнику"
        : "Место подходит · дрон назначается при подтверждении"
      : reasons[o.reason] || "Здесь нельзя построить";
    $("placement-rotate").textContent = "Поворот ↺";
    $("placement-rotate").setAttribute(
      "aria-label",
      "Повернуть на 90 градусов. Выход: " +
        ["вниз", "вправо", "вверх", "влево"][placement.turn],
    );
    $("placement-panel").dataset.valid = String(o.allowed);
    $("placement-confirm").disabled = !o.allowed;
    renderDirty = true;
  }
  function beginPlacement(kind) {
    const o = E.construction.availability(state, kind);
    if (!o.allowed) {
      notice(reasons[o.reason] || "Недоступно");
      return;
    }
    $("dialog").close();
    document.body.classList.remove("development-open");
    setMode("tactical");
    clearSelection();
    placement = { kind, turn: 0, key: null, point: null, result: null };
    document.body.classList.add("placing");
    $("placement-panel").hidden = false;
    $("command-dock").hidden = true;
    $("placement-title").textContent = E.development.items(state)[kind].label;
    const dimensions = E.construction.shapes[kind];
    $("placement-cost").textContent =
      o.cost + " сплава · " + dimensions.join("×");
    $("placement-help").textContent =
      coarse.matches || innerWidth < 700
        ? "Касание — место · два пальца — камера · подтвердите кнопкой"
        : "ЛКМ — построить · Shift + ЛКМ — несколько · R — поворот · ПКМ / Esc — отмена";
    measureMapArea();
    const target =
      kind === "outpost"
        ? state.campaign.mines
            .filter(
              (m) =>
                m.id !== "home" &&
                m.remaining > 0 &&
                E.explored(state, 0, m) &&
                !state.units.some(
                  (u) => u.kind === "outpost" && u.hp > 0 && u.site === m.id,
                ),
            )
            .sort(
              (a, b) => E.dist(a, E.hero(state)) - E.dist(b, E.hero(state)),
            )[0] || E.hero(state)
        : E.hero(state);
    view.focus(target.x, target.y);
    previewPlacement({ x: target.x + 120, y: target.y - 120 });
    updateUI();
  }
  function confirmPlacement(repeat = false) {
    if (!placement || mode !== "tactical" || storageConflict) return;
    const result = E.purchase(state, placement.kind, placement.point);
    if (!result.allowed) {
      placement.key = null;
      previewPlacement(placement.anchor);
      notice(reasons[result.reason] || "Площадка больше недоступна");
      return;
    }
    const built = state.units.find((u) => u.id === result.buildingId);
    if (repeat) {
      placement.key = null;
      E.refreshRecon(state);
      save();
      updateUI();
      view.add(E.knownEvents(state), settings.reduced);
      state.events = [];
      previewPlacement(placement.anchor);
      notice("Постройка добавлена · Shift + ЛКМ — ещё одна");
      return;
    }
    cancelPlacement();
    E.refreshRecon(state);
    save();
    updateUI();
    view.add(E.knownEvents(state), settings.reduced);
    state.events = [];
    notice("Дрон назначен · стройка начнётся после выхода из паузы");
    selectedBuilding = built.id;
    selected = [built.id];
    selectionVisible = true;
    refreshSelection();
  }
  $("placement-cancel").onclick = cancelPlacement;
  $("placement-confirm").onclick = () => confirmPlacement();
  $("placement-rotate").onclick = () => {
    if (placement) {
      placement.turn = (placement.turn + 1) % 4;
      previewPlacement(placement.anchor);
    }
  };
  function buy(action, site) {
    if (!state.campaign && site && performance.now() < (siteLocks[site] || 0))
      return;
    state.events = [];
    const result = E.purchase(state, action, site);
    $(state.campaign ? "development-feedback" : "supply-feedback").textContent =
      state.campaign
        ? result.allowed
          ? action === "repair-drone"
            ? "Зонд назначен · 12 прочности/с · 1 сплава за 8 прочности"
            : action === "stop-repair"
              ? "Зонды возвращаются к добыче"
          : action === "cancel"
            ? "Возвращено " + -result.cost + " сплава"
            : mode === "playing" ? "Заказ принят" : "Заказ принят · продолжится после выхода из паузы"
          : reasons[result.reason] || "Недоступно"
        : result.allowed
          ? action === "salvage"
            ? "Возвращено 25 сплава"
            : action === "outpost"
              ? "Стройка начнётся после выхода из паузы"
              : action === "hack"
                ? "Модуль готов. Терминал отмечен на карте"
                : "Подкрепление на позиции"
          : reasons[result.reason] || "Недоступно";
    if (result.allowed) {
      if (!state.campaign && site) {
        const operation = state,
          until = performance.now() + 450;
        siteLocks[site] = until;
        // Paused UI no longer polls every frame. Expire the double-tap guard
        // explicitly so an otherwise idle supply panel becomes usable again.
        setTimeout(() => {
          if (state !== operation || siteLocks[site] !== until) return;
          delete siteLocks[site];
          updateUI();
        }, 451);
      }
      sound.start();
      for (const event of E.knownEvents(state)) sound.play(event);
      view.add(E.knownEvents(state), settings.reduced);
      state.events = [];
      save();
    }
    if (!state.campaign) updateSupply();
    updateUI();
    return result;
  }
  account = new SignalAccountPanel($("account-content"), {
    getSave: () => SignalCloudCore.encode(saved || E.snapshot(state)),
    isFresh: () => !saved,
    canApply: () => ["menu", "paused", "tactical"].includes(mode),
    localConflict: () => storageConflict || !!localStore?.stale(),
    applySave: loadOperation,
    back: backFromDetail,
  });
  $("storage-load").onclick = () => {
    try {
      const raw = localStorage.getItem(KEY),
        data = JSON.parse(raw);
      if (!E.restore(data.save))
        throw Error(
          "Новая копия повреждена. Можно сохранить текущую операцию.",
        );
      localStore.replace({ settings, save: saved }); // Back up both versions before choosing.
      storageConflict = false;
      loadOperation(JSON.stringify(data.save));
      lastMode = "tactical";
      closeDialog();
    } catch (e) {
      $("storage-message").textContent = e.message;
    }
  };
  $("storage-keep").onclick = () => {
    try {
      localStore.replace({ settings, save: saved });
      storageConflict = false;
      closeDialog();
    } catch (e) {
      $("storage-message").textContent =
        "Не удалось записать резервную копию. Освободите место на устройстве.";
    }
  };
  $("supply-back").onclick = closeDialog;
  $("dock-shop").onclick = () => {
    if (!state.campaign) { openDialog("supply"); return; }
    if (mode === "playing") { setMode("tactical"); save(); }
    dockTab = "shop";
    development.select();
    $("development-feedback").textContent = "";
    refreshDock(selectedUnits());
    development.render();
  };
  $("dock-selection").onclick = () => { dockTab = "selection"; mobileDockView = "selection"; refreshDock(selectedUnits()); };
  $("dock-production").onclick = () => { dockTab = "selection"; mobileDockView = "production"; refreshDock(selectedUnits()); };
  $("select-army").onclick = () => selectHits(state.units.filter((u) => selectable(u) && [1, 2].includes(u.group)).map((u) => u.id));
  $("dialog").addEventListener("close", () => {
    document.body.classList.toggle(
      "development-open",
      $("dialog").open && $("dialog").dataset.panel === "development",
    );
    measureMapArea();
  });
  $("map-overview").onclick = () => {
    if (mode === "playing") {
      setMode("tactical");
      view.tactical.overview = true;
      save();
    } else if (view.tactical.overview)
      view.focus(E.hero(state).x, E.hero(state).y);
    else view.tactical.overview = true;
    resetInput();
    updateUI();
    measureMapArea();
  };
  $("map-center").onclick = () => {
    combatFocus = null;
    view.focus(E.hero(state).x, E.hero(state).y);
    if (mode === "tactical") resetInput();
    else {
      cancelMiniGesture();
      closeMiniLegend();
    }
    updateUI();
    measureMapArea();
  };
  function miniControls() {
    $("map-center").dataset.inspecting = String(!!combatFocus);
    $("map-center").title = combatFocus
      ? "Вернуть камеру к разведчику"
      : "К разведчику";
    $("minimap-fold").innerHTML =
      (settings.minimapFold ? "Показать мини-карту" : "Свернуть мини-карту") +
      " <kbd>M</kbd>";
  }
  function layoutMiniMap() {
    if (!["playing", "tactical"].includes(mode)) {
      miniRect = null;
      return;
    }
    const el = $("minimap-panel"),
      world = E.map(state),
      bounds = el.getBoundingClientRect(),
      dock = $("command-dock"), panel = dock.getBoundingClientRect(),
      alongside = !placement && !dock.hidden && panel.left >= bounds.right,
      width = bounds.width,
      drawer = $("dialog").open,
      folded =
        !!settings.minimapFold ||
        (mode === "tactical" && view.tactical.overview);
    if (el.dataset.dockAligned !== String(alongside)) el.dataset.dockAligned = String(alongside);
    const bottom = alongside ? Math.max(0, innerHeight - panel.bottom) + "px" : "";
    if (el.style.bottom !== bottom) el.style.bottom = bottom;
    // The canvas fits its map proportionally; resizing the frame never stretches geography.
    const wanted = (alongside
      ? Math.max(40, panel.height - $("map-tools").getBoundingClientRect().height - 2)
      : Math.round(((width - 2) * world.H) / world.W)) + "px";
    el.dataset.folded = String(folded);
    if (miniCanvas.style.height !== wanted) {
      miniCanvas.style.height = wanted;
      minimap.invalidate();
    }
    $("minimap-key").disabled = !!placement || drawer;
    miniRect = folded ? null : miniCanvas.getBoundingClientRect();
    miniControls();
    if (!$("minimap-legend").hidden) positionMiniLegend();
  }
  function positionMiniLegend() {
    const box = $("minimap-legend"),
      p = $("minimap-panel").getBoundingClientRect(),
      r = box.getBoundingClientRect(),
      beside = p.right + r.width + 22 < innerWidth;
    box.style.left =
      E.clamp(beside ? p.right + 8 : p.left, 14, innerWidth - r.width - 14) +
      "px";
    box.style.top =
      E.clamp(
        beside ? p.bottom - r.height : p.top - r.height - 8,
        14,
        Math.max(14, innerHeight - r.height - 14),
      ) + "px";
  }
  function closeMiniLegend() {
    $("minimap-legend").hidden = true;
    $("minimap-key").setAttribute("aria-expanded", "false");
  }
  $("minimap-symbols").innerHTML = SignalMiniMap.legend();
  $("minimap-key").onclick = () => {
    const open = $("minimap-legend").hidden;
    $("minimap-legend").hidden = !open;
    $("minimap-key").setAttribute("aria-expanded", String(open));
    if (open) {
      miniControls();
      positionMiniLegend();
    }
  };
  $("minimap-key-close").onclick = () => {
    closeMiniLegend();
    $("minimap-key").focus();
  };
  function foldMiniMap() {
    cancelMiniGesture();
    settings.minimapFold = !settings.minimapFold;
    minimap.invalidate();
    closeMiniLegend();
    measureMapArea();
    renderDirty = true;
    persist();
  }
  $("minimap-fold").onclick = foldMiniMap;
  // Additional fingers may never receive a compatibility click while a stick
  // owns the first touch. Activate navigation on touch, once per press.
  for (const id of [
    "map-overview",
    "map-center",
    "minimap-key",
    "minimap-key-close",
    "minimap-fold",
  ]) {
    const button = $(id),
      activate = button.onclick;
    let lastTouch = -Infinity;
    button.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || e.button !== 0 || button.disabled)
        return;
      lastTouch = performance.now();
      activate.call(button, e);
      e.preventDefault();
    });
    button.onclick = (e) => {
      if (e.detail !== 0 && performance.now() - lastTouch < 700) return;
      activate.call(button, e);
    };
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        $("minimap-legend").hidden ||
        e.target.closest("#minimap-legend, #minimap-key")
      )
        return;
      closeMiniLegend();
      if (e.target === canvas || e.target === miniCanvas) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  function miniPosition(e) {
    const r = miniCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, r };
  }
  function inspectMiniPoint(p) {
    if (!p) return;
    if (mode === "playing") combatFocus = p;
    else view.focus(p.x, p.y);
    edge = null;
    renderDirty = true;
    miniControls();
  }
  function cancelMiniGesture() {
    const drag = miniDrag;
    miniDrag = null;
    if (drag && miniCanvas.hasPointerCapture(drag.id))
      miniCanvas.releasePointerCapture(drag.id);
  }
  miniCanvas.addEventListener("contextmenu", (e) => e.preventDefault());
  miniCanvas.addEventListener("pointerdown", (e) => {
    if (
      miniDrag ||
      !["playing", "tactical"].includes(mode) ||
      ![0, 2].includes(e.button)
    )
      return;
    const p = miniPosition(e);
    miniDrag = {
      id: e.pointerId,
      command: e.button === 2 || orderMode || !!rallyBuilding,
    };
    miniCanvas.setPointerCapture(e.pointerId);
    if (!miniDrag.command) inspectMiniPoint(minimap.point(p.x, p.y));
    e.preventDefault();
    e.stopPropagation();
  });
  miniCanvas.addEventListener("pointermove", (e) => {
    const p = miniPosition(e);
    if (miniDrag?.id === e.pointerId) {
      if (!miniDrag.command) inspectMiniPoint(minimap.point(p.x, p.y));
      e.preventDefault();
    } else {
      const item = minimap.pick(p.x, p.y);
      miniCanvas.title = item
        ? item.label
        : "Касание — обзор · ПКМ — приказ · Home — к разведчику";
    }
  });
  miniCanvas.addEventListener("pointerup", (e) => {
    if (miniDrag?.id !== e.pointerId) return;
    const drag = miniDrag,
      p = miniPosition(e);
    cancelMiniGesture();
    if (
      drag.command &&
      p.x >= 0 &&
      p.y >= 0 &&
      p.x <= p.r.width &&
      p.y <= p.r.height
    ) {
      const point = minimap.point(p.x, p.y),
        hit = minimap.pick(p.x, p.y, e.pointerType === "touch" ? 11 : 8),
        target =
          hit &&
          state.units.find(
            (u) =>
              u.id === hit.unitId &&
              u.hp > 0 &&
              (!u.team || E.visible(state, 0, u)),
          );
      if (point)
        issueOrder(
          {
            x: E.clamp(point.x, 25, E.map(state).W - 25),
            y: E.clamp(point.y, 25, E.map(state).H - 25),
          },
          target || null,
        );
    }
    e.preventDefault();
    e.stopPropagation();
  });
  for (const type of ["pointercancel", "lostpointercapture"])
    miniCanvas.addEventListener(type, (e) => {
      if (miniDrag?.id === e.pointerId) cancelMiniGesture();
    });
  miniCanvas.addEventListener("keydown", (e) => {
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.code];
    if (delta) {
      const p = view.world(view.origin.x, view.origin.y);
      inspectMiniPoint({
        x: E.clamp(p.x + delta[0] * 160, 0, E.map(state).W),
        y: E.clamp(p.y + delta[1] * 160, 0, E.map(state).H),
      });
    } else if (e.code === "Home" || e.code === "Escape")
      $("map-center").click();
    else if (e.code === "Enter" || e.code === "Space")
      $("map-overview").click();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  for (const button of document.querySelectorAll("[data-purchase]"))
    button.onclick = () => buy(button.dataset.purchase);
  for (const button of document.querySelectorAll("[data-site]"))
    button.onclick = () => {
      const post = state.units.some(
        (u) =>
          u.kind === "outpost" && u.site === button.dataset.site && u.hp > 0,
      );
      buy(post ? "salvage" : "outpost", button.dataset.site);
    };
  $("start").onclick = () => begin();
  $("continue").onclick = () => begin(true);
  $("new-game").onclick = () => begin();
  $("tactical").onclick = toggleTactical;
  $("order-move").onclick = () => {
    cancelMapGesture();
    orderMode = !orderMode;
    rallyBuilding = null;
    refreshSelection();
  };
  $("order-cancel").onclick = () => {
    cancelMapGesture();
    if (orderMode || rallyBuilding) {
      orderMode = false;
      rallyBuilding = null;
      refreshSelection();
    } else {
      const workers = selectedUnits().filter((u) => u.kind === "drone" && (u.workerTask || u.buildingId));
      if (workers.length) {
        for (const u of workers) E.construction.resumeWorker(state, u);
        save();
        updateUI();
        notice("Зонды возвращаются к добыче · груз сохранён");
      } else clearSelection();
    }
  };
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
    sound.update(E.observe(state), mode, settings.volume);
    persist();
  };
  $("volume").onchange = () => {
    sound.start().then(() => sound.play({ type: "order", x: E.hero(state).x }));
  };
  $("motion").onchange = (e) => {
    settings.reduced = e.target.checked;
    persist();
  };
  for (const action of ["dash", "reload"]) {
    const button = $(action);
    let lastTouch = -Infinity;
    button.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || mode !== "playing" || button.disabled)
        return;
      // Secondary fingers do not reliably produce a compatibility click.
      // Each action owns its pointer independently of both sticks.
      lastTouch = performance.now();
      input[action] = true;
      actionPointers.set(e.pointerId, button);
      button.setPointerCapture(e.pointerId);
      button.classList.add("pressed");
      e.preventDefault();
    });
    button.addEventListener("click", (e) => {
      if (e.detail !== 0 && performance.now() - lastTouch < 700) return;
      if (mode === "playing" && !button.disabled) input[action] = true;
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, (e) => {
        if (actionPointers.get(e.pointerId) !== button) return;
        actionPointers.delete(e.pointerId);
        button.classList.remove("pressed");
        if (button.hasPointerCapture(e.pointerId))
          button.releasePointerCapture(e.pointerId);
      });
  }
  $("interact").addEventListener("pointerdown", (e) => {
    if (mode === "playing" && e.button === 0 && !e.currentTarget.disabled) {
      input.interact = true;
      actionPointers.set(e.pointerId, e.currentTarget);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    $("interact").addEventListener(type, (e) => {
      actionPointers.delete(e.pointerId);
      input.interact = false;
    });
  $("interact").addEventListener("keydown", (e) => {
    if (["Enter", "Space"].includes(e.code)) {
      e.preventDefault(); e.stopPropagation();
      if (mode === "playing" && !e.currentTarget.disabled) input.interact = true;
    }
  });
  $("interact").addEventListener("keyup", (e) => {
    if (["Enter", "Space"].includes(e.code)) { e.preventDefault(); input.interact = false; }
  });
  $("interact").addEventListener("blur", () => { input.interact = false; });
  function fieldEvent(type, handler) {
    canvas.addEventListener(type, handler);
    // Touch zones cover the field on small/hybrid screens. A connected mouse
    // still uses the field controls; it must not become a virtual joystick.
    for (const id of ["move-stick", "aim-stick"])
      $(id).addEventListener(type, (e) => {
        if (e.pointerType !== "touch" || type === "contextmenu") handler(e);
      });
  }
  fieldEvent("contextmenu", (e) => e.preventDefault());
  function buildingAt(e) {
    if (!state.campaign) return null;
    if (
      mode === "playing" &&
      state.units.some((u) => {
        if (!u.team || u.hp <= 0 || !E.visible(state, 0, u)) return false;
        const p = view.screen(u.x, u.y);
        return (
          Math.hypot(e.clientX - p.x, e.clientY - p.y) <
          Math.max(16, E.C[u.kind].r * view.camera.scale)
        );
      })
    )
      return null;
    const pad = e.pointerType === "touch" ? 22 : 14;
    return state.units
      .filter(
        (u) =>
          !u.team &&
          u.hp > 0 &&
          ["base", "outpost", "barracks", "foundry", "arsenal", "bunker", "logistics"].includes(
            u.kind,
          ),
      )
      .map((u) => {
        const p = view.screen(u.x, u.y);
        const worldPoint = view.world(e.clientX, e.clientY),
          box = u.construction && E.construction.rect(u);
        return {
          u,
          d:
            box &&
            worldPoint.x >= box.x &&
            worldPoint.x <= box.x + box.w &&
            worldPoint.y >= box.y &&
            worldPoint.y <= box.y + box.h
              ? 0
              : Math.hypot(
                  e.clientX - p.x,
                  (e.clientY - p.y + 10 * view.camera.scale) / 0.85,
                ),
          r: Math.max(pad, E.C[u.kind].r * view.camera.scale),
        };
      })
      .filter((v) => v.d <= v.r)
      .sort((a, b) => a.d - b.d)[0]?.u;
  }
  let openingClick = false;
  addEventListener(
    "pointerdown",
    () => {
      openingClick = false;
    },
    true,
  );
  addEventListener(
    "click",
    (e) => {
      // A panel opened on pointerup can appear under that same finger. Consume
      // its compatibility click; a new pointerdown immediately allows a new tap.
      if (!openingClick || e.detail === 0) return;
      openingClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  function openBuilding(u) {
    openingClick = true;
    selectedBuilding = u.id;
    selected = [u.id];
    selectionVisible = true;
    refreshSelection();
    development.select(u.id);
    if (mode === "tactical") { dockTab = "shop"; development.render(); }
    refreshDock(selectedUnits());
  }
  function edgeAt(e) {
    const margin = e.pointerType === "touch" ? 30 : 24;
    return {
      x: e.clientX < margin ? -1 : e.clientX > innerWidth - margin ? 1 : 0,
      y: e.clientY < margin ? -1 : e.clientY > innerHeight - margin ? 1 : 0,
    };
  }
  fieldEvent("pointermove", (e) => {
    if (
      buildingPress?.id === e.pointerId &&
      Math.hypot(e.clientX - buildingPress.x, e.clientY - buildingPress.y) > 9
    )
      buildingPress.moved = true;
    const p = mapPointers.get(e.pointerId);
    if (mode === "tactical" && p) {
      const dx = e.clientX - p.x,
        dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(p.x - p.startX, p.y - p.startY) > 9) p.moved = true;
      if (mapPointers.size > 1) {
        renderDirty = true;
        const [a, b] = [...mapPointers.values()],
          d = Math.hypot(a.x - b.x, a.y - b.y),
          mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinch) {
          view.zoomAt(d / Math.max(1, pinch.d), mid.x, mid.y);
          view.pan(
            (pinch.x - mid.x) / view.camera.scale,
            (pinch.y - mid.y) / (view.camera.scale * 0.73),
          );
        }
        pinch = { d, ...mid };
        edge = null;
      } else if (p.kind === "placement")
        previewPlacement(view.world(e.clientX, e.clientY));
      else if (p.kind === "select") paintSelection();
      else if (p.kind === "pan" && p.moved) {
        renderDirty = true;
        view.pan(-dx / view.camera.scale, -dy / (view.camera.scale * 0.73));
        edge = null;
      } else if (p.kind === "edge") edge = edgeAt(e);
      e.preventDefault();
      return;
    }
    if (orderDrag?.id === e.pointerId) {
      orderDrag.x = E.clamp(e.clientX, 0, innerWidth);
      orderDrag.y = E.clamp(e.clientY, 0, innerHeight);
      if (
        Math.hypot(
          orderDrag.x - orderDrag.startX,
          orderDrag.y - orderDrag.startY,
        ) > 8
      )
        orderDrag.moved = true;
      paintSelection();
      e.preventDefault();
      return;
    }
    if (placement && e.pointerType !== "touch" && !mapPointers.size)
      previewPlacement(view.world(e.clientX, e.clientY));
    if (mode === "tactical" && e.pointerType !== "touch" && !mapPointers.size)
      edge = edgeAt(e);
    else if (mode === "playing" && e.pointerType !== "touch") {
      // Only retain the latest position. The browser draws the native reticle;
      // terrain projection and the scout's turn belong to the simulation frame.
      mousePoint = { x: e.clientX, y: e.clientY };
    }
  });
  canvas.addEventListener("pointerleave", () => {
    if (!mapPointers.size) edge = null;
  });
  fieldEvent("pointerdown", (e) => {
    if ((mode === "tactical" || (mode === "playing" && (orderMode || rallyBuilding) && e.button === 0)) && [0, 1, 2].includes(e.button)) {
      if (placement && e.button === 2) {
        cancelPlacement();
        e.preventDefault();
        return;
      }
      const touch = e.pointerType === "touch",
        boundary = edgeAt(e);
      const kind =
        e.button === 1
          ? "pan"
          : placement
            ? "placement"
            : e.button === 2 || orderMode || rallyBuilding
              ? "order"
              : touch &&
                  (boundary.x || boundary.y) &&
                  !troopAt(e) &&
                  !buildingAt(e)
                ? "edge"
                : "select";
      const p = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        kind,
        button: e.button,
        add: e.shiftKey || e.ctrlKey || e.metaKey,
      };
      mapPointers.set(e.pointerId, p);
      edge = kind === "edge" ? boundary : null;
      if (mapPointers.size > 1) {
        cancelSelection(false);
        for (const v of mapPointers.values()) {
          v.kind = "pan";
          v.moved = true;
        }
        const [a, b] = [...mapPointers.values()];
        pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y),
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        };
        edge = null;
      } else if (kind === "placement")
        previewPlacement(view.world(e.clientX, e.clientY));
      else if (kind === "select") orderDrag = p;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (mode === "playing" && e.button === 2 && e.pointerType !== "touch") {
      cancelSelection();
      orderDrag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        add: e.ctrlKey || e.metaKey || e.shiftKey,
      };
      edge = null;
      input.fire = false;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const entity = mode === "playing" && e.button === 0 && (resourceAt(e) || troopAt(e) || buildingAt(e));
    if (entity) {
      buildingPress = {
        id: e.pointerId,
        unit: entity,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        add: e.shiftKey || e.ctrlKey || e.metaKey,
      };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (
      mode === "playing" &&
      e.button === 0 &&
      e.pointerType !== "touch"
    ) {
      mousePoint = { x: e.clientX, y: e.clientY };
      aim = view.aim(e.clientX, e.clientY, E.hero(state));
      input.fire = true;
      canvas.setPointerCapture(e.pointerId);
    }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    fieldEvent(type, (e) => {
      const p = mapPointers.get(e.pointerId);
      if (p) {
        mapPointers.delete(e.pointerId);
        if (orderDrag === p) cancelSelection(false);
        pinch = null;
        edge = null;
        if (canvas.hasPointerCapture(e.pointerId))
          canvas.releasePointerCapture(e.pointerId);
        if (type === "pointerup" && (mode === "tactical" || (mode === "playing" && p.kind === "order")) && onField(e)) {
          if (p.kind === "placement") {
            previewPlacement(view.world(e.clientX, e.clientY));
            if (e.pointerType !== "touch" && !p.moved)
              confirmPlacement(e.shiftKey);
          } else if (p.kind === "select") finishSelection(p, e);
          else if (p.kind === "order" && !p.moved)
            issueOrder(view.world(e.clientX, e.clientY), orderTargetAt(e));
        }
        e.preventDefault();
        return;
      }
      if (orderDrag?.id === e.pointerId) {
        const d = orderDrag;
        cancelSelection();
        if (type === "pointerup" && e.button === 2 && mode === "playing")
          finishSelection(d, e);
        e.preventDefault();
        return;
      }
      input.fire = false;
      const press = buildingPress;
      if (press?.id === e.pointerId) {
        buildingPress = null;
        if (
          type === "pointerup" &&
          !press.moved &&
          mode === "playing" &&
          onField(e)
        )
          selectEntity(press.unit, e, press.add);
      }
    });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (mode !== "tactical") return;
      e.preventDefault();
      if (mapPointers.size || orderDrag) {
        cancelMapGesture();
        return;
      }
      view.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      edge = null;
    },
    { passive: false },
  );
  function clearStick(stick, el) {
    const pointer = stick.id;
    stick.id = null;
    stick.x = stick.y = 0;
    stick.active = false;
    el.classList.remove("active", "engaged");
    for (const key of ["--base-x", "--base-y", "--stick-x", "--stick-y"])
      el.style.removeProperty(key);
    if (pointer !== null && el.hasPointerCapture(pointer))
      el.releasePointerCapture(pointer);
  }
  function quickFire() {
    const h = E.hero(state);
    const target = state.units
      .filter(
        (u) =>
          u.team &&
          u.hp > 0 &&
          E.dist(h, u) < E.C.hero.range &&
          !(u.kind === "citadel" && E.shielded(state)) &&
          E.clear(h, u) &&
          E.visible(state, 0, u),
      )
      .sort((a, b) => E.dist(h, a) - E.dist(h, b) || a.id - b.id)[0];
    aim = target
      ? { x: target.x, y: target.y }
      : { x: h.x + Math.cos(h.angle) * 600, y: h.y + Math.sin(h.angle) * 600 };
    mousePoint = null;
    input.tapFire = true;
  }
  for (const [id, stick, isAim] of [
    ["move-stick", moveStick, false],
    ["aim-stick", aimStick, true],
  ]) {
    const el = $(id);
    function paint() {
      el.style.setProperty("--stick-x", stick.visualX + "px");
      el.style.setProperty("--stick-y", stick.visualY + "px");
      el.classList.toggle("active", stick.active);
    }
    function move(e) {
      if (e.pointerId !== stick.id) return;
      const dx = e.clientX - stick.cx,
        dy = e.clientY - stick.cy,
        len = Math.hypot(dx, dy);
      // The origin belongs to this touch, even after crossing the screen centre.
      // Only the knob and input vector move; the base stays at pointerdown.
      const dead = 5,
        strength = E.clamp((len - dead) / (stick.radius - dead), 0, 1);
      stick.x = len ? (dx / len) * strength : 0;
      stick.y = len ? (dy / len) * strength : 0;
      stick.active = strength > 0;
      stick.used ||= stick.active;
      const visual = Math.min(stick.radius, len);
      stick.visualX = len ? (dx / len) * visual : 0;
      stick.visualY = len ? (dy / len) * visual : 0;
      paint();
      e.preventDefault();
    }
    el.addEventListener("pointerdown", (e) => {
      if (mode !== "playing" || e.pointerType !== "touch" || stick.id !== null || e.button !== 0) return;
      if (!isAim) {
        combatFocus = null;
        miniControls();
      }
      const r = el.getBoundingClientRect();
      Object.assign(stick, {
        id: e.pointerId,
        cx: e.clientX,
        cy: e.clientY,
        radius: Math.min(42, r.width * 0.29),
        building: resourceAt(e) || troopAt(e) || buildingAt(e),
        started: performance.now(),
        used: false,
        visualX: 0,
        visualY: 0,
        x: 0,
        y: 0,
        active: false,
      });
      mousePoint = null;
      el.style.setProperty("--base-x", stick.cx - r.x + "px");
      el.style.setProperty("--base-y", stick.cy - r.y + "px");
      el.classList.add("engaged");
      el.setPointerCapture(e.pointerId);
      paint();
      e.preventDefault();
    });
    el.addEventListener("pointermove", move);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      el.addEventListener(type, (e) => {
        if (stick.id !== e.pointerId) return;
        const tap =
          type === "pointerup" &&
          !stick.used &&
          performance.now() - stick.started < 250 &&
          mode === "playing";
        const building =
          tap && stick.building && (resourceAt(e) || troopAt(e) || buildingAt(e))?.id === stick.building.id
            ? stick.building
            : null;
        clearStick(stick, el);
        if (building) selectEntity(building, e);
        else if (tap && isAim) quickFire();
        e.preventDefault();
      });
  }
  addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing ||
      (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') && e.code !== "Escape")) return;
    if (e.code === "Escape" && !$("minimap-legend").hidden) {
      closeMiniLegend();
      $("minimap-key").focus();
      e.preventDefault();
      return;
    }
    if (
      e.code === "KeyM" &&
      !e.ctrlKey &&
      !e.metaKey &&
      ["playing", "tactical"].includes(mode) &&
      !$("dialog").open
    ) {
      e.preventDefault();
      if (!e.repeat) foldMiniMap();
      return;
    }
    if (placement && ["Escape", "KeyR"].includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) {
        if (e.code === "Escape") cancelPlacement();
        else $("placement-rotate").click();
      }
      return;
    }
    if (e.code === "Escape" && (orderDrag || mapPointers.size)) {
      cancelMapGesture();
      e.preventDefault();
      return;
    }
    if (e.code === "Escape" && (rallyBuilding || orderMode)) {
      rallyBuilding = null;
      orderMode = false;
      refreshSelection();
      e.preventDefault();
      return;
    }
    // In the drawer Tab navigates controls; resuming remains an explicit action.
    if ($("dialog").open && e.code === "Tab") return;
    if (e.repeat && ["Tab", "Escape"].includes(e.code)) {
      e.preventDefault();
      return;
    }
    if (
      $("dialog").open &&
      $("dialog").dataset.panel === "development" &&
      e.code === "Escape"
    ) {
      e.preventDefault();
      closeDialog();
      return;
    }
    if (
      ($("dialog").open && $("dialog").dataset.panel !== "development") ||
      mode === "menu"
    )
      return;
    if (e.code === "Escape") {
      e.preventDefault();
      if (mode === "tactical" && (selectedBuilding || selectedUnits().length)) {
        clearSelection();
        return;
      }
      openDialog("pause");
      return;
    }
    if (e.code === "Tab") {
      e.preventDefault();
      toggleTactical();
      return;
    }
    if (["playing", "tactical"].includes(mode) && !e.altKey) {
      const number = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)?.[1];
      if (number !== undefined && placement) {
        e.preventDefault();
        return;
      }
      if (number !== undefined && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!e.repeat) assignGroup(Number(number), e.shiftKey);
        return;
      }
      if (number !== undefined && controlGroups.has(Number(number))) {
        e.preventDefault();
        if (!e.repeat) recallGroup(Number(number), e.shiftKey);
        return;
      }
    }
    if (mode === "tactical") {
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
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.add(e.code);
      }
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
        ].includes(e.code)
      ) {
        combatFocus = null;
        miniControls();
      }
      if (e.code.startsWith("Shift") && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) input.dash = true;
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
    measureMapArea();
    renderDirty = true;
  });
  // A paused map needs a new frame only after interaction, a UI change,
  // camera easing, or an order acknowledgement. Keep input listeners alive.
  for (const type of [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "wheel",
    "keydown",
    "keyup",
    "click",
    "input",
    "change",
  ])
    addEventListener(
      type,
      () => {
        renderDirty = true;
      },
      { capture: true, passive: true },
    );
  function tick(now) {
    requestAnimationFrame(tick);
    const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (document.hidden) return;
    if (mode === "tactical") {
      let dx =
          (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
          (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
        dy =
          (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
      if (edge && !orderDrag && !view.tactical.overview) {
        dx += edge.x;
        dy += edge.y;
      }
      const d = Math.hypot(dx, dy);
      if (d && !orderDrag) {
        renderDirty = true;
        view.pan(
          ((dx / d) * 520 * elapsed) / view.camera.scale,
          ((dy / d) * 520 * elapsed) / (view.camera.scale * 0.73),
        );
        for (const p of mapPointers.values()) p.moved = true;
      }
    }
    if (mode === "playing") {
      acc += elapsed;
      if (mousePoint && !aimStick.active)
        aim = view.aim(mousePoint.x, mousePoint.y, E.hero(state));
      while (acc >= E.DT && state.status === "playing") {
        const h = E.hero(state),
          mx =
            (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
            (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
          my =
            (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
            (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
        if (aimStick.active)
          aim = {
            x: h.x + aimStick.x * 600,
            y: h.y + (aimStick.y * 600) / 0.73,
          };
        const strength = Math.hypot(moveStick.x, moveStick.y),
          projected = Math.hypot(moveStick.x, moveStick.y / 0.73) || 1;
        E.step(state, {
          x: mx + (moveStick.x / projected) * strength,
          y: my + (moveStick.y / 0.73 / projected) * strength,
          aim,
          fire: input.fire || aimStick.active || input.tapFire,
          dash: input.dash,
          reload: input.reload,
          interact: input.interact || keys.has("KeyE"),
        });
        input.dash = input.reload = input.tapFire = false;
        const events = E.knownEvents(state);
        for (const e of events) {
          if (e.type !== "end") sound.play(e);
          if (e.type === "collect") notice("Сплав +" + e.amount);
          if (e.type === "raid")
            notice(
              "Обнаружено подкрепление · " +
                ({ north: "север", south: "юг", east: "восток" }[e.sector] ||
                  "у цитадели"),
            );
          if (
            e.type === "upgrade" &&
            ["network", "command", "hack"].includes(e.action)
          )
            notice(
              {
                network: "Сеть управления готова",
                command: "Оперативный контур готов",
                hack: "Модуль проникновения готов",
              }[e.action],
            );
          if (e.type === "post-ready") notice("Опорный пункт готов");
          if (e.type === "breach")
            notice("Защита отключена. Прикройте разведчика");
        }
        view.add(events, settings.reduced);
        acc -= E.DT;
      }
      if (state.status !== "playing" && !resultShown) reportEnd();
      if (now - lastSaved > 3000) {
        save();
        lastSaved = now;
      }
    }
    const animated =
      mode === "playing" || (mode === "menu" && !settings.reduced);
    if (
      !animated &&
      !renderDirty &&
      view.cameraSettled &&
      !view.memoryNeedsRefine &&
      !view.fx.some((f) => f.type === "order")
    )
      return;
    if (now + 0.5 < nextDraw) return;
    const frameTime = 1000 / 60;
    nextDraw +=
      Math.max(1, Math.floor((now - nextDraw) / frameTime) + 1) * frameTime;
    if (now - lastUI > 80 && (mode === "playing" || renderDirty)) {
      updateUI();
      lastUI = now;
    }
    const scene = mode === "menu" ? state : E.observe(state);
    if (mode === "playing") sound.update(scene, mode, settings.volume);
    view.render(
      scene,
      {
        mode: mode === "paused" && lastMode === "tactical" ? "tactical" : mode,
        group: selected === null ? group : 0,
        selectedBuilding,
        placement,
        mapArea,
        selectionIds: selectionVisible
          ? selectedUnits().map((u) => u.id)
          : null,
        selecting: !!orderDrag,
        combatFocus,
        minimapRect: miniRect,
        aim,
        reduced: settings.reduced,
        touch: coarse.matches || innerWidth < 700,
      },
      Math.min(0.1, (now - lastDraw) / 1000),
    );
    if (!$("minimap-panel").hidden && miniRect)
      minimap.draw(
        scene,
        {
          selectionIds: selectionVisible
            ? selectedUnits().map((u) => u.id)
            : [],
          area: mapArea,
          active: mode === "playing",
          ack: view.fx.findLast((f) => f.type === "order"),
        },
        view,
        now,
      );
    lastDraw = now;
    renderDirty = false;
  }
  updateHome();
  setMode("menu");
  requestAnimationFrame(tick);
  // Read-only telemetry supports diagnostics without changing the operation.
  window.SignalGame = Object.freeze({
    snapshot: () => E.snapshot(state),
    observation: () => {
      const p = E.observe(state);
      return JSON.parse(
        JSON.stringify({
          units: p.units,
          caches: p.caches,
          watch: p.watch,
          relay: p.relay,
          terminal: p.terminal,
          events: p.events,
          objective: p.observationTask,
        }),
      );
    },
    mode: () => mode,
    selection: () => ({
      ids: selectedUnits().map((u) => u.id),
      custom: selected !== null,
      dragging: !!orderDrag,
      command: orderMode || !!rallyBuilding,
      building: selectedBuilding,
      groups: Object.fromEntries([...controlGroups].map(([n, ids]) => [n, [...ids]])),
    }),
    screen: (x, y) => view.screen(x, y),
    camera: () => ({ ...view.camera, overview: view.tactical.overview }),
    cameraSettled: () => !!view.cameraSettled,
    storageKey: KEY,
    audioState: () => sound.ctx?.state || "uninitialized",
    audio: () => sound.diagnostics(),
    diagnostics: () => ({
      units: state.units.length,
      bullets: state.bullets.length,
      events: state.events.length,
      effects: view.fx.length,
      scars: view.scars.length,
      poses: view.poses.size,
      minimap: minimap.diagnostics(),
    }),
  });
})();

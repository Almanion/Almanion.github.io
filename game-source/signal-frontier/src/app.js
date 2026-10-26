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
    selected = null,
    selectionVisible = false,
    orderDrag = null,
    orderMode = false,
    selectedBuilding = null,
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
    acc = 0,
    phase = -1,
    resultShown = false;
  const mapPointers = new Map();
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
      }
    }
  } catch (_) {
    saveAvailable = false;
  }
  const sound = new SignalAudio({ volume: () => settings.volume });
  function persist() {
    try {
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
    saved = next;
    state = E.restore(next);
    resultShown = false;
    phase = -1;
    group = 1;
    resetInput();
    selected = null;
    selectedBuilding = null;
    selectionVisible = false;
    view.reset(state);
    persist();
    updateHome();
    updateUI();
  }
  function notice(text) {
    $("notice").textContent = text;
    $("notice").classList.add("visible");
    noticeUntil = performance.now() + 4200;
  }
  function resetInput() {
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
  }
  function setMode(next) {
    resetInput();
    mode = next;
    document.body.dataset.mode = mode;
    $("home").hidden = mode !== "menu";
    $("hud").hidden = mode === "menu";
    $("tactical-panel").hidden = mode !== "tactical";
    $("map-tools").hidden = mode !== "tactical";
    $("tactical").setAttribute("aria-pressed", String(mode === "tactical"));
    $("tactical").querySelector("span").textContent =
      mode === "tactical" ? "В бой" : "Приказы";
    canvas.style.cursor =
      mode === "playing" && !coarse.matches ? "none" : "default";
    sound.update(state, mode, settings.volume);
    if (mode === "playing") sound.start();
    else if (mode !== "tactical") sound.stop();
    acc = 0;
    updateUI();
    measureMapArea();
  }
  function measureMapArea() {
    if (mode !== "tactical") return;
    const panel = $("tactical-panel").getBoundingClientRect(),
      tools = $("map-tools").getBoundingClientRect(),
      objective = document.querySelector(".objective").getBoundingClientRect(),
      landscape = innerWidth > innerHeight && innerHeight <= 500;
    mapArea = {
      x: 14,
      y: Math.max(tools.bottom, objective.bottom) + 12,
      right: landscape ? panel.left - 14 : innerWidth - 14,
      bottom: landscape ? innerHeight - 14 : panel.top - 12,
    };
  }
  const mapLayout = new ResizeObserver(measureMapArea);
  for (const el of [
    $("tactical-panel"),
    $("map-tools"),
    document.querySelector(".objective"),
  ])
    mapLayout.observe(el);
  function updateHome() {
    $("continue").hidden = !saved || saved.status !== "playing";
    $("new-game").hidden = !saved || saved.status !== "playing";
    $("start").hidden = !!saved && saved.status === "playing";
  }
  function begin(resume = false) {
    state = resume && saved ? E.restore(saved) : E.make();
    if (!state) state = E.make();
    group = 1;
    selected = null;
    selectedBuilding = null;
    selectionVisible = false;
    phase = -1;
    resultShown = false;
    aim = { x: E.hero(state).x + 280, y: E.hero(state).y - 80 };
    mousePoint = null;
    view.reset(state);
    view.camera.x = E.hero(state).x;
    view.camera.y = E.hero(state).y;
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
    if (
      n === 2 &&
      !state.units.some(
        (u) => (u.group === 2 || u.kind === "foundry") && u.hp > 0,
      )
    )
      return;
    cancelMapGesture();
    group = n;
    selectedBuilding = rallyBuilding = null;
    orderMode = false;
    selected = null;
    selectionVisible = true;
    refreshSelection();
  }
  function refreshSelection() {
    for (const [id, g] of [
      ["group-one", 1],
      ["group-two", 2],
    ]) {
      $(id).classList.toggle("selected", selected === null && g === group);
      $(id).setAttribute(
        "aria-pressed",
        String(selected === null && g === group),
      );
    }
    const members = selectedUnits(),
      building = state.units.find((u) => u.id === selectedBuilding && u.hp > 0);
    if (!building) selectedBuilding = null;
    const producer =
      building && ["barracks", "foundry"].includes(building.kind);
    const selectionText = building
      ? {
          barracks: "Казармы",
          foundry: "Тяжёлый цех",
          base: "База",
          outpost: "Узел",
        }[building.kind]
      : members.length
        ? "Выбрано: " + members.length
        : "Нет выбранных войск";
    if ($("selection-count").textContent !== selectionText)
      $("selection-count").textContent = selectionText;
    $("order-move").disabled = !members.length && !producer;
    $("order-move").textContent = producer ? "Сбор" : "Идти";
    $("order-move").setAttribute(
      "aria-pressed",
      String(orderMode || !!rallyBuilding),
    );
    $("order-cancel").hidden =
      !orderMode && !rallyBuilding && !building && !members.length;
    $("order-cancel").textContent =
      orderMode || rallyBuilding ? "Отмена" : "Снять";
    const touch = coarse.matches || innerWidth < 700;
    $("tactical-hint").textContent =
      orderMode || rallyBuilding
        ? "Укажите точку на карте · Отмена"
        : touch
          ? "Касание / рамка — выбор · два пальца — карта"
          : "ЛКМ — выбор · ПКМ — приказ · Shift — добавить";
    canvas.style.cursor =
      mode === "playing" && !coarse.matches
        ? "none"
        : orderMode || rallyBuilding
          ? "crosshair"
          : "default";
  }
  function selectedUnits() {
    return state.units.filter(
      (u) =>
        !u.team &&
        u.hp > 0 &&
        [1, 2].includes(u.group) &&
        (selected === null ? u.group === group : selected.includes(u.id)),
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
  function troopAt(e, enemy = false) {
    const pad = e.pointerType === "touch" ? 24 : 14;
    // An overview must not turn a distant enemy into a large invisible target.
    const hitPad = enemy
      ? Math.max(4, Math.min(pad, 30 * view.camera.scale))
      : pad;
    return state.units
      .filter(
        (u) =>
          u.hp > 0 && (enemy ? u.team : !u.team && [1, 2].includes(u.group)),
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
  function issueOrder(point, enemy = null) {
    const map = E.map(state);
    if (
      point.x < 24 ||
      point.y < 24 ||
      point.x > map.W - 24 ||
      point.y > map.H - 24
    )
      return false;
    const producer = rallyBuilding || selectedBuilding;
    if (!producer && !selectedUnits().length) return false;
    const success = producer
      ? E.setRally(state, producer, point.x, point.y)
      : enemy
        ? E.attackUnits(
            state,
            selectedUnits().map((u) => u.id),
            enemy.id,
          )
        : E.orderUnits(
            state,
            selectedUnits().map((u) => u.id),
            point.x,
            point.y,
          );
    if (success) {
      rallyBuilding = null;
      orderMode = false;
      view.add(state.events, settings.reduced);
      sound.start();
      sound.play({ type: "order", ...point });
      state.events = [];
      save();
    } else
      notice(
        producer ? "Здесь нельзя поставить точку сбора" : "Нет доступного пути",
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
    selectedBuilding = rallyBuilding = null;
    selectionVisible = true;
    orderMode = false;
    refreshSelection();
  }
  function finishSelection(d, e) {
    if (d.moved) {
      const left = Math.min(d.startX, d.x),
        right = Math.max(d.startX, d.x),
        top = Math.min(d.startY, d.y),
        bottom = Math.max(d.startY, d.y);
      const hits = state.units
        .filter((u) => {
          if (u.team || u.hp <= 0 || ![1, 2].includes(u.group)) return false;
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
        issueOrder(view.world(e.clientX, e.clientY), troopAt(e, true));
      else {
        const unit = troopAt(e),
          building = !unit && buildingAt(e);
        if (unit) selectHits([unit.id], d.add, true);
        else if (building && !d.add) openBuilding(building);
        else if (!d.add) clearSelection();
      }
    }
  }
  function onField(e) {
    return (
      e.clientX >= 0 &&
      e.clientX < innerWidth &&
      e.clientY >= 0 &&
      e.clientY < innerHeight &&
      document.elementFromPoint(e.clientX, e.clientY) === canvas
    );
  }
  function openDialog(which) {
    const dialog = $("dialog");
    if (storageConflict && which !== "storage") which = "storage";
    if (!dialog.open) {
      dialogOrigin = mode;
      lastMode =
        mode === "tactical" ? "tactical" : mode === "menu" ? "menu" : "playing";
      if (mode !== "menu") save();
      setMode(mode === "menu" ? "menu" : "paused");
      account?.changed();
    }
    dialog.dataset.panel = which;
    for (const section of dialog.querySelectorAll("section"))
      section.hidden = section.id !== which + "-content";
    if (!dialog.open) dialog.showModal();
    $("close-dialog").hidden = which === "result";
    if (which === "account") account.render();
    if (which === "supply") updateSupply();
    if (which === "development") development.render();
    if (which === "help")
      $("economy-help").textContent = E.development.expedition(state)
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
    sound.update(state, mode, settings.volume);
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
      state.units.filter((u) => u.team === 0 && u.group).length;
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
    $("alloy").textContent = state.economy.alloy;
    $("supply-title").textContent = state.campaign ? "Развитие" : "Снабжение";
    $("map-overview").setAttribute(
      "aria-pressed",
      String(view.tactical.overview),
    );
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
    }
    const rifles = state.units.filter((u) => u.group === 1 && u.hp > 0).length,
      art = state.units.some((u) => u.group === 2 && u.hp > 0);
    $("rifle-count").textContent =
      rifles +
      " / " +
      (state.campaign ? (E.development.expedition(state) ? 12 : 9) : 3);
    $("group-one").disabled = !rifles && !E.living(state, "barracks");
    $("group-two").disabled = !art && !E.living(state, "foundry");
    $("artillery-status").textContent = art
      ? "На позиции"
      : state.units.some((u) => u.kind === "artillery")
        ? "Потеряна"
        : state.relay.online
          ? "Готова к заказу"
          : "Нужен узел связи";
    if ($("dialog").open && !$("supply-content").hidden) updateSupply();
    if ($("dialog").open && !$("development-content").hidden)
      development.render();
    if (performance.now() > noticeUntil)
      $("notice").classList.remove("visible");
  }
  const reasons = {
    network: "Исследуйте сеть управления",
    command: "Исследуйте оперативный контур",
    "second-node": "Нужны два готовых добывающих узла",
    secure: "Уничтожьте южную батарею или глушитель",
    intact: "Корпус не повреждён",
    barracks: "Нужны готовые казармы",
    foundry: "Нужен готовый тяжёлый цех",
    expansion: "Постройте добывающий узел",
    "worker-limit": "Все места для дронов заняты",
    capacity: "Расширьте вместимость: постройте узел",
    queue: "Очередь заполнена",
    exhausted: "Месторождение исчерпано",
    researching: "Уже в очереди",
    order: "Заказ уже завершён или отменён",
    ended: "Операция завершена",
    funds: "Недостаточно сплава",
    distance: "Подведите разведчика к площадке",
    hostiles: "Сначала очистите площадку",
    occupied: "Площадка занята",
    relay: "Сначала запустите узел связи",
    post: "Нужен готовый опорный пункт",
    installed: "Модуль установлен",
    "squad-full": "Все три бойца в строю",
    "artillery-limit": "Орудие уже в строю",
    "post-limit": "Уже построены два пункта",
    blocked: "Освободите место для высадки",
    fortress: "Подавите северный бастион или южный арсенал",
    limit: "Лимит подкреплений",
  };
  const development = new SignalDevelopmentPanel($("development-panel"), {
    state: () => state,
    buy,
    reason: (code) =>
      code === "squad-full"
        ? "Лимит огневой группы"
        : code === "artillery-limit"
          ? "Лимит тяжёлой группы"
          : reasons[code] || "Недоступно",
    rally: (id) => {
      lastMode = "tactical";
      closeDialog();
      selectedBuilding = rallyBuilding = id;
      selected = [];
      refreshSelection();
    },
    focus: (x, y) => {
      lastMode = "tactical";
      closeDialog();
      view.focus(x, y);
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
  function buy(action, site) {
    if (!state.campaign && site && performance.now() < (siteLocks[site] || 0))
      return;
    state.events = [];
    const result = E.purchase(state, action, site);
    $(state.campaign ? "development-feedback" : "supply-feedback").textContent =
      state.campaign
        ? result.allowed
          ? action === "cancel"
            ? "Возвращено " + -result.cost + " сплава"
            : "Заказ принят · продолжится после выхода из паузы"
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
      if (!state.campaign && site) siteLocks[site] = performance.now() + 450;
      sound.start();
      for (const event of state.events) sound.play(event);
      view.add(state.events, settings.reduced);
      state.events = [];
      save();
    }
    if (!state.campaign) updateSupply();
    updateUI();
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
  $("supply-open").onclick = () => {
    development.select();
    $("supply-feedback").textContent = "";
    $("development-feedback").textContent = "";
    openDialog(state.campaign ? "development" : "supply");
  };
  $("supply-back").onclick = closeDialog;
  $("development-back").onclick = closeDialog;
  $("map-overview").onclick = () => {
    if (view.tactical.overview) view.focus(E.hero(state).x, E.hero(state).y);
    else view.tactical.overview = true;
    resetInput();
    updateUI();
  };
  $("map-center").onclick = () => {
    view.focus(E.hero(state).x, E.hero(state).y);
    resetInput();
    updateUI();
  };
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
    } else clearSelection();
  };
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
    sound.update(state, mode, settings.volume);
    persist();
  };
  $("volume").onchange = () => {
    sound.start().then(() => sound.play({ type: "order", x: E.hero(state).x }));
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
  function buildingAt(e) {
    if (!state.campaign) return null;
    if (
      mode === "playing" &&
      state.units.some((u) => {
        if (!u.team || u.hp <= 0) return false;
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
          ["base", "outpost", "barracks", "foundry"].includes(u.kind),
      )
      .map((u) => {
        const p = view.screen(u.x, u.y);
        return {
          u,
          d: Math.hypot(
            e.clientX - p.x,
            (e.clientY - p.y + 10 * view.camera.scale) / 0.85,
          ),
          r: Math.max(pad, E.C[u.kind].r * view.camera.scale),
        };
      })
      .filter((v) => v.d <= v.r)
      .sort((a, b) => a.d - b.d)[0]?.u;
  }
  function openBuilding(u) {
    if (mode === "playing") setMode("tactical");
    selectedBuilding = u.id;
    selected = [];
    selectionVisible = true;
    refreshSelection();
    development.select(u.id);
    openDialog("development");
  }
  function edgeAt(e) {
    const margin = e.pointerType === "touch" ? 30 : 24;
    return {
      x: e.clientX < margin ? -1 : e.clientX > innerWidth - margin ? 1 : 0,
      y: e.clientY < margin ? -1 : e.clientY > innerHeight - margin ? 1 : 0,
    };
  }
  canvas.addEventListener("pointermove", (e) => {
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
      } else if (p.kind === "select") paintSelection();
      else if (p.kind === "pan" && p.moved) {
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
    if (mode === "tactical" && e.pointerType !== "touch" && !mapPointers.size)
      edge = edgeAt(e);
    else if (mode === "playing" && e.pointerType !== "touch") {
      mousePoint = { x: e.clientX, y: e.clientY };
      aim = view.world(e.clientX, e.clientY);
    }
  });
  canvas.addEventListener("pointerleave", () => {
    if (!mapPointers.size) edge = null;
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (mode === "tactical" && [0, 1, 2].includes(e.button)) {
      const touch = e.pointerType === "touch",
        boundary = edgeAt(e);
      const kind =
        e.button === 1
          ? "pan"
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
      } else if (kind === "select") orderDrag = p;
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
    if (mode === "playing" && e.button === 0 && buildingAt(e)) {
      buildingPress = {
        id: e.pointerId,
        unit: buildingAt(e),
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (
      mode === "playing" &&
      e.button === 0 &&
      e.pointerType !== "touch"
    ) {
      mousePoint = { x: e.clientX, y: e.clientY };
      aim = view.world(e.clientX, e.clientY);
      input.fire = true;
      canvas.setPointerCapture(e.pointerId);
    }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(type, (e) => {
      const p = mapPointers.get(e.pointerId);
      if (p) {
        mapPointers.delete(e.pointerId);
        if (orderDrag === p) cancelSelection(false);
        pinch = null;
        edge = null;
        if (canvas.hasPointerCapture(e.pointerId))
          canvas.releasePointerCapture(e.pointerId);
        if (type === "pointerup" && mode === "tactical" && onField(e)) {
          if (p.kind === "select") finishSelection(p, e);
          else if (p.kind === "order" && !p.moved)
            issueOrder(view.world(e.clientX, e.clientY), troopAt(e, true));
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
          openBuilding(press.unit);
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
          E.clear(h, u),
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
      const r = el.getBoundingClientRect();
      el.style.setProperty("--base-x", stick.cx - r.x - r.width / 2 + "px");
      el.style.setProperty("--base-y", stick.cy - r.y - r.height / 2 + "px");
      el.style.setProperty("--stick-x", stick.visualX + "px");
      el.style.setProperty("--stick-y", stick.visualY + "px");
      el.classList.toggle("active", stick.active);
    }
    function move(e) {
      if (e.pointerId !== stick.id) return;
      let dx = e.clientX - stick.cx,
        dy = e.clientY - stick.cy,
        len = Math.hypot(dx, dy);
      // The base follows a long drag, so reversing direction needs only a small thumb motion.
      if (len > stick.radius) {
        stick.cx += (dx / len) * (len - stick.radius);
        stick.cy += (dy / len) * (len - stick.radius);
        stick.cx = E.clamp(
          stick.cx,
          Math.min(stick.originX, isAim ? innerWidth / 2 + 32 : 48),
          Math.max(
            stick.originX,
            isAim ? innerWidth - 48 : innerWidth / 2 - 32,
          ),
        );
        stick.cy = E.clamp(
          stick.cy,
          Math.min(stick.originY, stick.bounds.top + 40),
          Math.max(stick.originY, stick.bounds.bottom - 40),
        );
        dx = e.clientX - stick.cx;
        dy = e.clientY - stick.cy;
        len = Math.hypot(dx, dy);
      }
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
      if (mode !== "playing" || stick.id !== null || e.button !== 0) return;
      const r = el.getBoundingClientRect();
      Object.assign(stick, {
        id: e.pointerId,
        cx: e.clientX,
        cy: e.clientY,
        originX: e.clientX,
        originY: e.clientY,
        bounds: r,
        radius: Math.min(42, r.width * 0.29),
        started: performance.now(),
        used: false,
        visualX: 0,
        visualY: 0,
        x: 0,
        y: 0,
        active: false,
      });
      mousePoint = null;
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
          isAim &&
          type === "pointerup" &&
          !stick.used &&
          performance.now() - stick.started < 250 &&
          mode === "playing";
        clearStick(stick, el);
        if (tap) quickFire();
        e.preventDefault();
      });
  }
  addEventListener("keydown", (e) => {
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
    if (e.repeat && ["Tab", "Escape"].includes(e.code)) {
      e.preventDefault();
      return;
    }
    if ($("dialog").open || mode === "menu") return;
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
    if (["playing", "tactical"].includes(mode)) {
      if (e.code === "Digit1") chooseGroup(1);
      if (e.code === "Digit2") chooseGroup(2);
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
    measureMapArea();
  });
  function tick(now) {
    const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
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
        view.pan(
          ((dx / d) * 520 * elapsed) / view.camera.scale,
          ((dy / d) * 520 * elapsed) / (view.camera.scale * 0.73),
        );
        for (const p of mapPointers.values()) p.moved = true;
      }
    }
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
        for (const e of state.events) {
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
        view.add(state.events, settings.reduced);
        acc -= E.DT;
      }
      if (state.status !== "playing" && !resultShown) reportEnd();
      if (now - lastSaved > 3000) {
        save();
        lastSaved = now;
      }
    }
    sound.update(state, mode, settings.volume);
    if (now - lastUI > 80) {
      updateUI();
      lastUI = now;
    }
    view.render(
      state,
      {
        mode: mode === "paused" && lastMode === "tactical" ? "tactical" : mode,
        group: selected === null ? group : 0,
        selectedBuilding,
        mapArea,
        selectionIds: selectionVisible
          ? selectedUnits().map((u) => u.id)
          : null,
        selecting: !!orderDrag,
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
    selection: () => ({
      ids: selectedUnits().map((u) => u.id),
      custom: selected !== null,
      dragging: !!orderDrag,
      command: orderMode || !!rallyBuilding,
      building: selectedBuilding,
    }),
    screen: (x, y) => view.screen(x, y),
    camera: () => ({ ...view.camera, overview: view.tactical.overview }),
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
    }),
  });
})();

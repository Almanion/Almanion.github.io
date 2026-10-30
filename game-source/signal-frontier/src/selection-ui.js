/* Bounded, paginated roster. No canvas or per-frame portrait rendering. */
(function (root) {
  "use strict";
  const names = { hero: "Разведчик", rifle: "Боец", scout: "Дозорный", artillery: "Артиллерия", drone: "Зонд",
    base: "База", outpost: "Экстрактор", barracks: "Казармы", foundry: "Тяжёлый цех", arsenal: "Арсенал" };
  const shapes = {
    rifle: '<path d="m23 8 18 0 4 10-5 11H24l-5-11Z"/><path d="M23 30 12 37l-3 19h46l-3-19-11-7-9 10Z"/><path class="visor" d="M23 18h18v5H23Z"/><path d="m42 38 12-8 4 5-13 10M26 46h12"/>',
    scout: '<path d="m32 6 14 12-6 15H24l-6-15Z"/><path d="m22 32-10 9-4 15h48l-4-15-10-9-10 9Z"/><path class="visor" d="m22 18 10-5 10 5-10 5Z"/><path d="M12 39 8 16m34 30 12-7"/>',
    artillery: '<path d="M7 41h50v14H7ZM15 31h32l8 10H9Zm8-12h19v12H23Z"/><path d="m34 22 16-15 6 6-16 15"/><path class="visor" d="M25 32h14v6H25Z"/><path d="M14 46v5m9-5v5m18-5v5m9-5v5"/>',
    drone: '<path d="m32 18 13 10v15L32 51 19 43V28Zm-13 9L8 18 4 25l12 8m29-6 11-9 4 7-12 8M23 46l-6 10m24-10 6 10"/><path class="visor" d="m32 27 7 5v7l-7 4-7-4v-7Z"/><path d="M32 18V8m-5 0h10"/>',
    base: '<path d="m32 7 13 9v12l12 7v19H7V35l12-7V16Zm-13 9 13 8 13-8M19 28v14h26V28M7 35l12 7m26 0 12-7"/><path class="visor" d="M27 29h10v13H27Z"/>',
    outpost: '<path d="M8 47h48v10H8ZM18 45V26l14-9 14 9v19M32 17V6m-7 0h14M9 47V30h9m28 0h9v17"/><path class="visor" d="m25 29 7-4 7 4v10l-7 4-7-4Z"/>',
    barracks: '<path d="M6 55V27l26-15 26 15v28ZM14 27l18-10 18 10M32 12V4m0 0h14v7H32"/><path class="visor" d="M25 36h14v19H25Z"/><path d="M13 36h6m26 0h6M13 43h6m26 0h6"/>',
    foundry: '<path d="M6 55V29l17 8V21l17 10V12h12l6 43ZM40 12V6h12v6"/><path class="visor" d="M14 43h7v7h-7Zm15-5h7v12h-7Zm15-5h7v17h-7Z"/>',
    arsenal: '<path d="M8 55V23l24-13 24 13v32ZM15 27l17-9 17 9M8 55h48"/><path class="visor" d="m32 26-10 15h8l-2 10 15-17h-9l2-8Z"/>',
  };
  const icon = (kind) => `<svg viewBox="0 0 64 64" aria-hidden="true">${shapes[kind] || (kind === "hero" ? shapes.rifle : shapes.base)}</svg>`;
  // Patch only changed nodes/attributes, retaining focused buttons while timers tick.
  function patch(parent, html) {
    if (parent._html === html) return;
    parent._html = html;
    const template = document.createElement("template");
    template.innerHTML = html;
    const sync = (a, b) => {
      for (let i = 0; i < b.childNodes.length; i++) {
        const next = b.childNodes[i];
        let old = a.childNodes[i];
        if (!old) { a.append(next.cloneNode(true)); continue; }
        if (old.nodeType !== next.nodeType || old.nodeName !== next.nodeName ||
          (next.nodeType === 1 && old.dataset.key !== next.dataset.key)) {
          old.replaceWith(next.cloneNode(true)); continue;
        }
        if (next.nodeType === 3) { if (old.data !== next.data) old.data = next.data; continue; }
        for (const attr of [...old.attributes]) if (!next.hasAttribute(attr.name)) old.removeAttribute(attr.name);
        for (const attr of next.attributes) if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value);
        sync(old, next);
      }
      while (a.childNodes.length > b.childNodes.length) a.lastChild.remove();
    };
    sync(parent, template.content);
  }
  class SelectionPanel {
    constructor(el, options) {
      this.el = el; this.options = options; this.page = 0; this.producer = 0; this.membersKey = ""; this.memberIds = new Set(); this.careView = null;
      el.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || !el.contains(b)) return;
        if (b.dataset.careView) this.careView = this.careView === Number(b.dataset.careView) ? null : Number(b.dataset.careView);
        else if (b.dataset.care) options.care(b.dataset.care, Number(b.dataset.careId));
        else if (b.dataset.rosterPage) this.page += Number(b.dataset.rosterPage);
        else if (b.dataset.producerPage) this.producer += Number(b.dataset.producerPage);
        else if (b.dataset.member) {
          const id = Number(b.dataset.member), members = options.members();
          if (e.detail === 2) options.selectType(members.find((u) => u.id === id)?.kind, e.shiftKey);
          else if (e.ctrlKey || e.metaKey) {
            const kind = members.find((u) => u.id === id)?.kind;
            options.select(members.filter((u) => u.kind === kind).map((u) => u.id));
          } else options.select(e.shiftKey ? members.filter((u) => u.id !== id).map((u) => u.id) : [id]);
        } else if (b.dataset.cancelJob) options.buy("cancel", b.dataset.cancelJob);
        else if (b.dataset.purchase) options.buy(b.dataset.purchase, b.dataset.site);
        else if (b.dataset.inspect) options.inspect(Number(b.dataset.inspect));
        this.render();
      });
    }
    render() {
      const E = root.SignalEngine, s = this.options.state(), members = this.options.members(),
        key = members.map((u) => u.id).join(","), width = this.el.clientWidth;
      if (!width) return;
      if (key !== this.membersKey) {
        // Casualties and Shift-removal must not throw the player back to page one.
        if (members.length <= 1 || members.length >= this.memberIds.size || !members.every((u) => this.memberIds.has(u.id))) this.page = 0;
        this.producer = 0; this.membersKey = key; this.memberIds = new Set(members.map((u) => u.id));
      }
      const buildings = members.filter((u) => !E.C[u.kind].speed),
        single = members.length === 1 ? members[0] : null,
        detail = single || (buildings.length ? buildings[((this.producer % buildings.length) + buildings.length) % buildings.length] : null),
        compact = width < 430, hasDetail = !!detail,
        columns = Math.max(1, Math.min(12, Math.floor((width - (hasDetail && !compact ? 268 : 0)) / (compact ? 44 : 52)))),
        rows = Math.max(1, Math.min(3, Math.floor((this.el.clientHeight - (compact ? 40 : 52)) / (compact ? 38 : 48)))),
        size = columns * rows, pages = Math.max(1, Math.ceil(members.length / size));
      this.page = Math.max(0, Math.min(pages - 1, this.page));
      this.el.dataset.single = String(!!single); this.el.dataset.compact = String(compact);
      const health = (u) => Math.max(0, Math.min(100, Math.ceil(u.hp / E.C[u.kind].hp * 100))),
        hp = (u) => `<i class="roster-health" style="--health:${health(u)}%;--health-color:${health(u) > 55 ? "#a6d6b0" : health(u) > 25 ? "#e2bf70" : "#ed7e6b"}"></i>`,
        cards = members.slice(this.page * size, (this.page + 1) * size).map((u) =>
          `<button class="roster-unit" data-key="u${u.id}" data-member="${u.id}" title="${names[u.kind]} №${u.id} · ${Math.ceil(u.hp)} / ${E.C[u.kind].hp}\nНажать — выбрать · Shift — убрать · Ctrl — выбрать этот тип" aria-label="${names[u.kind]} №${u.id}, прочность ${Math.ceil(u.hp)} из ${E.C[u.kind].hp}">${icon(u.kind)}${hp(u)}${u.care ? `<small class="roster-badge">+</small>` : u.jobs?.length ? `<small class="roster-badge">${u.jobs.length}</small>` : u.build ? '<small class="roster-badge">⌁</small>' : ""}</button>`).join("");
      let info = "";
      if (detail) {
        const u = detail, items = s.campaign ? E.development.items(s) : {},
          building = !E.C[u.kind].speed, jobs = u.jobs || [], max = E.C[u.kind].hp;
        info = `<div class="roster-detail-head">${icon(u.kind)}<div><strong>${names[u.kind]}</strong><span>${Math.ceil(u.hp)} / ${max}</span>${hp(u)}</div>${E.support.enabled(s) && E.support.facility(u) ? `<button class="care-toggle" data-care-view="${u.id}" aria-pressed="${this.careView === u.id}" title="Лечение внутри: 4 места, 8 прочности/с">${this.careView === u.id ? "‹ Очередь" : "Лечение " + E.support.occupants(s, u.id).length + "/4"}</button>` : ""}${buildings.length > 1 ? `<div class="producer-pager"><button data-producer-page="-1" aria-label="Предыдущее выбранное здание">‹</button><small>${buildings.indexOf(u) + 1}/${buildings.length}</small><button data-producer-page="1" aria-label="Следующее выбранное здание">›</button></div>` : ""}</div>`;
        if (building && E.support.facility(u) && this.careView === u.id) {
          const patients = E.support.occupants(s, u.id), h = E.hero(s);
          info += '<div class="roster-queue care-slots">' + [0, 1, 2, 3].map((i) => {
            const v = patients[i];
            return v ? `<button class="roster-unit" data-key="patient${v.id}" data-care="exit" data-care-id="${v.id}" aria-label="Вывести: ${names[v.kind]} №${v.id}" title="${names[v.kind]} · ${Math.ceil(v.hp)}/${E.C[v.kind].hp} · ${v.care.inside ? v.care.exit ? "Ожидает выхода" : v.hp >= E.C[v.kind].hp ? "Вылечен · ждёт приказа" : "Лечится" : "Идёт ко входу"} · нажмите для выхода">${icon(v.kind)}${hp(v)}<small class="roster-badge">${v.care.inside ? v.hp >= E.C[v.kind].hp ? "✓" : "+" : "↗"}</small></button>` : '<span class="roster-slot">+</span>';
          }).join('') + '</div><small class="roster-note">8 прочности/с · нажатие на бойца — выход</small>';
          info += `<div class="care-actions"><button class="roster-inspect" data-care="admit" data-care-id="${u.id}" ${h.hp >= E.C.hero.hp || h.care || patients.length >= 4 ? "disabled" : ""}>Лечить героя</button><button class="roster-inspect" data-care="evacuate" data-care-id="${u.id}" ${patients.length ? "" : "disabled"}>Вывести всех</button></div>`;
        } else if (building) {
          if (u.build) {
            const progress = Math.round((1 - u.build / (items[u.kind]?.time || u.build)) * 100);
            info += `<div class="roster-build">Строительство · ${progress}%<progress value="${progress}" max="100"></progress></div>`;
          } else info += `<div class="roster-queue" aria-label="Очередь ${names[u.kind]}">${[0, 1, 2].map((i) => {
            const j = jobs[i];
            if (!j) return '<span class="roster-slot" aria-label="Свободное место очереди">·</span>';
            const label = items[j.action]?.label || j.action, progress = Math.round((1 - j.remaining / j.duration) * 100);
            return `<button class="roster-job" data-key="j${j.id}" data-cancel-job="${u.id}:${j.id}" title="Отменить: ${label} · вернуть ${Math.floor(j.cost * .75)} сплава" aria-label="Отменить: ${label}, вернуть ${Math.floor(j.cost * .75)} сплава">${icon(j.action)}<span>${i ? "В очереди" : j.remaining ? Math.ceil(j.remaining) + " с" : "Выход занят"}</span><i style="--progress:${progress}%"></i></button>`;
          }).join("")}</div><small class="roster-note">${jobs.length ? "Нажатие — отмена · возврат 75%" : "Очередь свободна"}</small>`;
          info += `<button class="roster-inspect" data-inspect="${u.id}">Открыть производство ›</button>`;
        } else {
          const stat = E.stats(s, u), task = u.care ? u.care.inside ? u.care.exit ? "Ожидает свободного выхода" : u.hp >= max ? "Вылечен · ждёт приказа внутри" : "Внутри экстрактора · лечится" : "Идёт на лечение" : u.mineId && !u.workerTask ? "Добывает назначенный ресурс" : u.workerTask?.kind === "repair" ? "Ремонтирует здание" : u.buildingId ? "Строит здание" : u.order?.followId ? "Следует за ведущим" : u.order ? "Выполняет приказ" : "Готов к приказу";
          info += `<p class="roster-task">${task}</p>${u.care ? `<button class="roster-inspect" data-care="exit" data-care-id="${u.id}">Выйти из экстрактора</button>` : `<div class="roster-stats"><span>Урон <b>${stat.damage || "—"}</b></span><span>Дальность <b>${stat.range ? (stat.range / 40).toLocaleString("ru-RU") : "—"}</b></span></div>`}`;
        }
      }
      patch(this.el, members.length ? `<div class="roster-list"><div class="roster-grid" style="--columns:${columns}">${cards}</div>${pages > 1 ? `<nav class="roster-pages" aria-label="Страницы выделения"><button data-roster-page="-1" ${this.page ? "" : "disabled"} aria-label="Предыдущая страница выделения">‹</button><span>${this.page * size + 1}–${Math.min(members.length, (this.page + 1) * size)} из ${members.length}</span><button data-roster-page="1" ${this.page < pages - 1 ? "" : "disabled"} aria-label="Следующая страница выделения">›</button></nav>` : ""}</div>${info ? `<aside class="roster-detail" data-key="detail${detail.id}">${info}</aside>` : ""}` : '<div class="roster-empty"><span>Отряд ждёт приказа</span><p>Выберите войска рамкой или нажмите закладку группы.</p><small>Ctrl + 1–0 — сохранить выделение</small></div>');
    }
  }
  root.SignalSelectionPanel = SelectionPanel;
})(window);

/* Compact production UI. All prices, prerequisites and transactions come from the simulation. */
(function (root) {
  "use strict";
  class DevelopmentPanel {
    constructor(element, options) {
      this.el = element;
      this.options = options;
      this.tab = "production";
      this.key = "";
      element.addEventListener("click", (e) => {
        const button = e.target.closest("button");
        if (!button) return;
        if (button.dataset.tab) {
          this.tab = button.dataset.tab;
          this.key = "";
          this.render();
        } else if (button.dataset.action) {
          options.buy(button.dataset.action, button.dataset.site);
        } else if (button.dataset.focus) {
          const [x, y] = button.dataset.focus.split(",").map(Number);
          options.focus(x, y);
        }
      });
    }
    render() {
      const E = root.SignalEngine,
        s = this.options.state();
      if (!s.campaign) return;
      const D = E.development,
        summary = D.summary(s),
        ITEMS = D.items(s),
        long = D.extended(s);
      const key = JSON.stringify([
        this.tab,
        s.economy,
        s.campaign.tier,
        s.campaign.weapons,
        s.campaign.armor,
        s.campaign.mines.map((m) => m.remaining),
        s.units.map((u) => [u.id, u.hp, u.build, u.node, u.defense, u.jobs]),
      ]);
      if (key === this.key) return;
      this.key = key;
      const focused = document.activeElement?.id;
      const reason = (o) => this.options.reason(o.reason);
      const button = (action, site, label) => {
        const o = E.supplyStatus(s, action, site),
          id =
            "develop-" +
            action +
            (site ? "-" + String(site).replace(":", "-") : "");
        return `<button id="${id}" class="develop-action" data-action="${action}" ${site !== undefined ? `data-site="${site}"` : ""} ${o.allowed ? "" : "disabled"}><span>${label || ITEMS[action]?.label || "Отменить"}</span><span>${o.reason === "installed" ? "✓" : Math.abs(o.cost)}</span></button>`;
      };
      const focus = (p, label) =>
        `<button class="map-link" data-focus="${p.x},${p.y}" aria-label="Показать: ${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M8 12h8m-4-4v8"/></svg></button>`;
      const queue = (u) =>
        !u?.jobs?.length
          ? ""
          : `<ol class="production-queue">${u.jobs.map((j, i) => `<li><div><span>${ITEMS[j.action].label}</span><small>${i === 0 ? (ITEMS[j.action].pop && summary.population > summary.capacity ? "Нет вместимости" : Math.ceil(j.remaining) + " с") : "В очереди"}</small><i style="--progress:${(1 - j.remaining / j.duration) * 100}%"></i></div><button data-action="cancel" data-site="${u.id}:${j.id}" aria-label="Отменить: ${ITEMS[j.action].label}; возврат ${Math.floor(j.cost * 0.75)}">×</button></li>`).join("")}</ol>`;
      const card = (title, detail, content, top = "") =>
        `<article class="development-card"><header><div><strong>${title}</strong><small>${detail}</small></div>${top}</header>${content}</article>`;
      const maintenance = (u) => {
        if (!long) return "";
        let html = "";
        if (["base", "outpost"].includes(u.kind) && !u.defense) {
          const o = E.supplyStatus(s, "defense", u.id);
          html +=
            button("defense", u.id) +
            '<p class="development-note">Автоогонь · урон по узлу −65%' +
            (!o.allowed ? " · " + reason(o) : "") +
            "</p>";
        }
        if (u.hp < E.C[u.kind].hp) {
          const o = E.supplyStatus(s, "repair", u.id);
          html +=
            button("repair", u.id) +
            '<p class="development-note">Восстановит 55% корпуса' +
            (!o.allowed ? " · " + reason(o) : "") +
            "</p>";
        }
        return html;
      };
      let content = "";
      if (this.tab === "economy") {
        const nodeList = [
          { id: "home", name: "Посадочный узел", x: 135, y: 1140 },
          ...D.PADS,
        ];
        content = nodeList
          .map((p, i) => {
            const u = s.units.find(
                (u) =>
                  u.hp > 0 &&
                  (p.id === "home"
                    ? u.kind === "base"
                    : u.kind === "outpost" && u.site === p.id),
              ),
              mine = s.campaign.mines.find((m) => m.id === p.id);
            if (!u) {
              const o = E.supplyStatus(s, "outpost", p.id);
              return card(
                `${i} · ${p.name}`,
                o.allowed ? "Новая добыча и +3 к вместимости" : reason(o),
                button("outpost", p.id, "Построить узел"),
                focus(p, p.name),
              );
            }
            if (u.build > 0)
              return card(
                `${i} · ${p.name}`,
                `Строительство · ${Math.ceil(u.build)} с`,
                `<p class="development-note">${E.dist(E.hero(s), u) <= 210 ? "Разведчик обеспечивает стройку" : "Подведите разведчика: стройка приостановлена"}</p>`,
                focus(u, p.name),
              );
            const o = E.supplyStatus(s, "drone", u.id),
              count = D.workers(s, u).length;
            return card(
              p.id === "home" ? p.name : `${i} · ${p.name}`,
              `${Math.min(4, count)} / 4 дрона${count > 4 ? ` · ${count - 4} в резерве` : ""} · остаток ${mine.remaining}`,
              button("drone", u.id, "Обучить дрона") +
                (!o.allowed
                  ? `<p class="development-note">${reason(o)}</p>`
                  : "") +
                maintenance(u) +
                queue(u),
              focus(u, p.name),
            );
          })
          .join("");
      } else if (this.tab === "production") {
        for (const kind of ["barracks", "foundry"]) {
          const u = s.units.find((u) => u.kind === kind && u.hp > 0),
            label = ITEMS[kind].label,
            p = D.BUILDINGS[kind];
          if (!u) {
            const o = E.supplyStatus(s, kind);
            content += card(
              label,
              o.allowed
                ? `${ITEMS[kind].time} с · ${kind === "barracks" ? "Обучение огневой группы" : "Тяжёлая поддержка"}`
                : reason(o),
              button(kind, undefined, "Построить"),
              focus(p, label),
            );
          } else if (u.build > 0)
            content += card(
              label,
              `Строительство · ${Math.ceil(u.build)} с`,
              '<p class="development-note">Продолжится после выхода из паузы</p>',
              focus(u, label),
            );
          else {
            const action = kind === "barracks" ? "rifle" : "artillery",
              o = E.supplyStatus(s, action);
            content += card(
              label,
              `${ITEMS[action].time} с · ${ITEMS[action].pop} вместимости`,
              button(
                action,
                undefined,
                "Заказать " + (action === "rifle" ? "бойца" : "орудие"),
              ) +
                `<p class="development-note">${o.allowed ? "Приказ группе задаёт точку сбора" : reason(o)}</p>` +
                maintenance(u) +
                queue(u),
              focus(u, label),
            );
          }
        }
      } else {
        for (const [action, detail] of [
          [
            "network",
            long
              ? "Ступень II · цех и улучшения армии"
              : "Открывает цех и модуль проникновения",
          ],
          ...(long
            ? [["command", "Ступень III · артиллерия и проникновение"]]
            : []),
          ["hack", "Разведчик отключает защиту через терминал"],
          ["weapons", "Урон союзников +20%"],
          ["armor", "Урон по разведчику и армии −15%"],
        ]) {
          const o = E.supplyStatus(s, action),
            job = D.queued(s, action)[0];
          content += card(
            ITEMS[action].label,
            job
              ? `Исследование · ${Math.ceil(job.remaining)} с`
              : o.reason === "installed"
                ? "Установлено"
                : detail,
            button(action, undefined, "Исследовать") +
              (!o.allowed && !["installed", "researching"].includes(o.reason)
                ? `<p class="development-note">${reason(o)}</p>`
                : ""),
          );
        }
        const base = E.living(s, "base");
        content += queue(base);
        for (const u of s.units.filter(
          (u) =>
            u.hp > 0 &&
            ["barracks", "foundry"].includes(u.kind) &&
            u.jobs?.some((j) => ["weapons", "armor"].includes(j.action)),
        ))
          content += queue(u);
      }
      this.el.innerHTML = `<div class="development-summary"><span>Сплав <strong id="development-alloy">${s.economy.alloy}</strong></span>${long ? `<span>Развитие <strong>${["", "I", "II", "III"][summary.tier]}</strong></span>` : ""}<span>Отряд <strong>${summary.population} / ${summary.capacity}</strong></span></div><div class="development-tabs" role="tablist" aria-label="Развитие базы">${[
        ["economy", "Добыча"],
        ["production", "Производство"],
        ["research", "Технологии"],
      ]
        .map(
          ([id, label]) =>
            `<button id="develop-tab-${id}" role="tab" aria-selected="${this.tab === id}" aria-controls="development-body" data-tab="${id}">${label}</button>`,
        )
        .join(
          "",
        )}</div><div id="development-body" role="tabpanel" aria-labelledby="develop-tab-${this.tab}">${content}</div>`;
      if (focused && document.getElementById(focused))
        document.getElementById(focused).focus({ preventScroll: true });
    }
  }
  root.SignalDevelopmentPanel = DevelopmentPanel;
})(window);

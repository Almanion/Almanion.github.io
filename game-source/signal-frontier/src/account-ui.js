/* Account controls load Firebase only when sync has been explicitly enabled. */
(function (root) {
  "use strict";
  const labels = {
    off: "Только на этом устройстве",
    connecting: "Подключение…",
    syncing: "Сохранение…",
    synced: "Сохранено в аккаунте",
    pending: "Есть новые изменения",
    waiting: "Облачная копия ожидает паузы",
    conflict: "На устройствах разные операции",
    "account-change": "Выбран другой аккаунт",
    error: "Синхронизация не подтверждена",
    "signed-out": "Войдите в аккаунт Альманиона",
  };
  function load() {
    if (root.AlmanionOrbitalAccount?.games?.includes("signalFrontier"))
      return Promise.resolve();
    return new Promise((ok, no) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        script.remove();
        no(Error("Сервис входа не ответил. Повторите подключение."));
      }, 15000);
      script.src = "/orbital-account.js?v=signal-0.6";
      script.onload = () => {
        clearTimeout(timer);
        ok();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        no(Error("Нет связи с сервисом входа."));
      };
      document.head.appendChild(script);
    });
  }
  class AccountPanel {
    constructor(el, options) {
      this.el = el;
      this.o = options;
      this.user = null;
      this.sync = null;
      this.enabled = false;
      this.error = "";
      el.innerHTML =
        '<p class="eyebrow">Альманион</p><h2>Сохранение</h2><p id="account-status" role="status"></p><p id="account-user" class="help-note"></p><button id="account-connect" class="primary">Подключить аккаунт</button><form id="account-login" hidden><label>Почта<input id="account-email" type="email" autocomplete="username" required maxlength="254"></label><label>Пароль<input id="account-password" type="password" autocomplete="current-password" required minlength="6" maxlength="128"></label><button type="submit" class="primary">Войти</button><div class="account-actions"><button type="button" id="account-register">Создать аккаунт</button><button type="button" id="account-reset">Восстановить пароль</button><button type="button" id="account-google">Войти через Google</button></div></form><div id="account-connected" hidden><button id="account-sync" class="primary">Синхронизировать</button><button id="account-signout" class="text-button">Выйти</button></div><div id="account-conflict" hidden><p>Выберите операцию. Перед заменой обе копии сохранятся на этом устройстве.</p><div id="account-copies"></div><button id="account-cloud" class="primary">Продолжить из аккаунта</button><button id="account-local" class="text-button">Оставить эту операцию</button></div><p id="account-message" class="help-note" role="status"></p><button id="account-back" class="text-button">Назад</button>';
      this.$ = (id) => el.querySelector("#" + id);
      this.$("account-connect").onclick = () => this.connect();
      this.$("account-back").onclick = options.back;
      this.$("account-login").onsubmit = (e) => {
        e.preventDefault();
        this.auth("signIn");
      };
      this.$("account-register").onclick = () => {
        if (this.$("account-login").reportValidity()) this.auth("register");
      };
      this.$("account-reset").onclick = () => {
        if (this.$("account-email").reportValidity())
          this.auth("resetPassword");
      };
      this.$("account-google").onclick = () => this.auth("signInGoogle");
      this.$("account-signout").onclick = () => this.auth("signOut");
      this.$("account-sync").onclick = () => this.sync?.sync(true);
      this.$("account-cloud").onclick = () => this.sync?.resolve("cloud");
      this.$("account-local").onclick = () => this.sync?.resolve("local");
      this.timer = setInterval(() => {
        if (
          this.sync?.uid &&
          document.visibilityState === "visible" &&
          !options.localConflict()
        )
          this.sync.sync(this.sync.status === "error");
      }, 30000);
      addEventListener("online", () => this.sync?.sync(true));
      this.render();
      try {
        if (localStorage.getItem("signal-cloud-enabled") === "1")
          this.connect();
      } catch {}
    }
    async connect() {
      if (this.loading || this.connected) return;
      this.loading = true;
      this.error = "";
      this.render();
      try {
        await load();
        if (!root.AlmanionOrbitalAccount?.games?.includes("signalFrontier"))
          throw Error(
            "Сервис входа устарел. Обновите страницу при подключённом интернете.",
          );
        this.stop = await root.AlmanionOrbitalAccount.connect(
          (user, transport, error) => {
            this.user = user;
            if (!this.sync)
              this.sync = new root.SignalCloudCore.CloudSync({
                storage: localStorage,
                transport,
                getSave: () => this.o.getSave(),
                validateSave: (text) => {
                  if (!root.SignalEngine.restore(JSON.parse(text)))
                    throw Error(
                      "Операция повреждена или создана в более новой версии игры.",
                    );
                },
                isFresh: () => this.o.isFresh(),
                canApply: () => this.o.canApply() && !this.o.localConflict(),
                applySave: (text) => this.o.applySave(text),
                changed: () => this.render(),
              });
            this.sync.o.transport = transport;
            if (error) this.error = "Не удалось проверить аккаунт.";
            this.sync.setUser(user?.uid || null);
            this.render();
          },
          "signalFrontier",
        );
        this.connected = true;
        this.enabled = true;
        try {
          localStorage.setItem("signal-cloud-enabled", "1");
        } catch {}
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
        this.render();
      }
    }
    async auth(method) {
      this.error = "";
      this.authBusy = true;
      this.render();
      try {
        await root.AlmanionOrbitalAccount[method](
          this.$("account-email").value.trim(),
          this.$("account-password").value,
        );
        this.$("account-password").value = "";
        if (method === "resetPassword")
          this.error =
            "Если аккаунт существует, письмо для восстановления отправлено.";
      } catch (e) {
        const errors = {
          "auth/invalid-credential": "Проверьте почту и пароль.",
          "auth/email-already-in-use": "Эта почта уже зарегистрирована.",
          "auth/weak-password": "Используйте пароль от 6 символов.",
          "auth/popup-closed-by-user": "Окно входа закрыто.",
          "auth/popup-blocked": "Разрешите окно входа и повторите.",
          "auth/network-request-failed": "Нет соединения с сервисом входа.",
          "auth/too-many-requests": "Слишком много попыток. Повторите позже.",
        };
        this.error =
          errors[e.code] || "Не удалось выполнить вход. Повторите попытку.";
      } finally {
        this.authBusy = false;
        this.render();
      }
    }
    render() {
      const status = this.sync?.status || "off",
        conflict = ["conflict", "account-change", "waiting"].includes(status);
      this.$("account-status").textContent = this.loading
        ? "Подключение…"
        : labels[status] || labels.off;
      this.$("account-user").textContent = this.user?.email || "";
      this.$("account-connect").hidden = !!this.connected;
      this.$("account-connect").disabled = !!this.loading;
      this.$("account-login").hidden = !this.connected || !!this.user;
      this.$("account-connected").hidden = !this.user || conflict;
      this.$("account-conflict").hidden = !conflict;
      this.$("account-message").textContent =
        this.error ||
        (status === "error"
          ? "Проверьте подключение и повторите синхронизацию."
          : "");
      for (const button of this.el.querySelectorAll("button"))
        if (button.id !== "account-back")
          button.disabled = !!(
            this.authBusy ||
            this.loading ||
            this.sync?.busy
          );
      if (conflict) {
        const describe = (text) => {
          try {
            const s = JSON.parse(text);
            return (
              (s.status === "won"
                ? "Победа"
                : s.status === "lost"
                  ? "Поражение"
                  : "В процессе") +
              " · " +
              Math.floor(s.t / 60) +
              ":" +
              String(Math.floor(s.t % 60)).padStart(2, "0") +
              " · " +
              s.economy.alloy +
              " сплава"
            );
          } catch {
            return "Нет операции";
          }
        };
        this.$("account-copies").textContent =
          "Здесь: " +
          describe(this.o.getSave()) +
          " / В аккаунте: " +
          describe(this.sync.remote?.save);
        this.$("account-cloud").disabled =
          !this.sync.remote || !!this.sync.busy;
      }
    }
    localChanged() {
      if (
        this.sync?.uid &&
        this.sync.status === "synced" &&
        !this.sync.same(this.o.getSave(), this.sync.base)
      )
        this.sync.notify("pending");
    }
    changed() {
      if (this.sync?.uid && !this.o.localConflict()) this.sync.sync();
    }
  }
  root.SignalAccountPanel = AccountPanel;
})(window);

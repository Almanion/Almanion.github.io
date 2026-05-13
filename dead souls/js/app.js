// ========== SPA РОУТЕР ==========

const APP = {
  root: document.getElementById('app'),

  init() {
    window.addEventListener('hashchange', () => this.route());
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-nav]');
      if (link) {
        e.preventDefault();
        const target = link.getAttribute('href');
        // Если уже на этом хеше — принудительно вызовем route()
        if (window.location.hash === target) {
          this.route();
        } else {
          window.location.hash = target;
        }
      }
    });
    this.route();
  },

  async route() {
    const hash = window.location.hash.slice(1) || 'home';
    const parts = hash.split('/');
    const page = parts[0];
    const param = parts[1];
    const param2 = parts[2];

    await loadChapters();

    const routes = {
      home: () => this.renderHome(),
      text: () => this.renderText(param, param2),
      summary: () => this.renderSummary(),
      'city-map': () => this.renderCityMap(),
      'landowner-map': () => this.renderLandownerMap(),
      chichikov: () => this.renderChichikov(),
      character: () => this.renderCharacter(param),
      society: () => this.renderSociety(),
      glossary: () => this.renderGlossary(),
      author: () => this.renderAuthor(),
      sources: () => this.renderSources(),
      about: () => this.renderAbout()
    };

    const renderer = routes[page] || routes.home;
    renderer();
    // Не сбрасываем скролл, если нужно прокрутить к конкретному абзацу/главе.
    if (!(page === 'text' && param)) {
      window.scrollTo(0, 0);
    }
    this.updateActiveNav(page);
    this.closeMenu();
    this._initFadeIn();
  },

  updateActiveNav(page) {
    document.querySelectorAll('.nav__link').forEach(link => {
      const href = link.getAttribute('href').slice(1);
      link.classList.toggle('nav__link--active', href === page);
    });
  },

  closeMenu() {
    document.querySelector('.nav__links')?.classList.remove('nav__links--open');
  },

  toggleMenu() {
    document.querySelector('.nav__links')?.classList.toggle('nav__links--open');
  },

  // ========== НАВИГАЦИЯ (общая) ==========
  getNav() {
    return `
      <nav class="nav">
        <div class="nav__inner">
          <a href="#home" data-nav class="nav__logo">Мёртвые души</a>
          <ul class="nav__links">
            <li><a href="#text" data-nav class="nav__link">Текст</a></li>
            <li><a href="#summary" data-nav class="nav__link">Краткое</a></li>
            <li><a href="#city-map" data-nav class="nav__link">Карта города</a></li>
            <li><a href="#landowner-map" data-nav class="nav__link">Карта помещиков</a></li>
            <li><a href="#chichikov" data-nav class="nav__link">Чичиков</a></li>
            <li><a href="#society" data-nav class="nav__link">Общество</a></li>
            <li><a href="#author" data-nav class="nav__link">О Гоголе</a></li>
            <li><a href="#glossary" data-nav class="nav__link">Глоссарий</a></li>
            <li><a href="#about" data-nav class="nav__link">О проекте</a></li>
          </ul>
          <button class="nav__toggle" onclick="APP.toggleMenu()" aria-label="Меню">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12h18M3 6h18M3 18h18"/>
            </svg>
          </button>
        </div>
      </nav>
    `;
  },

  getFooter() {
    return `
      <footer class="footer">
        <p>Интерактивный проект по поэме Н. В. Гоголя «Мёртвые души» &middot; <a href="#summary" data-nav>Краткое содержание</a> &middot; <a href="#glossary" data-nav>Глоссарий</a> &middot; <a href="#author" data-nav>О Гоголе</a> &middot; <a href="#sources" data-nav>Источники</a> &middot; <a href="#about" data-nav>О проекте</a></p>
        <p class="footer__author">Белоцерковцев Дмитрий, 9-1</p>
      </footer>
    `;
  },

  // ========== ГЛАВНАЯ СТРАНИЦА ==========
  renderHome() {
    this.root.innerHTML = `
      ${this.getNav()}

      <section class="hero">
        <div class="hero__content">
          <p class="hero__label">Н. В. Гоголь</p>
          <h1 class="hero__title">Мёртвые души</h1>
          <p class="hero__subtitle">Крестьяне, умершие, но числящиеся по "Ревизской сказке"</p>
          <div class="hero__actions">
            <a href="#text" data-nav class="btn btn--primary">Читать текст</a>
            <a href="#chichikov" data-nav class="btn btn--outline">Изучить персонажей</a>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section__header">
          <h2 class="section__title">Разделы проекта</h2>
          <p class="section__desc">Изучайте произведение через текст, карты и персонажей</p>
        </div>
        <div class="container">
          <div class="grid grid--4">
            <a href="#text" data-nav class="nav-card fade-in">
              <div class="nav-card__icon">&#128214;</div>
              <h3 class="nav-card__title">Оригинальный текст</h3>
              <p class="nav-card__desc">Текст поэмы с делением на главы и оглавлением</p>
            </a>
            <a href="#summary" data-nav class="nav-card fade-in">
              <div class="nav-card__icon">&#128221;</div>
              <h3 class="nav-card__title">Краткое содержание</h3>
              <p class="nav-card__desc">Пересказ каждой главы с фабулой</p>
            </a>
            <a href="#city-map" data-nav class="nav-card fade-in">
              <div class="nav-card__icon">&#127963;</div>
              <h3 class="nav-card__title">Карта города</h3>
              <p class="nav-card__desc">Интерактивная карта чиновников города NN</p>
            </a>
            <a href="#landowner-map" data-nav class="nav-card fade-in">
              <div class="nav-card__icon">&#127969;</div>
              <h3 class="nav-card__title">Карта помещиков</h3>
              <p class="nav-card__desc">Схема поместий, которые посещает Чичиков</p>
            </a>
            <a href="#chichikov" data-nav class="nav-card fade-in">
              <div class="nav-card__icon">&#128100;</div>
              <h3 class="nav-card__title">Чичиков</h3>
              <p class="nav-card__desc">Центральный персонаж и его связи со всеми героями</p>
            </a>
            <a href="#society" data-nav class="nav-card fade-in">
              <div class="nav-card__icon">&#127894;</div>
              <h3 class="nav-card__title">Общество</h3>
              <p class="nav-card__desc">Коллективный портрет губернской жизни</p>
            </a>
            <a href="#author" data-nav class="nav-card fade-in">
              <div class="nav-card__icon">&#9997;</div>
              <h3 class="nav-card__title">О Гоголе</h3>
              <p class="nav-card__desc">Биография автора и история создания поэмы</p>
            </a>
          </div>
        </div>
      </section>

      <section class="section section--alt">
        <div class="section__header">
          <h2 class="section__title">Помещики</h2>
          <p class="section__desc">Галерея образов, расположенных по нарастанию духовного омертвения</p>
        </div>
        <div class="container">
          <div class="grid grid--3">
            ${getLandowners().map(c => this.charCard(c)).join('')}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section__header">
          <h2 class="section__title">Чиновники города NN</h2>
          <p class="section__desc">Представители бюрократического мира поэмы</p>
        </div>
        <div class="container">
          <div class="grid grid--3">
            ${getOfficials().map(c => this.charCard(c)).join('')}
          </div>
        </div>
      </section>

      ${this.getFooter()}
    `;
  },

  charCard(c) {
    return `
      <a href="#character/${c.id}" data-nav class="char-card fade-in">
        <div class="char-card__name">${c.name}</div>
        <div class="char-card__role">${c.role}</div>
        <div class="char-card__desc">${c.shortDesc}</div>
        <div class="char-card__chapter">Глава ${c.chapter}</div>
      </a>
    `;
  },

  // ========== СТРАНИЦА ТЕКСТА ==========
  renderText(scrollToChapter, scrollToParagraph) {
    const toc = TEXT_CHAPTERS.map(ch => `
      <li class="text-page__toc-item">
        <a href="#" onclick="event.preventDefault(); document.getElementById('ch-${ch.number}').scrollIntoView({behavior:'smooth'})">
          <span>${ch.number}</span>${ch.title}
        </a>
      </li>
    `).join('');

    const chapters = TEXT_CHAPTERS.map(ch => `
      <div class="chapter" id="ch-${ch.number}">
        <h2 class="chapter__title">${ch.title}</h2>
        <p class="chapter__summary">${ch.summary}</p>
        <div class="chapter__text">
          ${ch.paragraphs.map((p, i) => {
            if (i === 0 && p.length > 5) {
              // Буквица: ищем первую букву (на случай, если начинается с кавычки/тире)
              const m = p.match(/^([^A-Za-zА-Яа-яЁё]*)([A-Za-zА-Яа-яЁё])(.*)$/);
              if (m) {
                return `<p id="ch${ch.number}-p${i}" class="chapter__first-p">${m[1]}<span class="drop-cap">${m[2]}</span>${m[3]}</p>`;
              }
            }
            return `<p id="ch${ch.number}-p${i}">${p}</p>`;
          }).join('')}
        </div>
        <div class="chapter__divider">&bull; &bull; &bull;</div>
      </div>
    `).join('');

    this.root.innerHTML = `
      ${this.getNav()}
      <div class="text-page">
        <div class="text-page__toc">
          <h2 class="text-page__toc-title">Оглавление</h2>
          <ul class="text-page__toc-list">${toc}</ul>
        </div>
        ${chapters}
      </div>
      ${this.getFooter()}
      <div class="text-panel__overlay" id="panelOverlay"></div>
      <div class="text-panel" id="textPanel">
        <div class="text-panel__header">
          <span class="text-panel__title" id="panelTitle"></span>
          <button class="text-panel__close" onclick="APP.closePanel()">&times;</button>
        </div>
        <div class="text-panel__body" id="panelBody"></div>
      </div>
    `;

    if (scrollToChapter) {
      setTimeout(() => {
        // Если указан индекс абзаца — прокрутим к нему и подсветим
        if (scrollToParagraph !== undefined) {
          const pEl = document.getElementById(`ch${scrollToChapter}-p${scrollToParagraph}`);
          if (pEl) {
            pEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            pEl.classList.add('paragraph-pulse');
            setTimeout(() => pEl.classList.remove('paragraph-pulse'), 2400);
            return;
          }
        }
        const el = document.getElementById(`ch-${scrollToChapter}`);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    }
  },

  // ========== ЗДАНИЕ НА КАРТЕ ГОРОДА ==========
  // Возвращает SVG-группу: «домик» (стены + крыша) + название + персонажи.
  // b = { x, y, w, h, title, tier: 1|2|3|'guest', chars: [{id, label, abbr}] }
  cityBuildingHTML(b) {
    const styles = {
      1: { fill: '#e3d4b3', stroke: '#6b5a47', roof: '#6b5a47', titleColor: '#3a3226', dashed: false },
      2: { fill: '#ece2cf', stroke: '#8b7355', roof: '#8b7355', titleColor: '#5a4a3a', dashed: false },
      3: { fill: '#f0e8d8', stroke: '#a89476', roof: '#a89476', titleColor: '#6b5a47', dashed: false },
      guest: { fill: '#fdf6e3', stroke: '#5a4a3a', roof: '#8b7355', titleColor: '#5a4a3a', dashed: true }
    };
    const s = styles[b.tier] || styles[3];

    const roofH = 14;
    const titleY = b.y + 22 + roofH;
    const charY = b.y + b.h - 42;
    const labelY = charY + 30;

    const chars = b.chars.map((c, i) => {
      const cx = b.x + (b.w / (b.chars.length + 1)) * (i + 1);
      const isHero = c.id === 'chichikov';
      const r = isHero ? 20 : 17;
      const fill = isHero ? '#5a4a3a' : '#8b7355';
      const abbrSize = c.abbr.length > 2 ? 9 : (c.abbr.length === 2 ? 10 : 12);
      const labelLines = c.label.length > 14 ? c.label.split(' ') : [c.label];
      const labelHTML = labelLines.map((ln, li) =>
        `<text x="${cx}" y="${labelY + li * 12}" text-anchor="middle" fill="#3a3226"
               font-size="10" font-family="sans-serif" font-weight="500">${ln}</text>`
      ).join('');
      return `
        <g class="map-point" data-char="${c.id}"
           onclick="location.hash='#character/${c.id}'"
           onmouseenter="APP.showTooltip(event, '${c.id}')"
           onmouseleave="APP.hideTooltip()">
          <circle cx="${cx}" cy="${charY}" r="${r + 5}" fill="${fill}" opacity="0.1"/>
          <circle class="map-point__circle" cx="${cx}" cy="${charY}" r="${r}" fill="${fill}"/>
          <text x="${cx}" y="${charY + 4}" text-anchor="middle" fill="#fff"
                font-size="${abbrSize}" font-weight="700">${c.abbr}</text>
          ${labelHTML}
        </g>
      `;
    }).join('');

    // Крыша — трапеция / треугольник по верху здания.
    const roofPath = `M ${b.x + 8} ${b.y + roofH}
                      L ${b.x + 18} ${b.y}
                      L ${b.x + b.w - 18} ${b.y}
                      L ${b.x + b.w - 8} ${b.y + roofH} Z`;

    const dash = s.dashed ? 'stroke-dasharray="6,4"' : '';

    // Маленький значок «звезда» для гостиницы, чтобы Чичиков выделялся семантически
    const guestStar = b.tier === 'guest'
      ? `<text x="${b.x + b.w - 14}" y="${b.y + roofH + 22}"
                text-anchor="end" fill="#c5a04d" font-size="16" font-weight="700">★</text>`
      : '';

    return `
      <g class="building-group">
        <!-- крыша -->
        <path d="${roofPath}" fill="${s.roof}" opacity="0.85"/>
        <!-- корпус здания -->
        <rect x="${b.x}" y="${b.y + roofH}" width="${b.w}" height="${b.h - roofH}" rx="4"
              fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.2" ${dash}/>
        <!-- название -->
        <text x="${b.x + b.w / 2}" y="${titleY}" text-anchor="middle"
              fill="${s.titleColor}" font-size="11.5" font-style="italic"
              font-family="Georgia" font-weight="600">${b.title}</text>
        ${guestStar}
        ${chars}
      </g>
    `;
  },

  // ========== КАРТА ГОРОДА ==========
  renderCityMap() {
    const officials = getOfficials();

    // Здания, сгруппированные по «эшелонам» власти.
    // Tier 1 — верховная власть; Tier 2 — закон/порядок; Tier 3 — служебные;
    // 'guest' — Гостиница, где остановился Чичиков.
    const buildings = [
      // Tier 1: ровно по центру, под собором
      {
        x: 290, y: 245, w: 420, h: 130, tier: 1,
        title: 'Губернский дом',
        chars: [
          { id: 'governor', label: 'Губернатор', abbr: 'Г' },
          { id: 'vice_governor', label: 'Вице-губернатор', abbr: 'ВГ' }
        ]
      },
      // Tier 2: три симметричных здания закона/порядка
      {
        x: 50, y: 415, w: 280, h: 140, tier: 2,
        title: 'Гражданская палата',
        chars: [
          { id: 'chairman', label: 'Председатель', abbr: 'Прд' },
          { id: 'kuvshinnoe_rylo', label: 'Иван Антонович', abbr: 'ИА' }
        ]
      },
      {
        x: 360, y: 415, w: 280, h: 140, tier: 2,
        title: 'Прокуратура',
        chars: [{ id: 'prosecutor', label: 'Прокурор', abbr: 'Прк' }]
      },
      {
        x: 670, y: 415, w: 280, h: 140, tier: 2,
        title: 'Полицейская часть',
        chars: [{ id: 'police_chief', label: 'Полицмейстер', abbr: 'Пл' }]
      },
      // Tier 3: пять симметричных служебных ведомств в одну линию
      {
        x: 30, y: 590, w: 180, h: 140, tier: 3,
        title: 'Городская дума',
        chars: [{ id: 'city_head', label: 'Городской глава', abbr: 'Гг' }]
      },
      {
        x: 220, y: 590, w: 180, h: 140, tier: 3,
        title: 'Почтовая контора',
        chars: [{ id: 'postmaster', label: 'Почтмейстер', abbr: 'Пч' }]
      },
      {
        x: 410, y: 590, w: 180, h: 140, tier: 3,
        title: 'Архит. правление',
        chars: [{ id: 'city_architect', label: 'Архитектор', abbr: 'Арх' }]
      },
      {
        x: 600, y: 590, w: 180, h: 140, tier: 3,
        title: 'Врачебная управа',
        chars: [{ id: 'medical_inspector', label: 'Инспектор', abbr: 'Ин' }]
      },
      {
        x: 790, y: 590, w: 180, h: 140, tier: 3,
        title: 'Казённые фабрики',
        chars: [{ id: 'factory_manager', label: 'Управляющий', abbr: 'Уф' }]
      },
      // Гостиница (отдельно, на периферии — у въезда в город)
      {
        x: 50, y: 760, w: 280, h: 140, tier: 'guest',
        title: 'Гостиница',
        chars: [{ id: 'chichikov', label: 'Чичиков', abbr: 'Ч' }]
      }
    ];

    this.root.innerHTML = `
      ${this.getNav()}
      <section class="section">
        <div class="section__header">
          <h2 class="section__title">Карта города NN</h2>
          <p class="section__desc">Стилизованный план провинциального города. Чиновники сгруппированы по своим ведомствам — от верховной власти до служебных управлений. Нажмите на персонажа, чтобы открыть его страницу.</p>
        </div>
        <div class="container">
          <div class="map-container" id="cityMap">
            <svg viewBox="0 0 1000 1020" class="map-svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="paperGrain" patternUnits="userSpaceOnUse" width="40" height="40">
                  <circle cx="2" cy="2" r="0.4" fill="#c5b8a5" opacity="0.18"/>
                  <circle cx="20" cy="22" r="0.4" fill="#c5b8a5" opacity="0.18"/>
                  <circle cx="32" cy="8" r="0.4" fill="#c5b8a5" opacity="0.18"/>
                </pattern>
              </defs>

              <!-- Фон-пергамент -->
              <rect width="1000" height="1020" fill="#f5efde" rx="12"/>
              <rect width="1000" height="1020" fill="url(#paperGrain)"/>

              <!-- Декоративная двойная рамка -->
              <rect x="14" y="14" width="972" height="992" fill="none" stroke="#b5a890" stroke-width="1.2" rx="8"/>
              <rect x="22" y="22" width="956" height="976" fill="none" stroke="#c5b8a5" stroke-width="0.6" rx="6"/>

              <!-- Заголовок -->
              <text x="500" y="58" text-anchor="middle" fill="#5a4a3a"
                    font-family="Georgia" font-style="italic" font-size="20"
                    letter-spacing="3">Планъ губернскаго города NN</text>

              <!-- Кафедральный собор -->
              <g transform="translate(500, 95)">
                <!-- центральный высокий купол -->
                <path d="M -10 60 Q -10 30, 0 14 Q 10 30, 10 60 Z"
                      fill="#8b7355" opacity="0.92"/>
                <line x1="0" y1="0" x2="0" y2="14" stroke="#8b7355" stroke-width="1.5"/>
                <line x1="-4" y1="4" x2="4" y2="4" stroke="#8b7355" stroke-width="1.5"/>
                <!-- левый купол -->
                <path d="M -34 64 Q -34 44, -26 36 Q -18 44, -18 64 Z"
                      fill="#8b7355" opacity="0.78"/>
                <line x1="-26" y1="22" x2="-26" y2="36" stroke="#8b7355" stroke-width="1.2"/>
                <line x1="-29" y1="25" x2="-23" y2="25" stroke="#8b7355" stroke-width="1.2"/>
                <!-- правый купол -->
                <path d="M 18 64 Q 18 44, 26 36 Q 34 44, 34 64 Z"
                      fill="#8b7355" opacity="0.78"/>
                <line x1="26" y1="22" x2="26" y2="36" stroke="#8b7355" stroke-width="1.2"/>
                <line x1="23" y1="25" x2="29" y2="25" stroke="#8b7355" stroke-width="1.2"/>
                <!-- основание собора -->
                <rect x="-42" y="64" width="84" height="22" fill="#e8dcc0" stroke="#8b7355" stroke-width="1"/>
                <rect x="-12" y="74" width="8" height="12" fill="#8b7355" opacity="0.3"/>
                <rect x="4" y="74" width="8" height="12" fill="#8b7355" opacity="0.3"/>
                <text y="104" text-anchor="middle" fill="#8b7355" font-size="11"
                      font-style="italic" font-family="Georgia">Кафедральный собор</text>
              </g>

              <!-- Соборная площадь — фоновая «брусчатка» под губернским домом -->
              <rect x="220" y="220" width="560" height="170" fill="#ebe1c7" opacity="0.55" rx="6"/>
              <text x="500" y="237" text-anchor="middle" fill="#a89476"
                    font-size="10" font-style="italic" font-family="Georgia"
                    letter-spacing="2">СОБОРНАЯ ПЛОЩАДЬ</text>

              <!-- Большая улица: проходит МЕЖДУ tier-2 и tier-3 -->
              <line x1="30" y1="570" x2="970" y2="570" stroke="#c5b8a5"
                    stroke-width="10" opacity="0.35"/>
              <line x1="30" y1="570" x2="970" y2="570" stroke="#a89476"
                    stroke-width="1" stroke-dasharray="16,8" opacity="0.65"/>
              <text x="55" y="565" fill="#8b7355" font-size="11.5" font-style="italic"
                    font-family="Georgia" letter-spacing="1">ул. Большая</text>

              <!-- Дворянская улица: проходит между губернским домом и tier-2 -->
              <line x1="30" y1="395" x2="970" y2="395" stroke="#c5b8a5"
                    stroke-width="7" opacity="0.32"/>
              <line x1="30" y1="395" x2="970" y2="395" stroke="#a89476"
                    stroke-width="0.8" stroke-dasharray="12,6" opacity="0.55"/>
              <text x="55" y="390" fill="#8b7355" font-size="10.5" font-style="italic"
                    font-family="Georgia" letter-spacing="1">ул. Дворянская</text>

              <!-- Торговая улица: проходит между tier-3 и нижней частью -->
              <line x1="30" y1="745" x2="970" y2="745" stroke="#c5b8a5"
                    stroke-width="7" opacity="0.32"/>
              <line x1="30" y1="745" x2="970" y2="745" stroke="#a89476"
                    stroke-width="0.8" stroke-dasharray="12,6" opacity="0.55"/>
              <text x="55" y="740" fill="#8b7355" font-size="10.5" font-style="italic"
                    font-family="Georgia" letter-spacing="1">ул. Торговая</text>

              <!-- Здания с чиновниками -->
              ${buildings.map(b => this.cityBuildingHTML(b)).join('')}

              <!-- Городской сад справа от Гостиницы -->
              <g transform="translate(440, 825)">
                <circle cx="-22" cy="6" r="9" fill="#a8b598" opacity="0.7"/>
                <circle cx="0" cy="0" r="11" fill="#a8b598" opacity="0.75"/>
                <circle cx="22" cy="6" r="9" fill="#a8b598" opacity="0.7"/>
                <circle cx="-10" cy="14" r="7" fill="#8a9a78" opacity="0.6"/>
                <circle cx="14" cy="14" r="7" fill="#8a9a78" opacity="0.6"/>
                <line x1="-22" y1="14" x2="-22" y2="22" stroke="#6b5a47" stroke-width="1"/>
                <line x1="0" y1="10" x2="0" y2="22" stroke="#6b5a47" stroke-width="1"/>
                <line x1="22" y1="14" x2="22" y2="22" stroke="#6b5a47" stroke-width="1"/>
                <text y="44" text-anchor="middle" fill="#7a8a72" font-size="11"
                      font-style="italic" font-family="Georgia">Городской сад</text>
              </g>

              <!-- Стрелка-дорога: путь Чичикова от въезда в город к Гостинице -->
              <path d="M 30 870 Q 70 855, 130 855" fill="none"
                    stroke="#8b7355" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.6"/>
              <text x="35" y="888" fill="#8b7355" font-size="10"
                    font-style="italic" font-family="Georgia">въезд в город →</text>

              <!-- Река: изгибается у нижнего края, после Торговой улицы и зданий tier-3 -->
              <path d="M 35 935 Q 220 920, 405 935 T 790 930 Q 880 925, 965 940"
                    fill="none" stroke="#a8c2d2" stroke-width="9" opacity="0.55"/>
              <path d="M 35 935 Q 220 920, 405 935 T 790 930 Q 880 925, 965 940"
                    fill="none" stroke="#7a9aaf" stroke-width="0.9" opacity="0.7"/>
              <text x="855" y="927" fill="#7a9aaf" font-size="11" font-style="italic"
                    font-family="Georgia">р. Безымянка</text>

              <!-- Роза ветров -->
              <g transform="translate(945, 75)">
                <circle r="24" fill="#f5efde" stroke="#b5a890" stroke-width="1"/>
                <circle r="20" fill="none" stroke="#c5b8a5" stroke-width="0.5"/>
                <path d="M 0 -18 L 5 0 L 0 5 L -5 0 Z" fill="#5a4a3a"/>
                <path d="M 0 18 L 5 0 L 0 -5 L -5 0 Z" fill="#b5a890"/>
                <text y="-28" text-anchor="middle" fill="#5a4a3a" font-size="11"
                      font-weight="700" font-family="Georgia">С</text>
                <text y="36" text-anchor="middle" fill="#5a4a3a" font-size="11"
                      font-family="Georgia">Ю</text>
              </g>

              <!-- Подпись внизу — внутри рамки -->
              <text x="500" y="985" text-anchor="middle" fill="#a89476"
                    font-size="11" font-style="italic" font-family="Georgia">
                «Городъ никакъ не уступалъ другимъ губернскимъ городамъ»
              </text>
            </svg>
            <div class="map-tooltip" id="mapTooltip">
              <div class="map-tooltip__name"></div>
              <div class="map-tooltip__role"></div>
            </div>
          </div>

          <div class="map-legend">
            <div class="map-legend__item">
              <span class="map-legend__swatch" style="background:#e3d4b3;border-color:#6b5a47"></span>
              <span>Верховная власть — губернатор и вице-губернатор</span>
            </div>
            <div class="map-legend__item">
              <span class="map-legend__swatch" style="background:#ece2cf;border-color:#8b7355"></span>
              <span>Закон и порядок — палата, прокуратура, полиция</span>
            </div>
            <div class="map-legend__item">
              <span class="map-legend__swatch" style="background:#f0e8d8;border-color:#a89476"></span>
              <span>Служебные ведомства — почта, дума, управы, фабрики</span>
            </div>
            <div class="map-legend__item">
              <span class="map-legend__swatch" style="background:#fdf6e3;border-color:#5a4a3a;border-style:dashed"></span>
              <span><strong>★ Гостиница</strong> — где остановился Чичиков (въезд в город)</span>
            </div>
          </div>
        </div>
      </section>

      <section class="section section--alt">
        <div class="section__header">
          <h2 class="section__title">Чиновники</h2>
        </div>
        <div class="container">
          <div class="grid grid--3">
            ${officials.map(c => this.charCard(c)).join('')}
          </div>
        </div>
      </section>
      ${this.getFooter()}
    `;
  },

  // ========== ИКОНКИ-СИЛУЭТЫ ПОМЕСТИЙ ==========
  // Каждая усадьба прорисована стилизованно — по характеру помещика.
  estateIconHTML(id, x, y) {
    const icons = {
      // Маниловка: дом на холме + «храм уединённого размышления» + дерево
      manilov: `
        <g transform="translate(${x},${y})">
          <!-- холм -->
          <path d="M -60 30 Q -30 -5, 0 -2 Q 30 -8, 60 30 Z"
                fill="#c8d4b8" opacity="0.55"/>
          <!-- основной дом -->
          <rect x="-22" y="-18" width="44" height="22" fill="#e8dcc0" stroke="#8b7355" stroke-width="1"/>
          <path d="M -26 -18 L 0 -32 L 26 -18 Z" fill="#a89476" stroke="#8b7355" stroke-width="1"/>
          <rect x="-4" y="-10" width="8" height="14" fill="#8b7355" opacity="0.4"/>
          <!-- «храм уединённого размышления» -->
          <g transform="translate(38, -4)">
            <rect x="-8" y="-2" width="16" height="10" fill="#f0e8d8" stroke="#a89476" stroke-width="0.8"/>
            <path d="M -10 -2 L 0 -10 L 10 -2 Z" fill="#a89476" opacity="0.7"/>
          </g>
          <!-- одинокое дерево (сентиментальный пейзаж) -->
          <g transform="translate(-42, -6)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#8b7355" stroke-width="1"/>
            <circle cx="0" cy="-3" r="5" fill="#a8b598" opacity="0.7"/>
          </g>
        </g>
      `,
      // Коробочка: россыпь домиков + курицы (изобилие птицы)
      korobochka: `
        <g transform="translate(${x},${y})">
          <!-- огород-двор -->
          <ellipse cx="0" cy="20" rx="65" ry="14" fill="#dce4cc" opacity="0.5"/>
          <!-- центральный дом -->
          <rect x="-16" y="-15" width="32" height="20" fill="#e8dcc0" stroke="#8b7355" stroke-width="1"/>
          <path d="M -19 -15 L 0 -28 L 19 -15 Z" fill="#a89476" stroke="#8b7355" stroke-width="1"/>
          <rect x="-3" y="-8" width="6" height="13" fill="#8b7355" opacity="0.4"/>
          <!-- хозяйственные постройки -->
          <rect x="-50" y="-2" width="22" height="14" fill="#e0d4b8" stroke="#a89476" stroke-width="0.8"/>
          <path d="M -52 -2 L -39 -10 L -26 -2 Z" fill="#a89476" opacity="0.7"/>
          <rect x="28" y="-4" width="20" height="16" fill="#e0d4b8" stroke="#a89476" stroke-width="0.8"/>
          <path d="M 26 -4 L 38 -12 L 50 -4 Z" fill="#a89476" opacity="0.7"/>
          <!-- куры (значки) -->
          <circle cx="-32" cy="22" r="2.5" fill="#8b7355"/>
          <circle cx="-25" cy="24" r="2.5" fill="#a89476"/>
          <circle cx="18" cy="23" r="2.5" fill="#8b7355"/>
          <circle cx="26" cy="25" r="2.5" fill="#a89476"/>
          <circle cx="6" cy="26" r="2.5" fill="#8b7355"/>
        </g>
      `,
      // Ноздрёв: беспорядочное хозяйство + конура (псарня — гордость хозяина)
      nozdryov: `
        <g transform="translate(${x},${y})">
          <!-- двор -->
          <ellipse cx="0" cy="20" rx="65" ry="13" fill="#d8d0bc" opacity="0.5"/>
          <!-- покосившийся дом -->
          <g transform="rotate(-3)">
            <rect x="-20" y="-16" width="40" height="22" fill="#e8dcc0" stroke="#8b7355" stroke-width="1"/>
            <path d="M -24 -16 L 0 -30 L 24 -16 Z" fill="#a89476" stroke="#8b7355" stroke-width="1"/>
            <rect x="-3" y="-8" width="6" height="14" fill="#8b7355" opacity="0.4"/>
            <!-- сломанный забор -->
            <line x1="-32" y1="6" x2="-32" y2="14" stroke="#8b7355" stroke-width="1.2"/>
            <line x1="-26" y1="2" x2="-26" y2="14" stroke="#8b7355" stroke-width="1.2"/>
            <line x1="26" y1="6" x2="26" y2="14" stroke="#8b7355" stroke-width="1.2"/>
          </g>
          <!-- псарня -->
          <g transform="translate(38, -2)">
            <rect x="-9" y="-4" width="18" height="14" fill="#c8b89c" stroke="#8b7355" stroke-width="0.8"/>
            <path d="M -11 -4 L 0 -12 L 11 -4 Z" fill="#8b7355"/>
            <circle cx="0" cy="3" r="3" fill="#3a3226"/>
          </g>
          <!-- собака рядом -->
          <ellipse cx="-38" cy="14" rx="6" ry="3" fill="#8b7355"/>
          <circle cx="-44" cy="11" r="2.5" fill="#8b7355"/>
        </g>
      `,
      // Собакевич: тяжёлая, основательная «медвежья» постройка
      sobakevich: `
        <g transform="translate(${x},${y})">
          <!-- основание -->
          <rect x="-50" y="18" width="100" height="4" fill="#a89476"/>
          <!-- мощный дом -->
          <rect x="-32" y="-22" width="64" height="42" fill="#d8c8a8" stroke="#6b5a47" stroke-width="2"/>
          <path d="M -36 -22 L 0 -42 L 36 -22 Z" fill="#6b5a47" stroke="#3a3226" stroke-width="1.5"/>
          <!-- маленькие, надёжные окна -->
          <rect x="-22" y="-12" width="8" height="10" fill="#8b7355" opacity="0.5"/>
          <rect x="-4" y="-12" width="8" height="10" fill="#8b7355" opacity="0.5"/>
          <rect x="14" y="-12" width="8" height="10" fill="#8b7355" opacity="0.5"/>
          <!-- крепкая дверь -->
          <rect x="-6" y="2" width="12" height="18" fill="#3a3226"/>
          <!-- толстые брёвна по сторонам -->
          <circle cx="-44" cy="10" r="6" fill="#8b7355"/>
          <circle cx="-44" cy="-2" r="6" fill="#8b7355"/>
          <circle cx="44" cy="10" r="6" fill="#8b7355"/>
          <circle cx="44" cy="-2" r="6" fill="#8b7355"/>
        </g>
      `,
      // Плюшкин: разрушенный, обветшалый дом
      plyushkin: `
        <g transform="translate(${x},${y})">
          <!-- мёртвая земля -->
          <ellipse cx="0" cy="22" rx="70" ry="12" fill="#c8c0a8" opacity="0.4"/>
          <!-- обветшавший дом с пробитой крышей -->
          <rect x="-26" y="-18" width="52" height="24" fill="#d8c8a8" stroke="#6b5a47" stroke-width="1" opacity="0.85"/>
          <!-- разваленная крыша -->
          <path d="M -30 -18 L -12 -32 L -4 -26 L 4 -32 L 14 -22 L 22 -30 L 30 -18 Z"
                fill="#8b7355" stroke="#3a3226" stroke-width="1"/>
          <!-- заколоченные окна -->
          <rect x="-18" y="-10" width="8" height="10" fill="#3a3226"/>
          <line x1="-19" y1="-7" x2="-9" y2="-2" stroke="#a89476" stroke-width="1"/>
          <rect x="-2" y="-10" width="8" height="10" fill="#3a3226"/>
          <line x1="-3" y1="-2" x2="7" y2="-7" stroke="#a89476" stroke-width="1"/>
          <rect x="14" y="-10" width="8" height="10" fill="#3a3226"/>
          <!-- куча хлама перед домом -->
          <circle cx="-38" cy="14" r="3" fill="#8b7355" opacity="0.6"/>
          <circle cx="-32" cy="17" r="2" fill="#a89476" opacity="0.5"/>
          <circle cx="-25" cy="15" r="3" fill="#8b7355" opacity="0.6"/>
          <circle cx="36" cy="16" r="3" fill="#6b5a47" opacity="0.6"/>
          <circle cx="42" cy="13" r="2" fill="#8b7355" opacity="0.6"/>
          <!-- одинокое сухое дерево -->
          <g transform="translate(40, -8)">
            <line x1="0" y1="0" x2="0" y2="22" stroke="#6b5a47" stroke-width="1.5"/>
            <line x1="0" y1="4" x2="-6" y2="-2" stroke="#6b5a47" stroke-width="1"/>
            <line x1="0" y1="8" x2="6" y2="2" stroke="#6b5a47" stroke-width="1"/>
            <line x1="0" y1="12" x2="-4" y2="6" stroke="#6b5a47" stroke-width="1"/>
          </g>
        </g>
      `
    };
    return icons[id] || '';
  },

  // ========== КАРТА ПОМЕЩИКОВ ==========
  renderLandownerMap() {
    const landowners = getLandowners();

    // Точки на маршруте: координаты подобраны так,
    // чтобы дорога образовала естественную петлю Чичикова.
    const estates = [
      { id: 'manilov',    x: 220, y: 200, order: 1, estate: 'Маниловка',         name: 'Манилов' },
      { id: 'korobochka', x: 820, y: 200, order: 2, estate: 'Деревня Коробочки', name: 'Коробочка' },
      { id: 'nozdryov',   x: 720, y: 360, order: 3, estate: 'Усадьба Ноздрёва',  name: 'Ноздрёв' },
      { id: 'sobakevich', x: 220, y: 480, order: 4, estate: 'Имение Собакевича', name: 'Собакевич' },
      { id: 'plyushkin',  x: 720, y: 580, order: 5, estate: 'Деревня Плюшкина',  name: 'Плюшкин' }
    ];

    // Город NN — точка отправления маршрута
    const cityX = 470, cityY = 100;

    // Дорога: плавная кривая через все усадьбы в порядке визитов
    const pathPoints = [{ x: cityX, y: cityY }, ...estates.map(e => ({ x: e.x, y: e.y }))];
    const roadPath = this.buildRoadPath(pathPoints);

    this.root.innerHTML = `
      ${this.getNav()}
      <section class="section">
        <div class="section__header">
          <h2 class="section__title">Карта помещиков</h2>
          <p class="section__desc">Стилизованная карта местности с маршрутом Чичикова. Усадьбы пронумерованы в порядке визитов и нарисованы в соответствии с характером каждого помещика — от сентиментального до разрушенного.</p>
        </div>
        <div class="container">
          <div class="map-container" id="landownerMap">
            <svg viewBox="0 0 1000 700" class="map-svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="landGrain" patternUnits="userSpaceOnUse" width="60" height="60">
                  <circle cx="10" cy="10" r="0.4" fill="#a8b598" opacity="0.25"/>
                  <circle cx="40" cy="35" r="0.4" fill="#a8b598" opacity="0.25"/>
                  <circle cx="22" cy="48" r="0.4" fill="#a8b598" opacity="0.25"/>
                </pattern>
              </defs>

              <!-- Фон-местность -->
              <rect width="1000" height="700" fill="#f3eed7" rx="12"/>
              <rect width="1000" height="700" fill="url(#landGrain)"/>

              <!-- Декоративная двойная рамка -->
              <rect x="14" y="14" width="972" height="672" fill="none" stroke="#b5a890" stroke-width="1.2" rx="8"/>
              <rect x="22" y="22" width="956" height="656" fill="none" stroke="#c5b8a5" stroke-width="0.6" rx="6"/>

              <!-- Заголовок -->
              <text x="500" y="58" text-anchor="middle" fill="#5a4a3a"
                    font-family="Georgia" font-style="italic" font-size="20"
                    letter-spacing="3">Маршрутъ Павла Ивановича</text>

              <!-- Стилизованные холмы фона -->
              <path d="M 0 540 Q 200 510, 400 545 T 700 540 Q 850 530, 1000 555 L 1000 700 L 0 700 Z"
                    fill="#dce4cc" opacity="0.45"/>
              <path d="M 0 620 Q 250 600, 500 625 T 1000 620 L 1000 700 L 0 700 Z"
                    fill="#c8d4b8" opacity="0.4"/>

              <!-- Лесные массивы (точечная штриховка) -->
              <g opacity="0.5" fill="#8b9a78">
                <circle cx="80" cy="320" r="6"/>
                <circle cx="90" cy="330" r="5"/>
                <circle cx="100" cy="320" r="7"/>
                <circle cx="110" cy="335" r="5"/>
                <circle cx="120" cy="325" r="6"/>
                <circle cx="60" cy="395" r="6"/>
                <circle cx="72" cy="405" r="5"/>
                <circle cx="84" cy="395" r="7"/>
                <circle cx="945" cy="420" r="6"/>
                <circle cx="955" cy="430" r="5"/>
                <circle cx="935" cy="430" r="6"/>
                <circle cx="940" cy="445" r="5"/>
                <circle cx="455" cy="295" r="5"/>
                <circle cx="468" cy="305" r="6"/>
                <circle cx="478" cy="295" r="5"/>
              </g>

              <!-- Дорога — толстая фоновая линия + пунктир сверху -->
              <path d="${roadPath}" fill="none" stroke="#d8ccb0" stroke-width="14" stroke-linecap="round"/>
              <path d="${roadPath}" fill="none" stroke="#8b7355" stroke-width="1.5"
                    stroke-dasharray="10,7" stroke-linecap="round"/>

              <!-- Город NN — точка отправления -->
              <g transform="translate(${cityX}, ${cityY})">
                <!-- упрощённый силуэт города -->
                <rect x="-50" y="-8" width="100" height="32" fill="#e8dcc0" stroke="#8b7355" stroke-width="1.2" rx="3"/>
                <!-- купола -->
                <path d="M -12 -8 Q -12 -22, -4 -28 Q 4 -22, 4 -8 Z" fill="#8b7355"/>
                <line x1="-4" y1="-32" x2="-4" y2="-28" stroke="#8b7355" stroke-width="1"/>
                <line x1="-7" y1="-30" x2="-1" y2="-30" stroke="#8b7355" stroke-width="1"/>
                <path d="M 18 -8 Q 18 -16, 24 -20 Q 30 -16, 30 -8 Z" fill="#8b7355" opacity="0.75"/>
                <path d="M -34 -8 Q -34 -16, -28 -20 Q -22 -16, -22 -8 Z" fill="#8b7355" opacity="0.75"/>
                <!-- окошки -->
                <rect x="-44" y="2" width="6" height="8" fill="#8b7355" opacity="0.5"/>
                <rect x="-30" y="2" width="6" height="8" fill="#8b7355" opacity="0.5"/>
                <rect x="36" y="2" width="6" height="8" fill="#8b7355" opacity="0.5"/>
                <text y="44" text-anchor="middle" fill="#5a4a3a" font-size="13"
                      font-style="italic" font-weight="600" font-family="Georgia">Город NN</text>
                <text y="58" text-anchor="middle" fill="#8b7355" font-size="10"
                      font-style="italic" font-family="Georgia">отправление</text>
              </g>

              <!-- Чичиков (фигурка-бричка рядом с городом) -->
              <g class="map-point" data-char="chichikov"
                 onclick="location.hash='#character/chichikov'"
                 onmouseenter="APP.showTooltip(event, 'chichikov')"
                 onmouseleave="APP.hideTooltip()"
                 transform="translate(${cityX + 105}, ${cityY + 15})">
                <circle r="22" fill="#5a4a3a" opacity="0.1"/>
                <circle class="map-point__circle" r="18" fill="#5a4a3a"/>
                <text y="4" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">Ч</text>
                <text y="36" text-anchor="middle" fill="#5a4a3a" font-size="11"
                      font-weight="600" font-family="sans-serif">Чичиков</text>
              </g>

              <!-- Усадьбы с иконками -->
              ${estates.map(e => `
                <g class="map-point" data-char="${e.id}"
                   onclick="location.hash='#character/${e.id}'"
                   onmouseenter="APP.showTooltip(event, '${e.id}')"
                   onmouseleave="APP.hideTooltip()">
                  <!-- иконка усадьбы -->
                  ${this.estateIconHTML(e.id, e.x, e.y)}

                  <!-- номер визита (медальон) -->
                  <g transform="translate(${e.x - 80}, ${e.y - 30})">
                    <circle r="18" fill="#5a4a3a"/>
                    <circle r="14" fill="none" stroke="#fff" stroke-width="1.2"/>
                    <text y="5" text-anchor="middle" fill="#fff" font-size="15"
                          font-weight="700" font-family="Georgia">${e.order}</text>
                  </g>

                  <!-- надпись усадьбы -->
                  <text x="${e.x}" y="${e.y + 55}" text-anchor="middle" fill="#5a4a3a"
                        font-size="13" font-weight="700" font-family="Georgia">${e.name}</text>
                  <text x="${e.x}" y="${e.y + 71}" text-anchor="middle" fill="#8b7355"
                        font-size="10" font-style="italic" font-family="Georgia">${e.estate}</text>
                </g>
              `).join('')}

              <!-- Роза ветров -->
              <g transform="translate(945, 62)">
                <circle r="22" fill="#f3eed7" stroke="#b5a890" stroke-width="1"/>
                <path d="M 0 -16 L 4 0 L 0 4 L -4 0 Z" fill="#5a4a3a"/>
                <path d="M 0 16 L 4 0 L 0 -4 L -4 0 Z" fill="#b5a890"/>
                <text y="-26" text-anchor="middle" fill="#5a4a3a" font-size="10"
                      font-weight="700">С</text>
                <text y="34" text-anchor="middle" fill="#5a4a3a" font-size="10">Ю</text>
              </g>

              <!-- Подпись внизу -->
              <text x="500" y="678" text-anchor="middle" fill="#a89476"
                    font-size="11" font-style="italic" font-family="Georgia">
                «Порядокъ визитовъ отражаетъ нарастание духовнаго омертвения»
              </text>
            </svg>
            <div class="map-tooltip" id="mapTooltip">
              <div class="map-tooltip__name"></div>
              <div class="map-tooltip__role"></div>
            </div>
          </div>

          <div class="map-legend">
            <div class="map-legend__item">
              <span class="map-legend__badge">1</span>
              <span><strong>Манилов</strong> — пустая мечтательность</span>
            </div>
            <div class="map-legend__item">
              <span class="map-legend__badge">2</span>
              <span><strong>Коробочка</strong> — мелочная скупость</span>
            </div>
            <div class="map-legend__item">
              <span class="map-legend__badge">3</span>
              <span><strong>Ноздрёв</strong> — буйное расточительство</span>
            </div>
            <div class="map-legend__item">
              <span class="map-legend__badge">4</span>
              <span><strong>Собакевич</strong> — грубый материализм</span>
            </div>
            <div class="map-legend__item">
              <span class="map-legend__badge">5</span>
              <span><strong>Плюшкин</strong> — крайнее омертвение</span>
            </div>
          </div>
        </div>
      </section>

      <section class="section section--alt">
        <div class="section__header">
          <h2 class="section__title">Помещики</h2>
        </div>
        <div class="container">
          <div class="grid grid--3">
            ${landowners.map(c => this.charCard(c)).join('')}
          </div>
        </div>
      </section>
      ${this.getFooter()}
    `;
  },

  // ========== ПЛАВНАЯ ДОРОГА ЧЕРЕЗ ТОЧКИ ==========
  // Строит SVG path через массив точек, используя кубические кривые Безье
  // для естественного, «извилистого» вида дороги.
  buildRoadPath(points) {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      // контрольные точки — смещены от середины отрезка
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      const offset = Math.abs(p1.x - p0.x) * 0.15 + Math.abs(p1.y - p0.y) * 0.15;
      const c1x = (p0.x + midX) / 2;
      const c1y = p0.y + (i % 2 === 0 ? offset : -offset);
      const c2x = (midX + p1.x) / 2;
      const c2y = p1.y - (i % 2 === 0 ? offset : -offset);
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1.x} ${p1.y}`;
    }
    return d;
  },

  // ========== ЧИЧИКОВ ==========
  renderChichikov() {
    const c = getCharacter('chichikov');
    this.root.innerHTML = `
      ${this.getNav()}
      <div class="char-page">
        <div class="char-page__hero">
          <div class="char-page__portrait">
            ${this.portraitHTML(c)}
          </div>
          <div class="char-page__intro">
            <div class="char-page__type">Главный герой</div>
            <h1 class="char-page__name">${c.name}</h1>
            <div class="char-page__role">${c.role}</div>
            <p class="char-page__desc">${c.fullDesc}</p>
          </div>
        </div>

        <div class="char-section">
          <h2 class="char-section__title">Связи с персонажами</h2>
          <div class="chichikov-hub">
            <a href="#city-map" data-nav class="chichikov-hub__card fade-in">
              <div class="chichikov-hub__card-title">&#127963; Карта города</div>
              <div class="chichikov-hub__card-desc">Чичиков и чиновники города NN — от губернатора до полицеймейстера</div>
            </a>
            <a href="#landowner-map" data-nav class="chichikov-hub__card fade-in">
              <div class="chichikov-hub__card-title">&#127969; Карта помещиков</div>
              <div class="chichikov-hub__card-desc">Маршрут Чичикова: от Манилова до Плюшкина</div>
            </a>
            <a href="#text" data-nav class="chichikov-hub__card fade-in">
              <div class="chichikov-hub__card-title">&#128214; Оригинальный текст</div>
              <div class="chichikov-hub__card-desc">Текст поэмы с делением на главы</div>
            </a>
            <a href="#society" data-nav class="chichikov-hub__card fade-in">
              <div class="chichikov-hub__card-title">&#127894; Общество</div>
              <div class="chichikov-hub__card-desc">Коллективный портрет губернии, в котором действует Чичиков</div>
            </a>
          </div>
        </div>

        <div class="char-section">
          <h2 class="char-section__title">Цитатная характеристика</h2>
          ${c.quotes.map(q => `
            <div class="quote-card" onclick="APP.openQuotePanel(${JSON.stringify(q).replace(/"/g, '&quot;')})">
              <div class="quote-card__text">${q.text}</div>
              <div class="quote-card__explanation">${q.explanation}</div>
              <div class="quote-card__hint">&#8594; Показать в тексте</div>
            </div>
          `).join('')}
        </div>

        <div class="char-section">
          <h2 class="char-section__title">Значение образа</h2>
          <div class="meaning-block">${c.meaning}</div>
        </div>

        <div class="char-section">
          <h2 class="char-section__title">Персонажи, связанные с Чичиковым</h2>
          <div class="grid grid--2">
            ${[...getLandowners().slice(0, 4), ...getOfficials().slice(0, 2)].map(ch => this.charCard(ch)).join('')}
          </div>
        </div>
      </div>

      ${this.getFooter()}

      <div class="text-panel__overlay" id="panelOverlay"></div>
      <div class="text-panel" id="textPanel">
        <div class="text-panel__header">
          <span class="text-panel__title" id="panelTitle"></span>
          <button class="text-panel__close" onclick="APP.closePanel()">&times;</button>
        </div>
        <div class="text-panel__body" id="panelBody"></div>
      </div>
    `;
  },

  // ========== СТРАНИЦА ПЕРСОНАЖА ==========
  renderCharacter(id) {
    const c = getCharacter(id);
    if (!c) return this.renderHome();

    const typeLabel = c.type === 'landowner' ? 'Помещик' : c.type === 'official' ? 'Чиновник' : 'Главный герой';
    const backLink = c.type === 'landowner' ? '#landowner-map' : c.type === 'official' ? '#city-map' : '#home';
    const backLabel = c.type === 'landowner' ? 'Карта помещиков' : c.type === 'official' ? 'Карта города' : 'Главная';

    if (id === 'chichikov') return this.renderChichikov();

    this.root.innerHTML = `
      ${this.getNav()}
      <div class="char-page">
        <a href="${backLink}" data-nav class="char-page__back">&#8592; ${backLabel}</a>

        <div class="char-page__hero">
          <div class="char-page__portrait">
            ${this.portraitHTML(c)}
          </div>
          <div class="char-page__intro">
            <div class="char-page__type">${typeLabel} &middot; Глава ${c.chapter}</div>
            <h1 class="char-page__name">${c.name}</h1>
            <div class="char-page__role">${c.role}</div>
            <p class="char-page__desc">${c.fullDesc}</p>
          </div>
        </div>

        ${c.details ? this.detailsTableHTML(c.details) : ''}

        <div class="char-section">
          <h2 class="char-section__title">Цитатная характеристика</h2>
          ${c.quotes.map(q => `
            <div class="quote-card" onclick="APP.openQuotePanel(${JSON.stringify(q).replace(/"/g, '&quot;')})">
              <div class="quote-card__text">${q.text}</div>
              <div class="quote-card__explanation">${q.explanation}</div>
              <div class="quote-card__hint">&#8594; Показать в тексте</div>
            </div>
          `).join('')}
        </div>

        <div class="char-section">
          <h2 class="char-section__title">Значение образа</h2>
          <div class="meaning-block">${c.meaning}</div>
        </div>
      </div>

      ${this.getFooter()}

      <div class="text-panel__overlay" id="panelOverlay"></div>
      <div class="text-panel" id="textPanel">
        <div class="text-panel__header">
          <span class="text-panel__title" id="panelTitle"></span>
          <button class="text-panel__close" onclick="APP.closePanel()">&times;</button>
        </div>
        <div class="text-panel__body" id="panelBody"></div>
      </div>
    `;
  },

  // ========== ПОРТРЕТ ==========
  portraitHTML(c) {
    const initial = c.name.charAt(0);
    // У чиновников портрет общий — подпись с именем не нужна,
    // поскольку имя уже есть в заголовке страницы.
    const caption = c.type === 'official'
      ? ''
      : `<div class="portrait__caption">${c.name}</div>`;
    return `
      <div class="portrait">
        <div class="portrait__placeholder">${initial}</div>
        <img class="portrait__img" src="${c.portrait}" alt="${c.name}"
             onerror="this.style.display='none'"
             onload="this.classList.add('portrait__img--loaded')"/>
      </div>
      ${caption}
    `;
  },

  // ========== ТАБЛИЦА ДЕТАЛЕЙ ПОМЕЩИКА ==========
  detailsTableHTML(details) {
    const rows = [
      { label: 'Портрет', key: 'portrait', icon: '&#9786;' },
      { label: 'Характер', key: 'character', icon: '&#9775;' },
      { label: 'Поместье', key: 'estate', icon: '&#127969;' },
      { label: 'Быт', key: 'lifestyle', icon: '&#127869;' },
      { label: 'Отношение к хозяйству', key: 'economy', icon: '&#128181;' },
      { label: 'Отношение к крепостным', key: 'serfs', icon: '&#128101;' },
      { label: 'Реакция на предложение Чичикова', key: 'chichikovReaction', icon: '&#128221;' }
    ];
    const items = rows
      .filter(r => details[r.key])
      .map(r => `
        <div class="details-row">
          <div class="details-row__label">
            <span class="details-row__icon">${r.icon}</span>
            <span>${r.label}</span>
          </div>
          <div class="details-row__content">${details[r.key]}</div>
        </div>
      `).join('');
    return `
      <div class="char-section">
        <h2 class="char-section__title">Подробная характеристика</h2>
        <div class="details-table">${items}</div>
      </div>
    `;
  },

  // ========== ОБЩЕСТВО ==========
  renderSociety() {
    const s = SOCIETY;
    this.root.innerHTML = `
      ${this.getNav()}
      <div class="char-page">
        <div class="char-page__header">
          <div class="char-page__type">Коллективный образ</div>
          <h1 class="char-page__name">${s.title}</h1>
          <div class="char-page__role">${s.subtitle}</div>
          <p class="char-page__desc">${s.intro}</p>
        </div>

        ${s.sections.map(section => `
          <div class="char-section">
            <h2 class="char-section__title">${section.title}</h2>
            <div class="meaning-block">${section.content}</div>
          </div>
        `).join('')}

        <div class="char-section">
          <h2 class="char-section__title">Цитатная характеристика общества</h2>
          ${s.quotes.map(q => `
            <div class="quote-card" onclick="APP.openQuotePanel(${JSON.stringify(q).replace(/"/g, '&quot;')})">
              <div class="quote-card__text">${q.text}</div>
              <div class="quote-card__explanation">${q.explanation}</div>
              <div class="quote-card__hint">&#8594; Показать в тексте</div>
            </div>
          `).join('')}
        </div>
      </div>

      ${this.getFooter()}

      <div class="text-panel__overlay" id="panelOverlay"></div>
      <div class="text-panel" id="textPanel">
        <div class="text-panel__header">
          <span class="text-panel__title" id="panelTitle"></span>
          <button class="text-panel__close" onclick="APP.closePanel()">&times;</button>
        </div>
        <div class="text-panel__body" id="panelBody"></div>
      </div>
    `;
  },

  // ========== КРАТКОЕ СОДЕРЖАНИЕ ==========
  renderSummary() {
    const p = PLOT_SUMMARIES;
    this.root.innerHTML = `
      ${this.getNav()}
      <div class="text-page">
        <div class="char-page__header">
          <div class="char-page__type">Пересказ</div>
          <h1 class="char-page__name">${p.title}</h1>
          <p class="char-page__desc">${p.intro}</p>
        </div>

        ${p.chapters.map(ch => `
          <div class="summary-chapter fade-in" id="sum-${ch.number}">
            <div class="summary-chapter__head">
              <a href="#text/${ch.number}" data-nav class="summary-chapter__number" title="Открыть полный текст главы">${ch.number}</a>
              <div class="summary-chapter__titles">
                <h2 class="summary-chapter__title">${ch.title}</h2>
                <div class="summary-chapter__fabula">${ch.fabula}</div>
              </div>
            </div>
            <div class="summary-chapter__body">${ch.summary}</div>
            <a href="#text/${ch.number}" data-nav class="summary-chapter__link">
              &#8594; Читать полный текст главы
            </a>
          </div>
        `).join('')}
      </div>
      ${this.getFooter()}
    `;
    this._initFadeIn();
  },

  // ========== ГЛОССАРИЙ ==========
  renderGlossary() {
    const g = GLOSSARY;
    this.root.innerHTML = `
      ${this.getNav()}
      <div class="char-page">
        <div class="char-page__header">
          <div class="char-page__type">Справочник</div>
          <h1 class="char-page__name">${g.title}</h1>
          <p class="char-page__desc">${g.intro}</p>
        </div>

        ${g.groups.map(grp => `
          <div class="char-section fade-in">
            <h2 class="char-section__title">${grp.title}</h2>
            <dl class="glossary-list">
              ${grp.terms.map(t => `
                <div class="glossary-item">
                  <dt class="glossary-item__term">${t.term}</dt>
                  <dd class="glossary-item__def">${t.definition}</dd>
                </div>
              `).join('')}
            </dl>
          </div>
        `).join('')}
      </div>
      ${this.getFooter()}
    `;
    this._initFadeIn();
  },

  // ========== АНИМАЦИЯ ПОЯВЛЕНИЯ ==========
  // Применяется к элементам с классом .fade-in: они появляются при скролле.
  _initFadeIn() {
    if (!('IntersectionObserver' in window)) {
      // fallback — просто показать всё
      document.querySelectorAll('.fade-in').forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.fade-in:not(.is-visible)').forEach(el => io.observe(el));
  },

  // ========== ОБ АВТОРЕ ==========
  renderAuthor() {
    const a = AUTHOR;
    this.root.innerHTML = `
      ${this.getNav()}
      <div class="char-page">
        <div class="char-page__header">
          <div class="char-page__type">Автор поэмы</div>
          <h1 class="char-page__name">${a.name}</h1>
          <div class="char-page__role">${a.dates}</div>
          <div class="author__epitaph">${a.epitaph}</div>
          <p class="char-page__desc">${a.intro}</p>
        </div>

        ${a.sections.map(s => `
          <div class="char-section">
            <h2 class="char-section__title">${s.title}</h2>
            <div class="meaning-block">${s.content}</div>
          </div>
        `).join('')}

        <div class="char-section">
          <h2 class="char-section__title">Хронология жизни</h2>
          <div class="timeline">
            ${a.timeline.map(t => `
              <div class="timeline__row fade-in">
                <div class="timeline__year">${t.year}</div>
                <div class="timeline__event">${t.event}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="char-section">
          <h2 class="char-section__title">Дальнейшее чтение</h2>
          <p>Подробный список источников и литературоведческих работ о поэме см. на странице <a href="#sources" data-nav>Источники</a>.</p>
        </div>
      </div>
      ${this.getFooter()}
    `;
  },

  // ========== ИСТОЧНИКИ ==========
  renderSources() {
    const s = SOURCES;
    this.root.innerHTML = `
      ${this.getNav()}
      <div class="char-page">
        <div class="char-page__header">
          <div class="char-page__type">Библиография</div>
          <h1 class="char-page__name">${s.title}</h1>
          <p class="char-page__desc">${s.intro}</p>
        </div>

        ${s.groups.map(g => `
          <div class="char-section">
            <h2 class="char-section__title">${g.title}</h2>
            <div class="sources-list">
              ${g.items.map(item => `
                <div class="source-item fade-in">
                  <div class="source-item__cite">
                    ${item.author ? `<span class="source-item__author">${item.author}</span> ` : ''}
                    <span class="source-item__work">${item.work}</span>${item.edition ? `. <span class="source-item__edition">${item.edition}</span>` : ''}${item.publisher ? ` — <span class="source-item__publisher">${item.publisher}</span>` : ''}
                  </div>
                  ${item.note ? `<div class="source-item__note">${item.note}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}

        <div class="char-section">
          <h2 class="char-section__title">Принципы работы с материалом</h2>
          <ul class="principles-list">
            ${s.principles.map(p => `<li>${p}</li>`).join('')}
          </ul>
        </div>
      </div>
      ${this.getFooter()}
    `;
  },

  // ========== О ПРОЕКТЕ ==========
  renderAbout() {
    this.root.innerHTML = `
      ${this.getNav()}
      <div class="about">
        <h1>О проекте</h1>
        <p>Этот интерактивный сайт создан для изучения поэмы Н. В. Гоголя «Мёртвые души». Проект объединяет оригинальный текст произведения, карты персонажей и цитатные характеристики в единое пространство для исследования.</p>

        <h2>Что можно изучать на сайте</h2>
        <ul>
          <li><strong>Оригинальный текст</strong> — поэма разделена на главы с удобным оглавлением и возможностью быстрого перехода</li>
          <li><strong>Карта города</strong> — интерактивная схема города NN с чиновниками и их связями</li>
          <li><strong>Карта помещиков</strong> — маршрут Чичикова с визуализацией порядка посещений</li>
          <li><strong>Персонажи</strong> — у каждого героя есть своя страница с характеристикой и цитатами</li>
          <li><strong>Цитаты в контексте</strong> — нажатие на цитату открывает её положение в оригинальном тексте</li>
        </ul>

        <h2>Как устроена навигация</h2>
        <p>Все разделы связаны между собой. Из карт можно перейти к персонажам, из карточек персонажей — к их цитатам в тексте. Чичиков выступает центральным узлом навигации, связанным со всеми остальными разделами.</p>

        <h2>Технологии</h2>
        <p>Сайт создан на чистом HTML, CSS и JavaScript без внешних зависимостей. Данные персонажей и текста хранятся в структурированных JavaScript-объектах, что позволяет легко расширять проект.</p>

        <h2>Принципы построения</h2>
        <ul>
          <li>Помещики расположены по нарастанию духовного омертвения: от Манилова (пустая мечтательность) до Плюшкина (полная деградация)</li>
          <li>Чиновники представлены как единая система городской бюрократии</li>
          <li>Чичиков связан со всеми персонажами как зеркало, отражающее их пороки</li>
          <li>Цитаты подобраны для раскрытия ключевых черт каждого персонажа</li>
        </ul>

        <h2>Источники и автор</h2>
        <p>Подробная биография Н. В. Гоголя, история создания поэмы и хронология жизни писателя — на странице <a href="#author" data-nav>О Гоголе</a>. Полный список использованных источников и литературоведческих работ — на странице <a href="#sources" data-nav>Источники</a>.</p>
      </div>
      ${this.getFooter()}
    `;
  },

  // ========== БОКОВАЯ ПАНЕЛЬ (цитата в тексте) ==========
  openQuotePanel(quote) {
    const result = findQuoteInText(quote.text);
    const panel = document.getElementById('textPanel');
    const overlay = document.getElementById('panelOverlay');
    const title = document.getElementById('panelTitle');
    const body = document.getElementById('panelBody');

    if (result) {
      title.textContent = `${result.chapterTitle}`;
      body.innerHTML = `
        ${result.contextBeforeShort ? `<div class="text-panel__context">${result.contextBeforeShort}</div>` : ''}
        <div class="text-panel__paragraph">${result.excerptHTML || result.paragraphHTML || result.paragraph}</div>
        ${result.contextAfterShort ? `<div class="text-panel__context">${result.contextAfterShort}</div>` : ''}
        <a href="#text/${result.chapter}/${result.paragraphIndex}" data-nav class="text-panel__chapter-link" onclick="APP.closePanel()">
          &#8594; Открыть в тексте главы
        </a>
      `;
    } else {
      title.textContent = `Глава ${quote.chapter}`;
      body.innerHTML = `
        <div class="text-panel__highlight">${quote.text}</div>
        <p class="text-panel__context"><em>${quote.explanation}</em></p>
        <p class="text-panel__hint">Точное место в тексте не найдено — возможно, цитата приведена в пересказе или соответствующая глава ещё не загружена.</p>
        <a href="#text/${quote.chapter}" data-nav class="text-panel__chapter-link" onclick="APP.closePanel()">
          &#8594; Перейти к главе ${quote.chapter}
        </a>
      `;
    }

    panel.classList.add('text-panel--open');
    overlay.classList.add('text-panel__overlay--visible');
    overlay.onclick = () => this.closePanel();
    document.addEventListener('keydown', this._escHandler = (e) => {
      if (e.key === 'Escape') this.closePanel();
    });
  },

  closePanel() {
    document.getElementById('textPanel')?.classList.remove('text-panel--open');
    document.getElementById('panelOverlay')?.classList.remove('text-panel__overlay--visible');
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
    }
  },

  // ========== ТУЛТИПЫ КАРТЫ ==========
  showTooltip(event, charId) {
    const c = getCharacter(charId);
    if (!c) return;
    const tooltip = document.getElementById('mapTooltip');
    if (!tooltip) return;

    tooltip.querySelector('.map-tooltip__name').textContent = c.name;
    tooltip.querySelector('.map-tooltip__role').textContent = c.role;

    const rect = tooltip.parentElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top - 60;

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.classList.add('map-tooltip--visible');
  },

  hideTooltip() {
    document.getElementById('mapTooltip')?.classList.remove('map-tooltip--visible');
  }
};

document.addEventListener('DOMContentLoaded', () => APP.init());

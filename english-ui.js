(function () {
    'use strict';

    if (document.body?.dataset.uiLanguage !== 'en') return;

    const UI_ROOTS = [
        '.sidebar',
        '.menu-toggle',
        '.scroll-to-top',
        '.exp-bottom-nav',
        '.exp-reader-toolbar',
        '.exp-reader-footer',
        '.page-footer',
        '.search-results-panel',
        '.settings-modal',
        '.settings-notification',
        '.auth-overlay',
        '.site-toast-region',
        '.copy-toast',
        '.lightbox-overlay',
        '.sidebar-collapse-btn',
        '.sidebar-expand-btn',
        '.bookmark-btn',
        '.copy-block-btn'
    ].join(',');
    const CONTENT_EXCLUSIONS = '.english-word-list, [lang="ru"], script, style, template';

    const TEXT = new Map(Object.entries({
        'Конспекты': 'Notes',
        'Дополнительно': 'More',
        'МатЦентр': 'Math Center',
        'Ликбезы': 'Guides',
        'Меню': 'Menu',
        'Поиск': 'Search',
        'Закладки': 'Bookmarks',
        'Проверка знаний': 'Knowledge check',
        'Знания': 'Review',
        'Аккаунт': 'Account',
        'Настройки': 'Settings',
        'Настройки сайта': 'Site settings',
        'Внешний вид и поведение сайта': 'Appearance and behavior',
        'Интерфейс': 'Interface',
        'Выберите способ отображения конспектов и навигации.': 'Choose how notes and navigation are displayed.',
        'Новый': 'New',
        'Основной дизайн с перелистыванием разделов': 'Main design with section-by-section navigation',
        'Старый': 'Legacy',
        'Классическая лента со всеми разделами подряд': 'Classic continuous page with every section',
        'Цветовая система': 'Color system',
        'Акценты и общий тон основного дизайна': 'Accents and overall tone of the main design',
        'Графит': 'Graphite',
        'Нейтральная палитра без цветных акцентов': 'Neutral palette without colored accents',
        'Призма': 'Prism',
        'Спокойные цветовые акценты учебных блоков': 'Subtle color accents for learning blocks',
        'Освещение': 'Appearance',
        'Как на устройстве': 'System',
        'Светлая': 'Light',
        'Тёмная': 'Dark',
        'Темы старого дизайна': 'Legacy design themes',
        'Цветовая тема применяется только к старому интерфейсу.': 'This color theme applies only to the legacy interface.',
        'Сепия': 'Sepia',
        'Полночь': 'Midnight',
        'Новогодний вайб': 'Holiday theme',
        'Включить новогоднее настроение со снегом и украшениями': 'Enable snow and holiday decorations',
        'Дополнительные настройки снега': 'Advanced snow settings',
        'Движение интерфейса': 'Interface motion',
        'Интенсивность переходов и визуальных откликов.': 'Intensity of transitions and visual feedback.',
        'Полное': 'Full',
        'Плавные переходы и отклики': 'Smooth transitions and feedback',
        'Умеренное': 'Moderate',
        'Только основные переходы': 'Essential transitions only',
        'Минимальное': 'Minimal',
        'Без декоративного движения': 'No decorative motion',
        'Отметка решённых задач': 'Solved task marker',
        'Вид отметки «решено»': 'Solved marker style',
        'Кольцо': 'Ring',
        'Галочка с мягким обведением': 'Check mark with a subtle outline',
        'Зачёркивание': 'Strike-through',
        'Галочка и линия по номеру': 'Check mark and a line through the number',
        'Отклик курсора': 'Pointer feedback',
        'Подсветка и лёгкое движение интерактивных элементов': 'Highlight and subtle motion for interactive elements',
        'Вернуть настройки по умолчанию': 'Restore default settings',
        'Включён новый интерфейс': 'New interface enabled',
        'Включён старый интерфейс': 'Legacy interface enabled',
        'Включено полное движение интерфейса': 'Full interface motion enabled',
        'Включено умеренное движение интерфейса': 'Moderate interface motion enabled',
        'Декоративное движение отключено': 'Decorative motion disabled',
        'Отметка задач: диагональное зачёркивание': 'Task marker: diagonal strike-through',
        'Отметка задач: обведение номера': 'Task marker: number outline',
        'Отклик курсора включён': 'Pointer feedback enabled',
        'Отклик курсора выключен': 'Pointer feedback disabled',
        'Настройки применены': 'Settings applied',
        'Настройки сброшены! Страница будет перезагружена...': 'Settings restored. The page will reload…',
        'Вход в аккаунт': 'Sign in',
        'Регистрация': 'Create an account',
        'Войти через Google': 'Continue with Google',
        'или': 'or',
        'Войти': 'Sign in',
        'Зарегистрироваться': 'Create account',
        'Уже есть аккаунт? Войти': 'Already have an account? Sign in',
        'Нет аккаунта? Зарегистрироваться': 'No account yet? Create one',
        'Вы вошли': 'Signed in',
        'Выйти': 'Sign out',
        'Конструктор конспектов': 'Note editor',
        'Входим…': 'Signing in…',
        'Выходим…': 'Signing out…',
        'Завершите вход в окне Google': 'Complete sign-in in the Google window',
        'Пароли не совпадают. Проверьте оба поля.': 'Passwords do not match.',
        'Неверная почта или пароль.': 'Incorrect email or password.',
        'Эта почта уже зарегистрирована — войдите.': 'This email is already registered. Sign in instead.',
        'Пароль слишком короткий (мин. 6 символов).': 'The password must contain at least 6 characters.',
        'Некорректная почта.': 'Enter a valid email address.',
        'Этот аккаунт отключён.': 'This account has been disabled.',
        'Этот способ входа не включён в Firebase.': 'This sign-in method is unavailable.',
        'Выбрать всё': 'Select all',
        'Снять всё': 'Clear selection',
        'Учить': 'Start review',
        'Определение': 'Definition',
        'Теорема': 'Theorem',
        'Лемма': 'Lemma',
        'Утверждение': 'Statement',
        'Следствие': 'Corollary',
        'Формула': 'Formula',
        'Замечание': 'Remark',
        'Пример': 'Example',
        'Свойства': 'Properties',
        'Опыт': 'Experiment',
        'Вывод': 'Derivation',
        'Система': 'System',
        'Блок': 'Block',
        'Адаптивное повторение определений': 'Adaptive review of definitions',
        'Определения, теоремы и ключевые утверждения': 'Definitions, theorems, and key statements',
        'В выбранных разделах пока нет определений для проверки.': 'There are no definitions to review in the selected sections.',
        'В выбранных разделах пока нет формулировок для проверки.': 'There is nothing to review in the selected sections.',
        'Воспроизведите определение из раздела': 'Recall the definition from this section',
        'Сформулируйте определение': 'State the definition',
        'показать ответ': 'show answer',
        'Снова': 'Again',
        'Трудно': 'Hard',
        'Хорошо': 'Good',
        'Легко': 'Easy',
        'Новые': 'New',
        'Изучаются': 'Learning',
        'К повторению': 'Due',
        'Выберите темы': 'Select sections',
        'Алгоритм соберёт короткую сессию.': 'A short review session will be prepared.',
        'Пока нечего проверять': 'Nothing to review yet',
        'На сейчас всё': 'All caught up',
        'Повторения появятся, когда начнёт снижаться вероятность вспомнить.': 'Reviews will appear as recall probability begins to decrease.',
        'Всё повторено': 'All caught up',
        'На сегодня карточек к повторению нет. Возвращайтесь позже — расписание подскажет, когда.': 'There are no cards due today. Return later when the schedule recommends another review.',
        'Сессия завершена': 'Review complete',
        'Готово': 'Done',
        'К темам': 'Back to sections',
        'вспомнено': 'recalled',
        'до повтора': 'until next review',
        'Закладок пока нет.': 'No bookmarks yet.',
        'Нажмите': 'Select',
        'на любом блоке, чтобы добавить.': 'on any block to add it.',
        'Тяните за ручку слева, чтобы менять порядок · нажмите на карточку, чтобы раскрыть': 'Drag the handle to reorder · select a card to expand it',
        'Состав:': 'Includes:',
        'Закрыть': 'Close',
        'Удалить': 'Remove',
        'Перейти к блоку': 'Go to block',
        'Поиск по конспектам': 'Search notes',
        'Весь сайт': 'Entire site',
        'Эта страница': 'This page',
        'Ничего не найдено': 'No results',
        'Попробуйте более короткий запрос или другое написание.': 'Try a shorter query or a different spelling.',
        'Индексируем конспекты…': 'Indexing notes…',
        'Первый поиск может занять несколько секунд.': 'The first search may take a few seconds.',
        'Физика': 'Physics',
        'Химия': 'Chemistry',
        'Алгебра': 'Algebra',
        'Геометрия': 'Geometry',
        'Формулы по геометрии': 'Geometry formulas',
        'Билеты по физике': 'Physics exam',
        'Назад': 'Previous',
        'Далее': 'Next',
        'Начало конспекта': 'Start of notes',
        'Конец конспекта': 'End of notes',
        'Конспект': 'Notes',
        'Экспорт в PDF': 'Export to PDF',
        'Скопировано': 'Copied',
        'Не удалось скопировать': 'Could not copy',
        'В приватном режиме вход сохранится только до закрытия браузера.': 'In private browsing, you will remain signed in only until the browser is closed.',
        'Вход сохранится только до обновления этой вкладки.': 'You will remain signed in only until this tab is refreshed.',
        'Браузер полностью запретил хранилище авторизации. Разрешите данные сайта и обновите страницу.': 'The browser has blocked sign-in storage. Allow site data and refresh the page.',
        'Окно Google закрыто до завершения входа.': 'The Google window was closed before sign-in was completed.',
        'Браузер заблокировал окно Google. Разрешите всплывающие окна для этого сайта и повторите вход.': 'The browser blocked the Google window. Allow pop-ups for this site and try again.',
        'Этот браузер не поддерживает окно входа Google. Откройте сайт в обычном браузере или войдите по почте.': 'This browser cannot open Google sign-in. Use a standard browser or sign in with email.',
        'Нет связи с сервером входа. Проверьте интернет и повторите попытку.': 'Could not reach the sign-in server. Check your connection and try again.',
        'Браузер запретил локальное хранилище, поэтому сохранить вход нельзя. Отключите строгий приватный режим для сайта.': 'Local storage is blocked, so your sign-in cannot be saved. Disable strict private browsing for this site.',
        'Слишком много попыток входа. Подождите несколько минут и попробуйте снова.': 'Too many sign-in attempts. Wait a few minutes and try again.',
        'Аккаунт с этой почтой уже создан другим способом. Войдите по почте, затем повторите вход через Google.': 'An account with this email already uses another sign-in method. Sign in with email, then try Google again.',
        'Домен не разрешён в настройках Firebase Auth.': 'This domain is not allowed in Firebase Auth settings.'
    }));

    const ATTRIBUTES = new Map(Object.entries({
        'Настройки': 'Settings',
        'Настройки сайта': 'Site settings',
        'Закрыть': 'Close',
        'Закрыть меню': 'Close menu',
        'Открыть меню': 'Open menu',
        'Наверх': 'Back to top',
        'Войти': 'Sign in',
        'Войти в аккаунт': 'Sign in',
        'Предыдущий раздел': 'Previous section',
        'Следующий раздел': 'Next section',
        'Навигация по разделам конспекта': 'Section navigation',
        'Переход между разделами конспекта': 'Move between sections',
        'Прогресс по разделам': 'Section progress',
        'Добавить в закладки': 'Add bookmark',
        'Удалить из закладок': 'Remove bookmark',
        'Удалить закладку': 'Remove bookmark',
        'Перетащите, чтобы изменить порядок': 'Drag to reorder',
        'Результаты поиска': 'Search results',
        'Закрыть результаты': 'Close results',
        'Область поиска': 'Search scope',
        'Дизайн сайта': 'Site design',
        'Цветовая тема': 'Color theme',
        'Анимация отметки решённой задачи': 'Solved task marker animation',
        'Свернуть меню навигации': 'Collapse navigation',
        'Развернуть меню навигации': 'Expand navigation',
        'Скопировать блок для Word': 'Copy block for Word',
        'Быстрая навигация': 'Quick navigation',
        'Закрыть уведомление': 'Dismiss notification'
    }));

    const PLACEHOLDERS = new Map(Object.entries({
        'Почта': 'Email',
        'Пароль (не менее 6 символов)': 'Password (at least 6 characters)',
        'Повторите пароль': 'Confirm password'
    }));

    function translateDynamic(value) {
        const patterns = [
            [/^Раздел (\d+) из (\d+)$/, 'Section $1 of $2'],
            [/^(\d+) (?:результат|результата|результатов)$/, '$1 results'],
            [/^Рекомендовано: (\d+) (?:карточка|карточки|карточек)$/, 'Recommended: $1 cards'],
            [/^(\d+) (?:карточка|карточки|карточек)$/, '$1 cards'],
            [/^(\d+) (?:ответ|ответа|ответов)$/, '$1 answers'],
            [/^(\d+) к повторению$/, '$1 due'],
            [/^(\d+) (?:новая|новые|новых)$/, '$1 new'],
            [/^ещё (\d+) в следующую сессию$/, '$1 more next session'],
            [/^<1 мин$/, '<1 min'],
            [/^(\d+) мин$/, '$1 min'],
            [/^(\d+) ч$/, '$1 hr'],
            [/^(\d+) дн$/, '$1 days'],
            [/^(\d+) мес$/, '$1 mo'],
            [/^([\d.,]+) г$/, '$1 yr'],
            [/^Аккаунт: (.+)$/, 'Account: $1'],
            [/^Не удалось войти(?: \(([^)]+)\))?\. Повторите попытку; если ошибка сохранится, обновите страницу\.$/, function (_, code) {
                return 'Could not sign in' + (code ? ' (' + code + ')' : '') + '. Try again; if the error persists, refresh the page.';
            }]
        ];
        for (const pair of patterns) {
            if (pair[0].test(value)) return value.replace(pair[0], pair[1]);
        }
        return value;
    }

    function translateValue(value, dictionary) {
        const text = String(value || '');
        const trimmed = text.trim();
        if (!trimmed) return text;
        const translated = dictionary.get(trimmed) || TEXT.get(trimmed) || translateDynamic(trimmed);
        if (translated === trimmed) return text;
        return text.slice(0, text.indexOf(trimmed)) + translated + text.slice(text.indexOf(trimmed) + trimmed.length);
    }

    function isExcluded(element) {
        if (element.closest('.bookmark-btn, .copy-block-btn')) return false;
        return !!element.closest(CONTENT_EXCLUSIONS);
    }

    function translateSubtree(root) {
        if (!(root instanceof Element) || isExcluded(root)) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (node) {
            const parent = node.parentElement;
            if (!parent || isExcluded(parent)) return;
            const next = translateValue(node.nodeValue, TEXT);
            if (next !== node.nodeValue) node.nodeValue = next;
        });

        [root].concat(Array.from(root.querySelectorAll('[aria-label], [aria-valuetext], [title], [placeholder]')))
            .forEach(function (element) {
                if (isExcluded(element)) return;
                ['aria-label', 'aria-valuetext', 'title'].forEach(function (name) {
                    if (!element.hasAttribute(name)) return;
                    const value = element.getAttribute(name);
                    const next = translateValue(value, ATTRIBUTES);
                    if (next !== value) element.setAttribute(name, next);
                });
                if (element.hasAttribute('placeholder')) {
                    const value = element.getAttribute('placeholder');
                    const next = translateValue(value, PLACEHOLDERS);
                    if (next !== value) element.setAttribute('placeholder', next);
                }
            });
    }

    function translateFrom(node) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!element) return;
        const containingRoot = element.closest(UI_ROOTS);
        if (containingRoot) translateSubtree(containingRoot);
        element.querySelectorAll?.(UI_ROOTS).forEach(translateSubtree);
    }

    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'attributes' || mutation.type === 'characterData') {
                translateFrom(mutation.target);
                return;
            }
            mutation.addedNodes.forEach(translateFrom);
        });
    });

    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'aria-valuetext', 'title', 'placeholder']
    });

    function translateAll() {
        document.querySelectorAll(UI_ROOTS).forEach(translateSubtree);
    }

    translateAll();
    document.addEventListener('DOMContentLoaded', translateAll, { once: true });
    window.addEventListener('load', translateAll, { once: true });
}());

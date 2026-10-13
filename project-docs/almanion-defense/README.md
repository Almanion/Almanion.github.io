# Almanion — интерактивная защита проекта

Презентация: https://almanion.github.io/presentation/

`Almanion.html` — автономная версия. Интернет и установка зависимостей не нужны.
Пробел / → — следующий шаг, ← — назад. Есть оглавление, повтор, полноэкранный
режим и настройка уменьшенного движения. Всего 30 управляемых состояний.

`Заметки-выступающего.html` содержит отдельный текст выступления.
Числовой пример FSRS фиксирован на 12 октября 2026 года; материалы и библиотека
в `source/reference/` соответствуют версии `f7f708a3b7266700b8a9ce2df9070e681e875654`.

Исходники демонстрации: `source/animation/`. Сборка:

```powershell
node project-docs/almanion-defense/source/animation/build.cjs
node project-docs/almanion-defense/source/animation/notes.cjs
```

Проверки используют Playwright и Microsoft Edge. Публикуемый файл находится
в `presentation/index.html`; он должен совпадать с автономным `Almanion.html`.
Сборка GitHub Pages допускает к публикации только готовый HTML из этой папки.

Код Almanion извлекает карточки, организует интерфейс, очередь, подтверждения
и сохранение состояния. Математический планировщик FSRS‑6 — библиотека
Open Spaced Repetition; её лицензия включена в HTML и `source/reference/`.

# almanion.github.io

## Структура

- **docs/** — публичные файлы сайта (то, что загружается на GitHub и отображается на GitHub Pages).
  - Все HTML, CSS, JS лежат в `docs/`.
  - Изображения — в `docs/images/`.
- **Local/** — локальные/приватные файлы (скрипты, инструкции, не для публикации).

## GitHub Pages

В настройках репозитория (Settings → Pages):

- **Source:** Deploy from a branch  
- **Branch:** main (или master)  
- **Folder:** /docs  

Тогда сайт будет собираться из папки `docs/`.

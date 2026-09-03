# Настройка конструктора конспектов

Конструктор работает на `constructor.html`. Редакторы создают общие черновики,
владелец проверяет их и публикует одним commit в GitHub.

## 1. Доступ к черновикам

Опубликуйте `firebase/database.rules.json` в Firebase Console → Realtime Database
→ Rules. После этого владелец может назначить пользователю роль «Редактор
конспектов» в `admin.html`. До назначения пользователь должен хотя бы один раз
войти на сайт, чтобы его email появился в каталоге аккаунтов.

Черновик сначала синхронно записывается в localStorage, затем дублируется в
IndexedDB и только после этого отправляется в `noteDrafts` Realtime Database.
При загрузке выбирается самая свежая копия. Потеря сети не блокирует работу и не
заменяет существующий текст пустым состоянием.

## 2. Публикация в GitHub

1. Создайте fine-grained personal access token GitHub только для репозитория
   `Almanion/Almanion.github.io`.
2. Выдайте ему единственное необходимое право: Repository permissions →
   Contents → Read and write. Задайте срок действия токена.
3. В Apps Script, где размещён `apps-script.gs`, откройте Project Settings →
   Script properties и добавьте `GITHUB_TOKEN`.
4. Необязательно добавьте `GITHUB_REPOSITORY=Almanion/Almanion.github.io` и
   `GITHUB_BRANCH=main`; такие значения уже используются по умолчанию.
5. Замените код Apps Script актуальным `apps-script.gs`, затем откройте Manage
   deployments, выберите действующий Web app, укажите New version и нажмите
   Deploy. URL менять не нужно.

Токен никогда не передаётся браузеру: он остаётся в Script properties. Backend
проверяет Firebase ID token и точный email владельца
`dmb23930@gmail.com`. Все JSON-файлы и изображения попадают в один атомарный Git
commit. Если backend временно не настроен, кнопка «Скачать» сохраняет тот же
набор файлов как резервный publication bundle.

## 3. Сборка GitHub Pages

Workflow `.github/workflows/pages.yml` запускает `tools/build-notes.js`. Скрипт
проверяет манифесты и разделы, затем вставляет сгенерированную разметку в копии
страниц предметов внутри Pages artifact. Исходная ручная HTML-разметка не
перезаписывается.

# Доступ к Матцентру по аккаунту

Матцентр v2 использует общий Firebase-аккаунт Almanion. Пароль Матцентра нужен
один раз: сервер проверяет его и сохраняет роль для Firebase UID. После этого
браузер отправляет только короткоживущий Firebase ID token; пароль не хранится
в `localStorage` и не попадает в URL или историю браузера.

## Обновление Google Apps Script

В проекте Google Apps Script каждой таблицы замените `Code.gs` содержимым
`apps-script.gs`. Затем в **Project Settings → Script properties** добавьте:

- `FIREBASE_WEB_API_KEY` — значение `apiKey` из `firebase-config.js`;
- `MATCENTER_USER_PASSWORD` — общий пароль учеников;
- `MATCENTER_ADMIN_PASSWORD` — отдельный пароль с правом менять статусы и подсказки.

После сохранения выберите в верхнем списке функций `authorizeExternalRequests`,
нажмите **Run** и подтвердите разрешения Google. Это необходимо сделать один раз
в каждом из двух Apps Script проектов: новая схема проверяет Firebase ID token
через Identity Toolkit, для чего Apps Script требуется разрешение
`script.external_request`. Проверочный вызов может вернуть HTTP 400 — это
нормально, потому что функция отправляет заведомо тестовый токен; важен сам факт
успешного выполнения `UrlFetchApp.fetch`.

Создайте новую версию deployment типа **Web app**, выполняемую от владельца, с
доступом **Anyone**. Само наличие URL не открывает данные: каждый запрос
проверяет Firebase ID token и сохранённую роль UID.

На сайте используются два URL из `TASKS_ENDPOINTS`, поэтому обновить нужно оба.
До завершения поочерёдного обновления можно временно добавить
`MATCENTER_ALLOW_LEGACY=true`; сразу после обновления обоих URL удалите это
свойство. Клиент автоматически включит новый режим, когда оба endpoint сообщат
`authVersion: 2`.

## Администратор сайта

Доступ к `admin.html` не связан с паролем Матцентра. Для него в Firebase
Realtime Database нужно вручную создать `admins/<uid> = true` и опубликовать
правила из `firebase/database.rules.json`.

Для отзыва доступа к Матцентру удалите свойство
`MATCENTER_ACCESS_<uid>` в обоих Apps Script проектах.

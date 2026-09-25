# Проверки фактически выпущенной сборки 8.0

Standalone SHA-256: `123505d97237b93039b986c3abb9864061172305ca2be5f01810935e71375f02`.

**3105 автоматических утверждений ядра**; **13 составных браузерных сценариев**. Это повторные проверки восстановленной сборки. Результаты ранее потерянного промежуточного выпуска не использованы.

## Численные и логические проверки
- 80 контрактов / 20 секторов. 12 вариативных карт, на каждой две противоположные ветви в одном мире.
- 184 контрольных рейса: оба режима на каждой карте и обе ветви.
- Все 16 новых/изменённых карт: базовая капсула, пять полных уровней оснащения, обычный/PRO режим, DT/2.
- Проверка совпадения обеих компонент скорости до/после портала; время события находится внутри полёта.
- Все адресаты обслуживаются по порядку; корабль не останавливается. Дополнительная синтетическая задача без гравитации подтверждает неизменность скорости и времени при передаче двух посылок.
- Три свободных контейнера многоадресного рейса необязательны для самой доставки; медаль и рейтинг учитывают их отдельно.
- Выплаты по одному максимуму карты, повтор не даёт денег, XP или данных. Тренировка не даёт наград.
- Чеки, повторный возврат, миграция, архив медалей, строгая стыковка и полезность двигателя при том же фактическом импульсе.
- Вариативные контейнеры не коллинеарны; выбранная подсветка не меняет геометрию.
- Заморозка планет разрушила 20 контрольных курсов новых подвижных карт. Это проверка важности движения для данных курсов, не всех возможных курсов.

## Достижения
Все 93 достижения получены в численном прохождении с реальным начислением наград и покупками. Ресурсы не добавлялись вручную. Для точности применялся локальный поиск около контрольных курсов. Профиль после прохождения, покупок и возвратов: 24514 кредитов, 224 данных, 30325 XP. Это демонстрация достижимости, не средняя статистика игроков. 93/93 не требовали выкупа всего магазина.

## Браузерные сценарии
1. 80 contracts, 20 sectors; new filter has 12 new and 4 revised maps; safe search
2. Transition does not advance flight; compact layout and medal detail dialog work
3. All 80 maps and all 12 alternative branches complete in live frame loop; all current medals earned
4. All 16 new/revised maps and both branches also finish in PRO via gameplay UI
5. Replay uses completed history, seeks without money changes and compares actual previous attempt
6. Branch briefing changes highlighting only; zoom does not modify the world
7. Exact course follows the selected branch and remains unpaid training
8. 93 achievements, seven sections, search and progress filters render
9. Late cosmetics require milestones and do not spend XP; shop shows strict-station effect; receipts refund exact amount
10. Settings tabs, contrast, JSON export and typed reset guard work
11. v7 to v8 preserves money and archives old medals; v8 storage roundtrip retains both routes
12. Seven small/tablet/desktop viewports fit map, next step, numeric inputs and launch; mobile drawer and two-finger gesture work
13. Storage-denied warning does not push mobile launch offscreen

## Ограничения и методика
Тестируется точный standalone HTML через Chromium/Playwright `set_content`. Из-за среды запусков подключено явное хранилище в памяти; это **не проверка постоянного localStorage** и не доказательство установки на конкретном телефоне. Проверка отказа хранилища выполнена отдельно.

Размеры: 320×568, 360×640, 390×844, 768×1024, 844×390, 1024×600, 1366×768. Проверены границы карты, следующего этапа, полей и кнопки запуска, отсутствие прокрутки документа в игровом режиме. Это эмуляция размеров и touch-событий, не реальные Android/iPhone. Safari не тестировался. Сетевые обращения и ошибки JavaScript в браузерном прогоне: ноль.

Нет независимого тестирования людьми. Три и более соседних удачных курса не гарантируют удобную сложность, отсутствие всех ошибок или глобальную оптимальность. Пользовательский опыт поиска решения ещё требует проверки.

## Воспроизведение
`npm run build`, `npm test`, `npm run economy` и `python tests/browser_v8.py`. JSON-отчёты: `core-results-v8.json`, `browser-results-v8.json`, `economy-results-v8.json`. Контрольные параметры в `level-witnesses-v8.json` являются спойлерами.

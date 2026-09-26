"""Build the editable school-project roadmap and its printable HTML (stdlib only)."""
from pathlib import Path
from html import escape
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'project-docs'
NAME = 'Дорожная_карта_Almanion'

PAGES = [
    [
        ('label', 'ИНДИВИДУАЛЬНЫЙ ПРОЕКТ ПО ИНФОРМАТИКЕ · 2026/2027'),
        ('title', 'Дорожная карта проекта'),
        ('subtitle', 'Almanion — образовательная веб-платформа\nс игровым модулем «Орбитальный курьер»'),
        ('note', 'Версия от 26.09.2026 · План: 28.09.2026–31.12.2026'),
        ('callout', 'Основная готовность — 20 декабря. Завершение плана — 31 декабря 2026 года.\nЭто рабочие сроки; официальная дата защиты согласуется с руководителем проекта.'),
        ('heading', 'Цель и исходная точка'),
        ('p', 'Подготовить к защите устойчивую веб-платформу для создания и изучения школьных конспектов: с поиском, конструктором, закладками, проверкой знаний и печатью. Игру представить как самостоятельный дополнительный модуль с описанной моделью движения и проверенной работой на телефоне и компьютере.'),
        ('p', 'К 26.09.2026 в проекте уже есть сайт на GitHub Pages, учебные разделы, Матцентр, конструктор, личный прогресс, аккаунты и роли, страницы класса и игра. Ниже запланированы их доводка, проверка и документирование, а не повторная разработка с нуля.'),
        ('heading', 'I. Зафиксировать объём и довести основные функции'),
        ('table', ['Срок', 'Этап и работы', 'Результат / критерий готовности'], [
            ['28.09–04.10\n2026', '01 · Границы проекта\nСогласовать постановку задачи, аудиторию, обязательные сценарии и календарь.', 'Паспорт проекта и список требований. Зафиксирована исходная версия сайта; определено, что входит в защиту.'],
            ['05.10–11.10\n2026', '02 · Архитектура и данные\nОписать структуру конспектов, роли, хранение и публикацию; проверить резервное копирование.', 'Схема системы и модель данных. Пробный конспект и личные данные восстановлены из резервной копии.'],
            ['12.10–18.10\n2026', '03 · Чтение и поиск\nДоработать мобильный интерфейс, формулы, поиск, закладки и экспорт в PDF.', 'На выбранных разделах нет обрезанного текста и формул; поиск приводит к нужному блоку; печать не содержит кнопок интерфейса.'],
            ['19.10–25.10\n2026', '04 · Конструктор\nПроверить создание и вложение блоков, редактирование, черновики и публикацию.', 'Редактор создаёт раздел без HTML. Перезагрузка и временная потеря сети не удаляют черновик; публикация не сбрасывает прогресс.'],
            ['26.10–01.11\n2026', '05 · Повторение и Матцентр\nПроверить выделение терминов, типы карточек, сохранение ответов и обновление таблиц.', 'Нет карточек вида «Определение определения». Повторение не ограничено дневным лимитом; сбой таблицы не удаляет загруженные задачи.'],
        ]),
        ('note', 'Доработки выполняются небольшими проверяемыми выпусками. Материалы отчёта и журнал изменений пополняются с первого этапа, а не только перед защитой.'),
    ],
    [
        ('label', 'ALMANION · ДОРОЖНАЯ КАРТА'),
        ('title', 'От доработки к защите'),
        ('subtitle', 'II. Игровой модуль, проверка качества и итоговая версия'),
        ('table', ['Срок', 'Этап и работы', 'Результат / критерий готовности'], [
            ['02.11–15.11', '06 · «Орбитальный курьер»\nДоработать управление и выбранные игровые сценарии. Описать модель движения и сохранения.', 'Демонстрационная версия игры, описание алгоритма и протокол испытаний. Детализация — на стр. 3.'],
            ['16.11–22.11', '07 · Надёжность и доступ\nПроверить роли, синхронизацию, отсутствие сети и ошибки внешних сервисов.', 'Нет неразрешённой записи закрытых данных. Прогресс восстанавливается; тесты проходят. Ограничения описаны.'],
            ['23.11–06.12', '08 · Апробация\nПригласить 5–8 добровольцев; записать время, ошибки и помощь при выполнении заданий.', 'Не менее 25 попыток по пяти сценариям. Обезличенные результаты и список замечаний.'],
            ['07.12–13.12', '09 · Исправления\nУстранить частые затруднения и повторить сценарии; сравнить результаты.', 'Критические ошибки закрыты. Ориентир — не менее 80% попыток без помощи; отклонения разобраны.'],
            ['14.12–20.12', '10 · Комплект к защите\nЗавершить записку, схемы, презентацию и инструкцию; выпустить контрольную версию.', '20.12 — сайт, игра, исходники, тесты и документация готовы. Описаны источники, инструменты и личный вклад.'],
            ['21.12–27.12', '11 · Репетиция и приёмка\nОбсудить результат с руководителем; дважды провести демонстрацию и проверить её резерв.', 'Учтены замечания, согласован сценарий защиты. Публичная версия соответствует итоговым материалам.'],
            ['28.12–31.12', '12 · Резерв и завершение\nЗакрыть остаточные замечания, повторить проверки и сохранить итоговый комплект.', '31.12 — архив версии, отчёт и презентация сохранены. Новые крупные функции не добавляются.'],
        ]),
        ('heading', 'Контрольные точки'),
        ('p', '04.10 — согласован объём → 01.11 — проверен учебный цикл → 15.11 — готов игровой модуль → 06.12 — завершена апробация → 20.12 — готов комплект к защите → 31.12 — завершён план. Все даты — 2026 год.'),
        ('heading', 'Зависимости и порядок работы'),
        ('p', 'Апробация начинается после проверки доступа и сохранений. Выводы пишутся по наблюдениям, а итоговая версия выпускается после повторных тестов. Основной приоритет — учебный цикл; игра не должна задерживать его готовность.'),
        ('note', 'Статус всех будущих этапов на 26.09.2026: «Запланировано». Даты в этой карте — плановые, а не отчёт о выполненной работе.'),
    ],
    [
        ('label', 'ALMANION · ИГРА И КОНТРОЛЬ РЕЗУЛЬТАТА'),
        ('title', 'Игра и критерии завершения'),
        ('heading', 'Разработка «Орбитального курьера»'),
        ('p', 'Игра уже включена в сайт. На защите демонстрируются модель движения, управление, сохранения и тесты. В отчёте отдельно описываются предоставленный исходный архив и последующие доработки.'),
        ('table', ['Срок в 2026 году', 'Работы', 'Проверяемый результат'], [
            ['02.11–04.11', 'Описать расчёт движения, столкновения и сохранения; выбрать доработки.', 'Схема игрового цикла, список изменений и контрольные примеры для численной модели.'],
            ['05.11–10.11', 'Выполнить доработки. Проверить прицеливание, запуск, паузу, повтор и камеру.', 'Управление работает мышью и касанием; интерфейс не нарушает расчёт траектории.'],
            ['11.11–15.11', 'Проверить кампанию, награды, импорт/экспорт и работу без сети.', 'Старое тестовое сохранение открывается; просмотр повтора не начисляет награды. Сборка воспроизводима.'],
            ['23.11–13.12', 'Провести апробацию вместе с сайтом; исправить выявленные затруднения.', 'Отзывы, повторные проверки и демонстрационный маршрут для защиты.'],
        ]),
        ('heading', 'Как оценить результат'),
        ('p', 'Пять сценариев: поиск; закладка; повторение; публикация тестового раздела с разрешённой ролью; игровой маршрут с восстановлением прогресса. Доля успеха = попытки без помощи / все попытки × 100%. Записываются также время и ошибки. Проверка удобства не доказывает улучшение успеваемости.'),
        ('heading', 'Что должно быть готово к 20 декабря'),
        ('bullets', [
            'Сайт и игра проверены на компьютере и реальном телефоне; текст, формулы и PDF отображаются корректно.',
            'Нет известных ошибок с потерей данных, нарушением доступа или блокировкой основного сценария.',
            'Готовы исходники, инструкция, тесты, обратная связь, записка, презентация и перечень ограничений.',
            'Есть резерв демонстрации: локальная игра, PDF и запись сценариев. Закрытые функции без сети не обещаются.',
        ]),
        ('heading', 'Контроль выполнения'),
        ('p', 'Автор ведёт работу; руководитель согласует объём и результаты. Еженедельно фиксируются статус, фактическая дата, ссылка на результат и следующий шаг. При задержке сокращается необязательная функция, а не проверка сохранений и доступа.'),
        ('note', 'Мессенджер и новые интеграции — за рамками обязательной версии. Сбои проверяются на тестовых данных; личные сведения не включаются в публичный отчёт. Все будущие результаты здесь — критерии приёмки, а не заявления о выполнении.'),
        ('source', 'Основа: постановка задачи от 21.09.2026, исходники и документация Almanion. Карта не устанавливает нормативные сроки лицея.'),
    ],
]

CSS = '''
@page { size: A4; margin: 16mm 17mm 17mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #192332; background: white; font: 11.5pt/1.25 "Times New Roman", serif; }
.sheet { break-after: page; }
.sheet:last-child { break-after: auto; }
p { margin: 0 0 7pt; }
.label { font: bold 8pt/1.3 Arial,sans-serif; letter-spacing:.08em; color:#535d77; margin-bottom:10pt; }
h1 { font: bold 23pt/1.1 Arial,sans-serif; margin:0 0 8pt; color:#25325a; }
.subtitle { font: 12pt/1.25 Arial,sans-serif; margin:0 0 8pt; }
h2 { font: bold 12pt/1.2 Arial,sans-serif; margin:12pt 0 7pt; color:#25325a; break-after:avoid; }
.note { font:9pt/1.3 Arial,sans-serif; color:#586174; }
.source { font:8pt/1.3 Arial,sans-serif; color:#586174; border-top:1px solid #ced3df; padding-top:7pt; }
.callout { background:#f0f2f8; border-left:3px solid #5869a3; padding:9pt 11pt; margin:10pt 0; font:10pt/1.35 Arial,sans-serif; }
table { border-collapse:collapse; width:100%; margin:8pt 0 9pt; table-layout:fixed; font-size:10.5pt; line-height:1.2; }
th { text-align:left; font:bold 9pt/1.25 Arial,sans-serif; background:#eef1f7; color:#25325a; }
td,th { padding:6pt; border:1px solid #cbd1dc; vertical-align:top; }
th:first-child { width:20%; } th:nth-child(2) { width:38%; }
td:first-child { font:9pt/1.3 Arial,sans-serif; color:#344263; }
tr { break-inside:avoid; }
ul { margin:5pt 0 8pt; padding-left:15pt; } li { margin-bottom:4pt; }
@media screen { body { background:#e9edf3; } .sheet { width:210mm; min-height:297mm; padding:16mm 17mm 17mm 20mm; margin:18px auto; background:white; box-shadow:0 2px 12px #0002; } }
'''

def html_text(s):
    return escape(s).replace('\n', '<br>')

def html_block(block):
    kind, *args = block
    if kind == 'table':
        headers, rows = args
        return '<table><thead><tr>' + ''.join('<th>'+html_text(s)+'</th>' for s in headers) + '</tr></thead><tbody>' + ''.join('<tr>'+''.join('<td>'+html_text(s)+'</td>' for s in row)+'</tr>' for row in rows) + '</tbody></table>'
    if kind == 'bullets':
        return '<ul>'+''.join('<li>'+html_text(s)+'</li>' for s in args[0])+'</ul>'
    tag = {'title':'h1', 'heading':'h2'}.get(kind, 'p')
    return f'<{tag} class="{kind}">{html_text(args[0])}</{tag}>'

# A minimal standards-based DOCX, preserving editable text, tables and page breaks.
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
def run(s):
    return '<w:r>' + '<w:br/>'.join('<w:t xml:space="preserve">'+escape(part)+'</w:t>' for part in s.split('\n')) + '</w:r>'
def para(s, style='Normal'):
    return f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>{run(s)}</w:p>'
def table(headers, rows):
    widths = [1960, 3725, 4115]
    result = '<w:tbl><w:tblPr><w:tblW w:w="9800" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>'
    result += ''.join(f'<w:{side} w:val="single" w:sz="4" w:color="CBD1DC"/>' for side in ['top','left','bottom','right','insideH','insideV'])
    result += '</w:tblBorders><w:tblCellMar>'+''.join(f'<w:{side} w:w="85" w:type="dxa"/>' for side in ['top','left','bottom','right'])+'</w:tblCellMar></w:tblPr><w:tblGrid>'+''.join(f'<w:gridCol w:w="{n}"/>' for n in widths)+'</w:tblGrid>'
    for index, row in enumerate([headers]+rows):
        result += '<w:tr><w:trPr><w:cantSplit/>'+('<w:tblHeader/>' if index == 0 else '')+'</w:trPr>'
        for width, text in zip(widths, row):
            result += f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>' + ('<w:shd w:fill="EEF1F7"/>' if index == 0 else '') + '</w:tcPr>'+para(text, 'TableHead' if index == 0 else 'TableText')+'</w:tc>'
        result += '</w:tr>'
    return result+'</w:tbl>'

def style(name, size, font='Times New Roman', bold=False, color='192332', before=0, after=100, keep=False):
    return f'<w:style w:type="paragraph" w:styleId="{name}"><w:name w:val="{name}"/><w:pPr><w:spacing w:before="{before}" w:after="{after}" w:line="270" w:lineRule="auto"/>'+('<w:keepNext/>' if keep else '')+f'</w:pPr><w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:cs="{font}"/><w:sz w:val="{size}"/><w:color w:val="{color}"/>'+('<w:b/>' if bold else '')+'</w:rPr></w:style>'

def build():
    OUT.mkdir(exist_ok=True)
    html = '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Дорожная карта — Almanion</title><style>'+CSS+'</style><body>'+''.join('<section class="sheet">'+''.join(html_block(b) for b in page)+'</section>' for page in PAGES)+'</body></html>'
    (OUT / (NAME+'.html')).write_text(html, encoding='utf-8')
    blocks = []
    styles_map = {'label':'Label','title':'Title','subtitle':'Subtitle','note':'Note','source':'Source','callout':'Callout','heading':'Heading1','p':'Normal'}
    for index, page in enumerate(PAGES):
        if index: blocks.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        for kind, *args in page:
            if kind == 'table': blocks.append(table(*args))
            elif kind == 'bullets': blocks.extend(para('• '+s) for s in args[0])
            else: blocks.append(para(args[0], styles_map[kind]))
    section = '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="907" w:right="964" w:bottom="964" w:left="1134" w:header="350" w:footer="400"/></w:sectPr>'
    document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+''.join(blocks)+section+'</w:body></w:document>'
    styles = f'<w:styles xmlns:w="{W}">'+''.join([
        style('Normal',23), style('Label',16,'Arial',True,'535D77',after=130,keep=True),
        style('Title',46,'Arial',True,'25325A',after=150,keep=True), style('Subtitle',24,'Arial',after=130,keep=True),
        style('Heading1',24,'Arial',True,'25325A',before=170,after=110,keep=True),
        style('Note',18,'Arial',color='586174'), style('Source',16,'Arial',color='586174'),
        style('Callout',20,'Arial',True,'344263',before=80,after=150),
        style('TableHead',18,'Arial',True,'25325A',after=0), style('TableText',21,after=0),
    ])+'</w:styles>'
    types = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'
    relationships = 'http://schemas.openxmlformats.org/package/2006/relationships'
    reltype = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
    footer = f'<w:ftr xmlns:w="{W}"><w:p><w:pPr><w:pStyle w:val="Note"/></w:pPr>{run("Almanion · Дорожная карта проекта     ")}<w:fldSimple w:instr="PAGE"/></w:p></w:ftr>'
    with ZipFile(OUT / (NAME+'.docx'), 'w', ZIP_DEFLATED) as z:
        for path, content in {
            '[Content_Types].xml':types,
            '_rels/.rels':f'<Relationships xmlns="{relationships}"><Relationship Id="rId1" Type="{reltype}officeDocument" Target="word/document.xml"/></Relationships>',
            'word/document.xml':document, 'word/styles.xml':styles, 'word/footer1.xml':footer,
            'word/_rels/document.xml.rels':f'<Relationships xmlns="{relationships}"><Relationship Id="rId1" Type="{reltype}styles" Target="styles.xml"/><Relationship Id="rId2" Type="{reltype}footer" Target="footer1.xml"/></Relationships>'
        }.items(): z.writestr(path, content)
    print('Built HTML and DOCX:', OUT / NAME)

if __name__ == '__main__': build()

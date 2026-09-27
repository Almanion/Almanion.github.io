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
        ('subtitle', 'Almanion — сайт с конспектами и учебными инструментами'),
        ('note', 'План: 28 сентября — 31 декабря 2026 года'),
        ('callout', '20 декабря — готовая версия проекта. 21–31 декабря — проверка, репетиция и резерв.'),
        ('heading', 'Цель'),
        ('p', 'Подготовить Almanion к защите: завершить основные функции, проверить сайт и игру, оформить результаты работы.'),
        ('heading', 'Что уже есть'),
        ('p', 'Сайт опубликован. Работают конспекты, поиск, конструктор, закладки, проверка знаний, Матцентр, аккаунты и игра «Орбитальный курьер».'),
        ('heading', 'План работ'),
        ('table', ['Срок', 'Что сделать', 'Готово, если'], [
            ['28.09–04.10', 'Уточнить цель, задачи и состав проекта.', 'Утверждены план и список функций для защиты.'],
            ['05.10–18.10', 'Исправить чтение конспектов, поиск, закладки, мобильную версию и экспорт в PDF.', 'Основные страницы работают на компьютере и телефоне.'],
            ['19.10–01.11', 'Проверить конструктор, черновики, публикацию, повторение и Матцентр.', 'Данные не теряются; раздел можно создать и опубликовать без правки HTML.'],
            ['02.11–15.11', 'Доработать игру «Орбитальный курьер».', 'Готовы демонстрационная версия, описание алгоритма и тесты.'],
            ['16.11–22.11', 'Проверить вход, роли, синхронизацию, работу без сети и восстановление данных.', 'Нет ошибок, ведущих к потере данных или обходу прав доступа.'],
            ['23.11–06.12', 'Провести проверку сайта с 5–8 учениками.', 'Записаны ошибки, время выполнения заданий и замечания.'],
            ['07.12–13.12', 'Исправить найденные проблемы и повторить проверку.', 'Закрыты критические ошибки; основные задания выполняются без помощи.'],
            ['14.12–20.12', 'Подготовить записку, презентацию, инструкцию и итоговую версию.', 'Сайт, игра и материалы для защиты готовы.'],
            ['21.12–31.12', 'Показать работу руководителю, провести две репетиции, сохранить резервную копию.', 'Замечания учтены; итоговые файлы собраны в одном архиве.'],
        ]),
        ('note', 'Все даты относятся к 2026 году.'),
    ],
    [
        ('label', 'ALMANION · ДОРОЖНАЯ КАРТА'),
        ('title', 'Игра и итог проекта'),
        ('heading', '«Орбитальный курьер»'),
        ('p', 'Игра входит в проект как отдельный модуль. На защите нужно показать не только игровой процесс, но и то, как устроены движение, управление и сохранение прогресса.'),
        ('table', ['Срок', 'Работа', 'Результат'], [
            ['02.11–04.11', 'Описать движение, столкновения и сохранение игры.', 'Схема игрового цикла и контрольные примеры.'],
            ['05.11–10.11', 'Доработать управление мышью и касанием.', 'Игрой удобно пользоваться на компьютере и телефоне.'],
            ['11.11–15.11', 'Проверить уровни, награды, импорт, экспорт и работу без сети.', 'Сохранение восстанавливается; повтор не выдаёт награду второй раз.'],
            ['23.11–13.12', 'Проверить игру вместе с остальным сайтом и исправить замечания.', 'Готов короткий маршрут для показа на защите.'],
        ]),
        ('heading', 'Что проверить с пользователями'),
        ('bullets', [
            'найти нужный материал через поиск;',
            'добавить блок в закладки и открыть его;',
            'пройти проверку знаний;',
            'создать и опубликовать тестовый раздел;',
            'пройти игровой маршрут и восстановить сохранение.',
        ]),
        ('heading', 'Что должно быть готово к 20 декабря'),
        ('bullets', [
            'работающие сайт и игра;',
            'проверка на компьютере и телефоне;',
            'исходный код, инструкция и результаты тестов;',
            'пояснительная записка и презентация;',
            'резервная копия проекта и запись демонстрации.',
        ]),
        ('heading', 'Контрольные даты'),
        ('p', '04.10 — утверждён план · 01.11 — проверены учебные функции · 15.11 — готова игра · 06.12 — закончена проверка с учениками · 20.12 — готов проект · 31.12 — завершён резервный этап.'),
        ('source', 'Составлено 28.09.2026. Даты рабочие и могут быть уточнены руководителем проекта.'),
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

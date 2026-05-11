# -*- coding: utf-8 -*-
"""Сборка вставки интерактивного блока оксидов в chemistry.html."""
from __future__ import annotations

import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent

_AMPH_REPLACEMENTS = [
    (
        '<div class="ac" onclick="sendPrompt(\'Реакции BeO как амфотерного оксида\')"><div class="a-sym">Be</div><div class="a-ox">BeO (+2)</div></div>',
        '<button type="button" class="chem-amph-btn" onclick="window.chemScrollToOxideReactions()"><span class="chem-a-sym">Be</span><span class="chem-a-ox">BeO (+2)</span></button>',
    ),
    (
        '<div class="ac" onclick="sendPrompt(\'Реакции Al₂O₃ как амфотерного оксида\')"><div class="a-sym">Al</div><div class="a-ox">Al₂O₃ (+3)</div></div>',
        '<button type="button" class="chem-amph-btn" onclick="window.chemScrollToOxideReactions()"><span class="chem-a-sym">Al</span><span class="chem-a-ox">Al₂O₃ (+3)</span></button>',
    ),
    (
        '<div class="ac" onclick="sendPrompt(\'Реакции ZnO как амфотерного оксида\')"><div class="a-sym">Zn</div><div class="a-ox">ZnO (+2)</div></div>',
        '<button type="button" class="chem-amph-btn" onclick="window.chemScrollToOxideReactions()"><span class="chem-a-sym">Zn</span><span class="chem-a-ox">ZnO (+2)</span></button>',
    ),
    (
        '<div class="ac" onclick="sendPrompt(\'Реакции Cr₂O₃ как амфотерного оксида\')"><div class="a-sym">Cr</div><div class="a-ox">Cr₂O₃ (+3)</div></div>',
        '<button type="button" class="chem-amph-btn" onclick="window.chemScrollToOxideReactions()"><span class="chem-a-sym">Cr</span><span class="chem-a-ox">Cr₂O₃ (+3)</span></button>',
    ),
    (
        '<div class="ac" onclick="sendPrompt(\'Реакции Fe₂O₃ как амфотерного оксида\')"><div class="a-sym">Fe(III)</div><div class="a-ox">Fe₂O₃ (+3)</div></div>',
        '<button type="button" class="chem-amph-btn" onclick="window.chemScrollToOxideReactions()"><span class="chem-a-sym">Fe(III)</span><span class="chem-a-ox">Fe₂O₃ (+3)</span></button>',
    ),
    (
        '<div class="ac" onclick="sendPrompt(\'Реакции PbO и PbO₂ как амфотерных оксидов\')"><div class="a-sym">Pb</div><div class="a-ox">PbO, PbO₂</div></div>',
        '<button type="button" class="chem-amph-btn" onclick="window.chemScrollToOxideReactions()"><span class="chem-a-sym">Pb</span><span class="chem-a-ox">PbO, PbO₂</span></button>',
    ),
    (
        '<div class="ac" onclick="sendPrompt(\'Реакции SnO и SnO₂ как амфотерных оксидов\')"><div class="a-sym">Sn</div><div class="a-ox">SnO, SnO₂</div></div>',
        '<button type="button" class="chem-amph-btn" onclick="window.chemScrollToOxideReactions()"><span class="chem-a-sym">Sn</span><span class="chem-a-ox">SnO, SnO₂</span></button>',
    ),
    (
        '<div class="ac" onclick="sendPrompt(\'Реакции MnO₂ как амфотерного оксида\')"><div class="a-sym">Mn</div><div class="a-ox">MnO₂ (+4)</div></div>',
        '<button type="button" class="chem-amph-btn" onclick="window.chemScrollToOxideReactions()"><span class="chem-a-sym">Mn</span><span class="chem-a-ox">MnO₂ (+4)</span></button>',
    ),
]


def extract_reactions_inner(html: str) -> str:
    m = re.search(
        r'<div style="padding: 1rem 0 0">\s*(.*)\s*</div>\s*<script>',
        html,
        re.DOTALL,
    )
    if not m:
        raise SystemExit("reactions: не найден блок")
    return m.group(1).strip()


def patch_reactions(inner: str) -> str:
    inner = inner.replace(
        'class="tabs"',
        'class="chem-react-tabs" role="tablist" aria-label="Класс веществ"',
    )
    inner = inner.replace(
        'class="tab-btn active" onclick="switchTab(\'oxides\')"',
        'type="button" class="chem-react-tab-btn active" data-chem-react="oxides" role="tab" aria-selected="true"',
    )
    inner = inner.replace(
        'class="tab-btn" onclick="switchTab(\'acids\')"',
        'type="button" class="chem-react-tab-btn" data-chem-react="acids" role="tab" aria-selected="false"',
    )
    inner = inner.replace(
        'class="tab-btn" onclick="switchTab(\'bases\')"',
        'type="button" class="chem-react-tab-btn" data-chem-react="bases" role="tab" aria-selected="false"',
    )
    inner = inner.replace(
        'class="tab-btn" onclick="switchTab(\'salts\')"',
        'type="button" class="chem-react-tab-btn" data-chem-react="salts" role="tab" aria-selected="false"',
    )
    inner = inner.replace(
        'id="tab-oxides" class="tab-content active"',
        'id="chem-react-oxides" class="chem-react-panel active" role="tabpanel"',
    )
    inner = inner.replace(
        'id="tab-acids" class="tab-content"',
        'id="chem-react-acids" class="chem-react-panel" role="tabpanel" hidden',
    )
    inner = inner.replace(
        'id="tab-bases" class="tab-content"',
        'id="chem-react-bases" class="chem-react-panel" role="tabpanel" hidden',
    )
    inner = inner.replace(
        'id="tab-salts" class="tab-content"',
        'id="chem-react-salts" class="chem-react-panel" role="tabpanel" hidden',
    )
    inner = inner.replace('class="tbl-wrap"', 'class="chem-tbl-wrap"')
    inner = inner.replace('class="tbl"', 'class="chem-tbl"')
    inner = inner.replace('class="section-label"', 'class="chem-section-label"')
    inner = re.sub(
        r'class="badge (b-[a-z]+)"',
        r'class="chem-badge chem-\1"',
        inner,
    )
    inner = inner.replace('class="formula"', 'class="chem-formula"')
    inner = inner.replace('class="note"', 'class="chem-note"')
    inner = inner.replace('class="desc"', 'class="chem-react-desc"')
    inner = inner.replace('class="foot"', 'class="chem-foot"')
    return inner


def extract_cheatsheet_body(html: str) -> str:
    if "</style>" not in html:
        raise SystemExit("cheatsheet: нет style")
    return html.split("</style>", 1)[1].strip()


def patch_cheatsheet(body: str) -> str:
    body = body.replace(
        '<svg width="100%" viewBox="0 0 680 220" role="img">',
        '<svg class="chem-pt-map" width="100%" viewBox="0 0 680 220" role="img">',
    )
    body = body.replace(
        '<rect x="40" y="28" width="600" height="154" rx="8" fill="none" stroke="var(--b)" stroke-width="0.5"/>',
        '<rect class="pt-border" x="40" y="28" width="600" height="154" rx="8" fill="none" stroke-width="0.5"/>',
    )
    body = body.replace(
        ' stroke="var(--b)" stroke-width="0.4" opacity="0.5"',
        ' class="pt-grid" stroke-width="0.4"',
    )
    body = body.replace(
        '<line x1="44" y1="197" x2="633" y2="197" stroke="var(--t)" stroke-width="0.5" marker-end="url(#axarr)"/>',
        '<line class="pt-axis" x1="44" y1="197" x2="633" y2="197" stroke-width="0.5" marker-end="url(#axarr)"/>',
    )

    for old, new in _AMPH_REPLACEMENTS:
        if old not in body:
            raise SystemExit(f"Не найдена строка шпаргалки для замены: {old[:50]}…")
        body = body.replace(old, new, 1)

    body = re.sub(
        r'class="tag (tg-[tac])"( style="margin-left:auto")?',
        r'class="chem-tag chem-\1"\2',
        body,
    )

    repls = [
        ('class="lbl"', 'class="chem-lbl"'),
        ('class="step"', 'class="chem-step"'),
        ('class="num nt"', 'class="chem-num chem-nt"'),
        ('class="num na"', 'class="chem-num chem-na"'),
        ('class="num nc"', 'class="chem-num chem-nc"'),
        ('class="num np"', 'class="chem-num chem-np"'),
        ('class="scale"', 'class="chem-scale"'),
        ('class="sc sc-t"', 'class="chem-sc chem-sc-t"'),
        ('class="sc sc-a"', 'class="chem-sc chem-sc-a"'),
        ('class="sc sc-c"', 'class="chem-sc chem-sc-c"'),
        ('class="deg-row"', 'class="chem-deg-row"'),
        ('class="amph-grid"', 'class="chem-amph-grid"'),
        ('class="g2"', 'class="chem-g2"'),
        ('class="ec"', 'class="chem-el-card"'),
        ('class="ec-h"', 'class="chem-ec-h"'),
        ('class="er"', 'class="chem-el-row"'),
        ('class="mo"', 'class="chem-el-formula"'),
        ('class="ox"', 'class="chem-el-ox"'),
        ('<p class="note">', '<p class="chem-hub-note">'),
    ]
    for a, b in repls:
        body = body.replace(a, b)

    body = body.replace(
        "На карточки амфотерных элементов можно нажать, чтобы узнать их реакции.",
        "По нажатию на карточку открывается таблица реакций (вкладка «Оксиды»).",
    )

    return body


def build_hub_html(reactions: str, cheatsheet: str) -> str:
    return rf"""
                <div id="oxide-interactive-hub" class="chem-interactive-hub" aria-label="Интерактивные таблицы по оксидам">
                    <header class="chem-hub-head">
                        <div class="chem-hub-icon" aria-hidden="true">⚗️</div>
                        <div>
                            <h4 class="chem-hub-title">Интерактивная справка</h4>
                            <p class="chem-hub-desc">
                                Два режима в одном блоке: быстро определить тип оксида по положению элемента в ПСХЭ и степени окисления,
                                либо переключить таблицу реакций для оксидов, кислот, оснований и солей.
                            </p>
                        </div>
                    </header>

                    <div class="chem-hub-segmented" role="tablist" aria-label="Режим просмотра">
                        <button type="button" class="chem-hub-seg-btn is-active" role="tab" aria-selected="true" aria-controls="chem-hub-pane-guide" id="chem-hub-tab-guide" data-chem-hub="guide">
                            Как определить тип оксида
                        </button>
                        <button type="button" class="chem-hub-seg-btn" role="tab" aria-selected="false" aria-controls="chem-hub-pane-react" id="chem-hub-tab-react" data-chem-hub="react">
                            Таблица реакций
                        </button>
                    </div>

                    <div id="chem-hub-pane-guide" class="chem-hub-pane is-active" role="tabpanel" aria-labelledby="chem-hub-tab-guide">
                        {cheatsheet}
                    </div>

                    <div id="chem-hub-pane-react" class="chem-hub-pane" role="tabpanel" aria-labelledby="chem-hub-tab-react" hidden>
                        {reactions}
                    </div>
                </div>

                <script>
                (function () {{
                    var root = document.getElementById("oxide-interactive-hub");
                    if (!root) return;

                    function setHubMode(mode) {{
                        var isGuide = mode === "guide";
                        root.querySelectorAll(".chem-hub-seg-btn").forEach(function (btn) {{
                            var on = btn.getAttribute("data-chem-hub") === mode;
                            btn.classList.toggle("is-active", on);
                            btn.setAttribute("aria-selected", on ? "true" : "false");
                        }});
                        var pg = document.getElementById("chem-hub-pane-guide");
                        var pr = document.getElementById("chem-hub-pane-react");
                        if (pg) {{
                            pg.classList.toggle("is-active", isGuide);
                            pg.hidden = !isGuide;
                        }}
                        if (pr) {{
                            pr.classList.toggle("is-active", !isGuide);
                            pr.hidden = isGuide;
                        }}
                    }}

                    root.querySelectorAll("[data-chem-hub]").forEach(function (btn) {{
                        btn.addEventListener("click", function () {{
                            setHubMode(btn.getAttribute("data-chem-hub"));
                        }});
                    }});

                    root.querySelectorAll("[data-chem-react]").forEach(function (btn) {{
                        btn.addEventListener("click", function () {{
                            var id = btn.getAttribute("data-chem-react");
                            root.querySelectorAll(".chem-react-tab-btn").forEach(function (b) {{
                                b.classList.remove("active");
                                b.setAttribute("aria-selected", "false");
                            }});
                            root.querySelectorAll(".chem-react-panel").forEach(function (p) {{
                                p.classList.remove("active");
                                p.hidden = true;
                            }});
                            btn.classList.add("active");
                            btn.setAttribute("aria-selected", "true");
                            var panel = document.getElementById("chem-react-" + id);
                            if (panel) {{
                                panel.classList.add("active");
                                panel.hidden = false;
                            }}
                        }});
                    }});

                    window.chemScrollToOxideReactions = function () {{
                        setHubMode("react");
                        var oxBtn = root.querySelector('[data-chem-react="oxides"]');
                        if (oxBtn) oxBtn.click();
                        var anchor = document.getElementById("oxide-interactive") || root;
                        anchor.scrollIntoView({{ behavior: "smooth", block: "start" }});
                    }};
                }})();
                </script>
""".strip()


def ensure_head_and_nav(text: str) -> str:
    link = '    <link rel="stylesheet" href="styles/chemistry-interactive-hub.css">\n'
    if "chemistry-interactive-hub.css" not in text:
        text = text.replace(
            '    <link rel="stylesheet" href="styles/copy-blocks.css">\n',
            '    <link rel="stylesheet" href="styles/copy-blocks.css">\n' + link,
            1,
        )

    nav = '                            <li><a href="#oxide-interactive" class="nav-link">2а. Шпаргалка и таблица реакций</a></li>\n'
    needle = '                            <li><a href="#oxides" class="nav-link">2. Оксиды</a></li>\n'
    if needle in text and nav.strip() not in text:
        text = text.replace(needle, needle + nav, 1)
    text = text.replace(
        'href="#oxide-interactive-hub"',
        'href="#oxide-interactive"',
    )
    text = text.replace(
        ">2а. Шпаргалка и реакции (оксиды)<",
        ">2а. Шпаргалка и таблица реакций<",
    )

    return text


def main() -> None:
    rx_html = (DOCS / "oxide_reactions_table.html").read_text(encoding="utf-8")
    cs_html = (DOCS / "oxide_type_cheatsheet.html").read_text(encoding="utf-8")

    rx_inner = patch_reactions(extract_reactions_inner(rx_html))
    cs_body = patch_cheatsheet(extract_cheatsheet_body(cs_html))

    hub = build_hub_html(rx_inner, cs_body)

    chem_path = DOCS / "chemistry.html"
    text = chem_path.read_text(encoding="utf-8")

    needle = (
        '                    <div class="remark-box">\n'
        "                        💡 <strong>Примеры:</strong> \\(Fe_3O_4\\) (можно представить как \\(FeO \\cdot Fe_2O_3\\)), \\(Pb_3O_4\\)\n"
        "                    </div>\n"
        "                </div>\n"
        "            </article>"
    )
    if needle not in text:
        if 'id="oxide-interactive-hub"' in text:
            print("OK: hub already present, syncing head/nav only.")
            text = ensure_head_and_nav(text)
            chem_path.write_text(text, encoding="utf-8")
            return
        raise SystemExit("Маркер в chemistry.html не найден.")

    insertion = (
        '                    <div class="remark-box">\n'
        "                        💡 <strong>Примеры:</strong> \\(Fe_3O_4\\) (можно представить как \\(FeO \\cdot Fe_2O_3\\)), \\(Pb_3O_4\\)\n"
        "                    </div>\n"
        "                </div>\n"
        "            </article>\n\n"
        '            <article id="oxide-interactive" class="topic">\n'
        "                <h3 class=\"topic-title\">2а. Оксиды: шпаргалка и типовые реакции</h3>\n\n"
        '                <div class="remark-box">\n'
        "                    💡 Один блок: тип оксида по ПСХЭ и степени окисления; переключаемые таблицы реакций (оксиды, кислоты, основания, соли).\n"
        "                </div>\n\n"
        + hub
        + "\n            </article>"
    )
    text = text.replace(needle, insertion, 1)
    text = ensure_head_and_nav(text)
    chem_path.write_text(text, encoding="utf-8")
    print("OK: chemistry.html patched.")


if __name__ == "__main__":
    main()

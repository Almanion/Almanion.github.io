(() => {
    'use strict';

    const entries = Object.freeze({
        orbit: 'Орбиты',
        hills: 'Вершины',
        waves: 'Волны',
        aurora: 'Сияние',
        contours: 'Изолинии',
        terrazzo: 'Терраццо',
        ink: 'Тушь',
        garden: 'Гербарий',
        eclipse: 'Затмение',
        plain: 'Без рисунка'
    });

    function contourLines(cx, cy, count, phase) {
        const lines = [];
        for (let layer = 0; layer < count; layer++) {
            const scale = 13 + layer * 13;
            const points = [];
            for (let step = 0; step < 48; step++) {
                const angle = step * Math.PI / 24;
                const radius = scale * (1 + .17 * Math.sin(angle * 3 + phase) + .09 * Math.cos(5 * angle - phase));
                const x = cx + Math.cos(angle) * radius * 1.38 + Math.sin(angle) * radius * .4;
                const y = cy + Math.sin(angle) * radius * .76;
                points.push([Math.round(x), Math.round(y)]);
            }
            const commands = points.map(([x, y], index) => {
                const [nextX, nextY] = points[(index + 1) % points.length];
                return `Q${x} ${y} ${(x + nextX) / 2} ${(y + nextY) / 2}`;
            });
            const [lastX, lastY] = points.at(-1);
            commands.unshift(`M${(points[0][0] + lastX) / 2} ${(points[0][1] + lastY) / 2}`);
            lines.push(`<path d="${commands.join(' ')}Z" opacity="${layer % 4 === 0 ? .7 : .34}"/>`);
        }
        return lines.join('');
    }

    const designs = {
        orbit: `
            <defs>
                <linearGradient id="@base" x2=".9" y2="1" gradientUnits="objectBoundingBox">
                    <stop stop-color="#160f33"/><stop offset=".62" stop-color="#3d3673"/><stop offset="1" stop-color="#8a679a"/>
                </linearGradient>
                <radialGradient id="@planet" cx=".35" cy=".27" r=".76">
                    <stop stop-color="#f9d8a3"/><stop offset=".52" stop-color="#de9caa"/><stop offset="1" stop-color="#614579"/>
                </radialGradient>
                <clipPath id="@planet-cut"><circle cx="386" cy="116" r="44"/></clipPath>
            </defs>
            <rect width="720" height="240" fill="url(#@base)"/>
            <g fill="none" stroke="#d6c5ff" transform="rotate(-23 386 116)">
                <ellipse cx="386" cy="116" rx="102" ry="40" opacity=".68"/>
                <ellipse cx="386" cy="116" rx="151" ry="62" opacity=".46"/>
                <ellipse cx="386" cy="116" rx="207" ry="88" opacity=".36"/>
                <ellipse cx="386" cy="116" rx="267" ry="113" opacity=".25"/>
                <path d="M80 116h612M386-25v290" stroke-dasharray="2 8" opacity=".19"/>
                <circle cx="286" cy="122" r="4.5" fill="#fcd3a8"/>
                <circle cx="513" cy="83" r="5.4" fill="#d6c5ff"/>
                <circle cx="583" cy="149" r="3.5" fill="#d6c5ff"/>
            </g>
            <circle cx="386" cy="116" r="44" fill="url(#@planet)"/>
            <g clip-path="url(#@planet-cut)" fill="none" stroke="#ffe7c5" opacity=".38">
                <path d="M331 103q37-32 107-21m-103 40q49-33 107-21m-105 47q38-29 99-27m-86 38q32-14 74-17" stroke-width="3"/>
                <path d="M330 90q30-30 99-25m-102 68q42-32 117-26"/>
            </g>
            <path fill="#ffeace" d="M245 47l2 6 6 2-6 2-2 6-2-6-6-2 6-2zm278 139 1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>
            <g fill="#e5d6ff" opacity=".63"><circle cx="149" cy="100" r="1.8"/><circle cx="179" cy="176" r="1.2"/><circle cx="593" cy="48" r="1.5"/><circle cx="634" cy="112" r="1.4"/><circle cx="468" cy="34" r="1.1"/><circle cx="272" cy="180" r="1.2"/></g>`,
        hills: `
            <defs>
                <linearGradient id="@sky" x2="0" y2="1">
                    <stop stop-color="#38485e"/><stop offset=".55" stop-color="#c58680"/><stop offset="1" stop-color="#edb28b"/>
                </linearGradient>
                <linearGradient id="@slope" x2=".38" y2="1"><stop stop-color="#597a7c"/><stop offset="1" stop-color="#293c4c"/></linearGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@sky)"/>
            <circle cx="462" cy="88" r="39" fill="#ffe0a4"/>
            <path d="M-18 152 75 86l98 58L249 75 358 167 449 138 542 109l204 46v85H-18Z" fill="#b58f92"/>
            <path d="m-12 208 105-54 47 15L302 64l45-18 45 44 32 12 44 49 68-18 195 53v54H-12Z" fill="url(#@slope)"/>
            <path d="m347 46 45 44-31-10-15 8-16-14-28 7 15-24 30-11Z" fill="#f8d3b1" opacity=".9"/>
            <path d="m347 47-11 22 10 19 25 78-53-40-72 28 54-72 18-24Z" fill="#b6adb1" opacity=".34"/>
            <path d="M-15 224l137-60 113 35 77-9 114-36 62 31 52-10 190 44v21H-15Z" fill="#263d43"/>
            <path d="m-5 237 126-36 83 15 99-13 146 12 72-25 210 30v20H-5Z" fill="#172f38"/>
            <g fill="none" stroke="#f6bf9a" opacity=".48">
                <path d="M189 52h49m-49 8h22m318 6h70m-39 7h29M50 109h148M505 103h172"/>
                <path d="M402 202c27 2 44 7 69 6m-144 11c21 3 78 2 110 5" opacity=".46"/>
            </g>`,
        waves: `
            <defs>
                <linearGradient id="@sea" x2="0" y2="1"><stop stop-color="#10284b"/><stop offset="1" stop-color="#3b9ba2"/></linearGradient>
                <linearGradient id="@crest" x2=".9" y2="1"><stop stop-color="#96e4cc"/><stop offset=".38" stop-color="#297e97"/><stop offset="1" stop-color="#0c304e"/></linearGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@sea)"/>
            <circle cx="486" cy="71" r="37" fill="#bce6d1" opacity=".52"/>
            <path d="M-18 125C86 164 163 80 250 100c49 11 88 52 141 66 108 30 181-57 347-68v142H-18Z" fill="#237587"/>
            <path d="M-18 196c113 10 234-156 331-129 50 14 28 64 2 63 25-26 4-35-33-23-75 24-103 82-151 133H-18Z" fill="url(#@crest)"/>
            <path d="M68 240c112-58 171-99 258-76 50 13 81 38 155 25 72-13 126-81 243-66v117Z" fill="#15506e"/>
            <path d="M199 246c103-31 141-53 216-35 59 15 131-4 174-21 49-19 89-26 145-19v75Z" fill="#113850"/>
            <g fill="none" stroke="#b6f3da" stroke-linecap="round">
                <path d="M42 192c123-65 209-148 271-125 31 12 36 41 15 57" opacity=".8" stroke-width="2.2"/>
                <path d="M53 210c113-62 180-127 247-130m-193 118c74-39 128-89 176-94" opacity=".54"/>
                <path d="M258 131c30-15 45-23 58-19m80 63c67 22 130 3 177-21 67-35 103-45 160-40M399 203c44 9 89 10 137-13" opacity=".46"/>
            </g>
            <g fill="#c6f7e0" opacity=".67"><circle cx="344" cy="100" r="2.5"/><circle cx="343" cy="116" r="1.1"/><circle cx="333" cy="131" r="2"/><circle cx="352" cy="113" r="1.4"/><circle cx="375" cy="155" r="1.3"/><circle cx="573" cy="138" r="2"/></g>`,
        aurora: `
            <defs>
                <linearGradient id="@night" x2=".23" y2="1"><stop stop-color="#110d31"/><stop offset=".63" stop-color="#173752"/><stop offset="1" stop-color="#315f64"/></linearGradient>
                <linearGradient id="@light" x2=".75" y2="1">
                    <stop stop-color="#b197ff" stop-opacity=".14"/><stop offset=".45" stop-color="#7edadd" stop-opacity=".8"/>
                    <stop offset=".8" stop-color="#aef3b0"/><stop offset="1" stop-color="#52c2bd" stop-opacity=".12"/>
                </linearGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@night)"/>
            <g fill="#d3e7fb">
                <path d="M180 52l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6Z"/>
                <circle cx="69" cy="71" r="1.3"/><circle cx="131" cy="104" r="1.5"/><circle cx="216" cy="30" r="1.4"/><circle cx="248" cy="77" r="1.8"/>
                <circle cx="347" cy="22" r="1.2"/><circle cx="446" cy="62" r="1.4"/><circle cx="508" cy="44" r="2"/><circle cx="533" cy="90" r="1.2"/>
                <circle cx="605" cy="51" r="1.3"/><circle cx="643" cy="88" r="1.7"/><circle cx="389" cy="142" r="1.1"/>
            </g>
            <path d="M-55 16c149-47 198 115 339 115 167 0 164-104 312-88 48 5 103 20 157 7v33c-104 32-165-29-242 4-97 42-128 96-245 73C115 132 65 33-55 56Z" fill="url(#@light)" opacity=".82"/>
            <path d="M-38 48C68 18 171 140 272 145c130 6 179-113 310-90 64 10 118 33 171 9v10c-82 52-150-11-242 28-79 33-156 78-228 60C175 143 77 57-38 78Z" fill="url(#@light)"/>
            <path d="M-38 77c145-23 213 147 350 103 78-25 125-66 214-63 72 3 134 32 227 2" fill="none" stroke="#8eeed2" stroke-width="2" opacity=".6"/>
            <path d="M-19 230 68 185l72 27 68-31 68 32 53-19 63 28 113-54 35 23 27-8 166 50v21H-19Z" fill="#1b394e"/>
            <path d="m-19 224 124-38 107 42 104-11 84 6 78-25 87 23 107-29 61 19v30H-19Z" fill="#121e38"/>
            <path d="m505 168-37 18 32-4 12 13 12-11 16 7Z" fill="#88aaa9" opacity=".7"/>`,
        contours: `
            <defs><linearGradient id="@map" x2="1" y2="1"><stop stop-color="#293849"/><stop offset=".52" stop-color="#476059"/><stop offset="1" stop-color="#77735b"/></linearGradient></defs>
            <rect width="720" height="240" fill="url(#@map)"/>
            <g fill="none" stroke="#e6dcb0" stroke-width="1.25">
                ${contourLines(225, 85, 9, .95)}
                ${contourLines(554, 192, 10, 2.5)}
            </g>
            <path d="M-30 196c121 47 131-68 251-57 54 6 69 27 119 21 64-8 102-93 176-77 61 14 136 41 227 9" fill="none" stroke="#b0e7d5" stroke-width="2.3" opacity=".9"/>
            <path d="M-30 196c121 47 131-68 251-57 54 6 69 27 119 21 64-8 102-93 176-77 61 14 136 41 227 9" fill="none" stroke="#dcd090" stroke-width="6" opacity=".15"/>
            <path d="M73 77h78m-42-24v50m463-52h69m-33-23v45M351 12v65m-32-33h64" fill="none" stroke="#f5dbad" opacity=".45" stroke-dasharray="2 4"/>
            <circle cx="340" cy="160" r="7" fill="#e5a77d"/>
            <circle cx="340" cy="160" r="12" fill="none" stroke="#e5a77d" opacity=".8"/>`,
        terrazzo: `
            <defs><linearGradient id="@plaster" x2=".8" y2="1"><stop stop-color="#f6dfbf"/><stop offset="1" stop-color="#e6b59e"/></linearGradient></defs>
            <rect width="720" height="240" fill="url(#@plaster)"/>
            <path fill="#b8664f" d="m14 37 38-28 46 14 6 40-48 25-46-11zM269-13l61 25 21 52-43 37-39-25-20-55zM453 109l62-22 48 28-5 43-48 18-42-24zM647 166l41-43 53 21-11 75-52 9-45-29Z"/>
            <path fill="#6f8878" d="m110 125 26-43 33 8 23 37-10 30-55 1zM362 53l31-36 58 3 13 54-52 22-43-17zM199 237l37-44 63 3 21 35-13 20h-93zM564 228l-5-42 38-18 31 32-13 42-37 5Z"/>
            <path fill="#414655" d="M-15 190l50-54 47 30-6 48-38 33-53-21ZM198 49l21-31 22 16-12 35-34 3Zm139 103 24-32 42 4 12 39-24 25-44-8zm140 65 52-21 9 23-23 24-54 2zm166-175 42-33 32 17-9 49-42-1Z"/>
            <path fill="#f9ead4" d="m118 18 32-11 34 17-10 38-41 13-18-28zm75 144 31-29 35 11 13 35-62 18zm250-61 28-22 26 5-22 21-21 30zm99-79 45-8 37 17 5 36-42 29-51-29zM91 231l19-34 34-18 45 28-45 38zm334-34 33-23 38 4-42 30z"/>
            <path fill="#bb8d55" d="m77 108 15-15 12 19-8 15zm148-8 16-12 13 23-28 10zm77 73 11-32 19-4 3 32-18 14zm188-126 10-19 24 7-5 26zm107 78 12-19 24 4-13 29-28 5zm58 112 18-12 20 11-10 15z"/>
            <g fill="#785b57" opacity=".68"><circle cx="53" cy="112" r="2"/><circle cx="104" cy="85" r="2"/><circle cx="189" cy="96" r="3"/><circle cx="167" cy="172" r="2.2"/><circle cx="286" cy="123" r="2.8"/><circle cx="379" cy="199" r="2"/><circle cx="422" cy="105" r="3"/><circle cx="461" cy="35" r="1.7"/><circle cx="546" cy="84" r="3"/><circle cx="634" cy="82" r="2"/><circle cx="662" cy="101" r="3"/><circle cx="623" cy="164" r="2"/><circle cx="545" cy="179" r="2"/></g>`,
        ink: `
            <defs>
                <linearGradient id="@paper" x2=".62" y2="1"><stop stop-color="#efe6dc"/><stop offset="1" stop-color="#b6adc4"/></linearGradient>
                <linearGradient id="@stroke" x2=".85" y2="1"><stop stop-color="#57355e"/><stop offset=".49" stop-color="#252542"/><stop offset="1" stop-color="#393d73"/></linearGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@paper)"/>
            <path d="M-14 208C113 76 156 52 251 75c62 15 75 53 132 53 77 0 74-96 156-111 61-10 122 46 195-4v82c-77 13-137-39-188-24-63 19-76 138-151 147-103 11-121-104-236-62-53 19-107 60-173 84Z" fill="#766088" opacity=".34"/>
            <path d="M-18 225C116 119 177 77 245 110c51 25 91 69 146 52 63-20 68-109 128-118 51-7 127 51 221 13-60 56-125 31-185 40-41 7-35 54-78 77-59 32-124 51-226-9-84-49-160 36-269 75Z" fill="url(#@stroke)"/>
            <path d="M-16 232c127-91 190-108 243-92 101 30 151 82 252 13 35-24 45-62 86-63 52-1 106 4 163-30" fill="none" stroke="#9d85aa" stroke-width="1.7" opacity=".57"/>
            <path d="M63 171c65-63 125-73 160-62 46 15 67 38 96 45m-39 32c98 46 119 28 167 10m23-85c36-70 76-70 134-46" fill="none" stroke="#eee0dd" opacity=".6" stroke-linecap="round" stroke-width="1.3"/>
            <g fill="#3c3155" opacity=".76"><circle cx="174" cy="85" r="3"/><circle cx="197" cy="63" r="4.6"/><circle cx="210" cy="85" r="1.4"/><circle cx="264" cy="67" r="1.8"/><circle cx="304" cy="112" r="4.1"/><circle cx="441" cy="62" r="3"/><circle cx="462" cy="31" r="1.9"/><circle cx="478" cy="37" r="4.1"/><circle cx="451" cy="43" r="1.1"/><circle cx="585" cy="130" r="6.1"/><circle cx="612" cy="143" r="2"/><circle cx="589" cy="154" r="1.8"/><circle cx="626" cy="132" r="1.4"/></g>`,
        garden: `
            <defs><linearGradient id="@grove" x2=".9" y2="1"><stop stop-color="#102e32"/><stop offset=".65" stop-color="#2b514a"/><stop offset="1" stop-color="#587159"/></linearGradient></defs>
            <rect width="720" height="240" fill="url(#@grove)"/>
            <g fill="none" stroke="#dce3be" stroke-width="1.4">
                <path d="M301 269c26-78-1-167-66-226m50 189c-20-45-79-70-128-101m183 134c21-83 104-143 197-187m-178 164c49-36 139-42 204-39m-229 28c-32-53-4-144 45-183"/>
            </g>
            <g fill="#a9c6a1">
                <path d="M237 47c-27 6-60-10-73-41 31-2 54 12 73 41ZM254 68c-27-30-16-52 6-63 16 21 12 43-6 63Zm10 18c-39 6-64-6-74-31 30-11 56 6 74 31Zm13 27c-15-30-12-56 9-69 20 22 14 49-9 69Zm11 26c-33 3-68-12-76-33 26-14 51-3 76 33Zm8 29c-13-31-6-52 17-66 12 24 2 47-17 66ZM304 194c-27 6-57-11-62-29 24-8 50 1 62 29Z"/>
                <path d="M151 127c-1-23-29-37-56-33 5 26 33 35 56 33Zm36 20c-4-22-14-42-39-44 1 24 11 40 39 44Zm7 4c-28 8-49 22-47 38 28-2 45-15 47-38Zm19 10c8-32-3-47-23-65-6 28 3 47 23 65Zm25 18c-21-9-47 0-60 20 22 9 39 2 60-20Z" opacity=".76"/>
                <path d="M438 146c17-25 23-54 1-72-23 22-16 51-1 72Zm19-13c30-1 54-18 58-43-29 1-52 17-58 43Zm-41 31c3-25-10-48-34-48-6 23 7 44 34 48Zm-12 11c31 9 53 4 73-21-27-10-55-1-73 21Zm65-19c29 11 63 2 77-21-28-14-54-8-77 21Zm-79 44c9-20-1-43-12-52-18 14-12 39 12 52Zm-10 12c17 14 47 10 62-7-17-12-46-11-62 7Z"/>
            </g>
            <g fill="none" stroke="#dce3be" opacity=".51">
                <path d="m181 19 56 29m10 16 10-42m-54 46 61 20m14 25 10-46m-62 44 62 27m26-20-18 49m160-83-18 63m-48 8 28 10m-2 5 37-7m23-10 49-12m-71 82 83-24"/>
            </g>
            <g fill="#f0c4a0">
                <path d="M377 62c-4-11-18-13-20-24 8-5 17 0 22 8-7-15-2-26 7-29 9 8 4 19 1 28 8-10 17-14 25-7-1 10-13 16-24 21 14-5 22-1 22 6-12 9-25 1-33-3Zm149 17c-5-10-6-27 1-32 8 3 12 13 11 24 2-15 9-25 18-24 6 9-1 19-7 25 11-6 20-5 23 2-5 10-19 14-35 12Z"/>
                <circle cx="567" cy="204" r="7"/><circle cx="548" cy="181" r="4"/><circle cx="590" cy="190" r="5"/>
                <circle cx="226" cy="87" r="2"/><circle cx="384" cy="106" r="2.4"/><circle cx="471" cy="81" r="2.2"/><circle cx="162" cy="169" r="2.1"/>
            </g>
            <path d="M76 62q34-48 75 0-27 7-75 0Zm468 131q42-36 97-1-38 20-97 1Z" fill="#82aa9b" opacity=".24"/>`,
        eclipse: `
            <defs>
                <linearGradient id="@space" x2=".9" y2="1"><stop stop-color="#110d20"/><stop offset=".72" stop-color="#3c2638"/><stop offset="1" stop-color="#25192f"/></linearGradient>
                <radialGradient id="@fire">
                    <stop offset=".42" stop-color="#ffd58d"/><stop offset=".46" stop-color="#ffdc93"/><stop offset=".51" stop-color="#f19471" stop-opacity=".98"/>
                    <stop offset=".65" stop-color="#ca5e61" stop-opacity=".51"/><stop offset="1" stop-color="#a6425c" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="@moon" cx=".38" cy=".29" r=".83"><stop stop-color="#141221"/><stop offset="1" stop-color="#2b1a29"/></radialGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@space)"/>
            <circle cx="371" cy="119" r="119" fill="url(#@fire)"/>
            <path d="M123 153c110-35 298-59 489-42m-491 51c129-35 279-56 488-42" fill="none" stroke="#eaa987" stroke-width="1" opacity=".28"/>
            <g fill="none" stroke="#ffd6a1">
                <circle cx="371" cy="119" r="76" stroke-dasharray="1 5" opacity=".48"/>
                <circle cx="371" cy="119" r="90" opacity=".23"/>
                <circle cx="371" cy="119" r="110" opacity=".12"/>
                <path d="M371 14v19m0 173v20M266 119h19m171 0h19" opacity=".44"/>
            </g>
            <circle cx="371" cy="119" r="52" fill="url(#@moon)"/>
            <path d="M322 103a52 52 0 0 1 86-20" fill="none" stroke="#ffebbc" stroke-width="1.3" stroke-linecap="round" opacity=".87"/>
            <g fill="#f1bf99" opacity=".68">
                <circle cx="158" cy="118" r="1.4"/><circle cx="185" cy="167" r="2"/><circle cx="201" cy="62" r="1.6"/><circle cx="261" cy="37" r=".9"/>
                <circle cx="492" cy="44" r="1.3"/><circle cx="540" cy="142" r="1.4"/><circle cx="582" cy="63" r="2"/><circle cx="616" cy="97" r="1.8"/>
                <circle cx="571" cy="202" r="1.4"/><circle cx="474" cy="198" r="1.7"/>
            </g>
            <path d="M232 189l2 5 5 2-5 2-2 5-2-5-5-2 5-2zm297-125 1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3Z" fill="#f6c491"/>`
    };

    let sequence = 0;
    function markup(id) {
        if (!Object.hasOwn(designs, id)) return '';
        const prefix = 'profile-cover-' + ++sequence + '-';
        return '<svg class="profile-cover-art" data-art="' + id + '" viewBox="0 0 720 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
            designs[id].replaceAll('@', prefix) + '</svg>';
    }

    window.AlmanionProfileCovers = Object.freeze({ entries, markup });
})();

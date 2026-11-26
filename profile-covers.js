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
        fireflies: 'Светлячки',
        signal: 'Сбой сигнала',
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

    const lights = [
        [149, 139, 2.3, 18, -22, 6, -4], [221, 96, 2, -24, -19, 8, -7],
        [252, 154, 3, 27, -34, 8, -6], [297, 112, 2.7, 23, 13, 7, -1],
        [330, 172, 2.5, -22, -23, 9, -5], [357, 73, 1.5, 15, -10, 7, -3],
        [387, 135, 3.8, 29, -25, 10, -9], [422, 103, 2, -19, -15, 7, -4],
        [450, 166, 2.7, 21, -29, 9, -2], [484, 70, 1.3, 14, 19, 8, -5],
        [523, 126, 3, 25, -23, 9, -8], [568, 178, 1.9, -21, -16, 8, -6]
    ];
    const fireflies = lights.map(([x, y, radius, dx, dy, duration, delay]) => `
        <g class="profile-cover-float" style="--cover-dx:${dx}px;--cover-dy:${dy}px;--cover-time:${duration}s;--cover-delay:${delay}s">
            <g class="profile-cover-shimmer" style="--cover-time:${duration / 2}s;--cover-delay:${delay}s">
                <circle cx="${x}" cy="${y}" r="${radius * 4}" fill="url(#@lantern)"/>
                <circle cx="${x}" cy="${y}" r="${radius}" fill="#fff6bd"/>
            </g>
        </g>`).join('');

    const signalTrace = 'M-14 128H50l20-8 15 18 13-29 18 41 19-75 20 94 22-130 22 136 20-73 20 31 23-15 27 13 24-24 22 39 19-67 19 87 23-113 23 126 23-96 23 53 21-18 23 8 25-14 23 15 20-54 17 68 21-66 18 70 21-38 19 17 19-9h61';
    const riverRoute = 'M-30 196c121 47 131-68 251-57 54 6 69 27 119 21 64-8 102-93 176-77 61 14 136 41 227 9';

    function orbitLane({ rx, ry, opacity, color = '', period, phase, radius }) {
        const ellipse = `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="none" stroke="#d7c7fe" opacity="${opacity}"/>`;
        if (!color) return ellipse;
        // Rotating in the scaled coordinate system traces the ellipse. The inner
        // counter-rotation and reciprocal scale preserve the moon's round shape.
        return `<g class="profile-cover-orbit-lane" style="--cover-time:${period}s;--orbit-start:${phase}deg">
            ${ellipse}
            <g transform="scale(1 ${ry / rx})">
                <g class="profile-cover-orbit-turn">
                    <g transform="translate(${rx} 0)">
                        <g class="profile-cover-orbit-upright">
                            <g transform="scale(1 ${rx / ry})">
                                <circle r="${radius * 2.25}" fill="${color}" opacity=".16"/>
                                <circle class="profile-cover-satellite" r="${radius}" fill="${color}"/>
                                <circle cx="${-radius / 3}" cy="${-radius / 3}" r="${radius / 3}" fill="#fff5e8" opacity=".8"/>
                            </g>
                        </g>
                    </g>
                </g>
            </g>
        </g>`;
    }

    const orbitTracks = [
        { rx: 104, ry: 41, opacity: .7, color: '#ffde9e', period: 20, phase: 148, radius: 4.5 },
        { rx: 151, ry: 62, opacity: .44, color: '#b9d8ff', period: 32, phase: 316, radius: 5.1 },
        { rx: 208, ry: 88, opacity: .33, color: '#d6b5ff', period: 48, phase: 13, radius: 3.3 },
        { rx: 267, ry: 113, opacity: .21 }
    ].map(orbitLane).join('');

    const designs = {
        orbit: `
            <defs>
                <linearGradient id="@base" x2=".9" y2="1" gradientUnits="objectBoundingBox">
                    <stop stop-color="#160f33"/><stop offset=".62" stop-color="#3d3673"/><stop offset="1" stop-color="#8a679a"/>
                </linearGradient>
                <radialGradient id="@planet" cx=".35" cy=".27" r=".76">
                    <stop stop-color="#ffebbf"/><stop offset=".45" stop-color="#e9a8a9"/><stop offset=".68" stop-color="#a06b94"/><stop offset="1" stop-color="#41375e"/>
                </radialGradient>
                <radialGradient id="@nebula">
                    <stop stop-color="#b3a2f1" stop-opacity=".28"/><stop offset="1" stop-color="#b3a2f1" stop-opacity="0"/>
                </radialGradient>
                <clipPath id="@planet-cut"><circle cx="386" cy="116" r="44"/></clipPath>
            </defs>
            <rect width="720" height="240" fill="url(#@base)"/>
            <ellipse class="profile-cover-shimmer" cx="358" cy="119" rx="291" ry="120" fill="url(#@nebula)"
                style="--cover-floor:.53;--cover-ceiling:.92;--cover-time:13s"/>
            <g transform="translate(386 116) rotate(-23)">
                <path d="M-298 0h596M0-125v250" fill="none" stroke="#c1adef" stroke-dasharray="1 8" opacity=".24"/>
                ${orbitTracks}
            </g>
            <circle cx="386" cy="116" r="44" fill="url(#@planet)"/>
            <g clip-path="url(#@planet-cut)" fill="none" stroke="#ffe7c5" opacity=".38">
                <path d="M331 103q37-32 107-21m-103 40q49-33 107-21m-105 47q38-29 99-27m-86 38q32-14 74-17" stroke-width="3"/>
                <path d="M330 90q30-30 99-25m-102 68q42-32 117-26"/>
            </g>
            <path class="profile-cover-shimmer" fill="#ffeace" d="M245 47l2 6 6 2-6 2-2 6-2-6-6-2 6-2zm278 139 1 3 3 1-3 1-1 3-1-3-3-1 3-1z"
                 style="--cover-floor:.45;--cover-ceiling:.9;--cover-time:6s;--cover-delay:-3s"/>
            <g fill="#e5d6ff" opacity=".63"><circle cx="149" cy="100" r="1.8"/><circle cx="179" cy="176" r="1.2"/><circle cx="593" cy="48" r="1.5"/><circle cx="634" cy="112" r="1.4"/><circle cx="468" cy="34" r="1.1"/><circle cx="272" cy="180" r="1.2"/></g>`,
        hills: `
            <defs>
                <linearGradient id="@sky" x2="0" y2="1">
                    <stop stop-color="#38485e"/><stop offset=".55" stop-color="#c58680"/><stop offset="1" stop-color="#edb28b"/>
                </linearGradient>
                <linearGradient id="@slope" x2=".38" y2="1"><stop stop-color="#597a7c"/><stop offset="1" stop-color="#293c4c"/></linearGradient>
                <radialGradient id="@sun-haze"><stop stop-color="#fff0c7" stop-opacity=".52"/><stop offset="1" stop-color="#fff0c7" stop-opacity="0"/></radialGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@sky)"/>
            <ellipse class="profile-cover-shimmer" cx="462" cy="88" rx="154" ry="108" fill="url(#@sun-haze)"
                style="--cover-floor:.5;--cover-ceiling:.88;--cover-time:14s"/>
            <circle cx="462" cy="88" r="39" fill="#ffe0a4"/>
            <path d="M-18 152 75 86l98 58L249 75 358 167 449 138 542 109l204 46v85H-18Z" fill="#b58f92"/>
            <path d="m-12 208 105-54 47 15L302 64l45-18 45 44 32 12 44 49 68-18 195 53v54H-12Z" fill="url(#@slope)"/>
            <path d="m347 46 45 44-31-10-15 8-16-14-28 7 15-24 30-11Z" fill="#f8d3b1" opacity=".9"/>
            <path d="m347 47-11 22 10 19 25 78-53-40-72 28 54-72 18-24Z" fill="#b6adb1" opacity=".34"/>
            <g class="profile-cover-float" fill="none" stroke="#efc1a8" stroke-linecap="round" opacity=".25"
                style="--cover-dx:-18px;--cover-dy:3px;--cover-time:19s;--cover-delay:-8s">
                <path d="M181 140c37 0 61-7 93-6m133 15c42-4 70-13 108-10" stroke-width="3"/>
                <path d="M132 153c55-1 97-7 146-7m79-17c51-8 100-11 143-9"/>
            </g>
            <path d="M-15 224l137-60 113 35 77-9 114-36 62 31 52-10 190 44v21H-15Z" fill="#263d43"/>
            <path d="m-5 237 126-36 83 15 99-13 146 12 72-25 210 30v20H-5Z" fill="#172f38"/>
            <g fill="none" stroke="#f6bf9a" opacity=".48">
                <g class="profile-cover-float" style="--cover-dx:23px;--cover-dy:-3px;--cover-time:15s"><path d="M189 52h49m-49 8h22m318 6h70m-39 7h29M50 109h148M505 103h172"/></g>
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
            <g class="profile-cover-float" fill="none" stroke="#b6f3da" stroke-linecap="round"
                style="--cover-dx:9px;--cover-dy:-7px;--cover-time:8s">
                <path d="M42 192c123-65 209-148 271-125 31 12 36 41 15 57" opacity=".8" stroke-width="2.2"/>
                <path d="M53 210c113-62 180-127 247-130m-193 118c74-39 128-89 176-94" opacity=".54"/>
                <path d="M258 131c30-15 45-23 58-19m80 63c67 22 130 3 177-21 67-35 103-45 160-40M399 203c44 9 89 10 137-13" opacity=".46"/>
            </g>
            <path class="profile-cover-flow" pathLength="100" d="M-20 205c125-49 219-162 306-145 43 8 70 45 41 73"
                fill="none" stroke="#ecffdf" stroke-width="2.4" stroke-linecap="round" opacity=".63" style="--cover-time:14s"/>
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
            <g class="profile-cover-float" style="--cover-dx:-18px;--cover-dy:-12px;--cover-time:15s">
                <g class="profile-cover-shimmer" style="--cover-floor:.65;--cover-time:9s">
                    <path d="M-55 16c149-47 198 115 339 115 167 0 164-104 312-88 48 5 103 20 157 7v33c-104 32-165-29-242 4-97 42-128 96-245 73C115 132 65 33-55 56Z" fill="url(#@light)" opacity=".82"/>
                    <path d="M-38 48C68 18 171 140 272 145c130 6 179-113 310-90 64 10 118 33 171 9v10c-82 52-150-11-242 28-79 33-156 78-228 60C175 143 77 57-38 78Z" fill="url(#@light)"/>
                    <path d="M-38 77c145-23 213 147 350 103 78-25 125-66 214-63 72 3 134 32 227 2" fill="none" stroke="#8eeed2" stroke-width="2" opacity=".6"/>
                </g>
            </g>
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
            <path d="${riverRoute}" fill="none" stroke="#b0e7d5" stroke-width="2.3" opacity=".76"/>
            <path class="profile-cover-flow" pathLength="100" d="${riverRoute}" fill="none" stroke="#e3ffdc" stroke-width="3.6"
                stroke-linecap="round" opacity=".83" style="--cover-time:17s"/>
            <path d="M73 77h78m-42-24v50m463-52h69m-33-23v45M351 12v65m-32-33h64" fill="none" stroke="#f5dbad" opacity=".45" stroke-dasharray="2 4"/>
            <circle cx="340" cy="160" r="7" fill="#e5a77d"/>
            <g class="profile-cover-beacon" style="--cover-time:5s"><circle cx="340" cy="160" r="12" fill="none" stroke="#e5a77d" opacity=".8"/></g>`,
        terrazzo: `
            <defs>
                <linearGradient id="@plaster" x2=".8" y2="1"><stop stop-color="#f6dfbf"/><stop offset="1" stop-color="#e6b59e"/></linearGradient>
                <linearGradient id="@window-light" x2="1" y2=".6">
                    <stop stop-color="#fff7db" stop-opacity="0"/><stop offset=".45" stop-color="#fff7db" stop-opacity=".47"/>
                    <stop offset=".58" stop-color="#fff7db" stop-opacity=".34"/><stop offset="1" stop-color="#fff7db" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@plaster)"/>
            <path fill="#b8664f" d="m14 37 38-28 46 14 6 40-48 25-46-11zM269-13l61 25 21 52-43 37-39-25-20-55zM453 109l62-22 48 28-5 43-48 18-42-24zM647 166l41-43 53 21-11 75-52 9-45-29Z"/>
            <path fill="#6f8878" d="m110 125 26-43 33 8 23 37-10 30-55 1zM362 53l31-36 58 3 13 54-52 22-43-17zM199 237l37-44 63 3 21 35-13 20h-93zM564 228l-5-42 38-18 31 32-13 42-37 5Z"/>
            <path fill="#414655" d="M-15 190l50-54 47 30-6 48-38 33-53-21ZM198 49l21-31 22 16-12 35-34 3Zm139 103 24-32 42 4 12 39-24 25-44-8zm140 65 52-21 9 23-23 24-54 2zm166-175 42-33 32 17-9 49-42-1Z"/>
            <path fill="#f9ead4" d="m118 18 32-11 34 17-10 38-41 13-18-28zm75 144 31-29 35 11 13 35-62 18zm250-61 28-22 26 5-22 21-21 30zm99-79 45-8 37 17 5 36-42 29-51-29zM91 231l19-34 34-18 45 28-45 38zm334-34 33-23 38 4-42 30z"/>
            <path fill="#bb8d55" d="m77 108 15-15 12 19-8 15zm148-8 16-12 13 23-28 10zm77 73 11-32 19-4 3 32-18 14zm188-126 10-19 24 7-5 26zm107 78 12-19 24 4-13 29-28 5zm58 112 18-12 20 11-10 15z"/>
            <g fill="#785b57" opacity=".68"><circle cx="53" cy="112" r="2"/><circle cx="104" cy="85" r="2"/><circle cx="189" cy="96" r="3"/><circle cx="167" cy="172" r="2.2"/><circle cx="286" cy="123" r="2.8"/><circle cx="379" cy="199" r="2"/><circle cx="422" cy="105" r="3"/><circle cx="461" cy="35" r="1.7"/><circle cx="546" cy="84" r="3"/><circle cx="634" cy="82" r="2"/><circle cx="662" cy="101" r="3"/><circle cx="623" cy="164" r="2"/><circle cx="545" cy="179" r="2"/></g>
            <path class="profile-cover-float" d="M-47 248 149-8h212L164 248Z" fill="url(#@window-light)"
                style="--cover-dx:425px;--cover-dy:0px;--cover-time:25s;--cover-delay:-6s"/>`,
        ink: `
            <defs>
                <linearGradient id="@paper" x2=".62" y2="1"><stop stop-color="#efe6dc"/><stop offset="1" stop-color="#b6adc4"/></linearGradient>
                <linearGradient id="@stroke" x2=".85" y2="1"><stop stop-color="#57355e"/><stop offset=".49" stop-color="#252542"/><stop offset="1" stop-color="#393d73"/></linearGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@paper)"/>
            <path d="M-14 208C113 76 156 52 251 75c62 15 75 53 132 53 77 0 74-96 156-111 61-10 122 46 195-4v82c-77 13-137-39-188-24-63 19-76 138-151 147-103 11-121-104-236-62-53 19-107 60-173 84Z" fill="#766088" opacity=".34"/>
            <path class="profile-cover-float" d="M-18 225C116 119 177 77 245 110c51 25 91 69 146 52 63-20 68-109 128-118 51-7 127 51 221 13-60 56-125 31-185 40-41 7-35 54-78 77-59 32-124 51-226-9-84-49-160 36-269 75Z"
                fill="url(#@stroke)" style="--cover-dx:-5px;--cover-dy:4px;--cover-time:18s;--cover-delay:-9s"/>
            <path d="M-16 232c127-91 190-108 243-92 101 30 151 82 252 13 35-24 45-62 86-63 52-1 106 4 163-30" fill="none" stroke="#9d85aa" stroke-width="1.7" opacity=".57"/>
            <path class="profile-cover-float" d="M63 171c65-63 125-73 160-62 46 15 67 38 96 45m-39 32c98 46 119 28 167 10m23-85c36-70 76-70 134-46" fill="none" stroke="#eee0dd" opacity=".6" stroke-linecap="round" stroke-width="1.3"
                style="--cover-dx:8px;--cover-dy:6px;--cover-time:12s"/>
            <g fill="#3c3155" opacity=".76"><circle cx="174" cy="85" r="3"/><circle cx="197" cy="63" r="4.6"/><circle cx="210" cy="85" r="1.4"/><circle cx="264" cy="67" r="1.8"/><circle cx="304" cy="112" r="4.1"/><circle cx="441" cy="62" r="3"/><circle cx="462" cy="31" r="1.9"/><circle cx="478" cy="37" r="4.1"/><circle cx="451" cy="43" r="1.1"/><circle cx="585" cy="130" r="6.1"/><circle cx="612" cy="143" r="2"/><circle cx="589" cy="154" r="1.8"/><circle cx="626" cy="132" r="1.4"/></g>`,
        garden: `
            <defs><linearGradient id="@grove" x2=".9" y2="1"><stop stop-color="#102e32"/><stop offset=".65" stop-color="#2b514a"/><stop offset="1" stop-color="#587159"/></linearGradient></defs>
            <rect width="720" height="240" fill="url(#@grove)"/>
            <g class="profile-cover-sway">
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
            <path d="M76 62q34-48 75 0-27 7-75 0Zm468 131q42-36 97-1-38 20-97 1Z" fill="#82aa9b" opacity=".24"/>
            </g>`,
        fireflies: `
            <defs>
                <linearGradient id="@wood" x2="0" y2="1"><stop stop-color="#10152b"/><stop offset=".65" stop-color="#193d38"/><stop offset="1" stop-color="#2e594b"/></linearGradient>
                <linearGradient id="@water" x2="0" y2="1"><stop stop-color="#0d302e"/><stop offset="1" stop-color="#081b21"/></linearGradient>
                <radialGradient id="@haze"><stop stop-color="#8ab37e" stop-opacity=".47"/><stop offset="1" stop-color="#8ab37e" stop-opacity="0"/></radialGradient>
                <radialGradient id="@lantern"><stop stop-color="#fff6af" stop-opacity=".77"/><stop offset=".47" stop-color="#eccc76" stop-opacity=".32"/><stop offset="1" stop-color="#c3ab52" stop-opacity="0"/></radialGradient>
            </defs>
            <rect width="720" height="240" fill="url(#@wood)"/>
            <ellipse cx="392" cy="111" rx="271" ry="111" fill="url(#@haze)"/>
            <g fill="#304b45">
                <path d="M-10 139 90 100l65 9 63-30 79 44 74-16 90 35 81-39 103-5 85 33v67H-10Z"/>
                <path d="M-10 165l139-34 74 24 104-14 87 18 73-8 113-32 100-5 50 28v71H-10Z" fill="#244139"/>
                <path d="m102 143 23-51 22 51zm60-7 23-59 22 59zm348 15 15-43 15 43zm26-6 26-61 26 61zm62-2 23-44 20 44z" fill="#24433a"/>
            </g>
            <path d="M-15 182c119 9 201-31 322-21 159 14 246 10 427-5v86H-15Z" fill="url(#@water)"/>
            <g fill="none" stroke="#95b17b" stroke-linecap="round" opacity=".45">
                <path d="M226 194h58m21 10h99m-137 13h95m27-27h64m11 24h57m-171 16h78m104-38h43m-381-15h60"/>
                <path d="M313 197h24m92 14h22m-77 12h64m-130-7h20m143-19h34" stroke="#e2d694"/>
            </g>
            <g fill="#142f32">
                <path d="M-10 0h40l14 69-2 63 18 74-22 44H-10Z"/>
                <path d="M19 63 54 37l39-16 59-5-49 19L60 60 28 109zm13 30 58-3 63-26-49 34-76 20z"/>
                <path d="M651 0h52l-5 75-25 47 7 75 50 48h-75l-12-92 6-59zm32 92-61-31-59-11 48 27 59 51z"/>
                <path d="M652 105 605 96l-51 7-23 16 77-7 51 28Z"/>
            </g>
            <g fill="#162d30">
                <path d="M103 0h26c-8 50 14 95 7 153l-11 24c7-48-6-84-9-110Z"/>
                <path d="m120 45 28 6 27 18 39 9-38-4-29-11-20 1Zm15 66 21-10 43-6-34 15-30 11Z"/>
                <path d="M595 0h18c-3 39-20 83-9 129l14 40-21-27c-14-42-9-92-2-142Z"/>
                <path d="m598 50-31-6-37 8 26 1 40 9Zm-5 40-24-7-22-22-24-8 21 12 25 27 25 8Z"/>
            </g>
            <g fill="#0a2026">
                <path d="M-14 227c55-21 119-21 191 13H-14Zm546 13c61-32 136-46 206-22v22Z"/>
                <path d="M116 240c-5-29-6-61 1-77 5 28 7 57 5 77Zm5-32c14-21 33-36 56-37-19 14-37 26-56 37Zm-7 6c-24-32-45-40-63-41 17 17 38 30 63 41ZM600 240c20-33 33-46 55-55-14 20-31 39-45 55Zm31 0c7-39 8-62-1-79-4 24-6 49-5 79Z"/>
            </g>
            <g fill="#b8cb92" opacity=".55"><circle cx="238" cy="66" r="1.2"/><circle cx="311" cy="87" r="1.6"/><circle cx="445" cy="51" r="1"/><circle cx="496" cy="89" r="1.6"/><circle cx="305" cy="156" r="1.3"/><circle cx="540" cy="157" r="1.4"/></g>
            ${fireflies}`,
        signal: `
            <defs>
                <linearGradient id="@scope" x2=".85" y2="1"><stop stop-color="#100f31"/><stop offset=".53" stop-color="#18294d"/><stop offset="1" stop-color="#211844"/></linearGradient>
                <radialGradient id="@field"><stop stop-color="#3a7b9e" stop-opacity=".46"/><stop offset="1" stop-color="#35658a" stop-opacity="0"/></radialGradient>
                <linearGradient id="@trace"><stop stop-color="#779bef"/><stop offset=".47" stop-color="#a9ffdf"/><stop offset=".71" stop-color="#76deff"/><stop offset="1" stop-color="#b392ff"/></linearGradient>
                <linearGradient id="@scan" x2="0" y2="1"><stop stop-color="#9ceefa" stop-opacity="0"/><stop offset=".72" stop-color="#9ceefa" stop-opacity=".09"/><stop offset="1" stop-color="#acf4fa" stop-opacity=".25"/></linearGradient>
                <pattern id="@grid" width="30" height="24" patternUnits="userSpaceOnUse"><path d="M30 0H0v24" fill="none" stroke="#91afdc" stroke-opacity=".22"/><circle r="1.15" fill="#a8c6ea" opacity=".49"/></pattern>
            </defs>
            <rect width="720" height="240" fill="url(#@scope)"/>
            <ellipse cx="366" cy="126" rx="360" ry="143" fill="url(#@field)"/>
            <path d="M0 12h720v216H0Z" fill="url(#@grid)"/>
            <g fill="#afcbff" opacity=".23">
                <path d="M0 16h111v3H0Zm77 14h77v4H77Zm477-4h166v3H554Zm-32 10h109v3H522ZM0 189h76v3H0Zm70 12h167v2H70Zm336 9h54v3h-54Zm155-15h159v5H561Zm57 16h67v3h-67Z"/>
                <path d="M174 46h17v2h-17Zm48-18h76v2h-76Zm194 15h42v3h-42Zm73 170h62v3h-62Zm-293-12h17v2h-17Z"/>
            </g>
            <path d="M22 49V25h29m618 0h29v24M51 215H22v-24m676 0v24h-29M360 12v14m0 188v14" fill="none" stroke="#a8b6ed" stroke-width="1.4" opacity=".65"/>
            <path d="M-10 121h740" fill="none" stroke="#9dc4e2" stroke-dasharray="2 7" opacity=".46"/>
            <path class="profile-cover-float" d="${signalTrace}" fill="none" stroke="#e78cf9" stroke-width="2" stroke-linejoin="round" opacity=".46"
                style="--cover-dx:12px;--cover-dy:8px;--cover-time:10s;--cover-delay:-4s"/>
            <path d="${signalTrace}" transform="translate(-4 4)" fill="none" stroke="#7167f0" stroke-width="2.4" stroke-linejoin="round" opacity=".64"/>
            <path class="profile-cover-shimmer" d="${signalTrace}" fill="none" stroke="#7deaff" stroke-width="9" stroke-linejoin="round" style="--cover-floor:.08;--cover-ceiling:.24;--cover-time:7s" opacity=".19"/>
            <path d="${signalTrace}" fill="none" stroke="url(#@trace)" stroke-width="2.7" stroke-linejoin="round"/>
            <path class="profile-cover-flow" pathLength="100" d="${signalTrace}" fill="none" stroke="#e8faff" stroke-width="3.1"
                stroke-linejoin="round" opacity=".77" style="--cover-time:20s;--cover-delay:-8s"/>
            <g class="profile-cover-float" fill="#a7dffb" opacity=".6" style="--cover-dx:25px;--cover-dy:0px;--cover-time:8s;--cover-delay:-2s">
                <path d="M89 60h25v2H89zm460 114h31v2h-31zm31-125h16v2h-16zM134 181h71v2h-71Z"/>
                <path d="M46 73h6v3h-6zm320 108h11v3h-11zm261-21h12v2h-12z" fill="#f4a8e1"/>
            </g>
            <g class="profile-cover-scan">
                <rect y="-57" width="720" height="57" fill="url(#@scan)"/>
                <path d="M0 0h720" stroke="#cdf1ff" stroke-opacity=".23"/>
            </g>`,
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
            <circle class="profile-cover-shimmer" cx="371" cy="119" r="119" fill="url(#@fire)" style="--cover-floor:.66;--cover-time:7s"/>
            <path d="M123 153c110-35 298-59 489-42m-491 51c129-35 279-56 488-42" fill="none" stroke="#eaa987" stroke-width="1" opacity=".28"/>
            <g fill="none" stroke="#ffd6a1">
                <circle cx="371" cy="119" r="76" stroke-dasharray="1 5" opacity=".48"/>
                <circle cx="371" cy="119" r="90" opacity=".23"/>
                <circle cx="371" cy="119" r="110" opacity=".12"/>
                <path d="M371 14v19m0 173v20M266 119h19m171 0h19" opacity=".44"/>
            </g>
            <circle cx="371" cy="119" r="52" fill="url(#@moon)"/>
            <path class="profile-cover-shimmer" d="M322 103a52 52 0 0 1 86-20" fill="none" stroke="#ffebbc" stroke-width="1.3" stroke-linecap="round"
                style="--cover-floor:.65;--cover-ceiling:.94;--cover-time:5s;--cover-delay:-2s"/>
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

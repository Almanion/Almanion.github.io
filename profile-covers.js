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
                <radialGradient id="@planet-halo">
                    <stop offset=".45" stop-color="#d3a0fb" stop-opacity="0"/>
                    <stop offset=".56" stop-color="#b381f2" stop-opacity=".24"/>
                    <stop offset="1" stop-color="#8e6cf0" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="@gas-light" gradientUnits="userSpaceOnUse" x1="277" y1="132" x2="438" y2="80">
                    <stop stop-color="#ffc485" stop-opacity="0"/>
                    <stop offset=".58" stop-color="#ffefc6" stop-opacity=".63"/>
                    <stop offset="1" stop-color="#ffdeac" stop-opacity="0"/>
                </linearGradient>
                <clipPath id="@globe"><ellipse cx="358.5" cy="120.7" rx="82" ry="81"/></clipPath>
                <clipPath id="@far-side"><rect x="-320" y="-220" width="640" height="220"/></clipPath>
                <mask id="@orbit-shadow" maskUnits="userSpaceOnUse" x="-320" y="-220" width="640" height="440">
                    <rect x="-320" y="-220" width="640" height="440" fill="white"/>
                    <g clip-path="url(#@far-side)">
                        <ellipse transform="rotate(20)" rx="82.6" ry="81.2" fill="black"/>
                    </g>
                </mask>
            </defs>
            <rect width="720" height="240" fill="#160925"/>
            <image href="images/profile-covers/orbit-cel.webp" width="720" height="240"/>
            <circle class="profile-cover-shimmer" cx="358.5" cy="120.7" r="152" fill="url(#@planet-halo)" opacity=".55"
                style="--cover-floor:.25;--cover-ceiling:.83;--cover-time:13s;--cover-delay:-4s"/>
            <g clip-path="url(#@globe)" fill="none" stroke="url(#@gas-light)" stroke-linecap="round">
                <path class="profile-cover-flow" pathLength="100"
                    d="M274 141c37-23 53-13 83-36 27-21 53-24 82-14"
                    stroke-width="2.5" style="--cover-time:15s;--cover-delay:-2s"/>
            </g>
            <g transform="translate(358.5 120.7) rotate(-20)">
                <g mask="url(#@orbit-shadow)">
                    <g transform="scale(1.14)">
                        ${orbitTracks}
                    </g>
                </g>
            </g>`,
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
                <linearGradient id="@sea-light" gradientUnits="userSpaceOnUse" x1="230" y1="168" x2="468" y2="123">
                    <stop stop-color="#9ceedf" stop-opacity="0"/>
                    <stop offset=".46" stop-color="#c0fce8" stop-opacity=".68"/>
                    <stop offset=".75" stop-color="#efffed"/>
                    <stop offset="1" stop-color="#a5efdb" stop-opacity=".14"/>
                </linearGradient>
            </defs>
            <rect width="720" height="240" fill="#092857"/>
            <g class="profile-cover-swell" style="--cover-time:13s;--cover-delay:-3s">
                <image href="images/profile-covers/waves-detailed.webp" width="720" height="240"/>
                <path class="profile-cover-flow" pathLength="100"
                    d="M477 177C423 184 380 163 362 144c-15-17-9-36 14-43 17-5 37 0 50 10"
                    fill="none" stroke="url(#@sea-light)" stroke-width="2.4" stroke-linecap="round"
                    style="--cover-time:8s;--cover-delay:-2s"/>
                <path class="profile-cover-flow" pathLength="100"
                    d="M83 165c75-23 124 25 214 33s138-44 232-27c27 5 58 11 89 17"
                    fill="none" stroke="#bcf7e5" stroke-width="1.6" stroke-linecap="round" opacity=".7"
                    style="--cover-time:12s;--cover-delay:-7s"/>
                <g class="profile-cover-float" style="--cover-dx:12px;--cover-dy:-9px;--cover-time:4.2s;--cover-delay:-2s">
                    <g class="profile-cover-shimmer" fill="#d6fdec" opacity=".55"
                        style="--cover-floor:.12;--cover-ceiling:.85;--cover-time:2.1s;--cover-delay:-.6s">
                        <path d="M354 54q6-3 10 2-6 2-10-2Zm78 24q5 0 8 6-6-1-8-6Zm21 31q4 1 5 6-4-2-5-6Z"/>
                        <circle cx="326" cy="68" r="1.2"/><circle cx="410" cy="68" r="1.6"/><circle cx="463" cy="100" r="1.2"/>
                    </g>
                </g>
            </g>`,
        aurora: `
            <defs>
                <linearGradient id="@mint" gradientUnits="userSpaceOnUse" x1="70" y1="176" x2="458" y2="27">
                    <stop stop-color="#43e2b1" stop-opacity="0"/>
                    <stop offset=".55" stop-color="#88ffc0" stop-opacity=".24"/>
                    <stop offset=".8" stop-color="#cbffe2" stop-opacity=".59"/>
                    <stop offset="1" stop-color="#67eabb" stop-opacity="0"/>
                </linearGradient>
                <linearGradient id="@violet" gradientUnits="userSpaceOnUse" x1="154" y1="126" x2="642" y2="71">
                    <stop stop-color="#8eaeff" stop-opacity="0"/>
                    <stop offset=".26" stop-color="#bd9ffc" stop-opacity=".53"/>
                    <stop offset=".6" stop-color="#85eafb" stop-opacity=".15"/>
                    <stop offset=".85" stop-color="#e3c6ff" stop-opacity=".54"/>
                    <stop offset="1" stop-color="#b1a2ff" stop-opacity="0"/>
                </linearGradient>
                <linearGradient id="@reflection">
                    <stop stop-color="#69e1bc" stop-opacity="0"/>
                    <stop offset=".55" stop-color="#bbffcf" stop-opacity=".63"/>
                    <stop offset="1" stop-color="#97acf9" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect width="720" height="240" fill="#0e254a"/>
            <image href="images/profile-covers/aurora-cel.webp" width="720" height="240"/>
            <g class="profile-cover-veil" style="--cover-dx:-7px;--cover-dy:4px;--cover-skew:-2deg;--cover-time:12s;--cover-delay:-4s">
                <g class="profile-cover-shimmer" opacity=".54" style="--cover-floor:.23;--cover-ceiling:.82;--cover-time:6.5s">
                    <path fill="url(#@mint)" d="M64 178c69-23 129-11 194-27 43-10 61-29 104-43 55-18 96-62 99-124
                        14 65-29 105-81 123-42 14-60 31-104 46-64 21-143 8-212 25Z"/>
                    <path d="M120 166c69-14 99-7 148-23s70-33 99-40c42-13 72-39 84-63"
                        fill="none" stroke="url(#@mint)" stroke-width="1.5" stroke-linecap="round"/>
                </g>
            </g>
            <g class="profile-cover-veil" style="--cover-dx:10px;--cover-dy:-5px;--cover-skew:2deg;--cover-time:17s;--cover-delay:-9s">
                <path fill="url(#@violet)" opacity=".69" d="M135 137c64-37 114-42 204-33 80 8 110 30 170 17
                    51-11 113-34 136-67-17 36-83 62-135 73-61 14-94-10-170-18-100-10-145-1-205 28Z"/>
                <path class="profile-cover-flow" pathLength="100" d="M148 131c71-34 135-39 217-22s102 23 151 13 106-33 133-66"
                    fill="none" stroke="#e2d1ff" stroke-width="1.7" stroke-linecap="round" opacity=".65"
                    style="--cover-time:15s;--cover-delay:-4s"/>
            </g>
            <g class="profile-cover-float" style="--cover-dx:19px;--cover-dy:0px;--cover-time:9s;--cover-delay:-5s">
                <path class="profile-cover-shimmer" fill="url(#@reflection)" opacity=".43"
                    d="M229 212l138-2 124 2-135 2Zm40 7 104-2 96 1-107 3Zm54 6 48-1 35 1-48 1Z"
                    style="--cover-floor:.23;--cover-ceiling:.9;--cover-time:5s;--cover-delay:-1s"/>
            </g>`,
        contours: `
            <defs>
                <linearGradient id="@chart" x2="1" y2="1">
                    <stop stop-color="#112633"/><stop offset=".58" stop-color="#163e41"/><stop offset="1" stop-color="#1c333c"/>
                </linearGradient>
                <linearGradient id="@terrain" x1=".16" y1="0" x2=".88" y2="1">
                    <stop stop-color="#39766c"/><stop offset="1" stop-color="#1e4b53"/>
                </linearGradient>
                <path id="@ridge" d="M-182 34c-12-25 15-52 47-62 28-9 42-1 64-21
                    20-18 40-34 68-29 24 4 38 24 58 25 24 2 52-4 79 9 30 15 47 35 45 54
                    -4 31-44 38-81 38-24 0-49 0-71 17-21 16-52 18-77 7-22-9-33-17-60-14
                    -30 2-61 0-72-24Z"/>
            </defs>
            <rect width="720" height="240" fill="url(#@chart)"/>
            <path d="M40 0v240M120 0v240M200 0v240M280 0v240M360 0v240M440 0v240M520 0v240M600 0v240M680 0v240
                M0 32h720M0 92h720M0 152h720M0 212h720" fill="none" stroke="#a4c8be" stroke-opacity=".10"/>
            <g fill="none" stroke="#9dbcb0" stroke-width="1" opacity=".43">
                ${contourLines(225, 85, 9, .95)}
                ${contourLines(554, 192, 10, 2.5)}
            </g>
            <g fill="none" stroke-linecap="round">
                <path d="${riverRoute}" stroke="#102d39" stroke-width="10" opacity=".78"/>
                <path d="${riverRoute}" stroke="#75c9bd" stroke-width="2" opacity=".75"/>
            </g>
            <g transform="translate(355 101) rotate(-14)" stroke="#9bcab4" stroke-width="1.5">
                <use href="#@ridge" fill="url(#@terrain)"/>
                <use href="#@ridge" transform="scale(.84)" fill="#2b615d" stroke="#82b8a5"/>
                <use href="#@ridge" transform="scale(.68)" fill="#336d62" stroke="#9bcab4"/>
                <use href="#@ridge" transform="scale(.52)" fill="#44806d" stroke="#a9d2b6" stroke-width="2.3"/>
                <use href="#@ridge" transform="scale(.37)" fill="#55957d" stroke="#b3dabb" stroke-width="3.1"/>
                <use href="#@ridge" transform="scale(.22)" fill="#78aa89" stroke="#ddedc5" stroke-width="4.6"/>
                <g fill="none" stroke="#e5ffd0" stroke-width="3.2">
                    <use href="#@ridge" class="profile-cover-contour-pulse" transform="scale(.22)" stroke-width="9" style="--cover-delay:-3s"/>
                    <use href="#@ridge" class="profile-cover-contour-pulse" transform="scale(.37)" stroke-width="6" style="--cover-delay:-2.45s"/>
                    <use href="#@ridge" class="profile-cover-contour-pulse" transform="scale(.52)" stroke-width="4.5" style="--cover-delay:-1.9s"/>
                    <use href="#@ridge" class="profile-cover-contour-pulse" transform="scale(.68)" style="--cover-delay:-1.35s"/>
                    <use href="#@ridge" class="profile-cover-contour-pulse" transform="scale(.84)" style="--cover-delay:-.8s"/>
                    <use href="#@ridge" class="profile-cover-contour-pulse" style="--cover-delay:-.25s"/>
                </g>
                <path d="M-6 4l6-11 6 11Z" fill="#f1e6ae" stroke="none"/>
            </g>
            <g transform="translate(529 205) rotate(157) scale(.43)" fill="#288080" stroke="#94c6ae" stroke-width="3">
                <use href="#@ridge" fill="#24575c"/>
                <use href="#@ridge" transform="scale(.74)" fill="#2b6667"/>
                <use href="#@ridge" transform="scale(.51)" fill="#458879" stroke-width="4.4"/>
                <use href="#@ridge" transform="scale(.28)" fill="#6aa088" stroke-width="6.4"/>
            </g>
            <g fill="none" stroke="#e6d8ab" stroke-width="1" opacity=".54">
                <path d="M95 37v18m-9-9h18M605 69v20m-10-10h20M251 191v16m-8-8h16"/>
                <circle cx="95" cy="46" r="12"/><circle cx="605" cy="79" r="13"/>
            </g>`,
        terrazzo: `
            <defs>
                <path id="@veins" d="M112 111c10-13 20-17 35-20 17-3 20-16 33-27
                    M402 90c13-14 12-31 29-40 12-7 25-8 34-21 6-9 7-16 16-24
                    M339 180c13-3 23-4 34-11 18-11 18-25 59-28
                    M552 61c-11 4-27 12-29 24-4 12 11 15 27 15 9 0 18 2 27 7
                    M31 215c12-18 31-21 40-33 10-12 4-23 17-36
                    M456 199c16-4 36-13 44-20 7-6 12-11 20-15"/>
                <mask id="@polished-stone" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="240">
                    <rect width="720" height="240" fill="white" opacity=".13"/>
                    <use href="#@veins" stroke="white" stroke-width="11" stroke-linecap="round" fill="none" opacity=".37"/>
                    <use href="#@veins" stroke="white" stroke-width="3.3" stroke-linecap="round" fill="none"/>
                </mask>
                <linearGradient id="@passing-light" gradientUnits="userSpaceOnUse" x1="-222" y1="128" x2="-44" y2="186">
                    <stop stop-color="#ffe8bb" stop-opacity="0"/>
                    <stop offset=".43" stop-color="#fff0cf" stop-opacity=".52"/>
                    <stop offset=".57" stop-color="#fffdfa" stop-opacity=".92"/>
                    <stop offset="1" stop-color="#fbe4b7" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect width="720" height="240" fill="#f0d6ad"/>
            <image href="images/profile-covers/terrazzo-cel.webp" width="720" height="240"/>
            <g mask="url(#@polished-stone)">
                <path class="profile-cover-lustre" d="M-290 242-146-2H-4L-148 242Z" fill="url(#@passing-light)"
                    style="--cover-time:19s;--cover-delay:-6s"/>
            </g>`,
        ink: `
            <defs>
                <linearGradient id="@wash-paper" x2="1" y2=".8">
                    <stop stop-color="#f3e7d8"/><stop offset=".48" stop-color="#e9d9d3"/><stop offset="1" stop-color="#cdb9c8"/>
                </linearGradient>
                <linearGradient id="@ink-body" x1=".07" y1="1" x2=".9" y2="0">
                    <stop stop-color="#4c4159"/><stop offset=".44" stop-color="#352745"/><stop offset="1" stop-color="#68506d"/>
                </linearGradient>
                <path id="@ink-gesture" d="M-20 188c89 12 151-5 222-67 54-47 102-82 151-60 39 17 44 50 9 81
                    -23 20-32 34-12 41 32 12 72-22 99-45 49-42 81-57 131-41 45 14 97 12 161-27
                    -57 61-113 80-171 63-26-8-58 7-93 37-44 38-104 65-158 46-40-14-42-47-11-79
                    25-25 52-43 33-54-30-19-73 19-112 52-70 60-142 104-249 76Z"/>
                <clipPath id="@ink-edge"><use href="#@ink-gesture"/></clipPath>
            </defs>
            <rect width="720" height="240" fill="url(#@wash-paper)"/>
            <circle cx="446" cy="91" r="54" fill="#d6a08d" opacity=".63"/>
            <circle cx="446" cy="91" r="65" fill="none" stroke="#aa797b" stroke-width="1" opacity=".52"/>
            <path d="M-10 172c103 24 177-64 236-93 50-24 118-55 172-16 25 18 15 47 51 44
                48-3 67-72 131-61 37 6 82 27 152 3-47 41-96 38-136 30-50-10-74 63-142 77
                -63 13-69-66-122-67-51-1-73 36-120 66-79 51-142 73-222 43Z" fill="#aa839b" opacity=".43"/>
            <use href="#@ink-gesture" fill="url(#@ink-body)"/>
            <g clip-path="url(#@ink-edge)">
                <path class="profile-cover-ink-spread" pathLength="100" d="M-28 200c107 23 187-34 251-89 63-54 111-55 132-30
                    21 25-31 56-33 91-2 52 80 31 145-24 44-38 74-45 111-31 52 19 106-13 160-48"
                    fill="none" stroke="#21182f" stroke-width="43" stroke-linecap="round" style="--cover-delay:-5s"/>
                <g fill="none" stroke-linecap="round">
                    <path d="M-5 201c87 17 168-36 224-85 56-51 100-67 127-48m19 31c-2 28-37 42-47 66
                        -18 46 57 53 105 18m30-27c42-37 76-60 111-49 54 17 96 2 159-28" stroke="#d6b6c7" stroke-width="1.8" opacity=".55"/>
                    <path d="M205 136c59-64 112-78 137-59 22 16-15 36-32 59m24 60c33 22 91-7 120-36
                        54-52 84-45 126-33" stroke="#a383ac" stroke-width="1.1" opacity=".76"/>
                    <path d="M38 223c73-3 95-16 138-39m211 19c19-9 35-18 55-37m154-45c28 5 68-9 96-23"
                        stroke="#d0ace1" opacity=".49"/>
                </g>
            </g>
            <g fill="#4e3c57" opacity=".72">
                <path d="M177 89q-9 1-6-4 6-5 10-3 3 4-4 7Zm110-40q-2-5 4-7 8 1 4 5-3 2-8 2Zm98 130q11 0 8 4-7 6-12 1-1-3 4-5Zm207-34q0-5 6-6 5 3 2 6-4 3-8 0Z"/>
                <circle cx="150" cy="100" r="2"/><circle cx="189" cy="80" r="1.5"/><circle cx="300" cy="35" r="2.4"/>
                <circle cx="376" cy="177" r="1.9"/><circle cx="584" cy="151" r="2.2"/><circle cx="616" cy="145" r="1.4"/>
            </g>`,
        garden: `
            <defs>
                <linearGradient id="@botanic-paper" x2=".9" y2="1">
                    <stop stop-color="#142e30"/><stop offset=".55" stop-color="#31544a"/><stop offset="1" stop-color="#263c39"/>
                </linearGradient>
                <radialGradient id="@botanic-light">
                    <stop stop-color="#91a47b" stop-opacity=".28"/><stop offset="1" stop-color="#91a47b" stop-opacity="0"/>
                </radialGradient>
                <g id="@rounded-leaf">
                    <path d="M0 0c-18-6-28-20-25-34 3-16 17-22 26-18 16 0 26 12 24 26C23-11 13-3 0 0Z"/>
                    <path d="M0 0c10-6 19-12 21-25 2-9-4-17-12-21 4 12 0 28-9 46Z" fill="#3e7471" opacity=".46"/>
                    <path d="M0-2c1-17 3-27 2-41m0 20-12-9M2-18l11-12" fill="none" stroke="#edf0c4" stroke-opacity=".61" stroke-width="1.25" stroke-linecap="round"/>
                </g>
                <g id="@pointed-leaf">
                    <path d="M0 0c-12-8-16-23-10-35 4-8 12-14 13-25 11 11 16 24 12 36C12-12 8-5 0 0Z"/>
                    <path d="M0 0c7-14 9-33 3-60 11 11 16 24 12 36C12-12 8-5 0 0Z" fill="#65846e" opacity=".52"/>
                    <path d="M1-2c5-14 6-28 3-43m2 19 5-9M5-17l-7-10" fill="none" stroke="#e8eabe" stroke-opacity=".68" stroke-width="1.02" stroke-linecap="round"/>
                </g>
                <g id="@flower-chip">
                    <path d="M0 0C-8-1-16-9-13-16c4-5 12-1 14 6-4-11-1-20 5-20 7 4 6 11 2 19 8-9 15-7 17-3 2 6-8 15-25 14Z" fill="#edb382"/>
                    <path d="M0 0c5-8 14-9 18-6C15-2 8 1 0 0Z" fill="#cb867a"/>
                    <circle cx="3" cy="-5" r="1.9" fill="#f9df9e"/>
                </g>
            </defs>
            <rect width="720" height="240" fill="url(#@botanic-paper)"/>
            <ellipse cx="370" cy="104" rx="275" ry="137" fill="url(#@botanic-light)"/>
            <g fill="none" stroke="#8eae93" stroke-width="1.15" opacity=".26">
                <path d="M63 202c63-6 104-52 133-121M89 195c-2-20 3-34 15-45 7 12 4 28-15 45Zm36-16c-2-25 6-42 22-54
                    8 18 0 36-22 54Zm44-42c-1-17 4-33 20-48 4 15-4 31-20 48Zm-30 34c21 2 37-3 49-14-17-7-35-3-49 14Z
                    M544 209c55-22 88-64 107-111m-62 86c-4-19 2-35 14-47 7 14 3 31-14 47Zm26-30c2-23 10-42 24-50
                    3 18-8 39-24 50Zm-14 23c19-1 39-10 49-24-18-2-37 8-49 24Z"/>
                <circle cx="135" cy="69" r="43"/>
                <path d="M572 46a37 37 0 0 1 25 49M180 192a52 52 0 0 1-54 14"/>
            </g>

            <g fill="none" stroke="#b2c6a2" stroke-width="2" stroke-linecap="round">
                <path d="M298 247c-2-23-6-39-14-55s-13-35-16-50c-4-18-5-35-4-53 0-16 3-30 11-48"/>
                <path d="M414 247c-4-31 0-52 11-72 14-27 36-53 46-78 6-15 6-26 7-36m-41 94c-4-21-15-43-30-56m44 25c17-9 29-25 32-39m-58 89c-13-14-26-19-42-21"/>
            </g>

            <g transform="translate(288 201) rotate(-69) scale(.96)" fill="#7fa893">
                <use href="#@rounded-leaf" class="profile-cover-leaf-open" style="--cover-delay:-8s"/>
            </g>
            <g transform="translate(282 187) rotate(66) scale(1.05)" fill="#a9c69c">
                <use href="#@rounded-leaf" class="profile-cover-leaf-open" style="--cover-delay:-7.5s;--leaf-fold:16deg"/>
            </g>
            <g transform="translate(276 169) rotate(-65) scale(1.17)" fill="#9fb18a">
                <use href="#@rounded-leaf" class="profile-cover-leaf-open" style="--cover-delay:-7s"/>
            </g>
            <g transform="translate(268 142) rotate(58) scale(1.16)" fill="#8ab2a0">
                <use href="#@rounded-leaf" class="profile-cover-leaf-open" style="--cover-delay:-6.5s;--leaf-fold:16deg"/>
            </g>
            <g transform="translate(265 122) rotate(-55) scale(1.02)" fill="#a2c59c">
                <use href="#@rounded-leaf" class="profile-cover-leaf-open" style="--cover-delay:-6s"/>
            </g>
            <g transform="translate(264 98) rotate(63) scale(.79)" fill="#b3cda1">
                <use href="#@rounded-leaf" class="profile-cover-leaf-open" style="--cover-delay:-5.5s;--leaf-fold:16deg"/>
            </g>
            <g transform="translate(266 67) rotate(-47) scale(.69)" fill="#83a990">
                <use href="#@rounded-leaf" class="profile-cover-leaf-open" style="--cover-delay:-5s"/>
            </g>
            <g transform="translate(271 51) rotate(17) scale(.69)" fill="#b7cfa4">
                <use href="#@rounded-leaf" class="profile-cover-leaf-open" style="--cover-delay:-4.5s;--leaf-fold:16deg"/>
            </g>

            <g transform="translate(419 194) rotate(54)" fill="#bcce9d">
                <use href="#@pointed-leaf" class="profile-cover-leaf-open" style="--cover-delay:-4s;--leaf-fold:14deg"/>
            </g>
            <g transform="translate(424 178) rotate(-74) scale(.83)" fill="#81a987">
                <use href="#@pointed-leaf" class="profile-cover-leaf-open" style="--cover-delay:-3.45s"/>
            </g>
            <g transform="translate(438 154) rotate(68)" fill="#a5c29a">
                <use href="#@pointed-leaf" class="profile-cover-leaf-open" style="--cover-delay:-2.9s;--leaf-fold:14deg"/>
            </g>
            <g transform="translate(460 117) rotate(-40) scale(.78)" fill="#b7cda4">
                <use href="#@pointed-leaf" class="profile-cover-leaf-open" style="--cover-delay:-2.4s"/>
            </g>
            <g transform="translate(478 61) rotate(9) scale(1.22)">
                <use href="#@flower-chip" class="profile-cover-leaf-open" style="--cover-delay:-1.9s;--leaf-fold:9deg"/>
            </g>
            <g transform="translate(407 99) rotate(-24) scale(.99)">
                <use href="#@flower-chip" class="profile-cover-leaf-open" style="--cover-delay:-1.45s"/>
            </g>
            <g transform="translate(483 85) rotate(33) scale(.73)">
                <use href="#@flower-chip" class="profile-cover-leaf-open" style="--cover-delay:-1s;--leaf-fold:12deg"/>
            </g>
            <g transform="translate(383 153) rotate(-53) scale(.57)">
                <use href="#@flower-chip" class="profile-cover-leaf-open" style="--cover-delay:-.5s"/>
            </g>
            <g fill="#dbbf8e" opacity=".64">
                <circle cx="162" cy="56" r="2.1"/><circle cx="329" cy="56" r="1.65"/><circle cx="350" cy="105" r="1.9"/>
                <circle cx="557" cy="75" r="2.3"/><circle cx="543" cy="57" r="1.4"/><circle cx="568" cy="177" r="1.7"/>
                <path d="M347 77q-3-8 2-10 7 4-2 10Zm193 49q-3-7 4-9 5 4-4 9Zm-181 55q-6 1-6-4 6-5 6 4Z"/>
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
                <linearGradient id="@eclipse-night" x2="1" y2=".76">
                    <stop stop-color="#100e23"/>
                    <stop offset=".54" stop-color="#30172f"/>
                    <stop offset="1" stop-color="#171229"/>
                </linearGradient>
                <radialGradient id="@eclipse-air">
                    <stop stop-color="#f5a578" stop-opacity=".26"/>
                    <stop offset=".55" stop-color="#bd6c83" stop-opacity=".20"/>
                    <stop offset="1" stop-color="#995e87" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="@eclipse-sun" x1=".17" y1="0" x2=".79" y2="1">
                    <stop stop-color="#fff4d6"/>
                    <stop offset=".32" stop-color="#f8cf8a"/>
                    <stop offset=".74" stop-color="#eb925a"/>
                    <stop offset="1" stop-color="#da685e"/>
                </linearGradient>
                <radialGradient id="@eclipse-moon-ink" cx=".62" cy=".34" r=".72">
                    <stop stop-color="#221528"/>
                    <stop offset="1" stop-color="#100e22"/>
                </radialGradient>
                <linearGradient id="@eclipse-plume-ink" gradientUnits="userSpaceOnUse" x1="-240" y1="32" x2="-51" y2="-13">
                    <stop stop-color="#985e9d" stop-opacity="0"/>
                    <stop offset=".37" stop-color="#b871a9" stop-opacity=".39"/>
                    <stop offset=".70" stop-color="#dc867e" stop-opacity=".74"/>
                    <stop offset="1" stop-color="#fac28a" stop-opacity=".91"/>
                </linearGradient>
                <linearGradient id="@eclipse-thread-ink" gradientUnits="userSpaceOnUse" x1="-240" y1="32" x2="-48" y2="15">
                    <stop stop-color="#c189bb" stop-opacity="0"/>
                    <stop offset=".40" stop-color="#dea5b9" stop-opacity=".53"/>
                    <stop offset="1" stop-color="#ffe7ba" stop-opacity=".86"/>
                </linearGradient>
                <path id="@eclipse-plume" d="M-44-30c-35-27-73-15-111 2-33 15-63 30-108 19
                    36 24 74 13 108-1 29-11 54-12 79 0-29-3-56 8-84 23-28 15-52 21-82 20
                    49 16 80-10 118-18 24-5 48-4 76 8l17-25Z"/>
                <path id="@eclipse-threads" d="M-248-5c62 19 98-43 151-38 22 2 39 11 52 19
                    M-228 28c49 2 83-48 135-37 15 3 29 12 39 19
                    M-189 35c55-30 91-26 141-10m-80-66c30-14 64-6 90 14"/>
                <clipPath id="@moon-portrait"><circle r="60.5"/></clipPath>
            </defs>
            <rect width="720" height="240" fill="url(#@eclipse-night)"/>
            <g transform="translate(360 120)" style="--eclipse-cycle:21s;--eclipse-phase:-5s">
                <ellipse class="profile-cover-shimmer" rx="214" ry="116" fill="url(#@eclipse-air)" opacity=".73"
                    style="--cover-floor:.56;--cover-ceiling:1;--cover-time:12s;--cover-delay:-4s"/>
                <g fill="none" stroke="#c89ab9" stroke-width=".85" opacity=".24">
                    <path d="M-258 64c57-17 119-51 190-79m154-26c66-20 101-19 152-12
                        M-208 90c50-13 123-52 154-70m125-42c65-22 106-25 154-19"/>
                </g>
                <g class="profile-cover-eclipse-corona">
                    <use href="#@eclipse-plume" transform="rotate(-13) scale(1.04 .96)" fill="url(#@eclipse-plume-ink)"/>
                    <use href="#@eclipse-plume" transform="rotate(159) scale(.87 1.03)" fill="url(#@eclipse-plume-ink)"/>
                    <use href="#@eclipse-plume" transform="rotate(57) scale(.42 .75)" fill="url(#@eclipse-plume-ink)" opacity=".56"/>
                    <use href="#@eclipse-plume" transform="rotate(-118) scale(.42 .9)" fill="url(#@eclipse-plume-ink)" opacity=".39"/>
                    <g fill="none" stroke="url(#@eclipse-thread-ink)" stroke-linecap="round" stroke-width="1.2">
                        <use href="#@eclipse-threads" transform="rotate(-13) scale(1.04 .96)"/>
                        <use href="#@eclipse-threads" transform="rotate(159) scale(.87 1.03)"/>
                    </g>
                </g>
                <g fill="#dfb6cf" opacity=".64">
                    <circle cx="-188" cy="-63" r="1.2"/><circle cx="-153" cy="68" r="1.25"/>
                    <circle cx="-225" cy="11" r=".95"/><circle cx="-114" cy="-48" r="1.55"/>
                    <circle cx="-59" cy="-81" r=".8"/><circle cx="82" cy="68" r="1.15"/>
                    <circle cx="144" cy="60" r=".9"/><circle cx="205" cy="-29" r="1.3"/>
                    <circle cx="232" cy="46" r="1.6"/><circle cx="171" cy="-74" r=".9"/>
                    <path d="M-153-45l1.2 3.8 3.8 1.2-3.8 1.2-1.2 3.8-1.2-3.8-3.8-1.2 3.8-1.2Zm266 95 1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3Z" fill="#f3d6cf"/>
                </g>
                <circle r="69" fill="none" stroke="#eea57f" stroke-width=".8" stroke-opacity=".37"/>
                <circle class="profile-cover-eclipse-sun" r="62" fill="url(#@eclipse-sun)"/>
                <path d="M-52-28c13-27 42-37 69-31m-54 106c21 14 50 14 71-1" fill="none"
                    stroke="#fff0c7" stroke-width="1.5" stroke-linecap="round" opacity=".68"/>
                <g class="profile-cover-eclipse-moon">
                    <circle r="60.5" fill="url(#@eclipse-moon-ink)"/>
                    <g clip-path="url(#@moon-portrait)">
                        <path d="M-70 44C-28 43-8 19 21 12c17-4 30-2 55 6v55H-70Z" fill="#27162c" opacity=".38"/>
                        <path d="M-50 34c24-1 49-28 80-25 8 1 19 3 28 6M-43 44c24-6 40-26 65-29"
                            fill="none" stroke="#84526d" stroke-linecap="round" opacity=".22"/>
                    </g>
                </g>
            </g>`
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

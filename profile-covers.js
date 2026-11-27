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
                <radialGradient id="@morning">
                    <stop stop-color="#fff1b3" stop-opacity=".45"/>
                    <stop offset=".38" stop-color="#ffca9a" stop-opacity=".22"/>
                    <stop offset="1" stop-color="#ffaf88" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="@high-cloud">
                    <stop stop-color="#f0c4c5" stop-opacity="0"/>
                    <stop offset=".57" stop-color="#ffe2cf" stop-opacity=".71"/>
                    <stop offset="1" stop-color="#ffe2cf" stop-opacity="0"/>
                </linearGradient>
                <linearGradient id="@valley-mist">
                    <stop stop-color="#92dce4" stop-opacity="0"/>
                    <stop offset=".45" stop-color="#c6edfd" stop-opacity=".52"/>
                    <stop offset=".7" stop-color="#b3dcea" stop-opacity=".38"/>
                    <stop offset="1" stop-color="#85c8df" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect width="720" height="240" fill="#254877"/>
            <image href="images/profile-covers/hills-cel.webp" width="720" height="240"/>
            <ellipse class="profile-cover-shimmer" cx="454" cy="66" rx="57" ry="45" fill="url(#@morning)" opacity=".54"
                style="--cover-floor:.2;--cover-ceiling:.92;--cover-time:9s;--cover-delay:-2s"/>
            <g class="profile-cover-wind" fill="url(#@high-cloud)" opacity=".41"
                style="--cover-from:-106px;--cover-to:136px;--cover-time:31s;--cover-delay:-13s">
                <path d="M4 46c38-2 62-1 105-4 32-2 57 2 83 1-36 6-64 2-88 5-44 5-65 1-100-2Z"/>
                <path d="M69 57c56-6 103-2 151-7-34 7-105 9-151 7Z"/>
            </g>
            <g class="profile-cover-wind" fill="url(#@valley-mist)" opacity=".48"
                style="--cover-from:-105px;--cover-to:102px;--cover-time:24s;--cover-delay:-5s">
                <path d="M165 180c63 8 89-14 145-9 32 2 55 13 92 10 29-2 48-9 86-6-39 4-64 14-105 11-27-1-54-11-80-9-67 3-92 20-138 3Z"/>
                <path d="M272 192c46-5 58-5 102 0 65 6 112-15 177-12-76 6-115 27-178 17-42-7-62-3-101-5Z"/>
            </g>
            <g class="profile-cover-wind" fill="url(#@valley-mist)" opacity=".41"
                style="--cover-from:-88px;--cover-to:140px;--cover-time:19s;--cover-delay:-10s">
                <path d="M263 209c43-11 101 1 153-5 42-4 79-18 140-15 33 2 51 6 93 3-31 8-59 4-91 2
                    -53-2-84 16-150 16-52 0-92-7-145-1Z"/>
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
                <image href="images/profile-covers/waves-cel.webp" width="720" height="240"/>
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
                <radialGradient id="@corona">
                    <stop offset=".56" stop-color="#ffca92" stop-opacity="0"/>
                    <stop offset=".61" stop-color="#ffd18e" stop-opacity=".32"/>
                    <stop offset=".75" stop-color="#fa7d55" stop-opacity=".16"/>
                    <stop offset="1" stop-color="#eb567b" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <rect width="720" height="240" fill="#1e0a20"/>
            <image href="images/profile-covers/eclipse-cel.webp" width="720" height="240"/>
            <circle class="profile-cover-shimmer" cx="360" cy="120" r="122" fill="url(#@corona)" opacity=".56"
                style="--cover-floor:.28;--cover-ceiling:1;--cover-time:6.4s;--cover-delay:-1.6s"/>
            <circle class="profile-cover-flow" cx="360" cy="120" r="70.5" pathLength="100"
                fill="none" stroke="#fff8d9" stroke-width="2.2" stroke-linecap="round" opacity=".92"
                style="--cover-time:17s;--cover-delay:-5s"/>
            <g class="profile-cover-float" style="--cover-dx:6px;--cover-dy:-5px;--cover-time:12s;--cover-delay:-7s">
                <g class="profile-cover-shimmer" fill="none" stroke="#ffd197" stroke-width="1" stroke-linecap="round" opacity=".49"
                    style="--cover-floor:.19;--cover-ceiling:.69;--cover-time:4s;--cover-delay:-1s">
                    <path d="M439 87c13-8 27-21 44-28m-224 65c-15 5-25 8-40 6m234 43c12 8 24 12 38 15"/>
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

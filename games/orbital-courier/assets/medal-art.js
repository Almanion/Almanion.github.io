/* Contract medals: original, decorative vector artwork with no shared SVG IDs.
   Set color on .medal-art (or its parent) for the semantic metal/accent colour.
   --medal-art-plate changes the dark enamel; default: #0b1c28.
   --medal-art-line / --medal-art-fine change the two stroke weights; defaults: 2 / 1.
   Stable parts: .medal-art-ribbons, -frame, -engraving, -symbol, -highlight.
   The individual illustrations are deliberately legible without the engraving. */
(function (root) {
  'use strict';
  const types = Object.freeze(['delivery', 'economy', 'cargo', 'precision', 'time', 'branches']);
  const symbols = {
    delivery: `<path d="M19 18h25v19H19z" fill="currentColor" fill-opacity=".1" stroke="none"/>
      <path d="M21 18h20a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3V21a3 3 0 0 1 3-3Z"/>
      <path d="m19 20 12 9 12-9m-24 15 8-7m8 0 8 7"/>
      <path class="medal-art-highlight" d="M21 20h20" stroke-width="var(--medal-art-fine, 1)" opacity=".45"/>
      <circle cx="43" cy="37" r="7" fill="var(--medal-art-plate, #0b1c28)"/>
      <circle cx="43" cy="37" r="5.1" fill="currentColor" fill-opacity=".17" stroke="none"/>
      <path d="m39.6 37 2.3 2.3 4.6-4.7"/>
      <path d="M14 23h-2m2 5h-3m3 5h-2" stroke-width="var(--medal-art-fine, 1)" opacity=".65"/>`,
    economy: `<path d="m35 11-15 20h11l-3 15 17-23H33Z" fill="currentColor" fill-opacity=".19"/>
      <path class="medal-art-highlight" d="m32.6 17-7.4 10h8.6" stroke-width="var(--medal-art-fine, 1)" opacity=".68"/>
      <path d="M17 30a16 16 0 0 0 9 13m12-29a16 16 0 0 1 10 12" stroke-width="var(--medal-art-fine, 1)" opacity=".56"/>
      <path d="m17 35 .3-5.2 4 2.7m22.2-8.8 4.7 2.3.4-5.1" stroke-width="var(--medal-art-fine, 1)" opacity=".7"/>`,
    cargo: `<path d="m32 12 15 8.5v17L32 46l-15-8.5v-17Z" fill="currentColor" fill-opacity=".1"/>
      <path d="m17 20.5 15 8.6 15-8.6L32 12Z" fill="currentColor" fill-opacity=".17" stroke="none"/>
      <path d="M32 29.1 47 20.5v17L32 46Z" fill="currentColor" fill-opacity=".1" stroke="none"/>
      <path d="m17 20.5 15 8.6 15-8.6M32 29.1V46"/>
      <path d="m24.5 16.2 15 8.6v7.1l-4.2 2.4v-7.1l-15-8.6" fill="var(--medal-art-plate, #0b1c28)" stroke-width="var(--medal-art-fine, 1)"/>
      <path class="medal-art-highlight" d="m20.4 23.8 8.3 4.8m6.6 12 8.3-4.8" stroke-width="var(--medal-art-fine, 1)" opacity=".6"/>
      <path d="m21 32 4 2.3m-4 1.1 4 2.3" stroke-width="var(--medal-art-fine, 1)" opacity=".75"/>`,
    precision: `<circle cx="32" cy="28" r="14.4" fill="currentColor" fill-opacity=".045" stroke-width="var(--medal-art-fine, 1)" opacity=".65"/>
      <circle cx="32" cy="28" r="9.6" fill="currentColor" fill-opacity=".08"/>
      <path d="M32 10v10m0 16v10M14 28h10m16 0h10"/>
      <path d="m32 24.8 3.2 3.2-3.2 3.2-3.2-3.2Z" fill="currentColor" stroke="none"/>
      <path class="medal-art-highlight" d="M20.7 16.7 23 19m18-2.3L39 19M20.7 39.3 23 37m18 2.3L39 37" stroke-width="var(--medal-art-fine, 1)" opacity=".58"/>`,
    time: `<path d="M28 10h8m-4 0v5m10.3 2.7 2-2m-1.5-1.4 2.9 2.8"/>
      <circle cx="32" cy="29" r="13.4" fill="currentColor" fill-opacity=".085"/>
      <path d="M32 20v10l7 4"/>
      <circle cx="32" cy="29" r="2" fill="currentColor" stroke="none"/>
      <path d="M32 18.5v1.3m10.5 9.2h-1.3M32 39.5v-1.3M21.5 29h1.3" stroke-width="var(--medal-art-fine, 1)" opacity=".8"/>
      <path class="medal-art-highlight" d="M23.4 22.4a10.8 10.8 0 0 1 5-3.5" stroke-width="var(--medal-art-fine, 1)" opacity=".65"/>
      <path d="M16 23h-3m2 6h-3m4 6h-3" stroke-width="var(--medal-art-fine, 1)" opacity=".6"/>`,
    branches: `<path d="M32 41V30c0-4-3-6-6-9l-7-7m13 16c0-4 3-6 6-9l7-7"/>
      <path d="M19 23v-9h9m8 0h9v9"/>
      <circle cx="32" cy="41" r="4.4" fill="var(--medal-art-plate, #0b1c28)"/>
      <circle cx="32" cy="41" r="1.7" fill="currentColor" stroke="none"/>
      <path class="medal-art-highlight" d="m21.5 18.8 6.8 6.8m14.2-6.8-6.8 6.8" stroke-width="var(--medal-art-fine, 1)" opacity=".55"/>
      <path d="M17 29v7h7m23-7v7h-7" stroke-width="var(--medal-art-fine, 1)" opacity=".48"/>`
  };

  function svg(type) {
    const key = typeof type === 'string' && Object.hasOwn(symbols, type) ? type : 'delivery';
    return `<svg xmlns="http://www.w3.org/2000/svg" class="medal-art medal-art--${key}" data-medal-art="${key}" viewBox="0 0 64 72" width="64" height="72" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <g class="medal-art-ribbons" stroke-width="var(--medal-art-fine, 1)">
        <path d="m15 44-6 23 12-5 7 7 5-22m16-3 6 23-12-5-7 7-5-22" fill="var(--medal-art-plate, #0b1c28)"/>
        <path d="m15 44-6 23 12-5 7 7 5-22m16-3 6 23-12-5-7 7-5-22" fill="currentColor" fill-opacity=".13"/>
        <path d="m18 50-2.5 10 6-2.2 4.5 4.6 2.5-11.5m17.5-.9 2.5 10-6-2.2-4.5 4.6-2.5-11.5" opacity=".45"/>
        <path d="m12.5 62.7 8.5-3.2 5 5.1m25.5-1.9L43 59.5l-5 5.1" opacity=".3"/>
      </g>
      <g class="medal-art-frame">
        <circle cx="32" cy="30" r="26" fill="var(--medal-art-plate, #0b1c28)" stroke="none"/>
        <circle cx="32" cy="28" r="26" fill="var(--medal-art-plate, #0b1c28)" stroke-width="var(--medal-art-line, 2)"/>
        <circle cx="32" cy="28" r="23.1" fill="currentColor" fill-opacity=".085" stroke-opacity=".32" stroke-width="var(--medal-art-fine, 1)"/>
        <circle cx="32" cy="28" r="19.5" stroke-opacity=".19" stroke-width="var(--medal-art-fine, 1)"/>
        <path class="medal-art-highlight" d="M10.7 20.1A22.8 22.8 0 0 1 40 6.7m11.3 28.4A22.8 22.8 0 0 1 24 49.3" stroke-width="var(--medal-art-fine, 1)" opacity=".65"/>
      </g>
      <g class="medal-art-engraving" stroke-width="var(--medal-art-fine, 1)" opacity=".65">
        <path d="M32 5v2.4M9 28h2.4M52.6 28H55M32 48.6V51m-16-39 1.7 1.7M46.3 42.3 48 44m0-32-1.7 1.7M17.7 42.3 16 44"/>
        <path d="m24 6.5.7 1.9m14.6 39.2.7 1.9m13.5-29.5-1.9.7m-39.2 14.6-1.9.7" opacity=".55"/>
      </g>
      <g class="medal-art-symbol" stroke-width="var(--medal-art-line, 2)">${symbols[key]}</g>
    </svg>`;
  }

  const art = Object.freeze({types, svg});
  const O = root.Orbital = root.Orbital || {};
  O.MedalArt = art;
  if (typeof module !== 'undefined' && module.exports) module.exports = art;
})(typeof globalThis !== 'undefined' ? globalThis : window);

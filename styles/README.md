# CSS layers

`style.css` still contains the legacy site styles. New cross-cutting design work should go into small override layers:

- `tokens.css` — semantic colors and theme aliases.
- `buttons.css` — shared button behavior and variants.
- `mobile-overrides.css` — compact mobile spacing.
- `copy-blocks.css` — controls for copying blocks to Word-friendly HTML/text.

The HTML pages load these files after `style.css`, so the layers can safely override legacy rules without moving thousands of lines at once.

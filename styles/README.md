# CSS layers

Legacy site styles are split under `site/`. `site/index.css` imports the chunks in cascade order. New cross-cutting design work should continue to go into small override layers:

- `tokens.css` — semantic colors and theme aliases.
- `buttons.css` — shared button behavior and variants.
- `mobile-overrides.css` — compact mobile spacing.
- `copy-blocks.css` — controls for copying blocks to Word-friendly HTML/text.

The HTML pages load these files after `site/index.css`, so the layers can safely override the legacy chunks.

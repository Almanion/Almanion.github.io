On-demand PDF dependencies, pinned in package-lock.json:
pdfmake 0.2.20 (MIT), MathJax 3.2.2 (Apache-2.0).
Recreate the JS copies with node tools/vendor-pdf.js.

Noto Sans regular, bold, italic and bold-italic from:
https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans
License: SIL Open Font License (NotoSans-LICENSE.txt).
These full fonts include Cyrillic; the PDF engine subsets fonts in the PDF.
Fonts are fetched only once per export session and used for measurement and
embedding, avoiding a second base64 font bundle.

Nothing in this directory is preloaded while reading notes.

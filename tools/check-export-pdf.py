"""Read-only QA for the website's downloadable PDFs."""
import sys
import pdfplumber

with pdfplumber.open(sys.argv[1]) as document:
    assert document.pages, "PDF has no pages"
    for number, page in enumerate(document.pages, 1):
        assert abs(page.width - 595.28) < 1 and abs(page.height - 841.89) < 1, "Not A4"
        text = page.extract_text() or ""
        assert "@Almanion239" in text, f"Footer missing on page {number}"
        assert "�" not in text, f"Missing glyphs on page {number}"
        body = [char for char in page.chars if char["top"] < 790]
        assert len(body) > 3 or page.curves or page.images, f"Blank page {number}"
        for char in body:
            assert char["x0"] >= 38 and char["x1"] <= 558, f"Horizontal margin overflow on page {number}"
            assert char["top"] >= 41 and char["bottom"] < 793, f"Vertical margin overflow on page {number}"
            color = char.get("non_stroking_color")
            assert color not in [(1, 1, 1), 1], f"White text on page {number}"
    full_text = "\n".join(page.extract_text() or "" for page in document.pages)
    assert "Молекулярная физика" in full_text, "Cyrillic title is not extractable"
    assert "Термодинамический" in full_text, "Definition text is not extractable"
    print(f"PDF QA passed: {len(document.pages)} A4 pages; Cyrillic, margins, ink and footers.")

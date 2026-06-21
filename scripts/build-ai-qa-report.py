from __future__ import annotations

import re
import sys
from pathlib import Path

import pypdfium2 as pdfium
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "LifeSync_Local_AI_Integration_and_QA_Report.md"
DIAGRAM = Path(r"C:\Users\osama\Downloads\usecase_diagram_updated.pdf")
OUTPUT = ROOT / "output" / "pdf" / "LifeSync_Local_AI_Integration_and_QA_Report.pdf"
ASSET_DIR = ROOT / "tmp" / "report-assets"


def register_fonts() -> None:
    candidates = {
        "ReportSans": Path(r"C:\Windows\Fonts\arial.ttf"),
        "ReportSans-Bold": Path(r"C:\Windows\Fonts\arialbd.ttf"),
        "ReportMono": Path(r"C:\Windows\Fonts\consola.ttf"),
    }
    for name, path in candidates.items():
        if path.exists():
            pdfmetrics.registerFont(TTFont(name, str(path)))


def inline_markup(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`([^`]+)`", r'<font name="ReportMono" size="8">\1</font>', text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<link href="\2" color="#2563EB">\1</link>', text)
    return text


def render_diagram() -> Path | None:
    if not DIAGRAM.exists():
        return None
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    image_path = ASSET_DIR / "usecase-diagram.png"
    document = pdfium.PdfDocument(str(DIAGRAM))
    page = document[0]
    bitmap = page.render(scale=2.2)
    bitmap.to_pil().save(image_path)
    page.close()
    document.close()
    return image_path


class ReportDoc(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="body",
            topPadding=7 * mm,
            bottomPadding=4 * mm,
        )
        self.addPageTemplates(PageTemplate(id="report", frames=[frame], onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        canvas.saveState()
        page = canvas.getPageNumber()
        if page > 1:
            canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
            canvas.line(18 * mm, 285 * mm, 192 * mm, 285 * mm)
            canvas.setFont("ReportSans", 8)
            canvas.setFillColor(colors.HexColor("#475569"))
            canvas.drawString(18 * mm, 288 * mm, "LifeSync Local BERT Integration and QA Report")
            canvas.drawRightString(192 * mm, 10 * mm, f"Page {page}")
        canvas.restoreState()


def make_styles():
    sample = getSampleStyleSheet()
    styles = {
        "cover_title": ParagraphStyle(
            "CoverTitle", parent=sample["Title"], fontName="ReportSans-Bold",
            fontSize=26, leading=31, textColor=colors.HexColor("#0F172A"),
            alignment=TA_LEFT, spaceAfter=8 * mm,
        ),
        "cover_sub": ParagraphStyle(
            "CoverSub", parent=sample["BodyText"], fontName="ReportSans",
            fontSize=12, leading=18, textColor=colors.HexColor("#334155"),
        ),
        "h1": ParagraphStyle(
            "H1", parent=sample["Heading1"], fontName="ReportSans-Bold",
            fontSize=17, leading=21, textColor=colors.HexColor("#0F172A"),
            spaceBefore=8 * mm, spaceAfter=3 * mm, keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "H2", parent=sample["Heading2"], fontName="ReportSans-Bold",
            fontSize=13, leading=17, textColor=colors.HexColor("#0F766E"),
            spaceBefore=5 * mm, spaceAfter=2 * mm, keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "H3", parent=sample["Heading3"], fontName="ReportSans-Bold",
            fontSize=11, leading=14, textColor=colors.HexColor("#1E3A8A"),
            spaceBefore=4 * mm, spaceAfter=2 * mm, keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body", parent=sample["BodyText"], fontName="ReportSans",
            fontSize=9.2, leading=13.2, textColor=colors.HexColor("#1E293B"),
            spaceAfter=2.2 * mm,
        ),
        "bullet": ParagraphStyle(
            "Bullet", parent=sample["BodyText"], fontName="ReportSans",
            fontSize=9.1, leading=13, leftIndent=5 * mm, firstLineIndent=-3 * mm,
            textColor=colors.HexColor("#1E293B"), spaceAfter=1.2 * mm,
        ),
        "small": ParagraphStyle(
            "Small", parent=sample["BodyText"], fontName="ReportSans",
            fontSize=7.4, leading=9.6, textColor=colors.HexColor("#334155"),
        ),
        "table_head": ParagraphStyle(
            "TableHead", parent=sample["BodyText"], fontName="ReportSans-Bold",
            fontSize=7.2, leading=9, textColor=colors.white,
        ),
        "table_body": ParagraphStyle(
            "TableBody", parent=sample["BodyText"], fontName="ReportSans",
            fontSize=6.9, leading=9, textColor=colors.HexColor("#1E293B"),
        ),
        "code": ParagraphStyle(
            "Code", parent=sample["Code"], fontName="ReportMono",
            fontSize=7.3, leading=9.6, textColor=colors.HexColor("#0F172A"),
            backColor=colors.HexColor("#F1F5F9"), leftIndent=4 * mm,
            rightIndent=4 * mm, borderPadding=5, spaceBefore=2 * mm, spaceAfter=3 * mm,
        ),
    }
    return styles


def parse_table(lines: list[str], styles, available_width: float):
    rows = []
    for row_index, line in enumerate(lines):
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if row_index == 1 and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            continue
        style = styles["table_head"] if not rows else styles["table_body"]
        rows.append([Paragraph(inline_markup(cell), style) for cell in cells])

    columns = len(rows[0])
    if columns == 2:
        widths = [available_width * 0.28, available_width * 0.72]
    elif columns == 3:
        widths = [available_width * 0.20, available_width * 0.26, available_width * 0.54]
    elif columns == 4:
        widths = [available_width * 0.15, available_width * 0.24, available_width * 0.23, available_width * 0.38]
    elif columns == 5:
        widths = [available_width * 0.11, available_width * 0.24, available_width * 0.16, available_width * 0.22, available_width * 0.27]
    else:
        widths = [available_width / columns] * columns

    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F766E")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def build_story(markdown: str, styles, diagram_path: Path | None, width: float):
    lines = markdown.splitlines()
    story = []

    # Purpose-built cover for a clean executive artifact.
    story.extend([
        Spacer(1, 24 * mm),
        Paragraph("LifeSync", styles["cover_sub"]),
        Spacer(1, 3 * mm),
        Paragraph("Local BERT Integration<br/>and QA Report", styles["cover_title"]),
        Paragraph(
            "Local BERT runtime, deterministic safety architecture, model evidence, "
            "target-model benchmarks, 20-case end-to-end QA, and 16 professional use cases.",
            styles["cover_sub"],
        ),
        Spacer(1, 18 * mm),
        Table([
            [Paragraph("ASSESSMENT", styles["table_head"]), Paragraph("ENVIRONMENT", styles["table_head"])],
            [Paragraph("Integrated - hybrid safety router required", styles["body"]),
             Paragraph("Ryzen 5 5600X / Radeon RX 570 4 GB / Windows", styles["body"])],
            [Paragraph("QA RESULT", styles["table_head"]), Paragraph("MODEL RESULT", styles["table_head"])],
            [Paragraph("20/20 Playwright; 191/191 executed Jest tests", styles["body"]),
             Paragraph("Raw BERT 68.33%; shadow hybrid 96.67%", styles["body"])],
        ], colWidths=[width / 2, width / 2], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F766E")),
            ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#0F766E")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ])),
        Spacer(1, 20 * mm),
        Paragraph("Prepared 20 June 2026", styles["cover_sub"]),
        PageBreak(),
    ])

    if diagram_path:
        story.append(Paragraph("Supplied System Use-Case Diagram", styles["h1"]))
        image = Image(str(diagram_path))
        max_w, max_h = width, 225 * mm
        ratio = min(max_w / image.imageWidth, max_h / image.imageHeight)
        image.drawWidth = image.imageWidth * ratio
        image.drawHeight = image.imageHeight * ratio
        story.extend([
            Paragraph(
                "This source diagram was used for requirements reconciliation. The implementation status "
                "of each capability is stated explicitly in Section 8.", styles["body"]),
            Spacer(1, 2 * mm), image, PageBreak(),
        ])

    in_code = False
    skip_code = False
    code_lines: list[str] = []
    i = 0
    # Skip Markdown's title/metadata because the cover already contains it.
    while i < len(lines) and not lines[i].startswith("## "):
        i += 1

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            if in_code:
                if not skip_code:
                    story.append(Preformatted("\n".join(code_lines), styles["code"], maxLineLength=100))
                code_lines = []
                in_code = False
                skip_code = False
            else:
                in_code = True
                skip_code = stripped.lower().startswith("```mermaid")
                if skip_code:
                    story.append(Paragraph(
                        "React UI → Express API → NLP validation → local LM Studio. "
                        "In parallel, deterministic metrics → hybrid narrative merge → short-lived cache → dashboard. "
                        "An unavailable or invalid model routes to deterministic fallback.",
                        styles["body"],
                    ))
            i += 1
            continue
        if in_code:
            if not skip_code:
                code_lines.append(line)
            i += 1
            continue
        if not stripped:
            i += 1
            continue
        if stripped.startswith("# "):
            story.append(Paragraph(inline_markup(stripped[2:]), styles["h1"]))
        elif stripped.startswith("## "):
            story.append(Paragraph(inline_markup(stripped[3:]), styles["h1"]))
        elif stripped.startswith("### "):
            story.append(Paragraph(inline_markup(stripped[4:]), styles["h2"]))
        elif stripped.startswith("#### "):
            story.append(Paragraph(inline_markup(stripped[5:]), styles["h3"]))
        elif stripped.startswith("|") and i + 1 < len(lines) and lines[i + 1].strip().startswith("|"):
            table_lines = [line]
            i += 1
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i])
                i += 1
            story.extend([parse_table(table_lines, styles, width), Spacer(1, 3 * mm)])
            continue
        elif re.match(r"^[-*] ", stripped):
            story.append(Paragraph("• " + inline_markup(stripped[2:]), styles["bullet"]))
        elif re.match(r"^\d+\. ", stripped):
            match = re.match(r"^(\d+)\. (.*)$", stripped)
            story.append(Paragraph(f"{match.group(1)}. " + inline_markup(match.group(2)), styles["bullet"]))
        elif stripped == "---":
            story.append(Spacer(1, 2 * mm))
        else:
            # Preserve Markdown hard-break metadata lines as ordinary paragraphs.
            story.append(Paragraph(inline_markup(stripped.rstrip("  ")), styles["body"]))
        i += 1

    return story


def main() -> int:
    register_fonts()
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    diagram_path = render_diagram()
    styles = make_styles()
    doc = ReportDoc(
        str(OUTPUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=17 * mm, bottomMargin=16 * mm,
        title="LifeSync Local BERT Integration and QA Report",
        author="LifeSync Engineering QA",
        subject="Local AI integration, model evidence, QA, and use cases",
    )
    story = build_story(SOURCE.read_text(encoding="utf-8"), styles, diagram_path, doc.width)
    doc.build(story)
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())

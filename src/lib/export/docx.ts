import { AlignmentType, BorderStyle, DeletedTextRun, Document, Footer, Header, HeadingLevel, InsertedTextRun, LevelFormat, LineRuleType, Packer, PageBreak, PageNumber, Paragraph, ShadingType, TableOfContents, TextRun } from "docx";
import { diffWords } from "diff";
import type { RDoc } from "./model";
import { typographic } from "./model";

export type MsChapter = { title: string; heading: string | null; kind: string; matterType: string | null; paragraphs: { text: string; original: string; style: string; inserted: boolean }[] };
export type MsData = { title: string; author: string; genre?: string | null; wordCount: number; chapters: MsChapter[] };

const NAVY = "1D2A46";
const GOLD = "A9752F";

// ---------------------------------------------------------------- reports
export async function reportDocx(doc: RDoc): Promise<Buffer> {
  const children: Paragraph[] = [];
  children.push(new Paragraph({ children: [new TextRun({ text: "CASHLESS EDIT", bold: true, color: GOLD, size: 18, characterSpacing: 60 })], spacing: { after: 120 } }));
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title, color: NAVY, bold: true, size: 48, font: "Georgia" })] }));
  if (doc.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: doc.subtitle, italics: true, size: 26, color: "555555" })], spacing: { after: 200 } }));
  for (const m of doc.meta ?? []) children.push(new Paragraph({ children: [new TextRun({ text: m, size: 18, color: "666666" })] }));
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 4 } }, spacing: { after: 240 } }));
  for (const b of doc.blocks) {
    switch (b.t) {
      case "h1":
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 }, children: [new TextRun({ text: b.text, color: NAVY, bold: true, size: 32, font: "Georgia" })] }));
        break;
      case "h2":
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: b.text, color: NAVY, bold: true, size: 26, font: "Georgia" })] }));
        break;
      case "h3":
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: b.text, color: GOLD, bold: true, size: 22 })] }));
        break;
      case "p":
        for (const para of b.text.split(/\n{2,}/)) children.push(new Paragraph({ spacing: { after: 120, line: 300 }, children: [new TextRun({ text: para, size: 22 })] }));
        break;
      case "small":
        children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: b.text, size: 18, color: "666666", italics: true })] }));
        break;
      case "quote":
        children.push(new Paragraph({ indent: { left: 480 }, spacing: { after: 120 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } }, children: [new TextRun({ text: b.text, italics: true, size: 21, font: "Georgia" })] }));
        break;
      case "bullets":
        for (const it of b.items) children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: it, size: 22 })] }));
        break;
      case "kv":
        for (const [k, v] of b.items) children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: k + ": ", bold: true, size: 22, color: NAVY }), new TextRun({ text: v, size: 22 })] }));
        break;
      case "score":
        children.push(new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: b.label + "  ", bold: true, size: 23, color: NAVY }), new TextRun({ text: b.score == null ? "Not assessed" : `${b.score}/100`, bold: true, size: 23, color: GOLD })] }));
        children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: b.text, size: 20, color: "444444" })] }));
        break;
      case "issue":
        children.push(new Paragraph({ spacing: { before: 160, after: 40 }, shading: { type: ShadingType.CLEAR, fill: "F5EDD5", color: "auto" }, children: [new TextRun({ text: `${b.severity.toUpperCase()} · ${b.category}`, bold: true, size: 20, color: NAVY }), new TextRun({ text: `   ${b.where} · ${b.objective ? "Objective error" : "Editorial recommendation"}`, size: 18, color: "666666" })] }));
        if (b.original) children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 40 }, children: [new TextRun({ text: "Original: ", bold: true, size: 20 }), new TextRun({ text: b.original, italics: true, size: 20, font: "Georgia" })] }));
        children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 40 }, children: [new TextRun({ text: "Problem: ", bold: true, size: 20 }), new TextRun({ text: b.explanation, size: 20 })] }));
        if (b.suggestion) children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 40 }, children: [new TextRun({ text: "Suggested revision: ", bold: true, size: 20, color: "2E6B3A" }), new TextRun({ text: b.suggestion, size: 20, font: "Georgia" })] }));
        if (b.reason) children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 60 }, children: [new TextRun({ text: "Why: ", bold: true, size: 20 }), new TextRun({ text: b.reason, size: 20, color: "444444" })] }));
        break;
      case "pagebreak":
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
    }
  }
  const d = new Document({
    creator: "Cashless Edit",
    title: doc.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] }] },
    sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${doc.title} — Cashless Edit  ·  `, size: 16, color: "888888" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888" })] })] }) }, children }],
  });
  return Buffer.from(await Packer.toBuffer(d));
}

// ---------------------------------------------------------------- manuscripts
export type MsVariant = "clean" | "original" | "tracked" | "smf";

/**
 * clean    — the author-approved working text, typeset for publication (KDP-friendly styles, TOC).
 * original — exactly as uploaded.
 * tracked  — original → current as real Word tracked changes (Review ▸ Accept/Reject in Word).
 * smf      — Standard Manuscript Format for agent/publisher submission.
 */
export async function manuscriptDocx(ms: MsData, variant: MsVariant, opts: { typographic?: boolean } = {}): Promise<Buffer> {
  const smf = variant === "smf";
  const fix = (s: string) => (opts.typographic && variant !== "original" && variant !== "tracked" ? typographic(s) : s);
  const font = smf ? "Times New Roman" : "Georgia";
  const size = smf ? 24 : 23;
  const line = smf ? 480 : 300;
  const children: Paragraph[] = [];
  const surname = ms.author.split(/\s+/).pop() || "Author";
  const date = new Date().toISOString();
  let rev = 1;

  const hasTitlePage = ms.chapters.some((c) => c.matterType === "title_page");
  if (smf) {
    children.push(new Paragraph({ children: [new TextRun({ text: ms.author, font, size })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: `Approx. ${roundWords(ms.wordCount).toLocaleString()} words`, font, size })], alignment: AlignmentType.RIGHT }));
    for (let i = 0; i < 8; i++) children.push(new Paragraph({ children: [] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ms.title.toUpperCase(), font, size })] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `by ${ms.author}`, font, size })] }));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  } else if (!hasTitlePage && variant === "clean") {
    for (let i = 0; i < 8; i++) children.push(new Paragraph({ children: [] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ms.title, font, size: 56, bold: true })] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: ms.author, font, size: 32 })] }));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  if (variant === "clean") {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Contents", font })] }));
    children.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-1" }) as unknown as Paragraph);
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  let first = true;
  for (const ch of ms.chapters) {
    if (smf && ch.kind === "front" && ch.matterType !== "dedication") continue; // submissions omit copyright/TOC pages
    if (variant === "clean" && ch.matterType === "toc") continue; // regenerated above
    if (!first) children.push(new Paragraph({ children: [new PageBreak()] }));
    first = false;
    const isTitle = ch.matterType === "title_page";
    if (!isTitle && ch.kind !== "front" || ch.heading) {
      if (smf) for (let i = 0; i < 6; i++) children.push(new Paragraph({ children: [] }));
      children.push(new Paragraph({ heading: ch.kind === "chapter" || ch.kind === "part" || ch.heading ? HeadingLevel.HEADING_1 : undefined, alignment: AlignmentType.CENTER, spacing: { before: smf ? 0 : 1200, after: 480 }, children: [new TextRun({ text: fix(ch.kind === "chapter" ? ch.title : ch.heading ?? ch.title), font, size: smf ? size : 36, bold: !smf })] }));
    }
    let firstPara = true;
    for (const p of ch.paragraphs) {
      if (p.style === "scene_break") {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240, line }, children: [new TextRun({ text: smf ? "#" : "* * *", font, size })] }));
        firstPara = true;
        continue;
      }
      const centered = p.style === "center" || isTitle || ch.matterType === "copyright" || ch.matterType === "dedication";
      const indent = !centered && !firstPara && p.style !== "quote" ? { firstLine: smf ? 720 : 360 } : p.style === "quote" ? { left: 720, right: 720 } : undefined;
      let runs: (TextRun | InsertedTextRun | DeletedTextRun)[];
      if (variant === "tracked") {
        if (p.inserted) runs = [new InsertedTextRun({ id: rev++, author: "Cashless Edit", date, text: p.text, font, size } as any)];
        else
          runs = diffWords(p.original, p.text).map((part) =>
            part.added ? new InsertedTextRun({ id: rev++, author: "Cashless Edit", date, text: part.value, font, size } as any) : part.removed ? new DeletedTextRun({ id: rev++, author: "Cashless Edit", date, text: part.value, font, size } as any) : new TextRun({ text: part.value, font, size }),
          );
      } else {
        const t = variant === "original" ? p.original : p.text;
        if (variant === "original" && p.inserted) continue;
        runs = [new TextRun({ text: fix(t), font, size, bold: isTitle && firstPara && !smf })];
      }
      children.push(new Paragraph({ alignment: centered ? AlignmentType.CENTER : smf ? AlignmentType.LEFT : AlignmentType.JUSTIFIED, indent, spacing: { line, lineRule: LineRuleType.AUTO, after: smf ? 0 : centered ? 120 : 0 }, children: runs as any }));
      firstPara = false;
    }
  }
  if (smf) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480 }, children: [new TextRun({ text: "THE END", font, size })] }));
  }

  const header = smf ? new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${surname} / ${ms.title.toUpperCase().slice(0, 40)} / `, font, size }), new TextRun({ children: [PageNumber.CURRENT], font, size })] })] }) : undefined;
  const footer = !smf && variant !== "original" ? new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font, size: 18 })] })] }) : undefined;
  const d = new Document({
    creator: ms.author,
    title: ms.title,
    features: { trackRevisions: variant === "tracked", updateFields: variant === "clean" },
    styles: { default: { document: { run: { font, size } } }, paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font, size: smf ? size : 36, bold: !smf }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } } }] },
    sections: [{ properties: { page: smf ? { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } : { size: { width: 8640, height: 12960 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 900, gutter: 180 } } }, headers: header ? { default: header } : undefined, footers: footer ? { default: footer } : undefined, children }],
  });
  return Buffer.from(await Packer.toBuffer(d));
}

function roundWords(n: number) {
  return n < 10000 ? Math.round(n / 100) * 100 : Math.round(n / 1000) * 1000;
}

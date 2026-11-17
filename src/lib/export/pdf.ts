import PDFDocument from "pdfkit";
import { diffWords } from "diff";
import type { RDoc } from "./model";
import { typographic } from "./model";
import type { MsData } from "./docx";

/** pdfkit's standard fonts use WinAnsi encoding — map anything outside it to a safe equivalent. */
const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function pdfSafe(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (c < 256 || WINANSI_EXTRA.has(ch)) out += ch;
    else if (/[‐-‒]/.test(ch)) out += "-";
    else if (ch === "―") out += "—";
    else if (/[′]/.test(ch)) out += "'";
    else if (/[″]/.test(ch)) out += '"';
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += base && base.codePointAt(0)! < 256 ? base : "?";
    }
  }
  return out;
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

const NAVY = "#1d2a46";
const GOLD = "#a9752f";

export async function reportPdf(r: RDoc): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 72, bottom: 72, left: 72, right: 72 }, bufferPages: true, info: { Title: r.title, Creator: "Cashless Edit" } });
  const out = collect(doc);
  const W = doc.page.width - 144;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GOLD).text("CASHLESS EDIT", { characterSpacing: 2 });
  doc.moveDown(0.5).font("Times-Bold").fontSize(26).fillColor(NAVY).text(pdfSafe(r.title));
  if (r.subtitle) doc.moveDown(0.2).font("Times-Italic").fontSize(14).fillColor("#555").text(pdfSafe(r.subtitle));
  doc.moveDown(0.5).font("Helvetica").fontSize(9).fillColor("#666");
  for (const m of r.meta ?? []) doc.text(pdfSafe(m));
  doc.moveDown(0.5).moveTo(72, doc.y).lineTo(72 + W, doc.y).strokeColor(GOLD).lineWidth(1).stroke().moveDown(1);
  const ensure = (h: number) => {
    if (doc.y + h > doc.page.height - 72) doc.addPage();
  };
  for (const b of r.blocks) {
    switch (b.t) {
      case "h1":
        ensure(60);
        doc.moveDown(0.8).font("Times-Bold").fontSize(18).fillColor(NAVY).text(pdfSafe(b.text)).moveDown(0.3);
        break;
      case "h2":
        ensure(40);
        doc.moveDown(0.5).font("Times-Bold").fontSize(14).fillColor(NAVY).text(pdfSafe(b.text)).moveDown(0.2);
        break;
      case "h3":
        ensure(30);
        doc.moveDown(0.3).font("Helvetica-Bold").fontSize(10.5).fillColor(GOLD).text(pdfSafe(b.text)).moveDown(0.1);
        break;
      case "p":
        for (const para of b.text.split(/\n{2,}/)) doc.font("Helvetica").fontSize(10.5).fillColor("#222").text(pdfSafe(para), { lineGap: 2.5, align: "left" }).moveDown(0.45);
        break;
      case "small":
        doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#666").text(pdfSafe(b.text), { lineGap: 1.5 }).moveDown(0.4);
        break;
      case "quote": {
        const y0 = doc.y;
        doc.font("Times-Italic").fontSize(11).fillColor("#333").text(pdfSafe(b.text), 90, doc.y, { width: W - 18, lineGap: 2 });
        doc.moveTo(80, y0).lineTo(80, doc.y).strokeColor(GOLD).lineWidth(2).stroke();
        doc.x = 72;
        doc.moveDown(0.5);
        break;
      }
      case "bullets":
        for (const it of b.items) doc.font("Helvetica").fontSize(10.5).fillColor("#222").text("•  " + pdfSafe(it), 82, doc.y, { width: W - 10, lineGap: 2, indent: -10 }).moveDown(0.2);
        doc.x = 72;
        doc.moveDown(0.3);
        break;
      case "kv":
        for (const [k, v] of b.items) doc.font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY).text(pdfSafe(k) + ": ", { continued: true }).font("Helvetica").fillColor("#222").text(pdfSafe(v)).moveDown(0.15);
        doc.moveDown(0.3);
        break;
      case "score": {
        ensure(50);
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY).text(pdfSafe(b.label), 72, y, { width: W - 90 });
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(GOLD).text(b.score == null ? "n/a" : `${b.score}/100`, 72 + W - 80, y, { width: 80, align: "right" });
        const barY = doc.y + 2;
        doc.rect(72, barY, W, 4).fillColor("#eee").fill();
        if (b.score != null) doc.rect(72, barY, (W * b.score) / 100, 4).fillColor(b.score >= 75 ? "#3a7d44" : b.score >= 55 ? GOLD : "#b33a3a").fill();
        doc.x = 72;
        doc.y = barY + 9;
        doc.font("Helvetica").fontSize(9.5).fillColor("#444").text(pdfSafe(b.text), { lineGap: 1.5 }).moveDown(0.6);
        break;
      }
      case "issue": {
        ensure(80);
        const col = b.severity === "critical" ? "#9b1c1c" : b.severity === "major" ? "#b45309" : b.severity === "moderate" ? GOLD : "#4b5563";
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(col).text(`${b.severity.toUpperCase()}  ·  ${pdfSafe(b.category)}`, { continued: true }).font("Helvetica").fillColor("#777").text(`   ${pdfSafe(b.where)} · ${b.objective ? "Objective error" : "Editorial recommendation"}`);
        doc.moveDown(0.15);
        const line = (label: string, text: string, font = "Helvetica", color = "#222") => doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(label, 84, doc.y, { continued: true, width: W - 12 }).font(font).fillColor(color).text(pdfSafe(text), { lineGap: 1.5 });
        if (b.original) line("Original: ", b.original, "Times-Italic");
        line("Problem: ", b.explanation);
        if (b.suggestion) line("Suggested revision: ", b.suggestion, "Times-Roman", "#2e6b3a");
        if (b.reason) line("Why: ", b.reason, "Helvetica", "#444");
        doc.x = 72;
        doc.moveDown(0.7);
        break;
      }
      case "pagebreak":
        doc.addPage();
        break;
    }
  }
  pageNumbers(doc, r.title, 72);
  doc.end();
  return out;
}

function pageNumbers(doc: PDFKit.PDFDocument, title: string, bottom: number, skipFirst = 1) {
  const range = doc.bufferedPageRange();
  for (let i = range.start + skipFirst; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const old = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor("#888").text(`${pdfSafe(title)}  ·  ${i + 1}`, 0, doc.page.height - bottom / 2 - 4, { width: doc.page.width, align: "center", lineBreak: false });
    doc.page.margins.bottom = old;
  }
}

export const TRIMS: Record<string, { w: number; h: number; label: string }> = {
  "5x8": { w: 360, h: 576, label: "5 × 8 in" },
  "5.5x8.5": { w: 396, h: 612, label: "5.5 × 8.5 in" },
  "6x9": { w: 432, h: 648, label: "6 × 9 in" },
  letter: { w: 612, h: 792, label: "US Letter (review copy)" },
};

/**
 * Manuscript PDF.
 * clean       — typeset interior: chapter openers on new pages, justified text, first-line indents.
 * highlighted — review copy showing every change since upload (deletions struck through in red, insertions in green).
 * print       — print-ready interior for KDP paperback/hardcover: chosen trim size, margins that satisfy KDP's
 *               gutter requirement for the page count (applied to both sides), chapters start on right-hand pages.
 */
export async function manuscriptPdf(ms: MsData, variant: "clean" | "highlighted" | "print", trimKey = "6x9"): Promise<Buffer> {
  const trim = TRIMS[variant === "print" ? trimKey : "letter"] ?? TRIMS["6x9"];
  const print = variant === "print";
  // KDP minimum inside (gutter) margin by page count; we apply it symmetrically so it holds on recto and verso.
  const estPages = ms.wordCount / (trim.w <= 360 ? 250 : trim.w <= 396 ? 280 : 320);
  const gutterIn = estPages <= 150 ? 0.375 : estPages <= 300 ? 0.5 : estPages <= 500 ? 0.625 : estPages <= 700 ? 0.75 : 0.875;
  const side = print ? Math.max(0.5, gutterIn + 0.125) * 72 : 72;
  const top = print ? 50 : 72,
    bottom = print ? 54 : 72;
  const doc = new PDFDocument({ size: [trim.w, trim.h], margins: { top, bottom, left: side, right: side }, bufferPages: true, autoFirstPage: true, info: { Title: ms.title, Author: ms.author, Creator: "Cashless Edit" } });
  const out = collect(doc);
  const bodySize = print ? 10.5 : 11.5;
  const fix = (s: string) => pdfSafe(variant === "highlighted" ? s : typographic(s));
  const width = () => doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const newRecto = () => {
    doc.addPage();
    if (print && doc.bufferedPageRange().count % 2 === 0) doc.addPage(); // blank verso so chapters open on the right
  };

  // Title page
  doc.font("Times-Bold").fontSize(print ? 24 : 30).fillColor("#000").text(pdfSafe(ms.title), doc.page.margins.left, trim.h * 0.3, { width: width(), align: "center" });
  doc.moveDown(1.5).font("Times-Roman").fontSize(print ? 14 : 16).text(pdfSafe(ms.author), { width: width(), align: "center" });
  if (variant === "highlighted") doc.moveDown(3).font("Helvetica").fontSize(9).fillColor("#666").text("Review copy — changes since upload: deletions in red strikethrough, insertions in green underline.", { width: width(), align: "center" });

  const firstPages = new Set<number>();
  for (const ch of ms.chapters) {
    if (ch.matterType === "title_page" || ch.matterType === "toc") continue;
    newRecto();
    firstPages.add(doc.bufferedPageRange().count - 1);
    doc.fillColor("#000");
    if (ch.kind === "chapter" || ch.kind === "part" || ch.heading) {
      doc.y = doc.page.margins.top + (print ? 60 : 90);
      doc.font("Times-Bold").fontSize(print ? 15 : 18).text(pdfSafe(ch.kind === "chapter" ? ch.title : ch.heading ?? ch.title), doc.page.margins.left, doc.y, { width: width(), align: "center" });
      doc.moveDown(2);
    }
    let first = true;
    for (const p of ch.paragraphs) {
      if (p.style === "scene_break") {
        doc.moveDown(0.6).font("Times-Roman").fontSize(bodySize).text("*   *   *", doc.page.margins.left, doc.y, { width: width(), align: "center" }).moveDown(0.6);
        first = true;
        continue;
      }
      const centered = p.style === "center" || ch.matterType === "copyright" || ch.matterType === "dedication";
      const opts: PDFKit.Mixins.TextOptions = { width: width(), align: centered ? "center" : "justify", indent: first || centered ? 0 : 18, lineGap: print ? 2 : 3.5, paragraphGap: centered ? 6 : 0 };
      doc.font("Times-Roman").fontSize(bodySize).fillColor("#000");
      if (variant === "highlighted" && (p.inserted || p.original !== p.text)) {
        const parts = p.inserted ? [{ value: p.text, added: true, removed: false }] : diffWords(p.original, p.text);
        doc.text("", doc.page.margins.left, doc.y, { ...opts, continued: true });
        parts.forEach((part, k) => {
          const last = k === parts.length - 1;
          if (part.added) doc.fillColor("#1f7a3a").text(pdfSafe(part.value), { ...opts, underline: true, strike: false, continued: !last });
          else if (part.removed) doc.fillColor("#b42318").text(pdfSafe(part.value), { ...opts, strike: true, underline: false, continued: !last });
          else doc.fillColor("#000").text(pdfSafe(part.value), { ...opts, strike: false, underline: false, continued: !last });
        });
        doc.fillColor("#000");
      } else {
        const t = variant === "highlighted" ? p.text : p.text;
        doc.text(fix(t), doc.page.margins.left, doc.y, opts);
      }
      first = false;
    }
  }
  // Page numbers (skip title page and chapter-opening pages, as is conventional in print).
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    if (firstPages.has(i)) continue;
    doc.switchToPage(i);
    const old = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Times-Roman").fontSize(9).fillColor("#000").text(String(i + 1), 0, doc.page.height - bottom / 2 - 4, { width: doc.page.width, align: "center", lineBreak: false });
    doc.page.margins.bottom = old;
  }
  doc.end();
  return out;
}

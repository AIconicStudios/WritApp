import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, now, uid } from "../db";
import type { ManuscriptRow } from "../types";
import { getChapters, getParagraphs } from "../repo";
import { manuscriptDocx, reportDocx, type MsData } from "./docx";
import { manuscriptPdf, reportPdf } from "./pdf";
import { manuscriptEpub } from "./epub";
import * as R from "./reports";
import { encryptBuffer } from "../secure";
import { HttpError } from "../auth";

export const EXPORTS: { id: string; name: string; group: "manuscript" | "report" | "book"; formats: string[]; desc: string }[] = [
  { id: "ms_clean", name: "Clean manuscript", group: "manuscript", formats: ["docx", "pdf", "epub"], desc: "Your current approved text, typeset with a generated table of contents. Straight quotes and “--” are converted to typographic quotes and em dashes in the export." },
  { id: "ms_original", name: "Original manuscript", group: "manuscript", formats: ["docx"], desc: "Exactly as uploaded — untouched." },
  { id: "ms_tracked", name: "Edited manuscript with tracked changes", group: "manuscript", formats: ["docx"], desc: "Every change since upload as real Word tracked changes (Review → Accept / Reject)." },
  { id: "ms_highlighted", name: "Edited manuscript with highlighted changes", group: "manuscript", formats: ["pdf"], desc: "Review PDF: deletions struck through in red, insertions underlined in green." },
  { id: "ms_smf", name: "Standard Manuscript Format (submission)", group: "manuscript", formats: ["docx"], desc: "For agents and publishers: Times New Roman 12 pt, double-spaced, 1-inch margins, header with surname / title / page." },
  { id: "ms_kdp_ebook", name: "Kindle eBook (KDP)", group: "manuscript", formats: ["epub", "docx"], desc: "Reflowable eBook with navigable table of contents — upload to KDP." },
  { id: "ms_print", name: "Print-ready interior (paperback / hardcover)", group: "manuscript", formats: ["pdf"], desc: "Chosen trim size, KDP gutter margins for the page count, chapters opening on right-hand pages." },
  { id: "report_editorial", name: "Editorial assessment report", group: "report", formats: ["docx", "pdf"], desc: "Scores, verdict, strengths, weaknesses and every open finding." },
  { id: "report_publication", name: "Publication readiness audit", group: "report", formats: ["docx", "pdf"], desc: "KDP / print / submission checklist." },
  { id: "book_summary", name: "Complete book summary", group: "book", formats: ["docx", "pdf"], desc: "Short and detailed summaries, beginning/middle/ending, themes." },
  { id: "book_summary_nospoil", name: "Spoiler-free summary", group: "book", formats: ["docx", "pdf"], desc: "Summary without the ending or twists." },
  { id: "book_characters", name: "Character analysis report", group: "book", formats: ["docx", "pdf"], desc: "Full profiles, relationships and editorial flags." },
  { id: "book_conflicts", name: "Conflict analysis report", group: "book", formats: ["docx", "pdf"], desc: "Central and secondary conflicts." },
  { id: "book_plot", name: "Plot analysis report", group: "book", formats: ["docx", "pdf"], desc: "Narrative stages, subplots, twists, unresolved threads." },
  { id: "book_chapters", name: "Chapter-by-chapter summary", group: "book", formats: ["docx", "pdf"], desc: "Summaries and chapter intelligence." },
  { id: "book_bible", name: "Complete Story Bible", group: "book", formats: ["docx", "pdf"], desc: "Characters, relationships, locations, timeline, objects, rules…" },
  { id: "book_literary", name: "Full literary analysis report", group: "book", formats: ["docx", "pdf"], desc: "Summary, characters, conflicts, plot, themes and setting combined." },
];

export function msData(ms: ManuscriptRow): MsData {
  const chapters = getChapters(ms.id).map((c) => ({ title: c.title, heading: c.heading, kind: c.kind, matterType: c.matter_type, paragraphs: getParagraphs(c.id).map((p) => ({ text: p.current_text, original: p.original_text, style: p.style, inserted: !!p.inserted })) }));
  return { title: ms.title, author: ms.author || "Author Name", genre: ms.genre, wordCount: ms.word_count, chapters };
}

const MIME: Record<string, string> = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf", epub: "application/epub+zip" };

export async function generateExport(ms: ManuscriptRow, userId: string, kind: string, format: string, opts: { trim?: string } = {}) {
  const def = EXPORTS.find((e) => e.id === kind);
  if (!def || !def.formats.includes(format)) throw new HttpError(400, "Unsupported export.");
  let buf: Buffer;
  const reportBuilders: Record<string, () => import("./model").RDoc> = {
    report_editorial: () => R.editorialReport(ms),
    report_publication: () => R.publicationReport(ms),
    book_summary: () => R.bookSummaryReport(ms, true),
    book_summary_nospoil: () => R.bookSummaryReport(ms, false),
    book_characters: () => R.charactersReport(ms),
    book_conflicts: () => R.conflictsReport(ms),
    book_plot: () => R.plotReport(ms),
    book_chapters: () => R.chapterSummariesReport(ms),
    book_bible: () => R.storyBibleReport(ms),
    book_literary: () => R.literaryReport(ms),
  };
  if (reportBuilders[kind]) {
    const doc = reportBuilders[kind]();
    buf = format === "pdf" ? await reportPdf(doc) : await reportDocx(doc);
  } else {
    const data = msData(ms);
    switch (kind) {
      case "ms_clean":
        buf = format === "pdf" ? await manuscriptPdf(data, "clean") : format === "epub" ? await manuscriptEpub(data) : await manuscriptDocx(data, "clean", { typographic: true });
        break;
      case "ms_original":
        buf = await manuscriptDocx(data, "original");
        break;
      case "ms_tracked":
        buf = await manuscriptDocx(data, "tracked");
        break;
      case "ms_highlighted":
        buf = await manuscriptPdf(data, "highlighted");
        break;
      case "ms_smf":
        buf = await manuscriptDocx(data, "smf", { typographic: true });
        break;
      case "ms_kdp_ebook":
        buf = format === "epub" ? await manuscriptEpub(data) : await manuscriptDocx(data, "clean", { typographic: true });
        break;
      case "ms_print":
        buf = await manuscriptPdf(data, "print", opts.trim ?? "6x9");
        break;
      default:
        throw new HttpError(400, "Unsupported export.");
    }
  }
  const safe = ms.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "_").slice(0, 60) || "manuscript";
  const fileName = `${safe}_${kind.replace(/^(ms|book|report)_/, "")}${kind === "ms_print" ? "_" + (opts.trim ?? "6x9") : ""}.${format}`;
  const id = uid("x_");
  const stored = path.join("exports", id + ".bin");
  fs.writeFileSync(path.join(DATA_DIR, stored), encryptBuffer(buf), { mode: 0o600 });
  db().prepare("INSERT INTO exports (id, manuscript_id, user_id, kind, format, file_name, file_path, size, created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, ms.id, userId, kind, format, fileName, stored, buf.length, now());
  return { id, fileName, size: buf.length, mime: MIME[format], buf };
}

export { MIME };

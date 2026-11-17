import type { Ref } from "../types";
import type { RChapter } from "./rules";
import { countWords } from "../text";

export type Check = { id: string; area: string; status: "pass" | "warn" | "fail" | "info"; title: string; detail: string; refs?: Ref[] };
export type TargetAssessment = { id: string; name: string; status: "ready" | "needs_work" | "not_ready"; notes: string[] };
export type PublicationAudit = {
  checks: Check[];
  targets: TargetAssessment[];
  pageEstimates: { trim: string; pages: number }[];
  wordCount: number;
  genreRange: { genre: string; min: number; max: number } | null;
  score: number;
  disclaimer: string;
  aiNotes?: string[];
};

const GENRE_RANGES: [RegExp, string, number, number][] = [
  [/fantasy|sci-?fi|science fiction|epic/i, "Fantasy / Science fiction", 90000, 125000],
  [/romance/i, "Romance", 70000, 100000],
  [/thriller|mystery|crime|suspense/i, "Thriller / Mystery", 70000, 100000],
  [/horror/i, "Horror", 70000, 95000],
  [/young adult|\bya\b|teen/i, "Young adult", 55000, 90000],
  [/middle grade|children/i, "Middle grade", 30000, 55000],
  [/literary|historical|general|fiction|novel/i, "Adult fiction", 70000, 110000],
  [/memoir|biography/i, "Memoir", 60000, 95000],
  [/non-?fiction|self-help|business/i, "Non-fiction", 40000, 80000],
];

export function publicationAudit(chapters: RChapter[], opts: { genre?: string | null; openCritical: number; openMajor: number; openObjective: number; title: string; author?: string | null }): PublicationAudit {
  const checks: Check[] = [];
  const front = chapters.filter((c) => c.kind === "front");
  const back = chapters.filter((c) => c.kind === "back");
  const body = chapters.filter((c) => c.kind === "chapter");
  const has = (t: string) => chapters.some((c) => c.matterType === t);
  const hRef = (c: RChapter): Ref => ({ chapterId: c.id, chapterIdx: c.idx, paragraphIdx: 0, paragraphId: c.paragraphs[0]?.id, quote: c.heading ?? c.title, label: c.title });
  const wc = chapters.reduce((n, c) => n + c.paragraphs.reduce((m, p) => m + countWords(p.text), 0), 0);
  const bodyWc = body.reduce((n, c) => n + c.paragraphs.reduce((m, p) => m + countWords(p.text), 0), 0);

  // Completeness
  checks.push(body.length ? { id: "chapters", area: "Completeness", status: "pass", title: `${body.length} chapters detected`, detail: `Body text: ${bodyWc.toLocaleString()} words.` } : { id: "chapters", area: "Completeness", status: "fail", title: "No chapters detected", detail: "Add chapter headings (e.g. “Chapter 1”) so the book can be navigated and typeset." });
  const last = body[body.length - 1];
  if (last) {
    const lastText = last.paragraphs.map((p) => p.text).join(" ").trim();
    const endsMid = !/[.!?”"’…]$/.test(lastText);
    checks.push(endsMid ? { id: "ending", area: "Completeness", status: "warn", title: "The final chapter may be incomplete", detail: "The last chapter ends without terminal punctuation — check that the manuscript was not truncated.", refs: [hRef(last)] } : { id: "ending", area: "Completeness", status: "pass", title: "Manuscript has a complete final chapter", detail: `Ends with “${last.title}”.` });
    if (/\b(tbc|to be continued|todo|tk|xxx|\[insert|lorem ipsum)\b/i.test(chapters.flatMap((c) => c.paragraphs.map((p) => p.text)).join(" "))) checks.push({ id: "placeholders", area: "Completeness", status: "fail", title: "Placeholder text found", detail: "The manuscript contains placeholder markers (TK, TODO, XXX, [insert…], lorem ipsum, TBC). Remove them before publishing." });
  }
  const numbered = body.filter((c) => c.number !== null && c.matterType !== "auto");
  let seqOk = true;
  for (let i = 1; i < numbered.length; i++) if (numbered[i].number !== numbered[i - 1].number! + 1 && numbered[i].number !== 1) seqOk = false;
  checks.push({ id: "numbering", area: "Chapter organisation", status: seqOk ? "pass" : "fail", title: seqOk ? "Chapter numbering is sequential" : "Chapter numbering has gaps, duplicates or ordering problems", detail: seqOk ? "No gaps or duplicates found." : "See the Proofreading issues for the exact chapters involved." });
  const lens = body.map((c) => c.paragraphs.reduce((m, p) => m + countWords(p.text), 0));
  if (lens.length > 3) {
    const sorted = [...lens].sort((a, b) => a - b);
    checks.push({ id: "chapter_lengths", area: "Chapter organisation", status: "info", title: "Chapter lengths", detail: `Shortest ${sorted[0].toLocaleString()} words, median ${sorted[Math.floor(sorted.length / 2)].toLocaleString()}, longest ${sorted[sorted.length - 1].toLocaleString()}.` });
  }
  const auto = body.some((c) => c.matterType === "auto");
  if (auto) checks.push({ id: "auto_sections", area: "Chapter organisation", status: "fail", title: "No chapter headings in the source file", detail: "Cashless Edit divided the text automatically. Add real chapter headings before publication." });

  // Formatting
  const headings = body.map((c) => c.heading).filter(Boolean) as string[];
  const styles = new Set(headings.map((h) => (/^chapter\s+\d/i.test(h) ? "d" : /^chapter\s+[ivx]/i.test(h) ? "r" : /^chapter/i.test(h) ? "w" : "o") + (h === h.toUpperCase() ? "U" : "T")));
  checks.push({ id: "heading_style", area: "Formatting", status: styles.size <= 1 ? "pass" : "warn", title: styles.size <= 1 ? "Chapter headings are consistent" : "Chapter headings use mixed styles", detail: styles.size <= 1 ? "All chapter headings follow one pattern." : "Use a single heading style for every chapter." });
  const text = chapters.flatMap((c) => c.paragraphs.map((p) => p.text)).join("\n");
  const straight = (text.match(/"/g) ?? []).length;
  const curly = (text.match(/[“”]/g) ?? []).length;
  checks.push({ id: "quotes", area: "Formatting", status: straight && curly ? "warn" : straight > 20 ? "warn" : "pass", title: straight && curly ? "Mixed straight and curly quotation marks" : straight > 20 ? "Straight quotation marks used" : "Quotation marks are typographic", detail: straight && curly ? `${straight} straight vs ${curly} curly.` : straight > 20 ? "Print and ebook typesetting expects curly quotes. Cashless Edit's export can convert them." : "Good." });
  const dashes = (text.match(/--|\w - \w/g) ?? []).length;
  checks.push({ id: "dashes", area: "Formatting", status: dashes > 2 ? "warn" : "pass", title: dashes > 2 ? `${dashes} improvised dashes (“--” or “ - ”)` : "Dashes are typeset correctly", detail: dashes > 2 ? "Replace with em dashes (—)." : "No improvised dashes found." });

  // Front matter
  checks.push({ id: "title_page", area: "Front matter", status: has("title_page") ? "pass" : "warn", title: has("title_page") ? "Title page present" : "No title page detected", detail: has("title_page") ? "" : `Add a title page with the title (“${opts.title}”) and author name. Cashless Edit's exports can generate one.` });
  checks.push({ id: "copyright", area: "Front matter", status: has("copyright") ? "pass" : "warn", title: has("copyright") ? "Copyright page present" : "No copyright page detected", detail: has("copyright") ? "" : "Self-published print and ebook editions need a copyright page (© year, author, rights statement, ISBN if any, edition). Not needed for agent/publisher submissions." });
  checks.push({ id: "toc", area: "Front matter", status: has("toc") ? "pass" : "info", title: has("toc") ? "Table of contents present" : "No table of contents", detail: has("toc") ? "Verify it matches the final chapter titles; generated exports rebuild it automatically." : "KDP ebooks should include a navigable table of contents; Cashless Edit's EPUB/DOCX exports generate one from the chapter headings." });
  checks.push({ id: "dedication", area: "Front matter", status: "info", title: has("dedication") ? "Dedication present" : "No dedication (optional)", detail: "" });
  // Back matter
  checks.push({ id: "ack", area: "Back matter", status: has("acknowledgements") ? "pass" : "info", title: has("acknowledgements") ? "Acknowledgements present" : "No acknowledgements (optional)", detail: "" });
  checks.push({ id: "about", area: "Back matter", status: has("about_author") ? "pass" : "warn", title: has("about_author") ? "About the Author present" : "No About the Author page", detail: has("about_author") ? "" : "Recommended for self-published editions; it builds reader connection and can link to your other books." });
  const nonfiction = /non-?fiction|memoir|biography|history|research|academic|self-help/i.test(opts.genre ?? "");
  if (nonfiction) checks.push({ id: "biblio", area: "Back matter", status: has("bibliography") || has("notes") ? "pass" : "warn", title: has("bibliography") || has("notes") ? "References / notes present" : "No bibliography or references detected", detail: "Non-fiction that cites sources should include notes or a bibliography." });

  // Editorial state
  checks.push({ id: "critical_issues", area: "Editorial quality", status: opts.openCritical ? "fail" : opts.openMajor > 10 ? "warn" : "pass", title: opts.openCritical ? `${opts.openCritical} critical issues unresolved` : opts.openMajor ? `${opts.openMajor} major issues unresolved` : "No critical or major issues open", detail: "Resolve critical and major issues in the revision workspace before publishing." });
  checks.push({ id: "objective_errors", area: "Editorial quality", status: opts.openObjective > Math.max(15, wc / 2000) ? "warn" : "pass", title: `${opts.openObjective} objective language errors open`, detail: "Spelling, punctuation and grammar errors found by the copy-edit and proofread stages." });

  // Length vs genre
  let genreRange: PublicationAudit["genreRange"] = null;
  for (const [re, g, min, max] of GENRE_RANGES) if (opts.genre && re.test(opts.genre)) {
    genreRange = { genre: g, min, max };
    break;
  }
  if (genreRange) {
    const inRange = bodyWc >= genreRange.min * 0.9 && bodyWc <= genreRange.max * 1.1;
    checks.push({ id: "length", area: "Market fit", status: inRange ? "pass" : "warn", title: `Length: ${bodyWc.toLocaleString()} words`, detail: `Typical range for ${genreRange.genre} debut submissions is about ${genreRange.min.toLocaleString()}–${genreRange.max.toLocaleString()} words. ${inRange ? "Within range." : bodyWc < genreRange.min ? "Shorter than typical — agents may see this as underdeveloped." : "Longer than typical — agents may hesitate on a debut of this length."} These are conventions, not rules.` });
  }

  // Page estimates (≈ words per page for typical interior layouts)
  const perPage: [string, number][] = [["5 × 8 in", 250], ["5.5 × 8.5 in", 280], ["6 × 9 in", 320]];
  const extra = front.length + back.length + body.length * 0.5; // chapter openers / matter pages
  const pageEstimates = perPage.map(([trim, wpp]) => ({ trim, pages: Math.ceil(wc / wpp + extra) }));
  const p69 = pageEstimates[2].pages;

  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const targets: TargetAssessment[] = [
    {
      id: "kdp_ebook", name: "Amazon KDP — Kindle eBook", status: fails ? "not_ready" : warns > 2 ? "needs_work" : "ready",
      notes: ["KDP accepts DOCX and EPUB; use the EPUB export for best results.", has("toc") ? "Table of contents found." : "Include a table of contents (generated automatically in the EPUB/DOCX export).", "Cover image is uploaded separately in KDP (not part of this manuscript).", "Avoid manual page breaks and blank lines for spacing; Cashless Edit exports use proper styles."],
    },
    {
      id: "paperback", name: "Paperback (KDP Print / IngramSpark)", status: fails ? "not_ready" : p69 < 24 ? "not_ready" : warns > 2 ? "needs_work" : "ready",
      notes: [`Estimated ${pageEstimates.map((p) => `${p.pages} pages at ${p.trim}`).join(", ")}.`, p69 < 24 ? "KDP paperback requires at least 24 pages." : p69 > 828 ? "Over KDP's 828-page paperback limit at 6×9 — consider a larger trim or splitting the book." : "Within KDP paperback page limits (24–828).", "Use the print-ready PDF export with the trim size you choose; margins are set for the gutter.", has("copyright") ? "Copyright page found." : "Add a copyright page."],
    },
    {
      id: "hardcover", name: "Hardcover (case laminate)", status: fails ? "not_ready" : p69 < 75 || p69 > 550 ? "needs_work" : warns > 2 ? "needs_work" : "ready",
      notes: [p69 < 75 ? "KDP hardcover requires at least 75 pages." : p69 > 550 ? "KDP hardcover is limited to 550 pages." : "Within KDP hardcover page limits (75–550).", "Hardcover trim sizes on KDP are 5.5×8.5, 6×9, 6.14×9.21, 7×10, 8.25×11 in."],
    },
    {
      id: "submission", name: "Agent / publisher submission", status: opts.openCritical || auto ? "not_ready" : warns > 3 || opts.openMajor > 5 ? "needs_work" : "ready",
      notes: ["Use the “Standard Manuscript Format” DOCX export (12 pt Times New Roman, double-spaced, 1-inch margins, header with surname / title / page).", genreRange ? `Word count ${bodyWc.toLocaleString()} vs typical ${genreRange.min.toLocaleString()}–${genreRange.max.toLocaleString()} for ${genreRange.genre}.` : "Set a genre on the manuscript to compare its length with market norms.", "Prepare a query letter and a 1–2 page synopsis (the Story Intelligence summary is a useful starting point, but write the final version yourself).", "Front matter such as copyright pages and acknowledgements is not needed for submissions."],
    },
  ];
  const score = Math.max(1, Math.min(100, Math.round(100 - fails * 14 - warns * 5 - Math.min(20, opts.openMajor) - opts.openCritical * 5)));
  return {
    checks, targets, pageEstimates, wordCount: wc, genreRange, score,
    disclaimer: "This assessment checks technical and editorial readiness against common industry conventions. It cannot guarantee acceptance by any publisher, agent or publishing platform, and it does not judge market demand.",
  };
}

import JSZip from "jszip";

/**
 * Stage 1a — text extraction.
 * Every format is converted into an ordered list of blocks. Block order is the document order,
 * so chapter boundaries and paragraph order are preserved.
 */
export type Block = {
  text: string;
  kind: "heading" | "p" | "scene_break" | "quote" | "center" | "page_break";
  level?: number; // heading level (1 = top)
};

export const SUPPORTED = [".docx", ".pdf", ".txt", ".md", ".markdown", ".rtf", ".odt", ".epub", ".html", ".htm"];
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export async function extractBlocks(buf: Buffer, fileName: string): Promise<Block[]> {
  const ext = (fileName.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  switch (ext) {
    case ".docx":
      return fromDocx(buf);
    case ".pdf":
      return fromPdf(buf);
    case ".txt":
      return fromPlain(decodeText(buf));
    case ".md":
    case ".markdown":
      return fromMarkdown(decodeText(buf));
    case ".rtf":
      return fromPlain(rtfToText(buf.toString("latin1")));
    case ".odt":
      return fromOdt(buf);
    case ".epub":
      return fromEpub(buf);
    case ".html":
    case ".htm":
      return fromHtml(decodeText(buf));
    default:
      throw new Error(`Unsupported file type "${ext}". Supported: ${SUPPORTED.join(", ")}`);
  }
}

/** Magic-byte validation so a renamed file can't masquerade as a manuscript. */
export function validateFile(buf: Buffer, fileName: string): string | null {
  const ext = (fileName.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  if (!SUPPORTED.includes(ext)) return `Unsupported file type "${ext || "unknown"}". Supported formats: ${SUPPORTED.join(", ")}.`;
  if (buf.length === 0) return "The file is empty.";
  if (buf.length > MAX_UPLOAD_BYTES) return `The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  const zip = buf[0] === 0x50 && buf[1] === 0x4b;
  if ([".docx", ".odt", ".epub"].includes(ext) && !zip) return `This does not look like a valid ${ext} file.`;
  if (ext === ".pdf" && buf.subarray(0, 1024).toString("latin1").indexOf("%PDF") < 0) return "This does not look like a valid PDF file.";
  if (ext === ".rtf" && !buf.subarray(0, 10).toString("latin1").startsWith("{\\rtf")) return "This does not look like a valid RTF file.";
  if ([".txt", ".md", ".markdown", ".html", ".htm"].includes(ext)) {
    const sample = buf.subarray(0, 8000);
    let nul = 0;
    for (const b of sample) if (b === 0) nul++;
    if (nul > 10 && !(sample[0] === 0xff || sample[0] === 0xfe)) return "This file appears to be binary, not text.";
  }
  return null;
}

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  const s = buf.toString("utf8");
  // Fallback to Windows-1252/latin1 if UTF-8 decoding produced replacement characters.
  if ((s.match(/�/g) ?? []).length > 5) return buf.toString("latin1");
  return s;
}

const SCENE_BREAK = /^\s*([*#~•·-]\s*){1,5}$|^\s*(\*\s*){3}$|^\s*§\s*$/;

/** Plain text: paragraphs are separated by blank lines, or by single newlines when the file uses one line per paragraph. */
export function fromPlain(raw: string): Block[] {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\f/g, "\n\n").replace(/\t/g, "    ");
  const lines = text.split("\n");
  const blankRatio = lines.filter((l) => !l.trim()).length / Math.max(1, lines.length);
  // Hard-wrapped text (many short lines, blank-line paragraph separators) vs one-paragraph-per-line.
  const longLines = lines.filter((l) => l.length > 200).length;
  const blankSeparated = blankRatio > 0.15 && longLines < lines.length * 0.3;
  const blocks: Block[] = [];
  if (blankSeparated) {
    let cur: string[] = [];
    const flush = () => {
      if (cur.length) {
        const para = cur.join(" ").replace(/\s+/g, " ").trim();
        if (para) blocks.push(classifyPlain(para));
      }
      cur = [];
    };
    for (const l of lines) {
      if (!l.trim()) flush();
      else if (/^\s{2,}\S/.test(l) && cur.length && /[.!?”"’]$/.test(cur[cur.length - 1])) {
        // Indented line after a sentence end inside a block: treat as a new paragraph.
        flush();
        cur.push(l.trim());
      } else cur.push(l.trim());
    }
    flush();
  } else {
    for (const l of lines) {
      const t = l.replace(/\s+/g, " ").trim();
      if (t) blocks.push(classifyPlain(t));
    }
  }
  return blocks;
}

function classifyPlain(t: string): Block {
  if (SCENE_BREAK.test(t)) return { text: t, kind: "scene_break" };
  return { text: t, kind: "p" };
}

function fromMarkdown(raw: string): Block[] {
  const out: Block[] = [];
  const chunks = raw.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  for (const c of chunks) {
    const lines = c.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        out.push({ text: stripMd(h[2]), kind: "heading", level: h[1].length });
        lines[i] = "";
      }
    }
    const rest = lines.filter((l) => l.trim()).join(" ").trim();
    if (!rest) continue;
    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(rest)) out.push({ text: "* * *", kind: "scene_break" });
    else if (rest.startsWith(">")) out.push({ text: stripMd(rest.replace(/^>\s?/gm, "").replace(/\s>\s?/g, " ")), kind: "quote" });
    else out.push({ text: stripMd(rest), kind: "p" });
  }
  return out;
}

function stripMd(s: string) {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2").replace(/_(.+?)_/g, "$1").replace(/`(.+?)`/g, "$1").trim();
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", eacute: "é", egrave: "è", copy: "©" };

export function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Minimal HTML-to-blocks converter (used for DOCX via mammoth, EPUB chapters and .html files). */
export function fromHtml(html: string): Block[] {
  const body = html.replace(/<head[\s\S]*?<\/head>/i, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const out: Block[] = [];
  const re = /<(h[1-6]|p|blockquote|li|div|hr|br)\b([^>]*)>([\s\S]*?)(?=<\/?(?:h[1-6]|p|blockquote|li|div|hr)\b|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] || "";
    if (tag === "hr") {
      out.push({ text: "* * *", kind: "scene_break" });
      continue;
    }
    const text = decodeEntities(m[3].replace(/<br\s*\/?>(?=.)/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (tag.startsWith("h")) out.push({ text, kind: "heading", level: +tag[1] });
    else if (tag === "blockquote") out.push({ text, kind: "quote" });
    else if (SCENE_BREAK.test(text)) out.push({ text, kind: "scene_break" });
    else if (/text-align:\s*center|class="[^"]*center/i.test(attrs) && text.length < 120) out.push({ text, kind: "center" });
    else out.push({ text, kind: "p" });
  }
  return out;
}

async function fromDocx(buf: Buffer): Promise<Block[]> {
  const mammoth = await import("mammoth");
  const styleMap = [
    "p[style-name='Title'] => h1:fresh",
    "p[style-name='Subtitle'] => h2:fresh",
    "p[style-name='Chapter Title'] => h1:fresh",
    "p[style-name='Chapter Heading'] => h1:fresh",
    "p[style-name='Quote'] => blockquote:fresh",
    "p[style-name='Intense Quote'] => blockquote:fresh",
    "p[style-name='Block Text'] => blockquote:fresh",
  ];
  const res = await mammoth.convertToHtml({ buffer: buf }, { styleMap, includeDefaultStyleMap: true, ignoreEmptyParagraphs: true } as any);
  const blocks = fromHtml(res.value);
  // Detect manual page breaks used as chapter separators: mammoth drops them, so also scan document.xml.
  return blocks;
}

async function fromOdt(buf: Buffer): Promise<Block[]> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("content.xml")?.async("string");
  if (!xml) throw new Error("Invalid ODT file: content.xml missing.");
  const out: Block[] = [];
  const re = /<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const text = decodeEntities(m[3].replace(/<text:s\b[^>]*\/>/g, " ").replace(/<text:tab\/>/g, " ").replace(/<text:line-break\/>/g, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (m[1] === "h") {
      const lvl = +(m[2].match(/outline-level="(\d)"/)?.[1] ?? 1);
      out.push({ text, kind: "heading", level: lvl });
    } else if (SCENE_BREAK.test(text)) out.push({ text, kind: "scene_break" });
    else out.push({ text, kind: "p" });
  }
  return out;
}

async function fromEpub(buf: Buffer): Promise<Block[]> {
  const zip = await JSZip.loadAsync(buf);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error("Invalid EPUB: container.xml missing.");
  const opf = (await zip.file(opfPath)?.async("string")) ?? "";
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest: Record<string, string> = {};
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = m[0].match(/id="([^"]+)"/)?.[1];
    const href = m[0].match(/href="([^"]+)"/)?.[1];
    if (id && href) manifest[id] = decodeURIComponent(href);
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => m[1]);
  const out: Block[] = [];
  for (const id of spine) {
    const href = manifest[id];
    if (!href) continue;
    const html = await zip.file(base + href)?.async("string");
    if (!html) continue;
    const blocks = fromHtml(html);
    if (out.length && blocks.length) out.push({ text: "", kind: "page_break" });
    out.push(...blocks);
  }
  return out;
}

/** Strips RTF control words and groups, keeping paragraph breaks. Handles \uN unicode escapes and \'hh. */
export function rtfToText(rtf: string): string {
  let out = "";
  let depth = 0;
  const skipDepth: number[] = [];
  let i = 0;
  let ucSkip = 1;
  const destinations = /^(fonttbl|colortbl|stylesheet|info|pict|header|footer|headerl|headerr|footerl|footerr|object|fldinst|themedata|colorschememapping|latentstyles|datastore|xmlnstbl|listtable|listoverridetable|rsidtbl|generator|mmathPr)$/;
  while (i < rtf.length) {
    const c = rtf[i];
    const skipping = skipDepth.length > 0 && depth >= skipDepth[skipDepth.length - 1];
    if (c === "{") {
      depth++;
      i++;
      if (rtf.startsWith("\\*", i)) {
        skipDepth.push(depth);
      }
      continue;
    }
    if (c === "}") {
      if (skipDepth.length && skipDepth[skipDepth.length - 1] === depth) skipDepth.pop();
      depth--;
      i++;
      continue;
    }
    if (c === "\\") {
      const m = rtf.slice(i).match(/^\\([a-zA-Z]+)(-?\d+)? ?|^\\'([0-9a-fA-F]{2})|^\\(.)/);
      if (!m) {
        i++;
        continue;
      }
      i += m[0].length;
      if (skipping) continue;
      if (m[3]) {
        out += Buffer.from([parseInt(m[3], 16)]).toString("latin1");
        continue;
      }
      if (m[4]) {
        if (m[4] === "~") out += " ";
        else if (m[4] === "\n" || m[4] === "\r") out += "\n\n";
        else if ("\\{}".includes(m[4])) out += m[4];
        continue;
      }
      const word = m[1];
      if (destinations.test(word)) {
        skipDepth.push(depth);
        continue;
      }
      if (word === "par" || word === "line" || word === "sect" || word === "page") out += "\n\n";
      else if (word === "tab") out += " ";
      else if (word === "uc") ucSkip = +(m[2] ?? 1);
      else if (word === "u") {
        let n = +(m[2] ?? 0);
        if (n < 0) n += 65536;
        out += String.fromCharCode(n);
        i += ucSkip; // skip fallback character(s)
      } else if (word === "emdash") out += "—";
      else if (word === "endash") out += "–";
      else if (word === "lquote") out += "‘";
      else if (word === "rquote") out += "’";
      else if (word === "ldblquote") out += "“";
      else if (word === "rdblquote") out += "”";
      continue;
    }
    if (!skipping && c !== "\r" && c !== "\n") out += c;
    i++;
  }
  return out;
}

type PdfItem = { str: string; transform: number[]; height?: number };

/** PDF: rebuild lines from glyph positions, then paragraphs from vertical gaps and indentation; strip page numbers and running headers. */
async function fromPdf(buf: Buffer): Promise<Block[]> {
  // Import the library entry directly (the package index runs a self-test on import).
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js" as any)).default as (b: Buffer, o: any) => Promise<{ text: string; numpages: number }>;
  const pages: { lines: { text: string; x: number; y: number; h: number }[] }[] = [];
  await pdfParse(buf, {
    max: 0,
    pagerender: async (page: any) => {
      const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const lines: { text: string; x: number; y: number; h: number }[] = [];
      let cur: { text: string; x: number; y: number; h: number } | null = null;
      for (const it of tc.items as PdfItem[]) {
        const x = it.transform[4];
        const y = it.transform[5];
        const h = Math.abs(it.transform[3]) || it.height || 10;
        if (cur && Math.abs(cur.y - y) < h * 0.5) {
          const needsSpace = cur.text && !cur.text.endsWith(" ") && !it.str.startsWith(" ");
          cur.text += (needsSpace ? " " : "") + it.str;
        } else {
          if (cur && cur.text.trim()) lines.push(cur);
          cur = { text: it.str, x, y, h };
        }
      }
      if (cur && cur.text.trim()) lines.push(cur);
      pages.push({ lines });
      return "";
    },
  });
  if (!pages.length || pages.every((p) => !p.lines.length)) throw new Error("No extractable text found in this PDF. If it is a scanned document, please run OCR first or upload the DOCX version.");

  // Running headers/footers: lines repeating (ignoring digits) on > 30% of pages at page top/bottom.
  const freq = new Map<string, number>();
  for (const p of pages) {
    const edge = [...p.lines.slice(0, 2), ...p.lines.slice(-2)];
    for (const l of new Set(edge.map((l) => l.text.replace(/\d+/g, "#").trim()))) freq.set(l, (freq.get(l) ?? 0) + 1);
  }
  const repeated = new Set([...freq].filter(([k, n]) => n >= Math.max(3, pages.length * 0.3) && k.length < 80).map(([k]) => k));

  const blocks: Block[] = [];
  let para = "";
  let lastLine: { x: number; y: number; h: number; text: string } | null = null;
  const leftMargins = pages.flatMap((p) => p.lines.map((l) => Math.round(l.x)));
  const marginMode = mode(leftMargins);
  const lens = pages.flatMap((p) => p.lines.map((l) => l.text.length)).sort((a, b) => a - b);
  const typicalLen = lens[Math.floor(lens.length * 0.75)] || 60;
  const flush = () => {
    const t = para.replace(/\s+/g, " ").trim();
    if (t) blocks.push(SCENE_BREAK.test(t) ? { text: t, kind: "scene_break" } : { text: t, kind: "p" });
    para = "";
  };
  for (let pi = 0; pi < pages.length; pi++) {
    const lines = pages[pi].lines.filter((l, i, arr) => {
      const t = l.text.trim();
      const edge = i < 2 || i >= arr.length - 2;
      if (edge && /^(page\s*)?\d{1,4}$/i.test(t)) return false;
      if (edge && /^[ivxlc]{1,6}$/i.test(t)) return false;
      if (edge && repeated.has(t.replace(/\d+/g, "#"))) return false;
      return true;
    });
    for (const l of lines) {
      const t = l.text.trim();
      if (!t) continue;
      const looksHeading = /^(chapter|part|prologue|epilogue)\b/i.test(t) && t.length < 80;
      let newPara = false;
      if (!lastLine) newPara = true;
      else if (looksHeading) newPara = true;
      else if (lastLine.y !== CONTINUE && lastLine.y - l.y > lastLine.h * 1.9) newPara = true; // vertical gap
      else if (l.x - marginMode > 8 && /[.!?”"’:]$/.test(lastLine.text.trim())) newPara = true; // first-line indent
      else if (l.x - marginMode > 8 && lastLine.text.trim().length < typicalLen * 0.6) newPara = true; // short line, then indent
      else if (l.x - marginMode > 30 && t.length < typicalLen * 0.6) newPara = true; // centred short line (title pages, epigraphs)
      else if (lastLine.y !== CONTINUE && lastLine.x - marginMode > 30 && lastLine.text.trim().length < typicalLen * 0.6) newPara = true; // after a centred line
      if (newPara) flush();
      if (looksHeading) {
        blocks.push({ text: t, kind: "heading", level: 1 });
        lastLine = { ...l, text: "." };
        continue;
      }
      // De-hyphenate words broken across lines.
      if (para.endsWith("-") && /^[a-z]/.test(t)) para = para.slice(0, -1) + t;
      else para += (para ? " " : "") + t;
      lastLine = l;
    }
    // Page boundary: the paragraph continues onto the next page unless the indent rule above starts a new one.
    if (lastLine) lastLine = { ...lastLine, y: CONTINUE };
  }
  flush();
  return blocks;
}

const CONTINUE = -1;

function mode(nums: number[]): number {
  const m = new Map<number, number>();
  for (const n of nums) m.set(n, (m.get(n) ?? 0) + 1);
  let best = 0,
    bestN = -1;
  for (const [k, v] of m) if (v > bestN) (best = k), (bestN = v);
  return best;
}

/**
 * Builds the sample manuscripts used for testing:
 *  - samples/the-keeper-of-saltmere.{txt,docx,pdf}  — a short novel with deliberately planted errors (see samples/README.md)
 *  - samples/long-test-manuscript.{txt,docx,pdf}    — a ~120,000-word synthetic manuscript (40 chapters) for stress-testing
 *    chapter ordering, word counts and large-file handling. Its prose is machine-assembled filler, not a real story.
 */
import fs from "node:fs";
import path from "node:path";
import { AlignmentType, Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } from "docx";
import PDFDocument from "pdfkit";

const dir = path.resolve("samples");
const src = fs.readFileSync(path.join(dir, "the-keeper-of-saltmere.txt"), "utf8");

type Sec = { heading: string | null; paras: string[] };
function splitTxt(txt: string): Sec[] {
  const blocks = txt.split(/\n\s*\n/).map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: Sec[] = [{ heading: null, paras: [] }];
  for (const b of blocks) {
    if (/^(chapter\s+\w+|acknowledgements)/i.test(b) && b.length < 80) out.push({ heading: b, paras: [] });
    else out[out.length - 1].paras.push(b);
  }
  return out;
}

async function toDocx(secs: Sec[], file: string) {
  const children: Paragraph[] = [];
  secs.forEach((s, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    if (s.heading) children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun(s.heading)] }));
    for (const p of s.paras) children.push(new Paragraph({ indent: { firstLine: 360 }, children: [new TextRun(p)] }));
  });
  const doc = new Document({ sections: [{ children }] });
  fs.writeFileSync(file, Buffer.from(await Packer.toBuffer(doc)));
}

function toPdf(secs: Sec[], file: string) {
  return new Promise<void>((resolve) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 72, bottom: 72, left: 72, right: 72 } });
    const out = fs.createWriteStream(file);
    doc.pipe(out);
    let first = true;
    for (const s of secs) {
      if (!first) doc.addPage();
      first = false;
      if (s.heading) doc.font("Times-Bold").fontSize(16).text(s.heading, { align: "center" }).moveDown(1.5);
      let firstPara = true;
      for (const p of s.paras) {
        doc.font("Times-Roman").fontSize(12).text(p, { indent: firstPara ? 0 : 24, align: "justify", lineGap: 2 });
        firstPara = false;
      }
    }
    doc.end();
    out.on("finish", () => resolve());
  });
}

// ---------- long synthetic manuscript
const subjects = ["The harbour", "The old house", "Every lamp in the village", "The road north", "Her father's ledger", "The wind off the moor", "The boy from the mill", "The schoolmistress", "The fishing fleet", "A letter from the city"];
const verbs = ["seemed to wait", "had changed since spring", "carried the smell of rain", "held more secrets than anyone admitted", "was quieter than it had been in years", "kept its own counsel", "refused to be hurried", "remembered things the villagers had forgotten"];
const tails = ["and nobody spoke of it at supper.", "while the tide went out across the flats.", "as the bells rang for evening service.", "though the season had barely begun.", "until the frost came down from the hills.", "and the gulls wheeled over the empty quay."];
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}
function longManuscript(): Sec[] {
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const secs: Sec[] = [{ heading: null, paras: ["LONG TEST MANUSCRIPT", "A synthetic manuscript for stress-testing Cashless Edit", "by Test Author"] }];
  for (let c = 1; c <= 40; c++) {
    const paras: string[] = [`This is chapter ${c} of the long test manuscript, and this sentence marks its beginning.`];
    let words = 12;
    const target = 2600 + Math.floor(r() * 900);
    let k = 0;
    while (words < target) {
      const n = 3 + Math.floor(r() * 4);
      const sents: string[] = [];
      for (let i = 0; i < n; i++) sents.push(`${pick(subjects)} ${pick(verbs)} ${pick(tails)}`);
      if (k % 5 === 2) sents.push(`“We should go back,” said Elinor, “before the light fails.”`);
      const p = sents.join(" ");
      paras.push(p);
      words += p.split(/\s+/).length;
      k++;
    }
    paras.push(`Here ends chapter ${c}.`);
    secs.push({ heading: `Chapter ${c}`, paras });
  }
  return secs;
}

async function main() {
  const keeper = splitTxt(src);
  await toDocx(keeper, path.join(dir, "the-keeper-of-saltmere.docx"));
  await toPdf(keeper, path.join(dir, "the-keeper-of-saltmere.pdf"));
  const long = longManuscript();
  const txt = long.map((s) => [s.heading, ...s.paras].filter(Boolean).join("\n\n")).join("\n\n\n");
  fs.writeFileSync(path.join(dir, "long-test-manuscript.txt"), txt);
  await toDocx(long, path.join(dir, "long-test-manuscript.docx"));
  await toPdf(long, path.join(dir, "long-test-manuscript.pdf"));
  const wc = txt.split(/\s+/).filter((w) => /\w/.test(w)).length;
  console.log(`Samples written to ${dir}. Long manuscript: ${wc.toLocaleString()} words, 40 chapters.`);
}
main();

/**
 * End-to-end test of the processing pipeline (no browser needed).
 *   npm test                 — built-in engine
 *   AI_TEST=mock npm test    — also exercises the AI stages against the local mock AI server (scripts/mock-ai-server.ts)
 * Verifies: parsing of TXT/DOCX/PDF, chapter ordering, word counts, issue references (every issue's quoted text
 * exists in its paragraph), planted-error detection, continuity, duplicate prevention, resume, and all exports.
 */
import fs from "node:fs";
import path from "node:path";
process.env.DATA_DIR = path.resolve("data-test");
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  const { db, now } = await import("../src/lib/db");
  const { ingestManuscript } = await import("../src/lib/pipeline/ingest");
  const { createJob, startWorker, resumeJob } = await import("../src/lib/pipeline/worker");
  const { getChapters, getParagraphs, getAnalysis } = await import("../src/lib/repo");
  const { generateExport, EXPORTS } = await import("../src/lib/export");
  const { locateQuote, countWords } = await import("../src/lib/text");
  const { resolveIssue } = await import("../src/lib/revisions");
  const { extractBlocks } = await import("../src/lib/parse/extract");
  const { encryptString } = await import("../src/lib/secure");

  const uid = "u_test";
  db().prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)").run(uid, "test@example.com", "Test", "x", now());
  if (process.env.AI_TEST === "mock") {
    db().prepare("INSERT INTO ai_settings (user_id, provider, base_url, model, api_key_enc, temperature, context_words, concurrency, requests_per_minute, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(uid, "openai_compat", "http://127.0.0.1:8787/v1", "mock-editor", encryptString("test"), 0.3, 1800, 2, 0, now());
  }
  startWorker();
  const waitJob = async (id: string, timeoutMs = 600_000) => {
    const t0 = Date.now();
    for (;;) {
      const j = db().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as any;
      if (["completed", "failed", "cancelled", "interrupted", "paused"].includes(j.status)) return j;
      if (Date.now() - t0 > timeoutMs) throw new Error("timeout");
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  // ---------------------------------------------------------- 1. Sample novel in three formats
  const ids: Record<string, string> = {};
  for (const ext of ["txt", "docx", "pdf"]) {
    const file = path.resolve("samples", `the-keeper-of-saltmere.${ext}`);
    const r = await ingestManuscript(uid, { name: path.basename(file), data: fs.readFileSync(file) }, { author: "Ada Merriweather", genre: "Literary fiction", force: true });
    ids[ext] = r.id;
    const chs = getChapters(r.id);
    const body = chs.filter((c) => c.kind === "chapter");
    check(`[${ext}] chapters detected`, body.length === 9, `${body.length} chapters: ${body.map((c) => c.number).join(",")}`);
    check(`[${ext}] chapter order preserved`, body.map((c) => c.number).join(",") === "1,2,3,4,5,6,8,9,10");
    check(`[${ext}] front matter detected`, chs.some((c) => c.matter_type === "copyright") && chs.some((c) => c.matter_type === "title_page"), chs.filter((c) => c.kind !== "chapter").map((c) => `${c.kind}:${c.matter_type}`).join(", "));
    check(`[${ext}] back matter detected`, chs.some((c) => c.matter_type === "acknowledgements"));
    const first = getParagraphs(body[0].id)[0]?.current_text ?? "";
    check(`[${ext}] first paragraph intact`, first.startsWith("The lamp at Harrow's Point had not gone dark in forty-one years"), first.slice(0, 60));
    const last = getParagraphs(body[body.length - 1].id).slice(-1)[0]?.current_text ?? "";
    check(`[${ext}] last chapter ends correctly`, last === "She never did find out who.", last);
    check(`[${ext}] chapter titles`, body[0].title === "Chapter 1: The Lamp", body[0].title);
    console.log(`   words: ${r.words}`);
  }
  const txtWords = (db().prepare("SELECT word_count FROM manuscripts WHERE id = ?").get(ids.txt) as any).word_count;
  for (const ext of ["docx", "pdf"]) {
    const w = (db().prepare("SELECT word_count FROM manuscripts WHERE id = ?").get(ids[ext]) as any).word_count;
    check(`[${ext}] word count matches TXT within 1%`, Math.abs(w - txtWords) / txtWords < 0.01, `${w} vs ${txtWords}`);
  }

  // Duplicate upload prevention
  const dup = await ingestManuscript(uid, { name: "the-keeper-of-saltmere.txt", data: fs.readFileSync("samples/the-keeper-of-saltmere.txt") }, {});
  check("duplicate upload detected", dup.duplicateOf === ids.txt);

  // ---------------------------------------------------------- 2. Full editorial review
  const ms = db().prepare("SELECT * FROM manuscripts WHERE id = ?").get(ids.txt) as any;
  const job = createJob(uid, ms, "full");
  const j = await waitJob(job.id);
  check("full review completed", j.status === "completed", j.error ?? j.message);
  const issues = db().prepare("SELECT * FROM issues WHERE manuscript_id = ?").all(ids.txt) as any[];
  console.log(`   ${issues.length} issues: ` + Object.entries(issues.reduce((a: any, i) => ((a[i.stage] = (a[i.stage] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(", "));
  const has = (pred: (i: any) => boolean) => issues.some(pred);
  check("planted: repeated word “the the”", has((i) => i.rule === "repeated_word" && /the the/i.test(i.original_text)));
  check("planted: “could of”", has((i) => /could of/i.test(i.original_text ?? "") && /could have/.test(i.suggestion ?? "")));
  check("planted: lowercase “monday”", has((i) => i.rule === "day_month_case"));
  check("planted: chapter 7 missing", has((i) => i.rule === "chapter_gap"));
  check("planted: eye colour contradiction (green → blue)", has((i) => i.stage === "continuity" && /eye/.test(i.category)), issues.filter((i) => i.stage === "continuity").map((i) => i.explanation.slice(0, 80)).join(" | "));
  check("planted: age contradiction (17 → 16)", has((i) => i.stage === "continuity" && /age/.test(i.category)));
  check("planted: name variant “Tobais”", has((i) => i.rule === "name_variant" && i.original_text === "Tobais"));
  check("planted: misspelling “definately”", has((i) => i.rule === "spelling" && i.original_text === "definately" && i.suggestion === "definitely"));
  check("planted: cliché", has((i) => i.rule === "cliche"));
  check("planted: “in order to”", has((i) => /in order to/i.test(i.original_text ?? "")));
  check("no false positive on “had had”/“an hour”/“Harrow's”", !has((i) => /had had|an hour|Harrow/.test(i.original_text ?? "") && i.objective));
  // Every issue that quotes text must quote real text from its paragraph.
  let bad = 0;
  for (const i of issues) {
    if (!i.paragraph_id || !i.original_text) continue;
    const p = db().prepare("SELECT current_text FROM paragraphs WHERE id = ?").get(i.paragraph_id) as any;
    if (!p || !locateQuote(p.current_text, i.original_text)) {
      bad++;
      if (bad < 4) console.log("   ungrounded:", i.rule, JSON.stringify(i.original_text).slice(0, 80));
    }
  }
  check("every issue reference points to real manuscript text", bad === 0, `${bad} ungrounded`);
  const report = getAnalysis<any>(ids.txt, "report");
  check("report generated with scores", !!report?.scores?.grammar?.score, `overall ${report?.scores?.overall?.score}, grammar ${report?.scores?.grammar?.score}`);
  check("story-level scores honestly marked when no AI", process.env.AI_TEST === "mock" ? report.scores.plot.basis === "ai" : report.scores.plot.score === null);
  const pub = getAnalysis<any>(ids.txt, "publication");
  check("publication audit generated", !!pub?.targets?.length, `score ${pub?.score}`);
  const bible = db().prepare("SELECT section, name FROM bible_entries WHERE manuscript_id = ? AND section = 'characters'").all(ids.txt) as any[];
  check("Story Bible characters extracted", ["Mara Quinn", "Tobias", "Rosalind Corrigan"].every((n) => bible.some((b) => b.name.includes(n.split(" ")[0]))), bible.map((b) => b.name).join(", "));

  // Duplicate processing prevention
  let blocked = false;
  try {
    createJob(uid, ms, "full");
  } catch (e: any) {
    blocked = /DUPLICATE/.test(e.message);
  }
  check("duplicate analysis prevented", blocked);

  // ---------------------------------------------------------- 3. Revision workflow
  const sug = issues.find((i) => i.rule === "repeated_word" && i.status === "open")!;
  const res = resolveIssue(ms, sug.id, "accept");
  const p = db().prepare("SELECT * FROM paragraphs WHERE id = ?").get(sug.paragraph_id) as any;
  check("accepting a suggestion edits working text", res.changed === true && !/the the/.test(p.current_text) && /the the/.test(p.original_text));
  const ver = db().prepare("SELECT COUNT(*) AS n FROM paragraph_versions WHERE paragraph_id = ?").get(p.id) as any;
  check("version history recorded", ver.n === 1);
  const could = issues.find((i) => /could of/i.test(i.original_text ?? ""))!;
  resolveIssue(ms, could.id, "modify", "could have");
  const rej = issues.find((i) => i.rule === "cliche")!;
  resolveIssue(ms, rej.id, "reject");

  // ---------------------------------------------------------- 4. Exports
  for (const e of EXPORTS) {
    for (const f of e.formats) {
      try {
        const x = await generateExport(ms, uid, e.id, f, { trim: "6x9" });
        const okMagic = f === "pdf" ? x.buf.subarray(0, 4).toString() === "%PDF" : x.buf[0] === 0x50 && x.buf[1] === 0x4b;
        check(`export ${e.id}.${f}`, okMagic && x.size > 500, `${(x.size / 1024).toFixed(1)} KB`);
        if (e.id === "ms_clean" && f === "docx") {
          const blocks = await extractBlocks(x.buf, "x.docx");
          const w = blocks.reduce((n, b) => n + countWords(b.text), 0);
          check("clean DOCX round-trip keeps the text", Math.abs(w - ms.word_count) / ms.word_count < 0.03, `${w} vs ${ms.word_count}`);
        }
        if (e.id === "ms_tracked") {
          const JSZip = (await import("jszip")).default;
          const xml = await (await JSZip.loadAsync(x.buf)).file("word/document.xml")!.async("string");
          check("tracked DOCX contains Word revisions", /<w:del\b/.test(xml) && /<w:ins\b/.test(xml));
        }
        if (e.id === "ms_original") {
          const blocks = await extractBlocks(x.buf, "x.docx");
          check("original DOCX preserves the uploaded text", blocks.some((b) => b.text.includes("out of the the oil store")));
        }
        if (f === "pdf") fs.writeFileSync(path.join(process.env.DATA_DIR!, `${e.id}.pdf`), x.buf);
      } catch (err: any) {
        check(`export ${e.id}.${f}`, false, err.message);
      }
    }
  }

  // ---------------------------------------------------------- 5. Long manuscript (~125k words) in all formats
  for (const ext of ["txt", "docx", "pdf"]) {
    const t0 = Date.now();
    const file = path.resolve("samples", `long-test-manuscript.${ext}`);
    const r = await ingestManuscript(uid, { name: path.basename(file), data: fs.readFileSync(file) }, { force: true });
    const chs = getChapters(r.id).filter((c) => c.kind === "chapter");
    const nums = chs.map((c) => c.number);
    check(`[long ${ext}] 40 chapters in order`, nums.length === 40 && nums.every((n, i) => n === i + 1), `${nums.length} chapters`);
    let markersOk = true;
    for (const c of chs) {
      const ps = getParagraphs(c.id);
      if (!ps[0]?.current_text.includes(`This is chapter ${c.number} of`) || !ps[ps.length - 1]?.current_text.includes(`Here ends chapter ${c.number}.`)) markersOk = false;
    }
    check(`[long ${ext}] every chapter starts and ends with its own markers`, markersOk);
    check(`[long ${ext}] word count`, r.words > 120000, `${r.words.toLocaleString()} words, parsed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (ext === "docx") {
      const lm = db().prepare("SELECT * FROM manuscripts WHERE id = ?").get(r.id) as any;
      const t1 = Date.now();
      const lj = createJob(uid, lm, process.env.AI_TEST === "mock" ? "proofread" : "full");
      // Simulate an interruption, then resume.
      await new Promise((res) => setTimeout(res, 1500));
      db().prepare("UPDATE jobs SET status = 'paused' WHERE id = ? AND status = 'running'").run(lj.id);
      const paused = await waitJob(lj.id);
      const unitsBefore = (db().prepare("SELECT COUNT(*) AS n FROM job_units WHERE job_id = ?").get(lj.id) as any).n;
      if (paused.status === "paused") resumeJob(lj.id, uid);
      const done = await waitJob(lj.id);
      check(`[long] analysis with pause/resume completed`, done.status === "completed", `${((Date.now() - t1) / 1000).toFixed(1)}s, ${unitsBefore} units done before pause`);
      const n = (db().prepare("SELECT COUNT(*) AS n FROM issues WHERE manuscript_id = ?").get(r.id) as any).n;
      console.log(`   long manuscript issues: ${n}`);
      const x = await generateExport(lm, uid, "ms_print", "pdf", { trim: "6x9" });
      check(`[long] print PDF export`, x.size > 100000, `${(x.size / 1024).toFixed(0)} KB`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("FAILED:\n" + failed.map((f) => ` - ${f.name}: ${f.detail ?? ""}`).join("\n"));
    process.exit(1);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

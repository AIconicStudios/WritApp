import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, now, uid, tx } from "../db";
import { encryptBuffer, sha256 } from "../secure";
import { extractBlocks, validateFile } from "../parse/extract";
import { organize } from "../parse/structure";
import { countWords } from "../text";
import { HttpError } from "../auth";

export type IngestResult = { id: string; duplicateOf?: string; warnings: string[]; chapters: number; words: number };

/** Stage 1: extract and organise the manuscript, then store it. */
export async function ingestManuscript(userId: string, file: { name: string; data: Buffer }, meta: { title?: string; author?: string; genre?: string; audience?: string; force?: boolean }): Promise<IngestResult> {
  const err = validateFile(file.data, file.name);
  if (err) throw new HttpError(400, err);
  let blocks;
  try {
    blocks = await extractBlocks(file.data, file.name);
  } catch (e) {
    throw new HttpError(422, `Could not read “${file.name}”: ${e instanceof Error ? e.message : e}`);
  }
  if (!blocks.length) throw new HttpError(422, "No text could be extracted from this file.");
  const fileTitle = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const st = organize(blocks, fileTitle);
  const allText = st.sections.flatMap((s) => s.paragraphs.map((p) => p.text)).join("\n");
  const hash = sha256(allText);
  const words = countWords(allText);
  if (words < 50) throw new HttpError(422, "The document contains fewer than 50 words of text.");

  if (!meta.force) {
    const dup = db().prepare("SELECT id FROM manuscripts WHERE user_id = ? AND content_hash = ?").get(userId, hash) as { id: string } | undefined;
    if (dup) return { id: dup.id, duplicateOf: dup.id, warnings: ["This exact manuscript has already been uploaded."], chapters: 0, words };
  }

  const id = uid("m_");
  const storeName = uid("f_") + ".bin";
  fs.writeFileSync(path.join(DATA_DIR, "uploads", storeName), encryptBuffer(file.data), { mode: 0o600 });
  const title = (meta.title?.trim() || (st.inferredTitle && st.inferredTitle.length < 120 ? st.inferredTitle : fileTitle)).slice(0, 200);
  const t = now();
  let chapters = 0;
  tx(() => {
    db().prepare("INSERT INTO manuscripts (id, user_id, title, author, genre, audience, file_name, file_type, file_path, content_hash, word_count, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, userId, title, meta.author?.trim() || null, meta.genre?.trim() || null, meta.audience?.trim() || null, file.name, (file.name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase(), storeName, hash, words, "organized", t, t);
    const insC = db().prepare("INSERT INTO chapters (id, manuscript_id, idx, kind, matter_type, title, heading, number, word_count) VALUES (?,?,?,?,?,?,?,?,?)");
    const insP = db().prepare("INSERT INTO paragraphs (id, manuscript_id, chapter_id, idx, global_idx, style, original_text, current_text, inserted, deleted, updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,?)");
    let g = 0;
    st.sections.forEach((s, i) => {
      const cid = uid("c_");
      if (s.kind === "chapter") chapters++;
      insC.run(cid, id, i, s.kind, s.matterType, s.title.slice(0, 300), s.heading, s.number, s.paragraphs.reduce((n, p) => n + countWords(p.text), 0));
      s.paragraphs.forEach((p, j) => insP.run(uid("p_"), id, cid, j, g++, p.style, p.text, p.text, t));
    });
    db().prepare("INSERT INTO analyses (manuscript_id, kind, data_json, ai_generated, updated_at) VALUES (?,?,?,0,?)").run(id, "ingest", JSON.stringify({ warnings: st.warnings, blocks: blocks.length, sections: st.sections.length, fileName: file.name, bytes: file.data.length }), t);
  });
  return { id, warnings: st.warnings, chapters, words };
}

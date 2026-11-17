# Cashless Edit

An AI-powered manuscript editing app for authors. It acts as a full editorial team: developmental editor, line editor, copy editor, proofreader, continuity checker and publication consultant. It also includes a Story Intelligence module, a living Story Bible and a Creative Companion that helps you continue and plan your book.

**It never needs a paid subscription.** The built-in engine works offline with no AI at all. For the AI features you can use a free local model (Ollama or LM Studio, unlimited) or a free-tier API (Google Gemini, Groq, OpenRouter `:free` models).

---

## Android app (runs entirely on your phone)

Cashless Edit is also an Android app. **Everything runs on the phone:** the database, the editorial engine, document reading (DOCX, PDF, TXT, EPUB…), and every export. There's no server, account or subscription, and it works offline.

**Install it**
1. Open this repository's **Releases** page on your phone. The newest is "Cashless Edit for Android".
2. Tap **CashlessEdit.apk** to download it, open it, and allow "install unknown apps" if Android asks.
3. New builds install over the old one and keep your manuscripts.

**Free AI on the phone:** the built-in engine works without AI. For story analysis and the creative tools:
- **Google Gemini:** get a free key at aistudio.google.com (Get API key), then paste it in Settings → AI Provider → Google Gemini (free tier). Groq and OpenRouter `:free` keys work too.
- **Ollama on a home computer:** start Ollama with `OLLAMA_HOST=0.0.0.0` and enter `http://<computer-IP>:11434` while your phone is on the same Wi-Fi.

**How the APK is made:** `.github/workflows/android.yml` builds it on GitHub's free build machines for every push and attaches it to a release.
- `npm run build:mobile` produces the static on-device app in `out/` and syncs it into `android/` (Capacitor). `MOBILE=1` swaps server modules for their phone versions in `src/mobile/`.
- On the phone, SQLite runs as WebAssembly and is saved to private app storage. The same API route handlers are called in-process.
- To build locally with Android Studio: run `npm run build:mobile`, then `npx cap open android`.
- `android/app/cashless-edit.keystore` is a signing key committed so updates install over each other. Use your own private key if you publish to Google Play.

**Phone notes:**
- Long analyses run while the app is open. If Android closes the app, the analysis continues automatically the next time you open it.
- Exports are saved to *Documents/Cashless Edit* and the share sheet opens so you can send them to Drive, email or WhatsApp.

## Quick start

```bash
npm install
cp .env.example .env        # optional; see "Configuration"
npm run build
npm start                   # http://localhost:3000
```

For development, use `npm run dev`. Create an account, click **New Manuscript**, and upload a file from `samples/`.

### Free, unlimited AI (recommended)

1. Install Ollama from https://ollama.com/download.
2. Download a model: `ollama pull qwen2.5:7b-instruct`. This needs about 8 GB of RAM. With 16 GB or more, `qwen2.5:14b-instruct` or `gemma2:9b` edit noticeably better.
3. In Cashless Edit, go to **Settings → AI Provider → Ollama (local)**, click **Test connection**, then **Save**.

With a local model your text never leaves your computer. Local models run at your computer's speed, so a Full Editorial Review of 100,000 words can take a few hours on a laptop. It runs in the background and resumes if interrupted.

**Free cloud alternatives.** Choose the preset in Settings and paste a free key:
- **Gemini:** aistudio.google.com
- **Groq:** console.groq.com
- **OpenRouter:** use any model ending in `:free`

These are faster but rate-limited. Set **Req/min** to stay inside the limit. Their terms may let the provider use your text, so prefer a local model for confidential manuscripts.

### Docker (app + Ollama together)

```bash
APP_SECRET=$(openssl rand -hex 32) docker compose up -d
docker compose exec ollama ollama pull qwen2.5:7b-instruct
```

Then open http://localhost:3000 and set the Ollama URL to `http://ollama:11434` in Settings.

---

## What works without AI and what needs it

| Feature | Built-in engine (no AI) | With an AI model |
|---|---|---|
| Upload & organisation (DOCX, PDF, TXT, MD, RTF, ODT, EPUB, HTML; 150k+ words) | ✔ | ✔ |
| Proofreading: spelling (Hunspell), repeated words, punctuation, quotes, capitalisation, chapter numbering, heading/dash/scene-break consistency | ✔ | ✔ |
| Copy editing: misused words, agreement, a/an, name-spelling variants, number/measurement/tense consistency, run-ons | ✔ (rules) | ✔ + sentence-level AI edits |
| Line editing: wordiness, redundancy, clichés, adverb tags, telling vs showing, passive voice, echoes, long sentences | ✔ (rules) | ✔ + AI line edits |
| Continuity: contradictions in eye/hair colour, ages and family relations, dropped characters | ✔ | ✔ + AI cross-chapter fact check |
| Story Bible: characters, locations, co-appearance relationships, attribute facts | ✔ (basic) | ✔ full (events, objects, rules, arcs, themes…) |
| Developmental edit, chapter assessments, story-level scores | — (marked "Not assessed") | ✔ |
| Story Intelligence: summaries, profiles, conflicts, plot structure, themes, setting, timeline | — | ✔ |
| Creative Companion and AI rewriting | — | ✔ |
| Publication audit and all exports (DOCX, PDF, EPUB, tracked changes, KDP print PDF, reports) | ✔ | ✔ |

Cashless Edit never pretends AI analysis happened. Without a model, the report says which categories were not assessed.

---

## How it works

### Architecture

- **Next.js 15 (App Router) + React 19 + TypeScript + Tailwind** in one deployable app.
- **SQLite** (`better-sqlite3`) in `DATA_DIR`. It needs no server and costs nothing. The schema is plain SQL in `src/lib/db.ts` and ports to PostgreSQL if you outgrow it.
- **Background job runner** (`src/lib/pipeline/worker.ts`) starts with the server. Jobs and every completed unit of work are stored in the database. That lets processing survive restarts, lets interrupted analyses resume exactly where they stopped, and stops the same work from running twice.
- **AI provider layer** (`src/lib/ai/provider.ts`) supports Ollama's native API and any OpenAI-compatible endpoint.
  - It retries with back-off and limits request rate.
  - It caches responses, so identical requests are never paid for twice.
  - Adding a provider means implementing one `chat()` function.
- **Structured outputs:** every AI task has a zod schema (`src/lib/ai/prompts.ts`). Malformed JSON is repaired or re-requested.

### The staged pipeline

1. **Extract and organise.** Detect chapters, parts and front/back matter, including tables of contents. Paragraph order is preserved.
2. **Build story understanding.**
   - Built-in name and fact extraction runs first.
   - The AI then reads each chapter in context-sized sections, carrying forward a rolling memory of the story so far.
   - Everything merges into the Story Bible.
3. **Chapter analysis.** Each chapter gets a developmental assessment and a score, with the story-so-far as context.
4. **Continuity.** Contradictions between chapters are reported with references to where each fact was first established.
5. **Copy, line and proofreading.** The rule engine runs first, then AI edits each section.
6. **Developmental edit** of the whole manuscript, followed by **Book Intelligence**.
7. **Editorial report and scores.** Language scores are measured from the text; story scores come from the AI.
8. **Revision workspace.**
9. **Publication audit.**

The manuscript is never sent to the AI in one piece. A 100,000-word book becomes about 50 section requests plus chapter-level and book-level passes.

### Grounding and honesty

- Every AI finding must quote the manuscript. Quotes are checked against the real paragraph (tolerating curly vs straight quotes and whitespace). **Findings whose quotes can't be found are discarded**, and the log reports how many.
- AI facts used for continuity checks must also be quoted, or they are dropped.
- Findings are labelled as **objective errors** or **editorial recommendations**. Patterns inside dialogue are softened, because characters may speak non-standard English.
- Character details that aren't in the text are shown as "Not established in the manuscript."

### Preservation and version history

- The original upload (encrypted) and each paragraph's original text are never modified.
- Accepting, modifying or rewriting changes only the working text, and every change is recorded in **History** with one-click restore.
- Suggestions whose text has since changed become "stale" instead of being misapplied.

### Creative Companion rules

- Scenarios, What-If results and plans never touch the manuscript.
- Generated writing is an editable draft. It is added only when you click **Add to manuscript** and choose where it goes.
- New facts from added text become *proposed* Story Bible entries, which join the official Bible only when you confirm them.
- Story branches keep their own version history and merge only on explicit confirmation.

---

## Exports

- **Clean manuscript** (DOCX with generated table of contents, PDF, or EPUB)
- **Original manuscript**
- **Tracked changes** (real Word revisions)
- **Highlighted-changes PDF**
- **Standard Manuscript Format** for agent and publisher submission
- **Kindle eBook** (EPUB or DOCX)
- **Print-ready interior PDF** in 5×8, 5.5×8.5 or 6×9 inch trims. Margins meet KDP's gutter requirement for the page count, and chapters open on right-hand pages.
- **Reports:** the editorial report, the publication audit, and the book reports (book summary, spoiler-free summary, characters, conflicts, plot, chapter summaries, Story Bible, full literary analysis), each as DOCX or PDF.

The publication audit checks against common industry conventions. It cannot guarantee acceptance by any publisher, agent or platform, and it says so.

---

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `APP_SECRET` | Encrypts stored API keys, uploads and exports (AES-256-GCM). If unset, a random secret is generated in `DATA_DIR/.secret`. |
| `DATA_DIR` | Location of the database, encrypted uploads and exports (default `./data`). |
| `AI_PROVIDER`, `OLLAMA_URL`, `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY` | Default AI settings for new accounts. Each user can override them in Settings. |
| `INSECURE_COOKIES=1` | Allows session cookies over plain HTTP in production. Use only for local or Docker setups without HTTPS. |

**Security:**
- Passwords are hashed with bcrypt and sessions use httpOnly cookies.
- Sign-in attempts are rate-limited.
- Every manuscript query is checked for ownership, and uploads are validated by extension and magic bytes.
- You can delete your account together with all its data.

---

## Testing

```bash
npm run sample            # regenerates samples/ (DOCX/PDF versions + a 125,000-word stress-test manuscript)
npm test                  # end-to-end pipeline test with the built-in engine
AI_TEST=mock npm test     # also exercises every AI stage against a local mock AI server
```

The test suite (`scripts/test-pipeline.ts`) checks:
- Parsing of TXT, DOCX and PDF, chapter order, front and back matter, and word counts
- Detection of the errors planted in the sample novel: misspelling, "the the", "could of", lowercase day, missing Chapter 7, green → blue eye colour, age 17 → 16, "Tobais" vs "Tobias"
- That there are no false positives on correct text, and that every finding quotes real manuscript text
- Duplicate-upload and duplicate-analysis prevention
- Accept and modify with version history
- All 26 exports, a round trip of the clean DOCX, real `<w:ins>`/`<w:del>` in the tracked DOCX, and the original DOCX preserved
- The 125k-word manuscript in all three formats, with every chapter's start and end markers in place, plus pause and resume
- In mock-AI mode: fabricated AI quotes, facts and contradictions are discarded; the Story Bible updates only after confirmation; and every creative tool works

`scripts/mock-ai-server.ts` is **test-only** and has no intelligence. It exists so the AI plumbing can be verified without downloading a model.

**Sample manuscript:** `samples/the-keeper-of-saltmere.*` is a short novel written for testing, with deliberately planted problems (listed above). `samples/long-test-manuscript.*` is machine-assembled filler for stress testing, not a real story.

---

## Known limitations

- Scanned PDFs have no text layer and need OCR before upload.
- Character formatting inside paragraphs (italics, bold) is not preserved on import. Paragraph structure (headings, scene breaks, block quotes, centred lines) is preserved. Runs of whitespace are normalised.
- The quality of developmental feedback depends on the model you connect. Small local models can miss subtle issues. Every finding links to its passage so you can judge it yourself.
- SQLite suits a single server. For many concurrent users, move the schema to PostgreSQL and run the worker as a separate process.

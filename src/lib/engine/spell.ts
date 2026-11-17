/**
 * Offline spell checker (Hunspell en-US dictionary via nspell) — free and unlimited.
 * To avoid false positives on fiction, words are only flagged when they are lowercase,
 * not in the manuscript's own vocabulary (words used 3+ times), and not inside the Story Bible names.
 */
type NSpell = { correct(w: string): boolean; suggest(w: string): string[]; add(w: string): void };
let checker: NSpell | null = null;
let loading: Promise<NSpell> | null = null;

const EXTRA = `okay ok alright email emails online offline website smartphone laptop wifi podcast selfie texted texting googled hashtag cellphone hoodie kinda gonna wanna gotta y'all ain't yeah yep nope uh um hmm mmm huh shh ahh oof ugh whoa wow meh lol nah`.split(/\s+/);

export async function getSpeller(): Promise<NSpell> {
  if (checker) return checker;
  if (!loading) {
    loading = (async () => {
      const nspell = (await import("nspell")).default as any;
      const dict = (await import("dictionary-en")).default as { aff: Uint8Array; dic: Uint8Array };
      const sp = nspell(Buffer.from(dict.aff), Buffer.from(dict.dic)) as NSpell;
      for (const w of EXTRA) sp.add(w);
      checker = sp;
      return sp;
    })();
  }
  return loading;
}

export { isCorrect } from "./spell-core";

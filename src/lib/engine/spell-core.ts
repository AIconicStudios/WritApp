/** Spelling decisions shared by the server and the phone app. */
type NSpell = { correct(w: string): boolean; suggest(w: string): string[]; add(w: string): void };

const cache = new Map<string, boolean>();

function simple(sp: NSpell, w: string) {
  return sp.correct(w) || sp.correct(w.replace(/our$/, "or")) || sp.correct(w.replace(/our/, "or"));
}

export function isCorrect(sp: NSpell, w: string): boolean {
  const k = w;
  const c = cache.get(k);
  if (c !== undefined) return c;
  let ok = sp.correct(w);
  if (!ok) {
    // Accept British spellings and common inflections the dictionary may miss.
    const variants = [w.replace(/our$/, "or"), w.replace(/ise$/, "ize"), w.replace(/ised$/, "ized"), w.replace(/ising$/, "izing"), w.replace(/isation$/, "ization"), w.replace(/re$/, "er"), w.replace(/lled$/, "led"), w.replace(/lling$/, "ling"), w.replace(/ogue$/, "og"), w.replace(/’/g, "'")];
    ok = variants.some((v) => v !== w && sp.correct(v));
  }
  if (!ok && w.includes("-")) ok = w.split("-").every((p) => !p || isCorrect(sp, p));
  // Closed compounds ("weathervane", "harbourmaster"): accept if the word splits into two dictionary words.
  if (!ok && w.length >= 8 && !w.includes("-")) {
    const base = w.replace(/['’]s$/, "");
    for (let i = 3; i <= base.length - 3 && !ok; i++) {
      const a = base.slice(0, i),
        b = base.slice(i);
      if (a.length >= 3 && b.length >= 3 && simple(sp, a) && simple(sp, b)) ok = true;
    }
  }
  if (cache.size > 200000) cache.clear();
  cache.set(k, ok);
  return ok;
}

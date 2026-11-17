/** Phone version of the spell checker: the Hunspell dictionary ships inside the app. */
type NSpell = { correct(w: string): boolean; suggest(w: string): string[]; add(w: string): void };
let loading: Promise<NSpell> | null = null;
const EXTRA = `okay ok alright email emails online offline website smartphone laptop wifi podcast selfie texted texting googled hashtag cellphone hoodie kinda gonna wanna gotta y'all ain't yeah yep nope uh um hmm mmm huh shh ahh oof ugh whoa wow meh lol nah`.split(/\s+/);

export async function getSpeller(): Promise<NSpell> {
  if (!loading)
    loading = (async () => {
      const nspell = (await import("nspell")).default as any;
      const [aff, dic] = await Promise.all([fetch("/dict/en.aff").then((r) => r.text()), fetch("/dict/en.dic").then((r) => r.text())]);
      const sp = nspell(aff, dic) as NSpell;
      for (const w of EXTRA) sp.add(w);
      return sp;
    })();
  return loading;
}
export { isCorrect } from "@/lib/engine/spell-core";

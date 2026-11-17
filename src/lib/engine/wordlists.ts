/** Curated, high-precision word lists for the built-in editorial engine. */

export const CONFUSED: { re: RegExp; fix: (m: RegExpExecArray) => string; why: string; conf: number }[] = [
  { re: /\b(could|should|would|must|might)\s+of\b/gi, fix: (m) => `${m[1]} have`, why: "“of” is a mishearing of the contraction “’ve”; the correct form is “have”.", conf: 0.97 },
  { re: /\balot\b/gi, fix: () => "a lot", why: "“alot” is not a standard word; write “a lot”.", conf: 0.98 },
  { re: /\birregardless\b/gi, fix: () => "regardless", why: "“Irregardless” is nonstandard; use “regardless”.", conf: 0.9 },
  { re: /\b(better|rather|less|more|other|greater|larger|smaller|older|younger|faster|taller|worse)\s+then\b/gi, fix: (m) => `${m[1]} than`, why: "Comparisons use “than”; “then” refers to time or sequence.", conf: 0.9 },
  { re: /\bit's\s+own\b/gi, fix: () => "its own", why: "The possessive is “its”; “it’s” means “it is” or “it has”.", conf: 0.98 },
  { re: /\bit’s\s+own\b/gi, fix: () => "its own", why: "The possessive is “its”; “it’s” means “it is” or “it has”.", conf: 0.98 },
  { re: /\bits'/gi, fix: () => "its", why: "“its’” is never correct; the possessive is “its”.", conf: 0.98 },
  { re: /\byour\s+(welcome|going|coming|right|wrong|kidding|joking|lying|crazy|insane|late|early|fired|beautiful|so\s+\w+)\b/gi, fix: (m) => `you’re ${m[1]}`, why: "“you’re” (you are) is needed here; “your” is possessive.", conf: 0.9 },
  { re: /\btheir\s+(is|are|was|were)\b/gi, fix: (m) => `there ${m[1]}`, why: "“there” is needed before a form of “to be”; “their” is possessive.", conf: 0.85 },
  { re: /\bthere\s+own\b/gi, fix: () => "their own", why: "The possessive is “their”.", conf: 0.95 },
  { re: /\bwho's\s+(car|house|book|idea|fault|turn|job|phone|room|side|name|child|son|daughter)\b/gi, fix: (m) => `whose ${m[1]}`, why: "The possessive is “whose”; “who’s” means “who is”.", conf: 0.92 },
  { re: /\bwho’s\s+(car|house|book|idea|fault|turn|job|phone|room|side|name|child|son|daughter)\b/gi, fix: (m) => `whose ${m[1]}`, why: "The possessive is “whose”; “who’s” means “who is”.", conf: 0.92 },
  { re: /\bto\s+loose\s+(my|his|her|their|our|your|the|it|him|them|everything|control)\b/gi, fix: (m) => `to lose ${m[1]}`, why: "“lose” means to misplace or fail to keep; “loose” means not tight.", conf: 0.85 },
  { re: /\bhad\s+lead\s+(him|her|them|us|me|to|the)\b/gi, fix: (m) => `had led ${m[1]}`, why: "The past participle of “lead” is “led”.", conf: 0.85 },
  { re: /\bbetween\s+(you|him|her|them)\s+and\s+I\b/gi, fix: (m) => `between ${m[1]} and me`, why: "After a preposition the object pronoun “me” is required.", conf: 0.85 },
  { re: /\bfor all intensive purposes\b/gi, fix: () => "for all intents and purposes", why: "The idiom is “for all intents and purposes”.", conf: 0.98 },
  { re: /\bcase and point\b/gi, fix: () => "case in point", why: "The idiom is “case in point”.", conf: 0.97 },
  { re: /\bnip (it|this|that) in the butt\b/gi, fix: (m) => `nip ${m[1]} in the bud`, why: "The idiom is “nip it in the bud”.", conf: 0.98 },
  { re: /\bone in the same\b/gi, fix: () => "one and the same", why: "The idiom is “one and the same”.", conf: 0.97 },
  { re: /\bdeep[- ]seeded\b/gi, fix: () => "deep-seated", why: "The phrase is “deep-seated”.", conf: 0.95 },
  { re: /\bmute point\b/gi, fix: () => "moot point", why: "The phrase is “moot point”.", conf: 0.95 },
  { re: /\bbaited breath\b/gi, fix: () => "bated breath", why: "The phrase is “bated breath” (from “abated”).", conf: 0.95 },
  { re: /\bsneak peak\b/gi, fix: () => "sneak peek", why: "A quick look is a “peek”.", conf: 0.97 },
  { re: /\bpeaked (my|his|her|their|our|your) (interest|curiosity)\b/gi, fix: (m) => `piqued ${m[1]} ${m[2]}`, why: "Interest is “piqued” (stimulated), not “peaked”.", conf: 0.95 },
  { re: /\btow the line\b/gi, fix: () => "toe the line", why: "The idiom is “toe the line”.", conf: 0.95 },
  { re: /\bfree reign\b/gi, fix: () => "free rein", why: "The idiom is “free rein” (from horse riding).", conf: 0.95 },
  { re: /\bmake due\b/gi, fix: () => "make do", why: "The phrase is “make do”.", conf: 0.93 },
  { re: /\bwreck havoc\b/gi, fix: () => "wreak havoc", why: "The phrase is “wreak havoc”.", conf: 0.95 },
  { re: /\bper say\b/gi, fix: () => "per se", why: "The Latin phrase is “per se”.", conf: 0.97 },
  { re: /\bsupposably\b/gi, fix: () => "supposedly", why: "“Supposedly” is the standard word.", conf: 0.9 },
  { re: /\bexpresso\b/gi, fix: () => "espresso", why: "The coffee is “espresso”.", conf: 0.95 },
  { re: /\bcould care less\b/gi, fix: () => "couldn’t care less", why: "The idiom meaning total indifference is “couldn’t care less”.", conf: 0.75 },
  { re: /\bstatue of limitations\b/gi, fix: () => "statute of limitations", why: "The legal term is “statute”.", conf: 0.97 },
  { re: /\bslight of hand\b/gi, fix: () => "sleight of hand", why: "The phrase is “sleight of hand”.", conf: 0.97 },
  { re: /\bshoe[- ]in\b/gi, fix: () => "shoo-in", why: "The phrase is “shoo-in”.", conf: 0.9 },
  { re: /\bsherbert\b/gi, fix: () => "sherbet", why: "The standard spelling is “sherbet”.", conf: 0.85 },
  { re: /\bin regards to\b/gi, fix: () => "in regard to", why: "The standard phrase is “in regard to” (or “regarding”).", conf: 0.8 },
  { re: /\bthe affect of\b/gi, fix: () => "the effect of", why: "As a noun meaning result, the word is “effect”.", conf: 0.85 },
];

export const AGREEMENT: { re: RegExp; fix: (m: RegExpExecArray) => string; why: string }[] = [
  { re: /\b(he|she|it)\s+don['’]t\b/gi, fix: (m) => `${m[1]} doesn’t`, why: "Third-person singular subjects take “doesn’t”." },
  { re: /\b(they|we|you)\s+was\b/gi, fix: (m) => `${m[1]} were`, why: "Plural subjects (and “you”) take “were”." },
  { re: /\bI\s+is\b/g, fix: () => "I am", why: "“I” takes “am”." },
  { re: /\b(he|she|it)\s+have\s+(been|got|had|seen|done|never|always|already)\b/gi, fix: (m) => `${m[1]} has ${m[2]}`, why: "Third-person singular subjects take “has”." },
];

export const WORDY: [RegExp, string, string][] = [
  [/\bin order to\b/gi, "to", "“In order to” can almost always be shortened to “to”."],
  [/\bdue to the fact that\b/gi, "because", "“Due to the fact that” is a wordy way to say “because”."],
  [/\bin spite of the fact that\b/gi, "although", "“In spite of the fact that” is wordy; “although” is tighter."],
  [/\bat this point in time\b/gi, "now", "“At this point in time” is padding for “now”."],
  [/\bat that point in time\b/gi, "then", "“At that point in time” is padding for “then”."],
  [/\bfor all intents and purposes\b/gi, "essentially", "This stock phrase rarely adds meaning."],
  [/\beach and every\b/gi, "every", "“Each and every” is redundant."],
  [/\bin the event that\b/gi, "if", "“In the event that” is a wordy way to say “if”."],
  [/\bwith the exception of\b/gi, "except", "“With the exception of” can be “except”."],
  [/\bin close proximity to\b/gi, "near", "“In close proximity to” is wordy and redundant."],
  [/\bon a daily basis\b/gi, "daily", "“On a daily basis” can be “daily”."],
  [/\bthe reason why\b/gi, "the reason", "“Why” is implied by “the reason”."],
  [/\ba large number of\b/gi, "many", "“A large number of” can be “many”."],
  [/\bat the present time\b/gi, "now", "Wordy phrase for “now”."],
  [/\bin the near future\b/gi, "soon", "Wordy phrase for “soon”."],
  [/\bhas the ability to\b/gi, "can", "“Has the ability to” can be “can”."],
  [/\bmade a decision\b/gi, "decided", "A noun phrase hides the stronger verb “decided”."],
  [/\bcame to the realization\b/gi, "realized", "A noun phrase hides the stronger verb “realized”."],
  [/\bgave a nod\b/gi, "nodded", "“Gave a nod” is weaker than “nodded”."],
  [/\blet out a sigh\b/gi, "sighed", "“Let out a sigh” is weaker than “sighed”."],
  [/\btook a deep breath\b/gi, "", "A very common stock beat; consider a more specific physical reaction."],
];

export const REDUNDANT: [RegExp, string][] = [
  [/\bnodded (his|her|their) head(s)?\b/gi, "nodded"],
  [/\bshrugged (his|her|their) shoulders\b/gi, "shrugged"],
  [/\bblinked (his|her|their) eyes\b/gi, "blinked"],
  [/\bclapped (his|her|their) hands together\b/gi, "clapped"],
  [/\bstood up on (his|her|their) feet\b/gi, "stood up"],
  [/\bpast history\b/gi, "history"],
  [/\bend result\b/gi, "result"],
  [/\bfree gift\b/gi, "gift"],
  [/\bfinal outcome\b/gi, "outcome"],
  [/\bclose proximity\b/gi, "proximity"],
  [/\bcompletely (destroyed|finished|eliminated)\b/gi, "$1"],
  [/\bsudden(ly)? (burst|erupted)\b/gi, "$2"],
  [/\bunexpected surprise\b/gi, "surprise"],
  [/\bfuture plans\b/gi, "plans"],
  [/\bbasic fundamentals\b/gi, "fundamentals"],
  [/\brevert back\b/gi, "revert"],
  [/\breturn back\b/gi, "return"],
  [/\bclimbed up\b/gi, "climbed"],
  [/\bthought (to|in) (himself|herself|themselves)\b/gi, "thought"],
  [/\bwhispered quietly\b/gi, "whispered"],
  [/\bshouted loudly\b/gi, "shouted"],
  [/\bsat down on the (chair|bed|sofa|couch)\b/gi, "sat on the $1"],
];

export const CLICHES = [
  "at the end of the day", "avoid like the plague", "better late than never", "bite the bullet", "blood ran cold", "breath she didn't know she was holding", "breath he didn't know he was holding", "calm before the storm", "cold as ice", "crystal clear", "dead as a doornail", "dark and stormy night", "every fiber of", "few and far between", "fit as a fiddle", "heart skipped a beat", "heart in her throat", "heart in his throat", "hit the nail on the head", "in the nick of time", "last but not least", "light as a feather", "little did she know", "little did he know", "little did they know", "only time will tell", "quiet as a mouse", "read between the lines", "scared to death", "sent shivers down", "shiver down her spine", "shiver down his spine", "shivers down her spine", "shivers down his spine", "sick as a dog", "the writing on the wall", "time stood still", "tip of the iceberg", "white as a sheet", "white as a ghost", "without a doubt", "worth its weight in gold", "all hell broke loose", "against all odds", "a heart of gold", "busy as a bee", "deafening silence", "eyes like saucers", "fell on deaf ears", "frozen in fear", "gut-wrenching", "in the blink of an eye", "jaw dropped", "knock on wood", "let the cat out of the bag", "like a kid in a candy store", "moment of truth", "needle in a haystack", "on cloud nine", "pale as death", "plain as day", "raining cats and dogs", "rang true", "sleep like a log", "slept like a baby", "sharp as a tack", "smooth as silk", "stuck out like a sore thumb", "the last straw", "the whole nine yards", "think outside the box", "throw caution to the wind", "tossed and turned", "under the weather", "unbeknownst to", "weighed a ton", "when all was said and done", "wild goose chase", "a chill ran down", "electricity coursed", "orbs", "let out a breath", "released a breath", "time seemed to slow", "the world fell away", "her heart pounded in her chest", "his heart pounded in his chest", "a single tear", "piercing blue eyes", "steely gaze",
];

export const TELLING_EMOTIONS = "angry|sad|happy|scared|afraid|nervous|anxious|guilty|jealous|lonely|excited|furious|terrified|embarrassed|ashamed|relieved|frustrated|hopeless|confused|depressed|overjoyed|upset|annoyed|worried|elated|devastated|heartbroken|miserable|thrilled|horrified|disgusted";

export const FANCY_TAGS = "exclaimed|retorted|interjected|opined|ejaculated|chortled|expostulated|queried|intoned|vociferated|asseverated";
export const ACTION_TAGS = "smiled|grinned|laughed|sighed|nodded|shrugged|frowned|smirked|giggled|beamed|winced";

export const NOT_ADVERBS = new Set("only family early likely ugly holy lovely friendly lonely silly belly bully reply supply apply rely fly july italy ally jelly hilly chilly curly daily elderly costly deadly kindly lily emily sally molly holly polly billy willy kelly shelly bubbly wobbly cuddly smelly sly ply reply comply imply multiply butterfly dragonfly assembly anomaly melancholy monopoly rally tally rely jolly folly gully dully sully scully".split(" "));

export const NAME_STOP = new Set(
  "I The A An And But Or If When Then There Here This That These Those It He She They We You His Her Their Our Your My Its What Who Why How Where Which Yes No Not Oh Ah Well So Now Just Still Even Maybe Perhaps Okay OK Mr Mrs Ms Dr Sir Madam Lord Lady Miss Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Christmas Easter God Chapter Part Prologue Epilogue One Two Three Four Five Six Seven Eight Nine Ten After Before Once Every Each All Some Any None Both Nothing Something Everything Anything Someone Everyone Nobody Somebody Again Later Soon Today Tomorrow Tonight Yesterday Mom Dad Mum Mother Father Grandma Grandpa Aunt Uncle Hello Hi Thanks Thank Please Sorry Good Great Fine Right Wrong Wait Look Listen Come Go Stop Don't Didn't Can't Won't I'm I'll I've I'd It's That's What's There's Let's He's She's They're We're You're Because Although Though While Since Until Unless Whatever Whenever However Meanwhile Instead Besides Still Yet Also Only Never Always Sometimes Often Inside Outside Above Below Behind Beside Between Through During Without Within Across Around Over Under Near Far With From Into Onto Upon Toward Towards Like Unlike As At By For In Of On To Up Down Out Off Away Back Home English French German Spanish American British Mister".split(
    " ",
  ),
);

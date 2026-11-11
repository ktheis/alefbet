/**
 * AlefBet Curriculum Data
 * Derived from Goal and Lessons.md
 * - 27 Letter forms (22 base + 5 sofit), with א, ל, מ, ם pre-seeded as known
 * - 16 Target Vocabulary Words (5 Starter + 11 Alphabet-Completing)
 * - Confusable look-alike letter pairs for ZPD tracking
 */

window.AlefBetData = window.AlefBetData || {};

window.AlefBetData.LETTERS = [
  // Pre-seeded Known Letters (Baseline)
  {
    id: 'alef',
    char: 'א',
    name: 'Alef',
    sound: 'Silent / vowel carrier',
    shortSound: '—',
    tier: 0,
    preSeeded: true,
    isFinal: false,
    confusables: ['צ', 'ע'],
    tip: 'Diagonal stroke with two arms; carries the vowel sound or glottal stop.'
  },
  {
    id: 'lamed',
    char: 'ל',
    name: 'Lamed',
    sound: 'L (as in "light")',
    shortSound: 'l',
    tier: 0,
    preSeeded: true,
    isFinal: false,
    confusables: ['כ', 'ק'],
    tip: 'The tallest letter in the Hebrew alphabet—its neck rises above the top line!'
  },
  {
    id: 'mem',
    char: 'מ',
    name: 'Mem',
    sound: 'M (as in "Moses")',
    shortSound: 'm',
    tier: 0,
    preSeeded: true,
    isFinal: false,
    confusables: ['ם', 'ט'],
    tip: 'Open at the bottom-left with a top-left horn; used at the start or middle of a word.'
  },
  {
    id: 'final_mem',
    char: 'ם',
    name: 'Final Mem (Mem Sofit)',
    sound: 'M (at end of word)',
    shortSound: 'm',
    tier: 0,
    preSeeded: true,
    isFinal: true,
    baseForm: 'מ',
    confusables: ['ס', 'מ'],
    tip: 'Completely closed square box at the end of a word (unlike rounder Samekh ס).'
  },

  // Tier 1: Letters from the 5 Starter Words (ישראל, משה, מצרים, ברוך, אתה)
  {
    id: 'yud',
    char: 'י',
    name: 'Yud',
    sound: 'Y / ee',
    shortSound: 'y/i',
    tier: 1,
    preSeeded: false,
    isFinal: false,
    confusables: ['ו', 'ז'],
    tip: 'Smallest letter—hangs from the top line like an apostrophe.'
  },
  {
    id: 'shin',
    char: 'ש',
    name: 'Shin / Sin',
    sound: 'SH or S',
    shortSound: 'sh/s',
    tier: 1,
    preSeeded: false,
    isFinal: false,
    confusables: ['ע', 'צ'],
    tip: 'Three prongs rising like a crown or flame (sh as in Moshe, s as in Yisra\'el).'
  },
  {
    id: 'resh',
    char: 'ר',
    name: 'Resh',
    sound: 'R',
    shortSound: 'r',
    tier: 1,
    preSeeded: false,
    isFinal: false,
    confusables: ['ד', 'ך'],
    tip: 'Smooth rounded top-right corner (no overhang like Dalet ד, doesn\'t drop below line like ך).'
  },
  {
    id: 'he',
    char: 'ה',
    name: 'He',
    sound: 'H / ah (at end)',
    shortSound: 'h',
    tier: 1,
    preSeeded: false,
    isFinal: false,
    confusables: ['ח', 'ת'],
    tip: 'Notice the breathing gap at the top-left of the left leg ("H has a hole to breathe").'
  },
  {
    id: 'tsadi',
    char: 'צ',
    name: 'Tsadi',
    sound: 'TS (as in "cats")',
    shortSound: 'ts',
    tier: 1,
    preSeeded: false,
    isFinal: false,
    confusables: ['ע', 'ץ'],
    tip: 'Bent base with a right arm reaching up-right (found in Mitzrayim מצרים).'
  },
  {
    id: 'bet',
    char: 'ב',
    name: 'Bet / Vet',
    sound: 'B or V',
    shortSound: 'b/v',
    tier: 1,
    preSeeded: false,
    isFinal: false,
    confusables: ['כ', 'פ'],
    tip: 'Square bottom-right base with a little tail sticking out to the right (unlike rounded Kaf כ).'
  },
  {
    id: 'vav',
    char: 'ו',
    name: 'Vav',
    sound: 'V / O / OO',
    shortSound: 'v/o/u',
    tier: 1,
    preSeeded: false,
    isFinal: false,
    confusables: ['ז', 'ן', 'י'],
    tip: 'A single straight vertical pillar reaching down to the baseline.'
  },
  {
    id: 'final_khaf',
    char: 'ך',
    name: 'Final Khaf (Khaf Sofit)',
    sound: 'KH (at end of word)',
    shortSound: 'kh',
    tier: 1,
    preSeeded: false,
    isFinal: true,
    baseForm: 'כ',
    confusables: ['ר', 'ד', 'ן'],
    tip: 'Looks like Resh ר, except its vertical leg drops straight below the baseline (as in Barukh ברוך).'
  },
  {
    id: 'tav',
    char: 'ת',
    name: 'Tav',
    sound: 'T',
    shortSound: 't',
    tier: 1,
    preSeeded: false,
    isFinal: false,
    confusables: ['ה', 'ח'],
    tip: 'Closed top like Chet ח, but the bottom-left leg kicks out a little foot ("Tav has a toe").'
  },

  // Tier 2: Letters from the 11 Alphabet-Completing Words
  {
    id: 'gimel',
    char: 'ג',
    name: 'Gimel',
    sound: 'G (as in "go")',
    shortSound: 'g',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['נ', 'ז'],
    tip: 'Narrow body with a small leg kicking forward at the bottom (unlike flat-bottomed Nun נ).'
  },
  {
    id: 'dalet',
    char: 'ד',
    name: 'Dalet',
    sound: 'D',
    shortSound: 'd',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['ר', 'ך'],
    tip: 'The horizontal roof overhangs to the right past the vertical post (unlike smooth Resh ר).'
  },
  {
    id: 'zayin',
    char: 'ז',
    name: 'Zayin',
    sound: 'Z',
    shortSound: 'z',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['ו', 'ג', 'ן'],
    tip: 'Vertical post whose top cap extends on BOTH sides like a T-bar or sword hilt.'
  },
  {
    id: 'chet',
    char: 'ח',
    name: 'Chet',
    sound: 'CH (guttural, as in "Bach")',
    shortSound: 'ch',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['ה', 'ת'],
    tip: 'Two vertical legs completely joined by a solid roof (no gap like He ה, no toe like Tav ת).'
  },
  {
    id: 'tet',
    char: 'ט',
    name: 'Tet',
    sound: 'T',
    shortSound: 't',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['מ', 'ס'],
    tip: 'Rounded basket open at the top, with the right rim curling inward (as in Tov טוב).'
  },
  {
    id: 'final_nun',
    char: 'ן',
    name: 'Final Nun (Nun Sofit)',
    sound: 'N (at end of word)',
    shortSound: 'n',
    tier: 2,
    preSeeded: false,
    isFinal: true,
    baseForm: 'נ',
    confusables: ['ו', 'ז', 'ך'],
    tip: 'A long vertical stroke that drops deep below the baseline (narrower top than Final Khaf ך).'
  },
  {
    id: 'nun',
    char: 'נ',
    name: 'Nun',
    sound: 'N',
    shortSound: 'n',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['ג', 'כ', 'ב'],
    tip: 'Short top bar curving down to a flat bottom foot pointing left (narrower than Kaf כ).'
  },
  {
    id: 'pe',
    char: 'פ',
    name: 'Pe / Fe',
    sound: 'P or F',
    shortSound: 'p/f',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['כ', 'ב', 'ף'],
    tip: 'Rounded outer C-shape like Kaf כ, but with an extra little spiral tongue tucked inside the top.'
  },
  {
    id: 'kaf',
    char: 'כ',
    name: 'Kaf / Khaf',
    sound: 'K or KH',
    shortSound: 'k/kh',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['ב', 'נ', 'פ'],
    tip: 'Smooth, rounded C-shape on the right with no tail sticking out at the bottom-right.'
  },
  {
    id: 'samekh',
    char: 'ס',
    name: 'Samekh',
    sound: 'S',
    shortSound: 's',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['ם', 'ט'],
    tip: 'A smooth, rounded circle/oval (unlike the sharp square corners of Final Mem ם).'
  },
  {
    id: 'final_pe',
    char: 'ף',
    name: 'Final Pe (Fe Sofit)',
    sound: 'F (at end of word)',
    shortSound: 'f',
    tier: 2,
    preSeeded: false,
    isFinal: true,
    baseForm: 'פ',
    confusables: ['פ', 'ך', 'ץ'],
    tip: 'Has the inner curled nose of Pe פ at the top, with its right leg dropping below the baseline.'
  },
  {
    id: 'ayin',
    char: 'ע',
    name: 'Ayin',
    sound: 'Silent / deep vowel carrier',
    shortSound: '‘',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['צ', 'א', 'ש'],
    tip: 'Two branches meeting at the bottom and slanting down-left like a slingshot.'
  },
  {
    id: 'qof',
    char: 'ק',
    name: 'Qof',
    sound: 'K / Q',
    shortSound: 'k',
    tier: 2,
    preSeeded: false,
    isFinal: false,
    confusables: ['כ', 'ר', 'ה'],
    tip: 'Curved roof on the right plus a long detached vertical leg dropping below the line on the left.'
  },
  {
    id: 'final_tsadi',
    char: 'ץ',
    name: 'Final Tsadi (Tsadi Sofit)',
    sound: 'TS (at end of word)',
    shortSound: 'ts',
    tier: 2,
    preSeeded: false,
    isFinal: true,
    baseForm: 'צ',
    confusables: ['צ', 'ע', 'ף'],
    tip: 'Like Tsadi צ, its right arm reaches up, while its main stem plunges straight below the line.'
  }
];

window.AlefBetData.WORDS = [
  // Tier 1: Five Starter Words
  {
    id: 'yisrael',
    hebrew: 'ישראל',
    vocalized: 'יִשְׂרָאֵל',
    translit: "Yisra'el",
    meaning: 'Israel',
    tier: 1,
    category: 'Starter Word',
    letters: ['י', 'ש', 'ר', 'א', 'ל'],
    anchorNote: 'Ends with your known letters א-ל (-el)!'
  },
  {
    id: 'moshe',
    hebrew: 'משה',
    vocalized: 'מֹשֶׁה',
    translit: 'Moshe',
    meaning: 'Moses',
    tier: 1,
    category: 'Starter Word',
    letters: ['מ', 'ש', 'ה'],
    anchorNote: 'Starts right-to-left with your known letter מ (Mem)!'
  },
  {
    id: 'mitzrayim',
    hebrew: 'מצרים',
    vocalized: 'מִצְרַיִם',
    translit: 'Mitzrayim',
    meaning: 'Egypt',
    tier: 1,
    category: 'Starter Word',
    letters: ['מ', 'צ', 'ר', 'י', 'ם'],
    anchorNote: 'Framed on both ends by your known M letters: starts with מ and ends with ם!'
  },
  {
    id: 'barukh',
    hebrew: 'ברוך',
    vocalized: 'בָּרוּךְ',
    translit: 'Barukh',
    meaning: 'Blessed',
    tier: 1,
    category: 'Starter Word',
    letters: ['ב', 'ר', 'ו', 'ך'],
    anchorNote: 'The #1 landmark word in any Hebrew service—opens almost every blessing.'
  },
  {
    id: 'attah',
    hebrew: 'אתה',
    vocalized: 'אַתָּה',
    translit: "'Attah",
    meaning: 'You',
    tier: 1,
    category: 'Starter Word',
    letters: ['א', 'ת', 'ה'],
    anchorNote: 'Starts with your known letter א (Alef) and immediately follows ברוך in blessings.'
  },

  // Tier 2: Eleven Alphabet-Completing Words
  {
    id: 'goy',
    hebrew: 'גוי',
    vocalized: 'גּוֹי',
    translit: 'Goy',
    meaning: 'Nation / people',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['ג', 'ו', 'י'],
    introduces: ['ג'],
    anchorNote: 'Introduces ג (Gimel).'
  },
  {
    id: 'davar',
    hebrew: 'דבר',
    vocalized: 'דָּבָר',
    translit: 'Davar',
    meaning: 'Word / matter / thing',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['ד', 'ב', 'ר'],
    introduces: ['ד'],
    anchorNote: 'Contrasts ד (Dalet at start) with ר (Resh at end) in the same word!'
  },
  {
    id: 'zahav',
    hebrew: 'זהב',
    vocalized: 'זָהָב',
    translit: 'Zahav',
    meaning: 'Gold',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['ז', 'ה', 'ב'],
    introduces: ['ז'],
    anchorNote: 'Introduces ז (Zayin).'
  },
  {
    id: 'echad',
    hebrew: 'אחד',
    vocalized: 'אֶחָד',
    translit: "'Echad",
    meaning: 'One',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['א', 'ח', 'ד'],
    introduces: ['ח'],
    anchorNote: 'Starts with known א (Alef) and closes the Shema!'
  },
  {
    id: 'tov',
    hebrew: 'טוב',
    vocalized: 'טוֹב',
    translit: 'Tov',
    meaning: 'Good',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['ט', 'ו', 'ב'],
    introduces: ['ט'],
    anchorNote: 'Introduces ט (Tet).'
  },
  {
    id: 'ben',
    hebrew: 'בן',
    vocalized: 'בֵּן',
    translit: 'Ben',
    meaning: 'Son',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['ב', 'ן'],
    introduces: ['ן'],
    anchorNote: 'Introduces ן (Final Nun) dropping below the line.'
  },
  {
    id: 'nefesh',
    hebrew: 'נפש',
    vocalized: 'נֶפֶשׁ',
    translit: 'Nefesh',
    meaning: 'Soul / life / being',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['נ', 'פ', 'ש'],
    introduces: ['נ', 'פ'],
    anchorNote: 'Introduces נ (Nun) and פ (Pe/Fe).'
  },
  {
    id: 'kesef',
    hebrew: 'כסף',
    vocalized: 'כֶּסֶף',
    translit: 'Kesef',
    meaning: 'Silver / money',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['כ', 'ס', 'ף'],
    introduces: ['כ', 'ס', 'ף'],
    anchorNote: 'Introduces כ (Kaf), ס (Samekh), and ף (Final Pe).'
  },
  {
    id: 'am',
    hebrew: 'עם',
    vocalized: 'עַם',
    translit: "'Am",
    meaning: 'People / nation',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['ע', 'ם'],
    introduces: ['ע'],
    anchorNote: 'Introduces ע (Ayin) paired with your known ם (Final Mem)!'
  },
  {
    id: 'qol',
    hebrew: 'קול',
    vocalized: 'קוֹל',
    translit: 'Qol',
    meaning: 'Voice / sound',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['ק', 'ו', 'ל'],
    introduces: ['ק'],
    anchorNote: 'Introduces ק (Qof) and ends with your known ל (Lamed)!'
  },
  {
    id: 'eretz',
    hebrew: 'ארץ',
    vocalized: 'אֶרֶץ',
    translit: "'Eretz",
    meaning: 'Land / earth',
    tier: 2,
    category: 'Alphabet Builder',
    letters: ['א', 'ר', 'ץ'],
    introduces: ['ץ'],
    anchorNote: 'Starts with known א (Alef), introduces ץ (Final Tsadi), and finishes Hamotzi!'
  }
];

window.AlefBetData.CONFUSABLE_PAIRS = [
  { pair: ['ב', 'כ'], label: 'ב (Bet) vs כ (Kaf)', hint: 'ב has a sharp square base/toe on the bottom-right; כ is smoothly rounded.' },
  { pair: ['ד', 'ר', 'ך'], label: 'ד (Dalet) vs ר (Resh) vs ך (Final Khaf)', hint: 'ד has a right roof overhang; ר has a smooth curve; ך drops below the baseline.' },
  { pair: ['ה', 'ח', 'ת'], label: 'ה (He) vs ח (Chet) vs ת (Tav)', hint: 'ה has a breathing gap top-left; ח is closed; ת has a left foot kicking out.' },
  { pair: ['ם', 'ס'], label: 'ם (Final Mem) vs ס (Samekh)', hint: 'Your known ם is a square box with corners; ס is a round oval.' },
  { pair: ['ו', 'ז', 'ן'], label: 'ו (Vav) vs ז (Zayin) vs ן (Final Nun)', hint: 'ו is a normal pillar; ז has a top bar on both sides; ן drops deep below the line.' },
  { pair: ['צ', 'ע', 'ץ'], label: 'צ (Tsadi) vs ע (Ayin) vs ץ (Final Tsadi)', hint: 'צ bends flat at the bottom; ע slants down-left; ץ drops straight below the line.' }
];

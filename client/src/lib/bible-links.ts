import { buildBibleLink } from "@shared/bible-versions";

const BOOKS: Record<string, string> = {
  genesis: "GEN", exodus: "EXO", leviticus: "LEV", numbers: "NUM", deuteronomy: "DEU",
  joshua: "JOS", judges: "JDG", ruth: "RUT", "1 samuel": "1SA", "2 samuel": "2SA",
  "1 kings": "1KI", "2 kings": "2KI", "1 chronicles": "1CH", "2 chronicles": "2CH",
  ezra: "EZR", nehemiah: "NEH", esther: "EST", job: "JOB", psalm: "PSA", psalms: "PSA",
  proverbs: "PRO", ecclesiastes: "ECC", "song of songs": "SNG", "song of song": "SNG",
  isaiah: "ISA", jeremiah: "JER", lamentations: "LAM", ezekiel: "EZK", daniel: "DAN",
  hosea: "HOS", joel: "JOL", amos: "AMO", obadiah: "OBA", jonah: "JON", micah: "MIC",
  nahum: "NAM", habakkuk: "HAB", zephaniah: "ZEP", haggai: "HAG", zechariah: "ZEC",
  malachi: "MAL", matthew: "MAT", mark: "MRK", luke: "LUK", john: "JHN", acts: "ACT",
  romans: "ROM", "1 corinthians": "1CO", "2 corinthians": "2CO", galatians: "GAL",
  galatian: "GAL", galation: "GAL", ephesians: "EPH", philippians: "PHP", colossians: "COL",
  "1 thessalonians": "1TH", "2 thessalonians": "2TH", "1 timothy": "1TI", "2 timothy": "2TI",
  titus: "TIT", philemon: "PHM", hebrews: "HEB", james: "JAS", "1 peter": "1PE",
  "2 peter": "2PE", "1 john": "1JN", "2 john": "2JN", "3 john": "3JN", jude: "JUD",
  revelation: "REV",
};

const referenceRegex = /\b(?:(?:1|2|3)\s+)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|(?:1|2)\s*Samuel|(?:1|2)\s*Kings|(?:1|2)\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song\s+of\s+Songs?|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|(?:1|2)\s*Corinthians|Galatians?|Galation|Ephesians|Philippians|Colossians|(?:1|2)\s*Thessalonians|(?:1|2)\s*Timothy|Titus|Philemon|Hebrews|James|(?:1|2)\s*Peter|(?:1|2|3)\s*John|Jude|Revelation)\s+(?:\d+(?:\s*,\s*\d+)+|\d+(?:-\d+)?(?:\s*:\s*(?:Verses?\s+)?\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)?)*)\b/gi;

function anchor(passage: string, label: string, version?: string | null) {
  return `<a href="${buildBibleLink(passage, version)}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${label}</a>`;
}

function updateStoredLink(href: string, version?: string | null): string {
  try {
    const url = new URL(href);
    if (url.hostname !== "www.bible.com" && url.hostname !== "bible.com") return href;
    const passage = url.pathname.match(/^\/bible\/\d+\/([A-Z0-9.-]+)\.[A-Z0-9_-]+$/i);
    if (!passage) return href;
    return `${buildBibleLink(passage[1], version)}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

// Personalize at display time; shared activity records must not be rewritten
// when one user changes their preference. Existing saved NIV anchors also work.
export function linkifyBibleReferences(content: string, version?: string | null): string {
  const parts = content.split(/(<(?:a|script|style|iframe)\b[^>]*>[\s\S]*?<\/(?:a|script|style|iframe)>|<[^>]*>)/gi);
  return parts.map(part => {
    if (/^<a\b/i.test(part)) {
      return part.replace(/\bhref\s*=\s*(["'])(.*?)\1/i, (_match, quote, href) =>
        `href=${quote}${updateStoredLink(href, version)}${quote}`);
    }
    if (part.startsWith("<")) return part;
    return part.replace(referenceRegex, match => {
      const parsed = match.match(/^(.+?)\s+(\d+.*)$/);
      if (!parsed) return match;
      const bookName = parsed[1].trim();
      const book = BOOKS[bookName.toLowerCase().replace(/\s+/g, " ").replace(/^([123])(?=[a-z])/, "$1 ")];
      if (!book) return match;
      const reference = parsed[2].trim();
      if (reference.includes(",") && !reference.includes(":")) {
        return `${bookName} ${reference.split(",").map(chapter =>
          anchor(`${book}.${chapter.trim()}`, chapter.trim(), version)).join(", ")}`;
      }
      const range = reference.match(/^(\d+)-(\d+)$/);
      if (range) {
        return `${bookName} ${anchor(`${book}.${range[1]}`, range[1], version)}-${anchor(`${book}.${range[2]}`, range[2], version)}`;
      }
      const formatted = reference.replace(/Verses?\s+/gi, "").replace(/\s+/g, "").replace(/:/g, ".");
      return anchor(`${book}.${formatted}`, match, version);
    });
  }).join("");
}

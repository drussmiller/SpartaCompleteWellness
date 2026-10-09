export const BIBLE_VERSION_CODES = ["AMP", "NIV", "NKJV", "ESV"] as const;
export type BibleVersion = (typeof BIBLE_VERSION_CODES)[number];
export const DEFAULT_BIBLE_VERSION: BibleVersion = "NIV";

export const BIBLE_VERSIONS: Record<BibleVersion, {
  name: string;
  id: number;
  suffix: string;
}> = {
  AMP: { name: "Amplified Bible", id: 1588, suffix: "AMP" },
  NIV: { name: "New International Version", id: 111, suffix: "NIV" },
  NKJV: { name: "New King James Version", id: 114, suffix: "NKJV" },
  ESV: { name: "English Standard Version", id: 59, suffix: "ESV" },
};

export function resolveBibleVersion(version?: string | null): BibleVersion {
  return BIBLE_VERSION_CODES.find(code => code === version) ?? DEFAULT_BIBLE_VERSION;
}

export function buildBibleLink(passage: string, version?: string | null): string {
  const translation = BIBLE_VERSIONS[resolveBibleVersion(version)];
  return `https://www.bible.com/bible/${translation.id}/${passage}.${translation.suffix}`;
}

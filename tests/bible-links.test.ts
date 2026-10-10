import assert from "node:assert/strict";
import { test } from "node:test";
import { linkifyBibleReferences } from "../client/src/lib/bible-links";
import { buildBibleLink, BIBLE_VERSION_CODES, BIBLE_VERSIONS } from "../shared/bible-versions";

test("NIV remains the default", () => {
  assert.equal(buildBibleLink("JHN.3.16"), "https://www.bible.com/bible/111/JHN.3.16.NIV");
});

for (const version of BIBLE_VERSION_CODES) {
  test(`${version} builds plain references and personalizes existing saved links`, () => {
    const config = BIBLE_VERSIONS[version];
    const expected = `https://www.bible.com/bible/${config.id}/JHN.3.16.${config.suffix}`;
    assert.ok(linkifyBibleReferences("John 3:16", version).includes(`href="${expected}"`));
    const stored = '<p><a href="https://www.bible.com/bible/111/JHN.3.16.NIV" target="_blank">John 3:16</a></p>';
    const personalized = linkifyBibleReferences(stored, version);
    assert.ok(personalized.includes(`href="${expected}"`));
    assert.equal((personalized.match(/<a /g) || []).length, 1);
    assert.equal(linkifyBibleReferences(personalized, version), personalized);
    assert.equal(stored.includes("/111/"), true);
  });
}

test("chapter lists, ranges, numbered books and verse ranges retain references", () => {
  const lists = linkifyBibleReferences("Psalms 29, 59, 89, 149", "ESV");
  for (const chapter of [29, 59, 89, 149]) assert.ok(lists.includes(`/59/PSA.${chapter}.ESV`));
  const ranges = linkifyBibleReferences("Genesis 33-34", "NKJV");
  assert.ok(ranges.includes("/114/GEN.33.NKJV"));
  assert.ok(ranges.includes("/114/GEN.34.NKJV"));
  assert.ok(linkifyBibleReferences("1 Corinthians 13:4-7", "AMP").includes("/1588/1CO.13.4-7.AMP"));
});

test("unrelated links and HTML attributes stay untouched while unlinked text is converted", () => {
  const content = '<div title="John 3:16"><a href="https://example.com">John 3:16</a><p>John 5:1-18</p></div>';
  const output = linkifyBibleReferences(content, "ESV");
  assert.ok(output.includes('title="John 3:16"'));
  assert.ok(output.includes('<a href="https://example.com">John 3:16</a>'));
  assert.ok(output.includes("/59/JHN.5.1-18.ESV"));
});

test("changing a user's version rewrites the same stored content without nesting links", () => {
  const niv = linkifyBibleReferences("John 3:16");
  const esv = linkifyBibleReferences(niv, "ESV");
  const amp = linkifyBibleReferences(esv, "AMP");
  assert.ok(amp.includes("/1588/JHN.3.16.AMP"));
  assert.equal((amp.match(/<a /g) || []).length, 1);
});

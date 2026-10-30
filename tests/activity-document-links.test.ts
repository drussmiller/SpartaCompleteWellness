import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeActivityVideoLinks } from "../server/activity-document-links";

const oldUrl = "https://youtu.be/QPIQ_zKSmL8";
const newUrl = "https://youtu.be/8x2PnF_AnO8";

test("Parallel Row nested Word hyperlink uses the corrected inner URL", () => {
  const html = `<p><strong>Parallel Row- </strong>4 Sets </p><p><a href="${oldUrl}"><a href="${newUrl}">${newUrl}</a></a></p>`;
  assert.equal(normalizeActivityVideoLinks(html),
    `<p><strong>Parallel Row- </strong>4 Sets </p><p>${newUrl}</p>`);
});

test("corrected visible URL overrides a stale destination, including formatted text", () => {
  assert.equal(normalizeActivityVideoLinks(`<a href="${oldUrl}"><strong>${newUrl}</strong></a>`), newUrl);
});

test("descriptive video labels still use the underlying destination", () => {
  assert.equal(normalizeActivityVideoLinks(`<a href="${newUrl}">Parallel Row</a>`), newUrl);
});

test("other exercises, non-video links, and existing iframes are preserved", () => {
  const html = `<p>Quad Band Pull Apart</p><a href="${oldUrl}">${oldUrl}</a><a href="https://example.com"><strong>Equipment</strong></a><iframe src="https://www.youtube.com/embed/8x2PnF_AnO8"></iframe>`;
  assert.equal(normalizeActivityVideoLinks(html), html.replace(`<a href="${oldUrl}">${oldUrl}</a>`, oldUrl));
});

test("normalization is idempotent and supports URL query strings", () => {
  const html = `<a href="${oldUrl}">${newUrl}?si=example&amp;t=10</a>`;
  const result = normalizeActivityVideoLinks(html);
  assert.equal(result, `${newUrl}?si=example&amp;t=10`);
  assert.equal(normalizeActivityVideoLinks(result), result);
});

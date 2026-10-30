const youtubeUrl = /^https?:\/\/(?:www\.)?(?:youtu\.be\/[a-zA-Z0-9_-]{11}|youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|v\/|shorts\/)[a-zA-Z0-9_-]{11})(?:[?&#][^\s<>"']*)?$/i;

/**
 * Word can retain an old hyperlink around a newly pasted link. Collapse
 * YouTube anchors before the browser repairs nested anchors into separate links.
 * A visible video URL takes precedence over a stale underlying destination.
 */
export function normalizeActivityVideoLinks(html: string): string {
  const stack: { opening: string; content: string; href: string }[] = [];
  let output = "";
  let position = 0;
  const append = (text: string) => {
    if (stack.length) stack[stack.length - 1].content += text;
    else output += text;
  };

  for (const match of html.matchAll(/<a\b[^>]*>|<\/a\s*>/gi)) {
    append(html.slice(position, match.index));
    position = match.index! + match[0].length;
    if (/^<a\b/i.test(match[0])) {
      const href = match[0].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
      stack.push({ opening: match[0], content: "", href });
    } else {
      const link = stack.pop();
      if (!link) {
        append(match[0]);
        continue;
      }
      const visible = link.content.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
      const href = link.href.replace(/&amp;/g, "&");
      // Only treat visible URLs as video links when the destination is also
      // YouTube; leave unrelated hyperlinks and labels unchanged.
      if (youtubeUrl.test(href)) {
        const url = youtubeUrl.test(visible) ? visible : href;
        append(url.replace(/&/g, "&amp;"));
      } else {
        append(`${link.opening}${link.content}${match[0]}`);
      }
    }
  }
  append(html.slice(position));
  while (stack.length) {
    const link = stack.pop()!;
    append(link.opening + link.content);
  }
  return output;
}

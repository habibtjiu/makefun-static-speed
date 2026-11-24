// makefun-site's text rules: the HTML escape table, the slug rule and the long date (README.md, "Text").

/** `text` with & < > " and ' escaped. */
export function escapeHtml(text) {
  const len = text.length;
  let last = 0;
  let out = '';
  for (let i = 0; i < len; i++) {
    let rep;
    switch (text.charCodeAt(i)) {
      case 38: rep = '&amp;'; break;
      case 60: rep = '&lt;'; break;
      case 62: rep = '&gt;'; break;
      case 34: rep = '&quot;'; break;
      case 39: rep = '&#39;'; break;
      default: continue;
    }
    if (i > last) out += text.slice(last, i);
    out += rep;
    last = i + 1;
  }
  if (last === 0) return text;
  return last < len ? out + text.slice(last) : out;
}

/** The most characters a slug keeps before a collision suffix. */
export const SLUG_MAX = 64;

/**
 * The slug of `text`: NFKD, combining marks dropped, A-Z lowered, every run of characters other than a-z and 0-9 one
 * "-", none at either end, at most SLUG_MAX characters (a "-" left at the cut dropped), and "untitled" when nothing is
 * left.
 */
export function slugify(text) {
  let isAscii = true;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 128) {
      isAscii = false;
      break;
    }
  }
  const plain = isAscii ? text : text.normalize('NFKD').replace(/\p{M}/gu, '');
  let out = '';
  let gap = false;
  for (let i = 0; i < plain.length; i++) {
    const c = plain.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      if (gap) { out += '-'; gap = false; }
      out += String.fromCharCode(c + 32);
    } else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      if (gap) { out += '-'; gap = false; }
      out += plain[i];
    } else {
      if (out.length > 0) gap = true;
    }
  }
  if (out.length > SLUG_MAX) out = out.slice(0, SLUG_MAX);
  while (out.length > 0 && out.charCodeAt(out.length - 1) === 45) out = out.slice(0, -1);
  return out === '' ? 'untitled' : out;
}

/** `slug` made unique against `taken` (and added to it): the first of slug, slug-2, slug-3 ... not taken. */
export function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A YYYY-MM-DD date in words, from the string alone: "2026-11-09" is "9 November 2026". */
export function longDate(date) {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

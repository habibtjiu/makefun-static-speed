// makefun-site's Markdown (README.md, "Markdown"): optimized lexer and inline renderer, byte-for-byte identical.

import { escapeHtml, slugify, uniqueSlug } from './text.js';

const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const CONTINUED = /^ {2,}\S/;
const HAS_WS = /\s/;

function isBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

/** A paragraph line as it is rendered: spaces and tabs at either end dropped. */
function trimLine(line) {
  let start = 0;
  let end = line.length;
  while (start < end) {
    const c = line.charCodeAt(start);
    if (c !== 32 && c !== 9) break;
    start++;
  }
  while (end > start) {
    const c = line.charCodeAt(end - 1);
    if (c !== 32 && c !== 9) break;
    end--;
  }
  return start === 0 && end === line.length ? line : line.slice(start, end);
}

/** A heading line's level and text, or null (a heading's text is never empty). */
function headingOf(line) {
  if (line.charCodeAt(0) !== 35) return null;
  const m = HEADING.exec(line);
  return m === null || m[2] === '' ? null : { depth: m[1].length, text: m[2] };
}

/** Whether `line` ends a paragraph: a blank line, a fence, a heading or a thematic break. */
function endsParagraph(line) {
  if (line.length === 0) return true;
  const c = line.charCodeAt(0);
  if (c === 32 || c === 9) return isBlank(line);
  if (c === 96) return FENCE_OPEN.test(line);
  if (c === 35) return headingOf(line) !== null;
  if (c === 45 || c === 42) return HR.test(line);
  return false;
}

/** `src`'s block tokens, in order. */
export function lex(src) {
  const lines = src.split('\n');
  const tokens = [];
  const nLines = lines.length;
  let i = 0;
  while (i < nLines) {
    const line = lines[i];
    if (line.length === 0) {
      i++;
      continue;
    }
    const c0 = line.charCodeAt(0);
    if ((c0 === 32 || c0 === 9) && isBlank(line)) {
      i++;
      continue;
    }
    if (c0 === 96) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        const body = [];
        i++;
        while (i < nLines && !(lines[i].charCodeAt(0) === 96 && FENCE_CLOSE.test(lines[i]))) body.push(lines[i++]);
        i++;
        tokens.push({ type: 'code', lang: fence[1], lines: body });
        continue;
      }
    } else if (c0 === 35) {
      const heading = headingOf(line);
      if (heading !== null) {
        tokens.push({ type: 'heading', depth: heading.depth, text: heading.text });
        i++;
        continue;
      }
    } else if (c0 === 45 || c0 === 42) {
      if (HR.test(line)) {
        tokens.push({ type: 'hr' });
        i++;
        continue;
      }
      if (line.charCodeAt(1) === 32) {
        const items = [];
        while (i < nLines) {
          const l = lines[i];
          const lc0 = l.charCodeAt(0);
          if ((lc0 === 45 || lc0 === 42) && l.charCodeAt(1) === 32) {
            items.push([trimLine(l.slice(2))]);
            i++;
          } else if (lc0 === 32 && CONTINUED.test(l)) {
            items[items.length - 1].push(trimLine(l));
            i++;
          } else break;
        }
        tokens.push({ type: 'list', ordered: false, start: 1, items: items.map((parts) => parts.join('\n')) });
        continue;
      }
    } else if (c0 === 62) {
      const body = [];
      while (i < nLines && lines[i].charCodeAt(0) === 62) {
        const l = lines[i++];
        const stripped = l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1);
        const trimmed = trimLine(stripped);
        if (trimmed !== '') body.push(trimmed);
      }
      tokens.push({ type: 'blockquote', lines: body });
      continue;
    } else if (c0 >= 48 && c0 <= 57) {
      const ordered = ORDERED.exec(line);
      if (ordered !== null) {
        const items = [];
        while (i < nLines) {
          const l = lines[i];
          const lc0 = l.charCodeAt(0);
          const m = lc0 >= 48 && lc0 <= 57 ? ORDERED.exec(l) : null;
          if (m !== null) {
            items.push([trimLine(m[2])]);
            i++;
          } else if (lc0 === 32 && CONTINUED.test(l)) {
            items[items.length - 1].push(trimLine(l));
            i++;
          } else break;
        }
        tokens.push({ type: 'list', ordered: true, start: Number(ordered[1]), items: items.map((parts) => parts.join('\n')) });
        continue;
      }
    }
    const body = [trimLine(line)];
    i++;
    while (i < nLines && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    tokens.push({ type: 'paragraph', text: body.join('\n') });
  }
  return tokens;
}

/** Lookup tables for ASCII characters. */
const ESCAPABLE = new Uint8Array(128);
for (const ch of ['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']) {
  ESCAPABLE[ch.charCodeAt(0)] = 1;
}

const INLINE_SPECIAL = new Uint8Array(128);
for (const ch of ['\\', '`', '*', '[', '&', '<', '>', '"', "'"]) {
  INLINE_SPECIAL[ch.charCodeAt(0)] = 1;
}

function isEscapable(code) {
  return code < 128 && ESCAPABLE[code] === 1;
}

/** The first index from `from` where `s` holds `what` outside a backslash escape, or -1. */
function findUnescapedChar(s, charCode, from) {
  const len = s.length;
  for (let j = from; j < len; j++) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < len && isEscapable(s.charCodeAt(j + 1))) {
      j++;
      continue;
    }
    if (c === charCode) return j;
  }
  return -1;
}

function findUnescapedDoubleStar(s, from) {
  const limit = s.length - 1;
  for (let j = from; j < limit; j++) {
    const c = s.charCodeAt(j);
    if (c === 92 && isEscapable(s.charCodeAt(j + 1))) {
      j++;
      continue;
    }
    if (c === 42 && s.charCodeAt(j + 1) === 42) return j;
  }
  return -1;
}

/** The first single * from `from` (one whose run is not **), outside an escape, or -1. */
function findSingleStar(s, from) {
  const len = s.length;
  for (let j = from; j < len; j++) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < len && isEscapable(s.charCodeAt(j + 1))) {
      j++;
      continue;
    }
    if (c !== 42) continue;
    if (j + 1 < len && s.charCodeAt(j + 1) === 42) {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}

/** `s` rendered inline; `env.link(target)` is a link's href. */
export function inline(s, env) {
  const len = s.length;
  let out = '';
  let last = 0;
  let i = 0;
  while (i < len) {
    const c = s.charCodeAt(i);
    if (c >= 128 || INLINE_SPECIAL[c] === 0) {
      i++;
      continue;
    }
    if (i > last) out += s.slice(last, i);
    if (c === 38) {
      out += '&amp;';
      i++;
    } else if (c === 60) {
      out += '&lt;';
      i++;
    } else if (c === 62) {
      out += '&gt;';
      i++;
    } else if (c === 34) {
      out += '&quot;';
      i++;
    } else if (c === 39) {
      out += '&#39;';
      i++;
    } else if (c === 92) {
      if (i + 1 < len && isEscapable(s.charCodeAt(i + 1))) {
        const next = s.charCodeAt(i + 1);
        out += next === 62 ? '&gt;' : s[i + 1];
        i += 2;
      } else {
        out += '\\';
        i++;
      }
    } else if (c === 96) {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        out += `<code>${escapeHtml(s.slice(i + 1, j))}</code>`;
        i = j + 1;
      } else {
        out += '`';
        i++;
      }
    } else if (c === 42) {
      if (i + 1 < len && s.charCodeAt(i + 1) === 42) {
        const j = findUnescapedDoubleStar(s, i + 2);
        if (j > i + 2) {
          out += `<strong>${inline(s.slice(i + 2, j), env)}</strong>`;
          i = j + 2;
        } else {
          out += '**';
          i += 2;
        }
      } else {
        const j = findSingleStar(s, i + 1);
        if (j > i + 1) {
          out += `<em>${inline(s.slice(i + 1, j), env)}</em>`;
          i = j + 1;
        } else {
          out += '*';
          i++;
        }
      }
    } else {
      // c === 91 ('[')
      const k = findUnescapedChar(s, 93, i + 1);
      const m = k !== -1 && k + 1 < len && s.charCodeAt(k + 1) === 40 ? s.indexOf(')', k + 2) : -1;
      const target = m === -1 ? '' : s.slice(k + 2, m);
      if (target !== '' && !HAS_WS.test(target)) {
        out += `<a href="${escapeHtml(env.link(target))}">${inline(s.slice(i + 1, k), env)}</a>`;
        i = m + 1;
      } else {
        out += '[';
        i++;
      }
    }
    last = i;
  }
  if (last === 0) return s;
  return last < len ? out + s.slice(last) : out;
}

/**
 * `src` rendered: its HTML (each block on its own lines, a "\n" after the last), its table of contents (every level 2
 * and 3 heading: level, id and its inline HTML) and its excerpt (the first paragraph's inline HTML, or "").
 */
export function renderMarkdown(src, env) {
  const ids = new Set();
  const blocks = [];
  const toc = [];
  let excerpt = null;
  const tokens = lex(src);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading': {
        const id = uniqueSlug(slugify(t.text), ids);
        const html = inline(t.text, env);
        blocks.push(`<h${t.depth} id="${id}">${html}</h${t.depth}>`);
        if (t.depth === 2 || t.depth === 3) toc.push({ level: t.depth, id, html });
        break;
      }
      case 'code': {
        const cls = t.lang === '' ? '' : ` class="language-${escapeHtml(t.lang)}"`;
        let codeOut = '';
        const ls = t.lines;
        for (let k = 0; k < ls.length; k++) codeOut += `${escapeHtml(ls[k])}\n`;
        blocks.push(`<pre><code${cls}>${codeOut}</code></pre>`);
        break;
      }
      case 'hr':
        blocks.push('<hr>');
        break;
      case 'blockquote':
        blocks.push(t.lines.length === 0 ? '<blockquote>\n</blockquote>' : `<blockquote>\n<p>${inline(t.lines.join('\n'), env)}</p>\n</blockquote>`);
        break;
      case 'list': {
        const tag = t.ordered ? 'ol' : 'ul';
        const open = t.ordered && t.start !== 1 ? `<ol start="${t.start}">` : `<${tag}>`;
        let itemsOut = '';
        const items = t.items;
        for (let k = 0; k < items.length; k++) itemsOut += `<li>${inline(items[k], env)}</li>\n`;
        blocks.push(`${open}\n${itemsOut}</${tag}>`);
        break;
      }
      case 'paragraph': {
        const html = inline(t.text, env);
        if (excerpt === null) excerpt = html;
        blocks.push(`<p>${html}</p>`);
        break;
      }
    }
  }
  let html = '';
  for (let i = 0; i < blocks.length; i++) html += `${blocks[i]}\n`;
  return { html, toc, excerpt: excerpt ?? '' };
}

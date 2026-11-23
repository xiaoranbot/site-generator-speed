// solve.js — a fast drop-in replacement for makefun-site 1.0.0.
//
// Written from the makefun-site README alone (its front matter, template
// dialect, Markdown subset, slug rule and report). No reference code was
// read and no existing implementation was copied.
//
// run(input) takes { site, templates, files } and returns the output tree:
// a JSON object of every path the build writes and that file's text.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);
const MARK = /\p{M}/gu;
const NON_ALNUM_RUN = /[^a-z0-9]+/g;
const UPPER = /[A-Z]/g;

// ------------------------------------------------------------------ text

function escapeInto(s, a, b, out) {
  let last = a;
  for (let i = a; i < b; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 38) rep = '&amp;';
    else if (c === 60) rep = '&lt;';
    else if (c === 62) rep = '&gt;';
    else if (c === 34) rep = '&quot;';
    else if (c === 39) rep = '&#39;';
    if (rep !== null) {
      if (last < i) out.push(s.slice(last, i));
      out.push(rep);
      last = i + 1;
    }
  }
  if (last < b) out.push(s.slice(last, b));
}

function escapeHtml(s) {
  const out = [];
  escapeInto(s, 0, s.length, out);
  return out.length === 1 && out[0] === s ? s : out.join('');
}

// A slug: NFKD, combining marks dropped, A-Z lowered, each run of
// characters other than a-z and 0-9 one '-', none at either end, cut to
// 64 characters, a '-' left at the cut dropped, 'untitled' when empty.
function slugifyRaw(text) {
  let s = text.normalize('NFKD').replace(MARK, '');
  s = s.replace(UPPER, (c) => c.toLowerCase());
  s = s.replace(NON_ALNUM_RUN, '-');
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) === 45) a++;
  while (b > a && s.charCodeAt(b - 1) === 45) b--;
  if (a > 0 || b < s.length) s = s.slice(a, b);
  if (s.length > 64) {
    s = s.slice(0, 64);
    if (s.charCodeAt(63) === 45) s = s.slice(0, 63);
  }
  return s === '' ? 'untitled' : s;
}

function dateLong(d) {
  // d is 'YYYY-MM-DD'; the date in words from the string alone.
  return (+d.slice(8, 10)) + ' ' + MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
}

function leap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function validDate(v) {
  if (v.length !== 10 || v.charCodeAt(4) !== 45 || v.charCodeAt(7) !== 45) return false;
  for (let i = 0; i < 10; i++) {
    if (i === 4 || i === 7) continue;
    const c = v.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  const y = +v.slice(0, 4);
  const m = +v.slice(5, 7);
  const d = +v.slice(8, 10);
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = m === 2 ? (leap(y) ? 29 : 28) : DAYS_IN_MONTH[m - 1];
  if (d > dim) return false;
  if (y < 1970 || y > 2099) return false;
  return true;
}

// ------------------------------------------------------------------ front matter

const FM_KEYS = new Set(['title', 'summary', 'date', 'tags', 'draft', 'layout', 'slug']);
const KEY_LINE = /^([a-z_]+):(?: (.*))?$/;
const SLUG_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LAYOUT_NAME = /^[a-z0-9-]+$/;

// Parse a quoted string value (value[0] === '"'). Returns the string, or
// an error reason.
function parseQuoted(value) {
  let out = '';
  let i = 1;
  const n = value.length;
  while (i < n) {
    const c = value[i];
    if (c === '\\') {
      const d = value[i + 1];
      if (d === '"' || d === '\\') {
        out += d;
        i += 2;
      } else {
        return { error: 'a quoted string has a bad escape' };
      }
    } else if (c === '"') {
      if (i !== n - 1) return { error: 'a quoted string is not closed' };
      return { value: out };
    } else {
      out += c;
      i++;
    }
  }
  return { error: 'a quoted string is not closed' };
}

// Validate one front-matter value. Returns the parsed value, or an error
// reason string.
function parseFmValue(key, value) {
  if (key === 'title' || key === 'summary') {
    if (value.charCodeAt(0) === 34) return parseQuoted(value);
    if (value.charCodeAt(0) === 91) return { error: 'a bare string opens on [' };
    return { value };
  }
  if (key === 'date') {
    return validDate(value) ? { value } : { error: 'not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
  }
  if (key === 'tags') {
    if (value.length < 2 || value.charCodeAt(0) !== 91 || value.charCodeAt(value.length - 1) !== 93) {
      return { error: 'not a list [a, b]' };
    }
    const inner = value.slice(1, -1);
    const tags = [];
    if (inner.trim() !== '') {
      const parts = inner.split(',');
      for (let p of parts) {
        p = p.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        if (p === '' || p.indexOf('"') !== -1 || p.indexOf('[') !== -1 || p.indexOf(']') !== -1) {
          return { error: 'an empty tag, or one holding " [ or ]' };
        }
        tags.push(p);
      }
    }
    return { value: tags };
  }
  if (key === 'draft') {
    return value === 'true' || value === 'false' ? { value: value === 'true' } : { error: 'true or false' };
  }
  if (key === 'layout') {
    return LAYOUT_NAME.test(value) ? { value } : { error: 'not a template name' };
  }
  // slug
  if (value.length > 64 || !SLUG_KEY.test(value)) return { error: 'not a slug' };
  return { value };
}

// Parse the front matter of a source's lines. Returns
// { fm, bodyStart } or { error }.
function parseFrontMatter(lines) {
  if (lines.length === 0 || lines[0] !== '---') return { error: 'no front matter' };
  const fm = {};
  const seen = new Set();
  let i = 1;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === '---') break;
    // blank (spaces and tabs only) or a comment (opening on '#')
    if (raw === '') continue;
    let blank = true;
    for (let k = 0; k < raw.length; k++) {
      const c = raw.charCodeAt(k);
      if (c !== 32 && c !== 9) { blank = false; break; }
    }
    if (blank) continue;
    if (raw.charCodeAt(0) === 35) continue;
    // drop trailing spaces and tabs, then match key: value
    let end = raw.length;
    while (end > 0) {
      const c = raw.charCodeAt(end - 1);
      if (c === 32 || c === 9) end--;
      else break;
    }
    const line = end < raw.length ? raw.slice(0, end) : raw;
    const m = KEY_LINE.exec(line);
    if (!m) return { error: 'line ' + (i + 1) + ' is not "key: value"' };
    const key = m[1];
    if (!FM_KEYS.has(key)) return { error: 'unknown key "' + key + '"' };
    if (seen.has(key)) return { error: 'key "' + key + '" is given twice' };
    seen.add(key);
    if (m[2] === undefined) return { error: 'key "' + key + '" has no value' };
    const r = parseFmValue(key, m[2]);
    if (r.error) return { error: 'key "' + key + '": ' + r.error };
    fm[key] = r.value;
  }
  if (i >= lines.length) return { error: 'the front matter is not closed' };
  if (fm.title === undefined) return { error: 'no title' };
  return { fm, bodyStart: i + 1 };
}

// ------------------------------------------------------------------ markdown

const FENCE_OPEN = /^```([A-Za-z0-9_+\\-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const BREAK_RE = /^(---|\*\*\*)[ \t]*$/;
const ORDERED_ITEM = /^(\d+)\. (.*)$/;
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function slugify(text, cache) {
  let s = cache.get(text);
  if (s === undefined) {
    s = slugifyRaw(text);
    cache.set(text, s);
  }
  return s;
}

function isBlank(line) {
  if (line === '') return true;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function trimSpaces(s) {
  let a = 0;
  let b = s.length;
  while (a < b && (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9)) a++;
  while (b > a && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) b--;
  return s.slice(a, b);
}

function resolvePath(dir, path) {
  const parts = dir === '' ? [] : dir.split('/');
  const segs = path.split('/');
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
}

// Link context for one source: resolves a link target to its href, and
// records a broken link (once per source and target) when it names neither
// a built page nor a static file.
function makeLinkCtx(source, dir, pageBySource, staticSet, base, brokenSet, brokenList) {
  return {
    resolve(target) {
      const c0 = target.charCodeAt(0);
      if (c0 === 47 || c0 === 35 || SCHEME_RE.test(target)) return target;
      const hash = target.indexOf('#');
      const frag = hash === -1 ? '' : target.slice(hash);
      const path = hash === -1 ? target : target.slice(0, hash);
      const resolved = resolvePath(dir, path);
      const url = pageBySource.get(resolved);
      if (url !== undefined) return url + frag;
      if (staticSet.has(resolved)) return base + '/' + resolved + frag;
      const key = source + '\n' + target;
      if (!brokenSet.has(key)) {
        brokenSet.add(key);
        brokenList.push('broken-link ' + source + ' -> ' + target);
      }
      return target;
    },
  };
}

function findStrongCloser(s, from, end) {
  let j = from;
  while (j + 1 < end) {
    const c = s.charCodeAt(j);
    if (c === 92) {
      const d = j + 1 < end ? s[j + 1] : '';
      if (d !== '' && ESCAPABLE.has(d)) { j += 2; continue; }
      j++;
      continue;
    }
    if (c === 42 && s.charCodeAt(j + 1) === 42) {
      // The next ** is the closer; with nothing between it and the
      // opener there is no closer at all, and a later ** does not count.
      if (j === from) return -1;
      return j;
    }
    j++;
  }
  return -1;
}

function findEmCloser(s, from, end) {
  let j = from;
  while (j < end) {
    const c = s.charCodeAt(j);
    if (c === 92) {
      const d = j + 1 < end ? s[j + 1] : '';
      if (d !== '' && ESCAPABLE.has(d)) { j += 2; continue; }
      j++;
      continue;
    }
    if (c === 42) {
      // A ** pair is a strong delimiter, never an em closer: skip the
      // pair whole, so only a lone * closes the emphasis.
      if (j + 1 < end && s.charCodeAt(j + 1) === 42) { j += 2; continue; }
      if (j > from) return j;
      j++;
      continue;
    }
    j++;
  }
  return -1;
}

// Try to parse a link starting at s[i] === '['. On success renders it
// into out and returns the index just past it; else returns -1.
function tryLink(s, i, end, out, lx) {
  let j = i + 1;
  let close = -1;
  while (j < end) {
    const c = s.charCodeAt(j);
    if (c === 92) {
      const d = j + 1 < end ? s[j + 1] : '';
      if (d !== '' && ESCAPABLE.has(d)) { j += 2; continue; }
      j++;
      continue;
    }
    if (c === 93) { close = j; break; }
    j++;
  }
  if (close === -1) return -1;
  if (close + 1 >= end || s.charCodeAt(close + 1) !== 40) return -1;
  const tEnd = s.indexOf(')', close + 2);
  if (tEnd === -1) return -1;
  const target = s.slice(close + 2, tEnd);
  if (target === '') return -1;
  for (let k = 0; k < target.length; k++) {
    const c = target.charCodeAt(k);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12) return -1;
  }
  const href = lx.resolve(target);
  out.push('<a href="');
  escapeInto(href, 0, href.length, out);
  out.push('">');
  inlineRange(s, i + 1, close, out, lx);
  out.push('</a>');
  return tEnd + 1;
}

// Render s[a..b] as inline HTML into out.
function inlineRange(s, a, b, out, lx) {
  let i = a;
  let seg = a;
  while (i < b) {
    const c = s.charCodeAt(i);
    if (c === 92) { // backslash
      const d = i + 1 < b ? s[i + 1] : '';
      if (d !== '' && ESCAPABLE.has(d)) {
        if (seg < i) escapeInto(s, seg, i, out);
        out.push(d === '>' ? '&gt;' : d);
        i += 2;
        seg = i;
      } else {
        if (seg < i) escapeInto(s, seg, i, out);
        out.push('\\');
        i++;
        seg = i;
      }
      continue;
    }
    if (c === 96) { // backtick: code span
      let j = i + 1;
      while (j < b && s.charCodeAt(j) !== 96) j++;
      if (j < b && j > i + 1) {
        if (seg < i) escapeInto(s, seg, i, out);
        out.push('<code>');
        escapeInto(s, i + 1, j, out);
        out.push('</code>');
        i = j + 1;
        seg = i;
      } else {
        i++;
      }
      continue;
    }
    if (c === 42) { // *
      if (i + 1 < b && s.charCodeAt(i + 1) === 42) {
        const j = findStrongCloser(s, i + 2, b);
        if (j !== -1) {
          if (seg < i) escapeInto(s, seg, i, out);
          out.push('<strong>');
          inlineRange(s, i + 2, j, out, lx);
          out.push('</strong>');
          i = j + 2;
          seg = i;
        } else {
          i += 2;
        }
      } else {
        const j = findEmCloser(s, i + 1, b);
        if (j !== -1) {
          if (seg < i) escapeInto(s, seg, i, out);
          out.push('<em>');
          inlineRange(s, i + 1, j, out, lx);
          out.push('</em>');
          i = j + 1;
          seg = i;
        } else {
          i++;
        }
      }
      continue;
    }
    if (c === 91) { // [
      if (seg < i) escapeInto(s, seg, i, out);
      const r = tryLink(s, i, b, out, lx);
      if (r !== -1) {
        i = r;
        seg = i;
      } else {
        seg = i; // '[' joins the pending segment as a literal
        i++;
      }
      continue;
    }
    if (c === 38 || c === 60 || c === 62 || c === 34 || c === 39) {
      if (seg < i) escapeInto(s, seg, i, out);
      out.push(c === 38 ? '&amp;' : c === 60 ? '&lt;' : c === 62 ? '&gt;' : c === 34 ? '&quot;' : '&#39;');
      i++;
      seg = i;
      continue;
    }
    i++;
  }
  if (seg < b) escapeInto(s, seg, b, out);
}

// 1 for a bullet list line, 2 for an ordered list line, 0 otherwise.
function listKindOf(line) {
  const c = line.charCodeAt(0);
  if ((c === 45 || c === 42) && line.charCodeAt(1) === 32) return 1;
  if (c >= 48 && c <= 57) {
    let j = 1;
    while (j < line.length) {
      const d = line.charCodeAt(j);
      if (d < 48 || d > 57) break;
      j++;
    }
    if (line.charCodeAt(j) === 46 && line.charCodeAt(j + 1) === 32) return 2;
  }
  return 0;
}

// A heading line, or null: { level, text } with the text's trailing
// spaces and tabs dropped. No text after the #'s is not a heading.
function headingOf(line) {
  if (line.charCodeAt(0) !== 35) return null;
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  const text = trimSpaces(m[2]);
  if (text === '') return null;
  return { level: m[1].length, text };
}

function isFenceOpen(line) {
  return line.charCodeAt(0) === 96 && FENCE_OPEN.test(line);
}

function isBreak(line) {
  return line === '---' || line === '***' || BREAK_RE.test(line);
}

// Render one source's body lines to HTML. Returns
// { html, toc, excerpt } where excerpt is the HTML of the body's first
// paragraph (its inner HTML, no <p> wrapper), or ''.
function renderBody(lines, start, end, lx, slugCache) {
  const out = [];
  const toc = [];
  const headingTaken = new Set();
  let excerpt = null;
  let i = start;
  while (i < end) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    // fence
    if (line.charCodeAt(0) === 96) {
      const fm = FENCE_OPEN.exec(line);
      if (fm) {
        const lang = fm[1];
        i++;
        const bodyOut = [];
        while (i < end) {
          const bl = lines[i];
          if (FENCE_CLOSE.test(bl)) { i++; break; }
          escapeInto(bl, 0, bl.length, bodyOut);
          bodyOut.push('\n');
          i++;
        }
        out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>');
        out.push(bodyOut.join(''));
        out.push('</code></pre>\n');
        continue;
      }
    }
    // heading
    const h = headingOf(line);
    if (h) {
      const base = slugify(h.text, slugCache);
      let id = base;
      let n = 2;
      while (headingTaken.has(id)) { id = base + '-' + n; n++; }
      headingTaken.add(id);
      const inner = [];
      inlineRange(h.text, 0, h.text.length, inner, lx);
      const innerHtml = inner.join('');
      if (h.level === 2 || h.level === 3) toc.push({ level: h.level, id, html: innerHtml });
      out.push('<h' + h.level + ' id="' + id + '">' + innerHtml + '</h' + h.level + '>\n');
      i++;
      continue;
    }
    // thematic break
    if (isBreak(line)) {
      out.push('<hr>\n');
      i++;
      continue;
    }
    // blockquote
    if (line.charCodeAt(0) === 62) {
      const parts = [];
      while (i < end) {
        const bl = lines[i];
        if (bl.charCodeAt(0) !== 62) break;
        let t = bl.slice(1);
        if (t.charCodeAt(0) === 32) t = t.slice(1);
        t = trimSpaces(t);
        if (t !== '') parts.push(t);
        i++;
      }
      if (parts.length === 0) {
        out.push('<blockquote>\n</blockquote>\n');
      } else {
        const joined = parts.join('\n');
        const inner = [];
        inlineRange(joined, 0, joined.length, inner, lx);
        out.push('<blockquote>\n<p>' + inner.join('') + '</p>\n</blockquote>\n');
      }
      continue;
    }
    // list
    const kind = listKindOf(line);
    if (kind !== 0) {
      const ordered = kind === 2;
      let startNum = 1;
      let first = true;
      const items = [];
      let cur = null;
      while (i < end) {
        const bl = lines[i];
        if (isBlank(bl)) break;
        const k = listKindOf(bl);
        if (k === kind) {
          if (cur !== null) items.push(cur);
          if (ordered) {
            const m = ORDERED_ITEM.exec(bl);
            if (first) startNum = parseInt(m[1], 10);
            cur = m[2];
          } else {
            cur = bl.slice(2);
          }
          first = false;
          i++;
          continue;
        }
        if (bl.charCodeAt(0) === 32 && bl.charCodeAt(1) === 32) {
          const t = trimSpaces(bl);
          if (t !== '' && cur !== null) { cur += '\n' + t; i++; continue; }
        }
        break;
      }
      if (cur !== null) items.push(cur);
      out.push(ordered ? (startNum !== 1 ? '<ol start="' + startNum + '">\n' : '<ol>\n') : '<ul>\n');
      for (let q = 0; q < items.length; q++) {
        const it = items[q];
        const inner = [];
        inlineRange(it, 0, it.length, inner, lx);
        out.push('<li>' + inner.join('') + '</li>\n');
      }
      out.push(ordered ? '</ol>\n' : '</ul>\n');
      continue;
    }
    // paragraph: lines up to a blank line, a fence, a heading or a
    // thematic break.
    const pLines = [trimSpaces(line)];
    i++;
    while (i < end) {
      const bl = lines[i];
      if (isBlank(bl)) break;
      if (isFenceOpen(bl)) break;
      if (headingOf(bl)) break;
      if (isBreak(bl)) break;
      pLines.push(trimSpaces(bl));
      i++;
    }
    const joined = pLines.join('\n');
    const inner = [];
    inlineRange(joined, 0, joined.length, inner, lx);
    const innerHtml = inner.join('');
    if (excerpt === null) excerpt = innerHtml;
    out.push('<p>' + innerHtml + '</p>\n');
  }
  return { html: out.join(''), toc, excerpt: excerpt === null ? '' : excerpt };
}

// ------------------------------------------------------------------ templates

const PATH_RE = /^[_A-Za-z][_A-Za-z0-9]*(\.[_A-Za-z][_A-Za-z0-9]*)*$/;
const EMPTY_ARR = [];

function parseTag(inner) {
  if (inner === 'endfor') return { t: 'tag', kind: 'endfor' };
  if (inner === 'endif') return { t: 'tag', kind: 'endif' };
  if (inner === 'else') return { t: 'tag', kind: 'else' };
  let m = /^for\s+([_A-Za-z][_A-Za-z0-9]*)\s+in\s+(.+)$/.exec(inner);
  if (m) {
    const path = trimSpaces(m[2]);
    if (!PATH_RE.test(path)) return { error: 'a path is not one' };
    return { t: 'tag', kind: 'for', v: m[1], path: path.split('.') };
  }
  m = /^if\s+(not\s+)?(.+)$/.exec(inner);
  if (m) {
    const path = trimSpaces(m[2]);
    if (!PATH_RE.test(path)) return { error: 'a path is not one' };
    return { t: 'tag', kind: 'if', path: path.split('.'), neg: !!m[1] };
  }
  m = /^include\s+"([^"]*)"$/.exec(inner);
  if (m) return { t: 'tag', kind: 'include', name: m[1] };
  return { error: '"' + inner + '" is not a tag' };
}

function buildTree(tokens) {
  const root = [];
  const stack = [{ kind: 'root', body: root }];
  function cur() {
    const f = stack[stack.length - 1];
    if (f.kind === 'if') return f.inElse ? f.node.els : f.node.then;
    return f.body;
  }
  for (const tok of tokens) {
    if (tok.t === 'tag') {
      if (tok.kind === 'for') {
        const node = { t: 'for', v: tok.v, path: tok.path, body: [] };
        cur().push(node);
        stack.push({ kind: 'for', body: node.body });
      } else if (tok.kind === 'if') {
        const node = { t: 'if', path: tok.path, neg: tok.neg, then: [], els: null };
        cur().push(node);
        stack.push({ kind: 'if', node, inElse: false });
      } else if (tok.kind === 'else') {
        const f = stack[stack.length - 1];
        if (f.kind !== 'if' || f.node.els !== null) return { error: 'a for or if is closed out of order' };
        f.node.els = [];
        f.inElse = true;
      } else if (tok.kind === 'endfor') {
        const f = stack[stack.length - 1];
        if (f.kind !== 'for') return { error: 'a for or if is closed out of order' };
        stack.pop();
      } else if (tok.kind === 'endif') {
        const f = stack[stack.length - 1];
        if (f.kind !== 'if') return { error: 'a for or if is closed out of order' };
        stack.pop();
      } else if (tok.kind === 'include') {
        cur().push({ t: 'include', name: tok.name });
      }
    } else {
      cur().push(tok);
    }
  }
  if (stack.length > 1) return { error: 'a for or if is not closed' };
  return { nodes: root };
}

// Parse one template source. A {% %} tag alone on its line (only spaces
// or tabs beside it) takes the whole line with it, its \n included.
// Returns { nodes } or { error }.
function parseTemplate(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  let textStart = 0;
  while (i < n) {
    const jVar = src.indexOf('{{', i);
    const jTag = src.indexOf('{%', i);
    let j = -1;
    let isTag = false;
    if (jVar === -1) { j = jTag; isTag = true; }
    else if (jTag === -1) { j = jVar; }
    else if (jTag < jVar) { j = jTag; isTag = true; }
    else { j = jVar; }
    if (j === -1) break;
    if (isTag) {
      const close = src.indexOf('%}', j + 2);
      if (close === -1) return { error: '{% is not closed' };
      const inner = trimSpaces(src.slice(j + 2, close));
      const lineStart = src.lastIndexOf('\n', j - 1) + 1;
      const before = src.slice(lineStart, j);
      let afterEnd = close + 2;
      while (afterEnd < n && (src.charCodeAt(afterEnd) === 32 || src.charCodeAt(afterEnd) === 9)) afterEnd++;
      const standalone = /^[ \t]*$/.test(before) && (afterEnd >= n || src.charCodeAt(afterEnd) === 10);
      const tag = parseTag(inner);
      if (tag.error) return { error: tag.error };
      if (standalone) {
        if (textStart < lineStart) tokens.push({ t: 'text', s: src.slice(textStart, lineStart) });
        tokens.push(tag);
        i = afterEnd;
        if (i < n && src.charCodeAt(i) === 10) i++;
        textStart = i;
      } else {
        if (textStart < j) tokens.push({ t: 'text', s: src.slice(textStart, j) });
        tokens.push(tag);
        i = close + 2;
        textStart = i;
      }
    } else {
      const raw = src.startsWith('{{{', j);
      const openLen = raw ? 3 : 2;
      const closeStr = raw ? '}}}' : '}}';
      const close = src.indexOf(closeStr, j + openLen);
      if (close === -1) return { error: raw ? '{{{ is not closed' : '{{ is not closed' };
      const inner = trimSpaces(src.slice(j + openLen, close));
      if (!PATH_RE.test(inner)) return { error: 'a path is not one' };
      if (textStart < j) tokens.push({ t: 'text', s: src.slice(textStart, j) });
      tokens.push({ t: 'var', path: inner.split('.'), raw });
      i = close + closeStr.length;
      textStart = i;
    }
  }
  if (textStart < n) tokens.push({ t: 'text', s: src.slice(textStart) });
  return buildTree(tokens);
}

function resolvePathValue(path, ctx, scope) {
  const first = path[0];
  let v;
  let found = false;
  for (let s = scope.length - 1; s >= 0; s--) {
    const f = scope[s];
    if (first === 'loop') { v = f.loop; found = true; break; }
    if (first === f.elem) { v = f.value; found = true; break; }
  }
  if (!found) {
    if (first === 'loop') return undefined;
    v = ctx[first];
  }
  for (let k = 1; k < path.length; k++) {
    if (v === null || v === undefined) return undefined;
    if (!Object.prototype.hasOwnProperty.call(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function writeValue(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (Array.isArray(v)) {
    let s = '';
    for (let k = 0; k < v.length; k++) {
      if (k > 0) s += ', ';
      s += writeValue(v[k]);
    }
    return s;
  }
  return '';
}

function truthy(v) {
  if (v === undefined || v === null || v === false || v === '' || v === 0) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function renderNodes(nodes, ctx, scope, templates, out, depth) {
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    if (node.t === 'text') { out.push(node.s); continue; }
    if (node.t === 'var') {
      const v = writeValue(resolvePathValue(node.path, ctx, scope));
      if (node.raw) out.push(v);
      else escapeInto(v, 0, v.length, out);
      continue;
    }
    if (node.t === 'for') {
      const arr = resolvePathValue(node.path, ctx, scope);
      if (Array.isArray(arr)) {
        for (let k = 0; k < arr.length; k++) {
          scope.push({ elem: node.v, value: arr[k], loop: { index: k + 1, first: k === 0, last: k === arr.length - 1, length: arr.length } });
          renderNodes(node.body, ctx, scope, templates, out, depth);
          scope.pop();
        }
      }
      continue;
    }
    if (node.t === 'if') {
      const cond = truthy(resolvePathValue(node.path, ctx, scope));
      const take = node.neg ? !cond : cond;
      renderNodes(take ? node.then : (node.els || EMPTY_ARR), ctx, scope, templates, out, depth);
      continue;
    }
    if (node.t === 'include') {
      if (depth < 8) {
        const tpl = templates[node.name];
        if (tpl) renderNodes(tpl, ctx, scope, templates, out, depth + 1);
      }
      continue;
    }
  }
}

// ------------------------------------------------------------------ the build

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function countWords(lines, start) {
  let n = 0;
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(/\S+/g);
    if (m) n += m.length;
  }
  return n;
}

export function run(input) {
  const site = input.site;
  const base = site.base_url.replace(/\/+$/, '');
  const slugCache = new Map();
  const brokenSet = new Set();
  const brokenList = [];
  const report = [];

  // 1. Sources: files sorted by path in code-unit order.
  const files = input.files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // 2. Templates, parsed in code-unit order of name. One that does not
  // parse is reported and left out, as if it were not there.
  const templateNames = Object.keys(input.templates).sort();
  const templates = {};
  for (const name of templateNames) {
    const r = parseTemplate(input.templates[name]);
    if (r.error) {
      report.push('template "' + name + '": ' + r.error);
      templates[name] = null;
    } else {
      templates[name] = r.nodes;
    }
  }

  // 3. Front matter and the checks, in source order.
  const staticSet = new Set();
  const kept = [];
  const takenByDir = new Map();
  const rootTaken = new Set(['posts', 'tags', 'page']);
  for (const f of files) {
    if (!f.path.endsWith('.md')) {
      staticSet.add(f.path);
      continue;
    }
    const content = f.content.indexOf('\r') === -1 ? f.content : f.content.replace(/\r\n?/g, '\n');
    const lines = content.split('\n');
    const fmRes = parseFrontMatter(lines);
    if (fmRes.error) {
      report.push('refused ' + f.path + ': ' + fmRes.error);
      continue;
    }
    const fm = fmRes.fm;
    const isPost = f.path.startsWith('posts/');
    if (!isPost && (f.path.startsWith('tags/') || f.path.startsWith('page/'))) {
      report.push('refused ' + f.path + ': ' + (f.path.startsWith('tags/') ? 'tags' : 'page') + '/ is the generator\'s own');
      continue;
    }
    if (isPost && fm.date === undefined) {
      report.push('refused ' + f.path + ': a post needs a date');
      continue;
    }
    const layout = fm.layout !== undefined ? fm.layout : (isPost ? 'post' : 'page');
    if (!templates[layout]) {
      report.push('refused ' + f.path + ': layout "' + layout + '" is no template that parses');
      continue;
    }
    if (fm.draft === true) {
      report.push('draft ' + f.path);
      continue;
    }
    // Permalinks: slug unique in its directory, in source order.
    const dir = isPost ? 'posts' : dirOf(f.path);
    let taken = takenByDir.get(dir);
    if (!taken) {
      taken = dir === '' ? new Set(rootTaken) : new Set();
      takenByDir.set(dir, taken);
    }
    const slugBase = fm.slug !== undefined ? fm.slug : slugify(fm.title, slugCache);
    let slug = slugBase;
    let n = 2;
    while (taken.has(slug)) { slug = slugBase + '-' + n; n++; }
    taken.add(slug);
    // The post's tags, each slug once (the first spelling kept).
    const tagList = [];
    const seenTagSlugs = new Set();
    const rawTags = fm.tags || [];
    for (let t = 0; t < rawTags.length; t++) {
      const name = rawTags[t];
      const s = slugify(name, slugCache);
      if (seenTagSlugs.has(s)) continue;
      seenTagSlugs.add(s);
      tagList.push({ name, slug: s, url: '' });
    }
    kept.push({
      path: f.path,
      fileDir: dirOf(f.path),
      isPost,
      dir,
      fm,
      title: fm.title,
      date: fm.date,
      summary: fm.summary || '',
      slug,
      url: base + '/' + (dir === '' ? '' : dir + '/') + slug + '/',
      outPath: (dir === '' ? '' : dir + '/') + slug + '/index.html',
      layout,
      lines,
      bodyStart: fmRes.bodyStart,
      tagList,
      readingMinutes: Math.max(1, Math.ceil(countWords(lines, fmRes.bodyStart) / 200)),
    });
  }

  // 4. Markdown, each source's body rendered to HTML, its links resolved.
  const pageBySource = new Map();
  for (const p of kept) pageBySource.set(p.path, p.url);
  for (const p of kept) {
    const lx = makeLinkCtx(p.path, p.fileDir, pageBySource, staticSet, base, brokenSet, brokenList);
    const r = renderBody(p.lines, p.bodyStart, p.lines.length, lx, slugCache);
    p.content = r.html;
    p.toc = r.toc;
    p.excerpt = r.excerpt;
    p.lines = null;
  }

  // 5. Collections: posts newest date first, equal dates by slug.
  const posts = kept.filter((p) => p.isPost);
  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });

  // 6. Tags, each slug once, named as first met walking the posts in
  // collection order; ordered by count of posts, most first, then slug.
  const tagBySlug = new Map();
  for (const post of posts) {
    for (const t of post.tagList) {
      let tag = tagBySlug.get(t.slug);
      if (!tag) {
        tag = { name: t.name, slug: t.slug, posts: [] };
        tagBySlug.set(t.slug, tag);
      }
      tag.posts.push(post);
    }
  }
  const tags = [...tagBySlug.values()];
  tags.sort((a, b) => {
    if (a.posts.length !== b.posts.length) return b.posts.length - a.posts.length;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  for (const p of kept) {
    for (const t of p.tagList) {
      const tag = tagBySlug.get(t.slug);
      if (tag) {
        // A page's tags link to the tag of the same slug: the tag's own
        // name (the first spelling met walking the posts), or "" where
        // no post has that tag.
        t.name = tag.name;
        t.url = base + '/tags/' + t.slug + '/';
      }
    }
  }

  // Cards and page objects.
  function makeCard(p) {
    return {
      title: p.title,
      url: p.url,
      date: p.date || '',
      date_long: p.date ? dateLong(p.date) : '',
      summary: p.summary,
      excerpt: p.excerpt,
      reading_minutes: p.readingMinutes,
      tags: p.tagList,
    };
  }
  for (const p of kept) p.card = makeCard(p);
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const newer = i > 0 ? posts[i - 1] : null;
    const older = i + 1 < posts.length ? posts[i + 1] : null;
    post.newer = newer ? { title: newer.title, url: newer.url, date: newer.date, date_long: dateLong(newer.date) } : null;
    post.older = older ? { title: older.title, url: older.url, date: older.date, date_long: dateLong(older.date) } : null;
  }
  for (const p of kept) {
    const page = {
      title: p.card.title,
      url: p.card.url,
      date: p.card.date,
      date_long: p.card.date_long,
      summary: p.card.summary,
      excerpt: p.card.excerpt,
      reading_minutes: p.card.reading_minutes,
      tags: p.card.tags,
      slug: p.slug,
      content: p.content,
      toc: p.toc,
      newer: p.isPost ? p.newer : null,
      older: p.isPost ? p.older : null,
      is_post: p.isPost,
    };
    p.pageObj = page;
  }

  const siteCtx = { title: site.title, base_url: base };
  const tagsCtx = tags.map((t) => ({ name: t.name, slug: t.slug, url: base + '/tags/' + t.slug + '/', count: t.posts.length }));
  const recentCtx = posts.slice(0, site.recent).map((p) => p.card);

  const output = {};

  // 7. Layouts: every page through its layout, with `page`.
  for (const p of kept) {
    const ctx = { site: siteCtx, tags: tagsCtx, recent: recentCtx, page: p.pageObj };
    const out = [];
    renderNodes(templates[p.layout], ctx, [], templates, out, 0);
    output[p.outPath] = out.join('');
  }

  // The index, `site.per_page` posts a page (at least one).
  const perPage = site.per_page;
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
  const indexTpl = templates['index'];
  if (indexTpl) {
    for (let n = 1; n <= totalPages; n++) {
      const pagePosts = posts.slice((n - 1) * perPage, n * perPage).map((p) => p.card);
      const pager = {
        number: n,
        total: totalPages,
        url: n === 1 ? base + '/' : base + '/page/' + n + '/',
        newer_url: n === 1 ? '' : (n === 2 ? base + '/' : base + '/page/' + (n - 1) + '/'),
        older_url: n === totalPages ? '' : base + '/page/' + (n + 1) + '/',
      };
      const ctx = { site: siteCtx, tags: tagsCtx, recent: recentCtx, posts: pagePosts, pager };
      const out = [];
      renderNodes(indexTpl, ctx, [], templates, out, 0);
      output[n === 1 ? 'index.html' : 'page/' + n + '/index.html'] = out.join('');
    }
  }

  // Each tag through `tag`, and `tags/index.html` through `tags`.
  const tagTpl = templates['tag'];
  if (tagTpl) {
    for (const t of tags) {
      const tagCtx = { name: t.name, slug: t.slug, url: base + '/tags/' + t.slug + '/', count: t.posts.length, posts: t.posts.map((p) => p.card) };
      const ctx = { site: siteCtx, tags: tagsCtx, recent: recentCtx, tag: tagCtx };
      const out = [];
      renderNodes(tagTpl, ctx, [], templates, out, 0);
      output['tags/' + t.slug + '/index.html'] = out.join('');
    }
  }
  const tagsTpl = templates['tags'];
  if (tagsTpl) {
    const ctx = { site: siteCtx, tags: tagsCtx, recent: recentCtx };
    const out = [];
    renderNodes(tagsTpl, ctx, [], templates, out, 0);
    output['tags/index.html'] = out.join('');
  }

  // Static files, unless a built page has their path.
  let staticCount = 0;
  for (const f of files) {
    if (f.path.endsWith('.md')) continue;
    if (Object.prototype.hasOwnProperty.call(output, f.path)) {
      report.push('shadowed ' + f.path + ': a built page has its path');
      continue;
    }
    output[f.path] = f.content;
    staticCount++;
  }

  // 8. The report, every line sorted, then the built line.
  for (const line of brokenList) report.push(line);
  report.sort();
  let pageCount = 0;
  for (const p of kept) if (!p.isPost) pageCount++;
  report.push('built ' + pageCount + ' pages, ' + posts.length + ' posts, ' + tags.length + ' tags and ' + staticCount + ' static files');
  output['build-report.txt'] = report.map((l) => l + '\n').join('');

  return output;
}

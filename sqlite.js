'use strict';
// Reading an SQLite database on the phone, read-only, with nothing installed: enough to scan whole tables, which is
// what a Health Connect backup needs. The file format is SQLite's own documented one (sqlite.org/fileformat2.html):
// a header, fixed-size pages, each table a B-tree of pages, each row a record of typed values, long rows continued on
// overflow pages. Indexes are never needed: every table is read start to end, in rowid order.

function sqliteErr(msg) { const e = new Error(msg); e.code = 'sqlite'; return e; }
// A variable-length integer: up to 9 bytes, 7 bits each, the 9th byte whole. Returns [value, bytes used].
function sqliteVarint(u8, p) {
  let v = 0;
  for (let i = 0; i < 8; i++) { const b = u8[p + i]; v = v * 128 + (b & 0x7f); if (b < 0x80) return [v, i + 1]; }
  return [v * 256 + u8[p + 8], 9];
}
function sqliteOpen(u8) {
  const head = new TextDecoder().decode(u8.subarray(0, 15));
  if (head !== 'SQLite format 3') throw sqliteErr('This is not an SQLite database.');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const ps = dv.getUint16(16) === 1 ? 65536 : dv.getUint16(16), usable = ps - u8[20];
  if (dv.getUint32(56) !== 1) throw sqliteErr('This database is not stored as UTF-8 text.');
  const dec = new TextDecoder();
  // A row's payload: what fits on its page, then the overflow pages in a chain.
  function payload(at, size) {
    const X = usable - 35;
    if (size <= X) return u8.subarray(at, at + size);
    const M = Math.floor((usable - 12) * 32 / 255) - 23, K = M + (size - M) % (usable - 4), local = K <= X ? K : M;
    const out = new Uint8Array(size);
    out.set(u8.subarray(at, at + local));
    let got = local, next = dv.getUint32(at + local);
    while (got < size && next) {
      const base = (next - 1) * ps, n = Math.min(usable - 4, size - got);
      out.set(u8.subarray(base + 4, base + 4 + n), got); got += n;
      next = dv.getUint32(base);
    }
    return out;
  }
  // A record: a header of serial types, then the values. Text is decoded; blobs stay bytes.
  function record(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
    let [hs, n] = sqliteVarint(b, 0), h = n, d = hs;
    while (h < hs) {
      const [t, m] = sqliteVarint(b, h); h += m;
      if (t === 0) out.push(null);
      else if (t === 1) { out.push(v.getInt8(d)); d += 1; }
      else if (t === 2) { out.push(v.getInt16(d)); d += 2; }
      else if (t === 3) { out.push((v.getInt8(d) << 16) | v.getUint16(d + 1)); d += 3; }
      else if (t === 4) { out.push(v.getInt32(d)); d += 4; }
      else if (t === 5) { out.push(v.getInt16(d) * 4294967296 + v.getUint32(d + 2)); d += 6; }
      else if (t === 6) { out.push(Number(v.getBigInt64(d))); d += 8; }
      else if (t === 7) { out.push(v.getFloat64(d)); d += 8; }
      else if (t === 8) out.push(0);
      else if (t === 9) out.push(1);
      else if (t >= 12) { const len = (t - (t & 1 ? 13 : 12)) / 2; out.push(t & 1 ? dec.decode(b.subarray(d, d + len)) : b.subarray(d, d + len)); d += len; }
      else out.push(null);
    }
    return out;
  }
  // Every row of a table B-tree, in order: fn(rowid, values). A read past the end of the file is damage, said as such.
  function scan(root, fn) {
    try { walk(root, fn); } catch (e) { throw e?.name === 'RangeError' ? sqliteErr('The database is damaged or cut short.') : e; }
  }
  // Interior pages are walked left to right.
  function walk(root, fn) {
    const stack = [root], seen = new Set();
    while (stack.length) {
      const pg = stack.pop();
      if (seen.has(pg) || pg < 1 || pg * ps > u8.length) throw sqliteErr('The database is damaged or cut short.');
      seen.add(pg);
      const base = (pg - 1) * ps, h = base + (pg === 1 ? 100 : 0), type = u8[h], cells = dv.getUint16(h + 3);
      if (type === 0x05) {
        const kids = [];
        for (let i = 0; i < cells; i++) kids.push(dv.getUint32(base + dv.getUint16(h + 12 + 2 * i)));
        kids.push(dv.getUint32(h + 8));
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      } else if (type === 0x0d) {
        for (let i = 0; i < cells; i++) {
          let at = base + dv.getUint16(h + 8 + 2 * i);
          const [size, a] = sqliteVarint(u8, at); at += a;
          const [rowid, b] = sqliteVarint(u8, at); at += b;
          fn(rowid, record(payload(at, size)));
        }
      } else throw sqliteErr('The database is damaged or cut short.'); // a table's pages are only ever these two kinds
    }
  }
  // The schema: each table's root page and its columns, in order; an INTEGER PRIMARY KEY column is the rowid.
  const tables = {};
  scan(1, (rid, r) => {
    if (r[0] !== 'table' || typeof r[4] !== 'string') return;
    const body = r[4].slice(r[4].indexOf('(') + 1, r[4].lastIndexOf(')')), cols = [];
    let depth = 0, cur = '';
    for (const ch of body + ',') {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { cols.push(cur.trim()); cur = ''; } else cur += ch;
    }
    const defs = cols.filter(c => c && !/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(c));
    // A computed column ("x AS (expr)", virtual unless STORED) is not in the record, so the ones after it move up.
    let at = 0;
    const slot = defs.map(c => /\bAS\s*\(/i.test(c) && !/\bSTORED\b/i.test(c) ? -1 : at++);
    tables[r[1]] = { root: r[3], cols: defs.map(c => c.match(/^["`[]?([^"`\]\s]+)/)[1].toLowerCase()), slot, rowidCol: defs.findIndex(c => /^\S+\s+INTEGER\s+PRIMARY\s+KEY/i.test(c)), noRowid: /WITHOUT\s+ROWID/i.test(r[4]) };
  });
  return {
    tables,
    has: name => !!tables[name] && !tables[name].noRowid,
    // Rows as objects keyed by column name. A missing table gives no rows rather than an error.
    each(name, fn) {
      const t = tables[name];
      if (!t || t.noRowid) return 0;
      let n = 0;
      scan(t.root, (rid, vals) => {
        const o = {};
        for (let i = 0; i < t.cols.length; i++) o[t.cols[i]] = i === t.rowidCol ? rid : t.slot[i] < 0 ? null : vals[t.slot[i]] ?? null;
        fn(o); n++;
      });
      return n;
    },
  };
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('sqlite.js');

'use strict';
// Reading a .zip on the phone, with nothing fetched and nothing installed: the Zepp app's "Export data" arrives as a
// password-protected zip, and this opens it where it lands. The archive's table of contents is read from its end;
// each file is unlocked (the traditional PKWARE lock, or WinZip AES with its password check and its HMAC), inflated
// with the browser's own DecompressionStream, and handed over line by line, so a large export never has to sit in
// memory as one string. Long loops pause every few megabytes so the screen can show progress.

const ZIP_CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const zipTick = () => new Promise(r => setTimeout(r, 0));
function zipErr(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

// The table of contents: every entry with its name, method, sizes, where its data starts, and how it is locked.
function zipEntries(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), u16 = o => dv.getUint16(o, true), u32 = o => dv.getUint32(o, true);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (u32(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw zipErr('notzip', 'This is not a zip file, or it is damaged.');
  let n = u16(eocd + 10), at = u32(eocd + 16);
  // A zip64 archive keeps the real numbers in a second end record.
  if ((n === 0xffff || at === 0xffffffff) && eocd >= 20 && u32(eocd - 20) === 0x07064b50) {
    const e64 = Number(dv.getBigUint64(eocd - 12, true));
    if (u32(e64) === 0x06064b50) { n = Number(dv.getBigUint64(e64 + 32, true)); at = Number(dv.getBigUint64(e64 + 48, true)); }
  }
  const out = [], dec = new TextDecoder();
  for (let i = 0; i < n && at + 46 <= u8.length; i++) {
    if (u32(at) !== 0x02014b50) throw zipErr('corrupt', 'The zip’s table of contents is damaged.');
    const flags = u16(at + 8), nl = u16(at + 28), xl = u16(at + 30), cl = u16(at + 32);
    const e = { flags, method: u16(at + 10), time: u16(at + 12), crc: u32(at + 16), csize: u32(at + 20), usize: u32(at + 24), off: u32(at + 42),
      name: dec.decode(u8.subarray(at + 46, at + 46 + nl)), encrypted: !!(flags & 1), aes: null };
    // Extra fields: zip64 sizes, and the WinZip AES record (strength and the real compression method).
    for (let x = at + 46 + nl, end = x + xl; x + 4 <= end;) {
      const id = u16(x), len = u16(x + 2), d = x + 4;
      if (id === 0x0001) { let p = d; if (e.usize === 0xffffffff) { e.usize = Number(dv.getBigUint64(p, true)); p += 8; } if (e.csize === 0xffffffff) { e.csize = Number(dv.getBigUint64(p, true)); p += 8; } if (e.off === 0xffffffff) e.off = Number(dv.getBigUint64(p, true)); }
      if (id === 0x9901 && len >= 7) e.aes = { v: u16(d), strength: u8[d + 4], method: u16(d + 5) };
      x = d + len;
    }
    e.dir = /\/$/.test(e.name);
    out.push(e);
    at += 46 + nl + xl + cl;
  }
  return out;
}
// Where an entry's own bytes are: after its local header, whose name and extra lengths can differ from the table's.
function zipData(u8, e) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(e.off, true) !== 0x04034b50) throw zipErr('corrupt', `“${e.name}” is damaged inside the zip.`);
  const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
  return u8.subarray(start, start + e.csize);
}

// ---------- the traditional PKWARE lock ----------
async function zipCryptoOpen(data, e, pw) {
  let k0 = 0x12345678, k1 = 0x23456789, k2 = 0x34567890;
  const upd = b => { k0 = ZIP_CRC[(k0 ^ b) & 0xff] ^ (k0 >>> 8); k1 = (Math.imul((k1 + (k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0; k2 = ZIP_CRC[(k2 ^ (k1 >>> 24)) & 0xff] ^ (k2 >>> 8); };
  for (const b of pw) upd(b);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const t = (k2 | 2) & 0xffff, c = data[i] ^ ((t * (t ^ 1)) >>> 8) & 0xff;
    out[i] = c; upd(c);
    if (i === 11) {
      // The last byte of the 12-byte header repeats a known byte: the CRC's top byte, or the time's when sizes trail the data.
      const want = e.flags & 8 ? (e.time >>> 8) & 0xff : (e.crc >>> 24) & 0xff;
      if (c !== want) throw zipErr('password', 'Wrong password.');
    }
    if ((i & 0x1fffff) === 0x1fffff) await zipTick();
  }
  return out.subarray(12);
}

// ---------- WinZip AES ----------
// AES itself, encryption only (CTR needs nothing else), with the usual four lookup tables.
const ZIP_AES = (() => {
  const S = new Uint8Array(256), T = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const rotl8 = (x, s) => ((x << s) | (x >>> (8 - s))) & 0xff;
  let p = 1, q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 0xff;
    q = (q ^ (q << 1)) & 0xff; q = (q ^ (q << 2)) & 0xff; q = (q ^ (q << 4)) & 0xff; if (q & 0x80) q ^= 0x09;
    S[p] = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63;
  } while (p !== 1);
  S[0] = 0x63;
  const x2 = v => ((v << 1) ^ (v & 0x80 ? 0x1b : 0)) & 0xff;
  for (let i = 0; i < 256; i++) {
    const s = S[i], w = ((x2(s) << 24) | (s << 16) | (s << 8) | (x2(s) ^ s)) >>> 0;
    T[0][i] = w; T[1][i] = ((w >>> 8) | (w << 24)) >>> 0; T[2][i] = ((w >>> 16) | (w << 16)) >>> 0; T[3][i] = ((w >>> 24) | (w << 8)) >>> 0;
  }
  function expand(key) {
    const nk = key.length / 4, nr = nk + 6, w = new Uint32Array(4 * (nr + 1));
    for (let i = 0; i < nk; i++) w[i] = ((key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3]) >>> 0;
    let rc = 1;
    for (let i = nk; i < w.length; i++) {
      let t = w[i - 1];
      if (i % nk === 0) { t = ((S[(t >>> 16) & 0xff] << 24) | (S[(t >>> 8) & 0xff] << 16) | (S[t & 0xff] << 8) | S[t >>> 24]) ^ (rc << 24); rc = x2(rc); }
      else if (nk > 6 && i % nk === 4) t = (S[t >>> 24] << 24) | (S[(t >>> 16) & 0xff] << 16) | (S[(t >>> 8) & 0xff] << 8) | S[t & 0xff];
      w[i] = (w[i - nk] ^ t) >>> 0;
    }
    return { w, nr };
  }
  // One 16-byte block, in place.
  function block({ w, nr }, b) {
    const [T0, T1, T2, T3] = T;
    let s0 = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) ^ w[0], s1 = ((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) ^ w[1];
    let s2 = ((b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]) ^ w[2], s3 = ((b[12] << 24) | (b[13] << 16) | (b[14] << 8) | b[15]) ^ w[3];
    for (let r = 1; r < nr; r++) {
      const t0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 0xff] ^ T2[(s2 >>> 8) & 0xff] ^ T3[s3 & 0xff] ^ w[4 * r];
      const t1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 0xff] ^ T2[(s3 >>> 8) & 0xff] ^ T3[s0 & 0xff] ^ w[4 * r + 1];
      const t2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 0xff] ^ T2[(s0 >>> 8) & 0xff] ^ T3[s1 & 0xff] ^ w[4 * r + 2];
      const t3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 0xff] ^ T2[(s1 >>> 8) & 0xff] ^ T3[s2 & 0xff] ^ w[4 * r + 3];
      s0 = t0; s1 = t1; s2 = t2; s3 = t3;
    }
    const k = 4 * nr, f = (a, c, d, e2) => ((S[a >>> 24] << 24) | (S[(c >>> 16) & 0xff] << 16) | (S[(d >>> 8) & 0xff] << 8) | S[e2 & 0xff]) >>> 0;
    const o = [f(s0, s1, s2, s3) ^ w[k], f(s1, s2, s3, s0) ^ w[k + 1], f(s2, s3, s0, s1) ^ w[k + 2], f(s3, s0, s1, s2) ^ w[k + 3]];
    for (let i = 0; i < 4; i++) { b[4 * i] = o[i] >>> 24; b[4 * i + 1] = (o[i] >>> 16) & 0xff; b[4 * i + 2] = (o[i] >>> 8) & 0xff; b[4 * i + 3] = o[i] & 0xff; }
    return b;
  }
  return { expand, block };
})();
async function zipAesOpen(data, e, pw) {
  const sub = globalThis.crypto?.subtle;
  if (!sub) throw zipErr('unsupported', 'This browser cannot open AES-locked zips here. Unzip it in the Files app and pick the CSV files.');
  const kl = [0, 16, 24, 32][e.aes.strength], sl = kl / 2;
  if (!kl) throw zipErr('unsupported', 'This zip uses an unknown AES strength.');
  const salt = data.subarray(0, sl), check = data.subarray(sl, sl + 2), body = data.subarray(sl + 2, data.length - 10), mac = data.subarray(data.length - 10);
  // Keys: PBKDF2 with HMAC-SHA1, 1000 rounds, giving the AES key, the HMAC key and a 2-byte password check.
  const base = await sub.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
  const dk = new Uint8Array(await sub.deriveBits({ name: 'PBKDF2', hash: 'SHA-1', salt, iterations: 1000 }, base, (2 * kl + 2) * 8));
  if (dk[2 * kl] !== check[0] || dk[2 * kl + 1] !== check[1]) throw zipErr('password', 'Wrong password.');
  const hk = await sub.importKey('raw', dk.subarray(kl, 2 * kl), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await sub.sign('HMAC', hk, body));
  for (let i = 0; i < 10; i++) if (sig[i] !== mac[i]) throw zipErr('corrupt', `“${e.name}” is damaged inside the zip.`);
  // CTR with a little-endian counter that starts at 1 (WinZip's own convention, not the usual big-endian one).
  const K = ZIP_AES.expand(dk.subarray(0, kl)), ctr = new Uint8Array(16), ks = new Uint8Array(16), out = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i += 16) {
    for (let j = 0; j < 16 && ++ctr[j] === 256; j++) ctr[j] = 0;
    ks.set(ctr); ZIP_AES.block(K, ks);
    const n = Math.min(16, body.length - i);
    for (let j = 0; j < n; j++) out[i + j] = body[i + j] ^ ks[j];
    if ((i & 0x1fffff) === 0) await zipTick();
  }
  return out;
}

// One file from the archive, unlocked and inflated, line by line.
async function zipLines(u8, e, pw, onLine) {
  let data = zipData(u8, e), method = e.method;
  if (e.encrypted) {
    if (!pw) throw zipErr('password', 'This zip needs its password.');
    if (e.method === 99 && e.aes) { data = await zipAesOpen(data, e, pw); method = e.aes.method; }
    else data = await zipCryptoOpen(data, e, pw);
  }
  if (method !== 0 && method !== 8) throw zipErr('unsupported', `“${e.name}” is packed in a way this app cannot open (method ${method}).`);
  let stream = new Blob([data]).stream();
  if (method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
  const rd = stream.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '', first = true;
  try {
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      const parts = (rest + value).split('\n');
      rest = parts.pop();
      for (let l of parts) {
        if (first) { l = l.replace(/^\uFEFF/, ''); first = false; }
        if (l && onLine(l.charCodeAt(l.length - 1) === 13 ? l.slice(0, -1) : l) === false) { rd.cancel().catch(() => {}); return; }
      }
    }
  } catch (err) { throw err.code ? err : zipErr(e.encrypted ? 'password' : 'corrupt', e.encrypted ? 'Wrong password.' : `“${e.name}” is damaged inside the zip.`); }
  if (rest) onLine(rest.charCodeAt(rest.length - 1) === 13 ? rest.slice(0, -1) : rest);
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('zip.js');

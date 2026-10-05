'use strict';
/* ============================================================================
   BITOS OFFICE / ZIP
   Minimal ZIP reader and writer for OOXML packages (.docx/.xlsx/.pptx).
   Writes STORE (uncompressed) entries, which every reader accepts and needs no
   compressor. Reads STORE and DEFLATE entries, inflating with the browser-native
   DecompressionStream('deflate-raw'). No dependencies.
   ========================================================================== */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const utf8 = new TextEncoder();
const u16 = v => { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, v & 0xFFFF, true); return a; };
const u32 = v => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v >>> 0, true); return a; };

function asBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return utf8.encode(String(data == null ? '' : data));
}

function dosDateTime(date) {
  const d = date || new Date();
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const day = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, day };
}

function concat(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/* Write [{ name, data, date? }] into one ZIP. Returns a Uint8Array. */
export async function zipWrite(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = utf8.encode(String(f.name));
    const data = asBytes(f.data);
    const crc = crc32(data);
    const { time, day } = dosDateTime(f.date);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
    ]);
    chunks.push(local, data);
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length + data.length;
  }
  const cd = concat(central);
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(offset), u16(0),
  ]);
  return concat([...chunks, cd, eocd]);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('deflate decompression is not supported here');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* Read a ZIP into a Map<string, Uint8Array>. Accepts Uint8Array/ArrayBuffer. */
export async function zipRead(input) {
  const buf = asBytes(input);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xFFFF; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataOff = localOff + 30 + lNameLen + lExtraLen;
    const rawData = buf.subarray(dataOff, dataOff + compSize);
    if (method === 0) out.set(name, rawData.slice());
    else if (method === 8) out.set(name, await inflateRaw(rawData));
    else throw new Error(`unsupported zip compression method ${method}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

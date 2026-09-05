/**
 * Membuat ikon sumber OpenPacket (512x512 PNG, RGBA) tanpa dependensi:
 * latar gradien gelap, kartu rounded, dan amplop paket (envelope) sebagai
 * metafora PDU yang sama dengan animasi kabel di aplikasi.
 * Pemakaian: node scripts/generate-icon.mjs [output.png]
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 512;
const pixels = Buffer.alloc(SIZE * SIZE * 4);

function put(x, y, r, g, b, a = 255) {
  const i = (y * SIZE + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

// Jarak titik ke segmen garis (untuk flap amplop)
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function roundedRectContains(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + radius, Math.min(x1 - radius, x));
  const cy = Math.max(y0 + radius, Math.min(y1 - radius, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 || (x >= x0 + radius && x <= x1 - radius) || (y >= y0 + radius && y <= y1 - radius);
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // Kartu rounded di atas latar transparan
    if (!roundedRectContains(x, y, 16, 16, SIZE - 17, SIZE - 17, 112)) {
      put(x, y, 0, 0, 0, 0);
      continue;
    }

    // Gradien vertikal navy -> biru
    const t = y / SIZE;
    let r = Math.round(11 + t * (30 - 11));
    let g = Math.round(15 + t * (58 - 15));
    let b = Math.round(25 + t * (138 - 25));

    // Amplop paket: border + interior gelap
    const ex0 = 128, ex1 = SIZE - 128, ey0 = 176, ey1 = 336;
    const inEnvelope = x >= ex0 && x <= ex1 && y >= ey0 && y <= ey1;
    const onBorder =
      inEnvelope &&
      (x < ex0 + 14 || x > ex1 - 14 || y < ey0 + 14 || y > ey1 - 14);
    if (onBorder) {
      r = 249; g = 250; b = 251; // putih
    } else if (inEnvelope) {
      r = 15; g = 23; b = 42; // #0F172A
    }

    // Flap amplop: dua diagonal dari sudut atas ke tengah
    const flap = Math.min(
      distToSegment(x, y, ex0 + 7, ey0 + 7, SIZE / 2, (ey0 + ey1) / 2 + 18),
      distToSegment(x, y, ex1 - 7, ey0 + 7, SIZE / 2, (ey0 + ey1) / 2 + 18)
    );
    if (inEnvelope && flap <= 7) {
      r = 52; g = 211; b = 153; // emerald #34D399
    }

    // Titik "paket" kecil di tengah flap
    const dot = Math.hypot(x - SIZE / 2, y - (ey0 + ey1) / 2 + 18);
    if (inEnvelope && dot <= 22) {
      r = 52; g = 211; b = 153;
    }

    put(x, y, r, g, b);
  }
}

// --- PNG encoder minimal ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = process.argv[2] ?? 'src-tauri/icon-source.png';
writeFileSync(out, png);
console.log(`Ikon sumber ditulis: ${out} (${png.length} bytes)`);

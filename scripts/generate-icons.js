import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Generates a high-resolution, anti-aliased minimalist PNG logo for GIO DA SORTE Pro:
 * - Dark Obsidian background (#070B14 -> #101A33)
 * - Neon Cyan/Blue (#00F2FE / #38BDF8) glowing outer ring
 * - Tilted minimalist perforated lucky raffle ticket with side notches
 * - Glowing neon-blue four-leaf lucky clover + white diamond star core
 * - Subtle gold crown accent
 */
function createLogoPng(width, height, isMaskable = false) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const rawData = Buffer.alloc(height * (1 + width * 4));

  const cx = width / 2;
  const cy = height / 2;
  const scale = isMaskable ? 0.82 : 1.0;

  // Precompute rotation (-14 degrees)
  const angle = (-14 * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  function clamp(v, min = 0, max = 255) {
    return v < min ? min : v > max ? max : v;
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function blend(baseR, baseG, baseB, overR, overG, overB, alpha) {
    const a = Math.max(0, Math.min(1, alpha));
    return [
      baseR * (1 - a) + overR * a,
      baseG * (1 - a) + overG * a,
      baseB * (1 - a) + overB * a,
    ];
  }

  // Signed distance to a rounded box centered at (0,0) with half-extents (hx, hy) and corner radius r
  function sdRoundedBox(px, py, hx, hy, r) {
    const qx = Math.abs(px) - hx + r;
    const qy = Math.abs(py) - hy + r;
    const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    const inDist = Math.min(Math.max(qx, qy), 0);
    return outDist + inDist - r;
  }

  let offset = 0;
  const aa = 1.5 / width;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      // Normalized coordinates in [-1, 1]
      const nx = ((x - cx) / (width / 2)) / scale;
      const ny = ((y - cy) / (height / 2)) / scale;
      const rDist = Math.hypot(nx, ny);

      // 1. Dark Obsidian Radial Background (#050811 -> #101B36)
      const bgGrad = Math.max(0, 1 - Math.hypot(nx, ny + 0.25) * 0.85);
      let r = 6 + bgGrad * 12;
      let g = 9 + bgGrad * 20;
      let b = 18 + bgGrad * 38;
      let a = 255;

      // Rounded squircle mask for non-maskable icon
      if (!isMaskable) {
        const dSquircle = sdRoundedBox(nx * scale, ny * scale, 0.96, 0.96, 0.42);
        if (dSquircle > aa * 2) {
          rawData[offset++] = 0;
          rawData[offset++] = 0;
          rawData[offset++] = 0;
          rawData[offset++] = 0;
          continue;
        }
        if (dSquircle > -aa) {
          a = Math.round(255 * (1 - smoothstep(-aa, aa, dSquircle)));
        }
        // Subtle outer neon border on squircle
        const borderDist = Math.abs(dSquircle + 0.025);
        if (borderDist < 0.015) {
          const borderAlpha = (1 - borderDist / 0.015) * 0.45;
          [r, g, b] = blend(r, g, b, 0, 242, 254, borderAlpha);
        }
      }

      // 2. Ambient Neon Cyan Aura in Center
      const aura = Math.max(0, 1 - rDist * 1.25);
      [r, g, b] = blend(r, g, b, 0, 210, 255, aura * aura * 0.18);

      // 3. Thin Outer Circular Ring
      const ringDist = Math.abs(rDist - 0.78);
      if (ringDist < 0.012) {
        const ringAlpha = (1 - ringDist / 0.012) * 0.35;
        [r, g, b] = blend(r, g, b, 56, 189, 248, ringAlpha);
      }

      // 4. Rotate coordinates for Tilted Minimalist Raffle Ticket
      const ty = ny - 0.03;
      const rx = nx * cosA - ty * sinA;
      const ry = nx * sinA + ty * cosA;

      // Ticket geometry: half-width = 0.62, half-height = 0.34, corner radius = 0.06
      const dBox = sdRoundedBox(rx, ry, 0.62, 0.34, 0.06);
      // Perforation side circular notches at (-0.62, 0) and (+0.62, 0) with radius 0.11
      const dNotchL = Math.hypot(rx + 0.62, ry) - 0.11;
      const dNotchR = Math.hypot(rx - 0.62, ry) - 0.11;
      // CSG subtraction: max(dBox, -min(dNotchL, dNotchR))
      const dTicket = Math.max(dBox, -Math.min(dNotchL, dNotchR));

      // Outer Neon Glow around Ticket
      if (dTicket > 0 && dTicket < 0.12) {
        const glowFactor = Math.pow(1 - dTicket / 0.12, 2.2) * 0.55;
        [r, g, b] = blend(r, g, b, 0, 242, 254, glowFactor);
      }

      // Inside Ticket Surface
      if (dTicket < aa) {
        const insideAlpha = 1 - smoothstep(-aa, aa, dTicket);
        const surfT = (rx + 0.62) / 1.24;
        const tr = 15 + surfT * 10;
        const tg = 26 + surfT * 18;
        const tb = 52 + surfT * 30;
        [r, g, b] = blend(r, g, b, tr, tg, tb, insideAlpha * 0.96);

        // Dashed Vertical Stub Divider Line at rx = 0.24
        const stubDist = Math.abs(rx - 0.24);
        const dashPattern = Math.sin(ry * 42);
        if (stubDist < 0.012 && dashPattern > 0 && Math.abs(ry) < 0.29) {
          const lineAlpha = (1 - stubDist / 0.012) * 0.75;
          [r, g, b] = blend(r, g, b, 56, 189, 248, lineAlpha);
        }

        // Four-Leaf Neon Clover on Left Main Section of Ticket (centered at rx = -0.16, ry = 0)
        const cxClover = rx + 0.16;
        const cyClover = ry;
        const leafOffset = 0.105;
        const leafRadius = 0.082;
        const dLeafTop = Math.hypot(cxClover, cyClover + leafOffset) - leafRadius;
        const dLeafBot = Math.hypot(cxClover, cyClover - leafOffset) - leafRadius;
        const dLeafLeft = Math.hypot(cxClover + leafOffset, cyClover) - leafRadius;
        const dLeafRight = Math.hypot(cxClover - leafOffset, cyClover) - leafRadius;
        const dClover = Math.min(dLeafTop, dLeafBot, dLeafLeft, dLeafRight);

        // Clover neon glow
        if (dClover > 0 && dClover < 0.06) {
          const cGlow = Math.pow(1 - dClover / 0.06, 2) * 0.5;
          [r, g, b] = blend(r, g, b, 0, 242, 254, cGlow);
        }
        if (dClover < aa) {
          const cAlpha = 1 - smoothstep(-aa, aa, dClover);
          // Electric Neon Cyan-Blue gradient on clover
          const cGrad = (cxClover + cyClover + 0.2) / 0.4;
          const cr = clamp(0 + cGrad * 40);
          const cg = clamp(242 - cGrad * 45);
          const cb = 254;
          [r, g, b] = blend(r, g, b, cr, cg, cb, cAlpha);
        }

        // White Diamond Star Core at center of clover
        const dStar = Math.abs(cxClover) + Math.abs(cyClover) - 0.055;
        if (dStar < aa) {
          const sAlpha = 1 - smoothstep(-aa, aa, dStar);
          [r, g, b] = blend(r, g, b, 255, 255, 255, sAlpha);
        }

        // Minimalist Barcode / Lucky Lines on Ticket Stub (rx around 0.41)
        const barX = rx - 0.41;
        if (Math.abs(barX) < 0.09) {
          const bars = [-0.16, -0.08, 0.0, 0.08, 0.16];
          for (let bi = 0; bi < bars.length; bi++) {
            const by = ry - bars[bi];
            const bw = bi % 2 === 0 ? 0.08 : 0.055;
            const dBar = sdRoundedBox(barX, by, bw, 0.015, 0.008);
            if (dBar < aa) {
              const bAlpha = (1 - smoothstep(-aa, aa, dBar)) * 0.85;
              if (bi === 2) {
                // Gold highlight bar in center
                [r, g, b] = blend(r, g, b, 250, 204, 21, bAlpha);
              } else {
                [r, g, b] = blend(r, g, b, 56, 189, 248, bAlpha);
              }
            }
          }
        }
      }

      // Crisp Neon Cyan Border of Ticket
      const ticketBorderDist = Math.abs(dTicket);
      if (ticketBorderDist < 0.022) {
        const bAlpha = 1 - smoothstep(0.008, 0.022, ticketBorderDist);
        const grad = (rx + 0.6) / 1.2;
        const br = clamp(0 + grad * 56);
        const bg = clamp(242 - grad * 50);
        const bb = 254;
        [r, g, b] = blend(r, g, b, br, bg, bb, bAlpha);
      }

      // 5. Minimalist Gold Sparkle Star Above Ticket (at nx = -0.08, ny = -0.54)
      const sx = nx + 0.06;
      const sy = ny + 0.54;
      const dTopStar = Math.pow(Math.abs(sx), 0.65) + Math.pow(Math.abs(sy), 0.65) - 0.14;
      if (dTopStar < aa) {
        const stAlpha = 1 - smoothstep(-aa, aa, dTopStar);
        [r, g, b] = blend(r, g, b, 253, 224, 71, stAlpha);
      } else if (dTopStar < 0.05) {
        const stGlow = (1 - dTopStar / 0.05) * 0.35;
        [r, g, b] = blend(r, g, b, 245, 158, 11, stGlow);
      }

      rawData[offset++] = clamp(Math.round(r));
      rawData[offset++] = clamp(Math.round(g));
      rawData[offset++] = clamp(Math.round(b));
      rawData[offset++] = clamp(Math.round(a));
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const pubDir = path.resolve('public');
if (!fs.existsSync(pubDir)) {
  fs.mkdirSync(pubDir, { recursive: true });
}

const logo512 = createLogoPng(512, 512, false);

// Save as logo.png in both public/logo.png and root logo.png
fs.writeFileSync(path.join(pubDir, 'logo.png'), logo512);
fs.writeFileSync(path.resolve('logo.png'), logo512);

// Update PWA and favicon icons to match the new brand logo
fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), createLogoPng(192, 192, false));
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), logo512);
fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), createLogoPng(512, 512, true));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), createLogoPng(180, 180, false));
fs.writeFileSync(path.join(pubDir, 'favicon.ico'), createLogoPng(64, 64, false));

console.log('Successfully generated logo.png and all brand icons!');

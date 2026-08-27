const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = process.cwd();
const RARE_EARTH_DIR = path.join(ROOT, 'rare-earth');
const THUMB_DIR = path.join(ROOT, 'assets', 'thumb');
const LOGO = path.join(ROOT, 'assets', 'logo', 'asiatopro-white.png');

const W = 1200;
const H = 630;
const FONT = "'Noto Sans CJK JP','Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif";

function extractMeta(content) {
  const m = content.match(/<!--([\s\S]*?)-->/);
  if (!m) return null;
  const block = m[1];
  const get = (key) => {
    const mm = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return mm ? mm[1].trim() : null;
  };
  return { title: get('title'), permalink: get('permalink'), category: get('category') };
}

function esc(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 全角=1.0、半角=0.55 として行幅を計算し、指定幅で折り返す
function wrap(text, maxUnits, maxLines) {
  const width = (ch) => (/[\x20-\x7E]/.test(ch) ? 0.55 : 1);
  const breakable = '、。」）】・—';
  const noHead = '、。」）】ー';
  const lines = [];
  let cur = '';
  let acc = 0;
  for (const ch of text) {
    const w = width(ch);
    if (acc + w > maxUnits && cur.length > 0 && !noHead.includes(ch)) {
      lines.push(cur);
      cur = '';
      acc = 0;
      if (lines.length >= maxLines) break;
    }
    cur += ch;
    acc += w;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const consumed = lines.join('').length;
    if (consumed < text.length) lines[maxLines - 1] = last.slice(0, -1) + '…';
  }
  return lines.filter(Boolean).length ? lines.filter(Boolean) : [text];
}

function svgCard(title, category) {
  let raw = (title || '').replace(/\s*[|｜]\s*Asiatopro.*$/, '').replace(/\n/g, ' ').trim();
  let kicker = '';
  const sep = raw.search(/[|｜]/);
  if (sep > 0 && sep <= 22) {
    kicker = raw.slice(0, sep).trim();
    raw = raw.slice(sep + 1).trim();
  }
  const lines = wrap(raw, 14, 3);
  const units = (t) => [...t].reduce((n, c) => n + (/[\x20-\x7E]/.test(c) ? 0.55 : 1), 0);
  const widest = Math.max(...lines.map(units));
  const AVAIL = 1024;
  const base = lines.length >= 3 ? 68 : lines.length === 2 ? 78 : 86;
  const size = Math.floor(Math.min(base, AVAIL / widest));
  const lh = Math.round(size * 1.4);
  const blockH = lines.length * lh;
  const regionTop = kicker ? 215 : 165;
  const regionBottom = 505;
  let y = regionTop + Math.round((regionBottom - regionTop - blockH) / 2) + size;
  const kickY = 180;
  const tspans = lines
    .map((l) => {
      const t = `<tspan x="88" y="${y}">${esc(l)}</tspan>`;
      y += lh;
      return t;
    })
    .join('');
  const kickSvg = kicker
    ? `<text x="88" y="${kickY}" font-family="${FONT}" font-size="34" font-weight="700" fill="#fbbf24" letter-spacing="1">${esc(kicker)}</text>`
    : '';
  const catW = 18 + [...(category || '')].length * 26;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="1090" cy="120" r="240" fill="#d97706" opacity="0.07"/>
  <circle cx="1160" cy="560" r="150" fill="#d97706" opacity="0.05"/>
  <rect x="0" y="0" width="14" height="${H}" fill="#d97706"/>
  <rect x="88" y="72" width="${catW}" height="46" rx="6" fill="#d97706"/>
  <text x="97" y="103" font-family="${FONT}" font-size="24" font-weight="700" fill="#ffffff" letter-spacing="1">${esc(category || '')}</text>
  ${kickSvg}
  <text font-family="${FONT}" font-size="${size}" font-weight="700" fill="#ffffff" letter-spacing="0.5">${tspans}</text>
  <rect x="88" y="${H - 108}" width="64" height="3" fill="#d97706"/>
  <text x="88" y="${H - 58}" font-family="${FONT}" font-size="26" font-weight="500" fill="#94a3b8" letter-spacing="2">asiatopro.com｜レアアース専門メディア</text>
</svg>`);
}

async function build() {
  if (!fs.existsSync(RARE_EARTH_DIR)) return;
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  const dirs = fs.readdirSync(RARE_EARTH_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  let made = 0;
  let skipped = 0;
  for (const d of dirs) {
    const file = path.join(RARE_EARTH_DIR, d.name, 'index.html');
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('name="robots" content="noindex')) continue;
    const info = extractMeta(content);
    if (!info || !info.permalink) continue;
    const slug = info.permalink.replace(/\/$/, '').split('/').pop();
    const out = path.join(THUMB_DIR, `${slug}.png`);
    if (fs.existsSync(out)) {
      skipped++;
      continue; // 既存ファイルは上書きしない（手作り画像を優先）
    }
    let img = sharp(svgCard(info.title, info.category), { density: 96 });
    if (fs.existsSync(LOGO)) {
      const logo = await sharp(LOGO).resize({ height: 54 }).toBuffer();
      img = sharp(await img.png().toBuffer()).composite([{ input: logo, top: H - 128, left: 1200 - 88 - 200, gravity: 'northwest' }]);
    }
    await img.png({ compressionLevel: 9 }).toFile(out);
    made++;
    console.log(`サムネイル生成: ${slug}.png`);
  }
  console.log(`サムネイル: 新規${made}件 / 既存${skipped}件`);
}

build().catch((e) => {
  console.error('サムネイル生成でエラー:', e.message);
});

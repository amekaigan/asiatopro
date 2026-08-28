/**
 * migrate.js — 一度だけ実行する移行スクリプト
 *
 * 各HTMLの <header>〜</header> と </main>以降〜</footer> を
 * AUTO マーカーに置き換え、共通CSSの補正と og:image の追加を行う。
 *
 * ドライラン（書き換えずに結果だけ表示）:
 *   DRY=1 node .github/scripts/migrate.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SITE_URL = 'https://asiatopro.com';
const DRY = !!process.env.DRY;

function collect(dir, acc) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.') || d.name === 'node_modules' || d.name === 'assets' || d.name === 'lp') continue;
    if (d.isFile() && d.name.startsWith('google')) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) collect(p, acc);
    else if (d.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

function getMeta(content, key) {
  const m = content.match(/<!--([\s\S]*?)-->/);
  if (!m) return null;
  const mm = m[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return mm ? mm[1].trim() : null;
}

const HEADER_MARKERS = '<!-- AUTO:HEADER:START -->\n<!-- AUTO:HEADER:END -->';
const BELOW_MARKERS = '</main>\n\n<!-- AUTO:BELOW:START -->\n<!-- AUTO:BELOW:END -->';

const results = { header: [], below: [], og: [], css: [], skip: [], fail: [] };

for (const file of collect(ROOT, [])) {
  const rel = path.relative(ROOT, file);
  let c = fs.readFileSync(file, 'utf-8');
  const before = c;
  let touched = false;

  // ---- 1. ヘッダー → マーカー ----
  if (c.includes('<!-- AUTO:HEADER:START -->')) {
    results.skip.push(`${rel} (header済)`);
  } else if (/<header[\s\S]*?<\/header>/.test(c)) {
    // ヘッダー本体＋直後のハンバーガー用styleブロックをまとめて置換
    c = c.replace(
      /[ \t]*<header[\s\S]*?<\/header>[ \t]*\n?(\s*<style>(?:(?!<\/style>)[\s\S])*?navToggle[\s\S]*?<\/style>[ \t]*\n?)?/,
      `  ${HEADER_MARKERS}\n`
    );
    results.header.push(rel);
    touched = true;
  } else {
    results.fail.push(`${rel} (headerなし)`);
  }

  // ---- 2. </main>〜</footer> → マーカー ----
  if (c.includes('<!-- AUTO:BELOW:START -->')) {
    results.skip.push(`${rel} (below済)`);
  } else if (/<\/main>[\s\S]*?<\/footer>/.test(c)) {
    c = c.replace(/<\/main>[\s\S]*?<\/footer>/, BELOW_MARKERS);
    results.below.push(rel);
    touched = true;
  } else {
    results.fail.push(`${rel} (</main>〜</footer>なし)`);
  }

  // ---- 3. og:image を追加 ----
  const permalink = getMeta(c, 'permalink');
  if (permalink && permalink !== '/' && !c.includes('property="og:image"')) {
    const slug = permalink.replace(/\/$/, '').split('/').pop();
    const tag = `<meta property="og:image" content="${SITE_URL}/assets/thumb/${slug}.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">`;
    if (/<meta property="og:url"[^>]*>\n?/.test(c)) {
      c = c.replace(/(<meta property="og:url"[^>]*>)\n?/, `$1\n${tag}\n`);
      results.og.push(rel);
      touched = true;
    }
  }

  // ---- 4. 記事CSSの共通補正 ----
  const cssBefore = c;
  // リード文：オレンジの左罫を外し、余白を広げる
  c = c.replace(
    /\.re-article \.re-lead \{[^}]*\}/g,
    '.re-article .re-lead { background: #fffbeb; padding: 1.2em 1.4em; margin: 1.2em 0; border-radius: 6px; }'
  );
  // H2：紺ベタをやめ、ゴールドの下線アクセントに
  c = c.replace(
    /\.re-article h2 \{[^}]*\}/g,
    '.re-article h2 { font-size: 1.28em; color: #0f172a; margin-top: 2.4em; margin-bottom: 0.8em; padding-bottom: 0.35em; border-bottom: 2px solid #e2e8f0; position: relative; }\n.re-article h2::after { content: ""; position: absolute; left: 0; bottom: -2px; width: 56px; height: 2px; background: #d97706; }'
  );
  // ハイライト：左罫を外す（H2との差別化はベタ塗りで担保）
  c = c.replace(
    /(\.re-article \.re-highlight \{[^}]*?)border-left: 4px solid #d97706;\s*/g,
    '$1'
  );
  if (c !== cssBefore) {
    results.css.push(rel);
    touched = true;
  }

  if (touched && c !== before && !DRY) fs.writeFileSync(file, c);
}

const show = (label, arr) => {
  console.log(`\n■ ${label}: ${arr.length}件`);
  arr.forEach((x) => console.log(`   ${x}`));
};
console.log(DRY ? '=== ドライラン（ファイルは変更していません）===' : '=== 実行しました ===');
show('ヘッダーを置換', results.header);
show('記事下〜フッターを置換', results.below);
show('og:imageを追加', results.og);
show('CSSを補正', results.css);
show('スキップ（対応済み）', results.skip);
show('要確認（手動対応が必要かも）', results.fail);

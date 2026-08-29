#!/usr/bin/env node
'use strict';

/**
 * strip-style.js
 *
 * 各記事HTMLに残っている記事本文用の <style> を削除し、
 * 共通CSS（/assets/css/article.css）に寄せるための一度きりの移行スクリプト。
 *
 * 実行方法
 *   node .github/scripts/strip-style.js            … dry-run（何も書き換えない）
 *   node .github/scripts/strip-style.js --apply    … 実際に書き換える
 *   node .github/scripts/strip-style.js --file=company-smm   … 1記事だけ対象にする
 *
 * 処理内容
 *   1. </head> より後ろにある記事用 <style>〜</style> を削除
 *   2. <article class="re-article"> 直後の <h1> を AUTO:ARTICLEHEAD マーカーに置換
 *   3. .re-table-wrap で囲まれていない <table> を囲む
 *   4. /rare-earth/ へのリンク文言と BreadcrumbList の name を「記事一覧」に統一
 *   5. 「2027年1月」の誤記を検出（置換はせず報告のみ）
 *
 * 安全のため、次のものには一切触れない
 *   - AUTO:XXX:START 〜 AUTO:XXX:END の内側（自動生成領域）
 *   - </head> より前の <style>（AUTO:HEAD 領域）
 *   - タグ属性の style="..."
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ARTICLE_DIR = path.join(ROOT, 'rare-earth');

const APPLY = process.argv.includes('--apply');
const ONLY = (() => {
  const a = process.argv.find((x) => x.startsWith('--file='));
  return a ? a.slice('--file='.length) : null;
})();

/* ------------------------------------------------------------------ */
/* ユーティリティ                                                      */
/* ------------------------------------------------------------------ */

// AUTO:XXX:START 〜 AUTO:XXX:END の範囲を列挙する
function getAutoRanges(html) {
  const ranges = [];
  const re = /<!--\s*AUTO:([A-Za-z0-9_]+):START\s*-->/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1];
    const endRe = new RegExp('<!--\\s*AUTO:' + name + ':END\\s*-->', 'i');
    const rest = html.slice(m.index);
    const em = rest.match(endRe);
    if (em) {
      ranges.push({ name, start: m.index, end: m.index + em.index + em[0].length });
    } else {
      // ENDが見つからない場合は、そのファイルの末尾までを保護対象にする
      ranges.push({ name, start: m.index, end: html.length });
    }
  }
  return ranges;
}

function isInsideAuto(ranges, start, end) {
  return ranges.some((r) => start >= r.start && end <= r.end);
}

function headEndIndex(html) {
  const m = html.match(/<\/head\s*>/i);
  return m ? m.index + m[0].length : 0;
}

// 連続しすぎた空行を1つにまとめる
function tidyBlankLines(html) {
  return html.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
}

function oneLine(s, len = 60) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > len ? t.slice(0, len) + '…' : t;
}

/* ------------------------------------------------------------------ */
/* 1. 記事用 <style> の削除                                            */
/* ------------------------------------------------------------------ */

function removeArticleStyles(html, log) {
  const limit = headEndIndex(html);
  const ranges = getAutoRanges(html);
  const re = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;

  const targets = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (start < limit) continue;                 // </head> より前は触らない
    if (isInsideAuto(ranges, start, end)) continue; // AUTOマーカーの内側は触らない
    targets.push({ start, end, text: m[0] });
  }

  if (targets.length === 0) return html;

  // 後ろから消していく（インデックスがずれないように）
  let out = html;
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    const lines = t.text.split('\n').length;
    log.push(`  [style] 削除 ${lines}行 : ${oneLine(t.text.slice(0, 120))}`);
    out = out.slice(0, t.start) + out.slice(t.end);
  }
  return tidyBlankLines(out);
}

/* ------------------------------------------------------------------ */
/* 2. <h1> を AUTO:ARTICLEHEAD マーカーへ                              */
/* ------------------------------------------------------------------ */

const ARTICLEHEAD_BLOCK =
  '  <!-- AUTO:ARTICLEHEAD:START -->\n  <!-- AUTO:ARTICLEHEAD:END -->';

// 開始タグの位置から、入れ子を数えて対応する終了タグの末尾位置を返す
function matchingCloseIndex(html, openStart, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}\\s*>`, 'gi');
  re.lastIndex = openStart;
  let depth = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

function replaceH1(html, log, warn) {
  if (/AUTO:ARTICLEHEAD:START/i.test(html)) {
    log.push('  [h1] 既に AUTO:ARTICLEHEAD あり。スキップ');
    return html;
  }

  // <article class="re-article"> でも <div class="re-article"> でも受け付ける
  const artRe =
    /<(article|div|section)\b[^>]*class=["'][^"']*\bre-article\b[^"']*["'][^>]*>/i;
  const art = html.match(artRe);
  if (!art) {
    warn.push('  [h1] class="re-article" の要素が見つからない。手動で確認してください');
    return html;
  }

  const afterArt = art.index + art[0].length;
  const rest = html.slice(afterArt);

  // 1) <div class="article-header"> があれば、そのブロックごと置き換える
  const hdrRe =
    /<(div|header)\b[^>]*class=["'][^"']*\barticle-header\b[^"']*["'][^>]*>/i;
  const hdr = rest.match(hdrRe);
  if (hdr && hdr.index < 3000) {
    const hdrStart = afterArt + hdr.index;
    const tag = hdr[1].toLowerCase();
    const hdrEnd = matchingCloseIndex(html, hdrStart, tag);
    if (hdrEnd === -1) {
      warn.push('  [h1] article-header の閉じタグが見つからない。手動で確認してください');
      return html;
    }
    const block = html.slice(hdrStart, hdrEnd);
    if (!/<h1\b/i.test(block)) {
      warn.push('  [h1] article-header の中に <h1> がない。手動で確認してください');
      return html;
    }
    const title = oneLine(
      (block.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i) || ['', ''])[1].replace(/<[^>]+>/g, ' '),
      50
    );
    log.push(`  [h1] article-header ごとマーカーに置換 (${block.split('\n').length}行) : ${title}`);
    return tidyBlankLines(
      html.slice(0, hdrStart) + ARTICLEHEAD_BLOCK + html.slice(hdrEnd)
    );
  }

  // 2) 裸の <h1> の場合
  const h1 = rest.match(/<h1\b[^>]*>[\s\S]*?<\/h1\s*>/i);
  if (!h1) {
    warn.push('  [h1] <h1> が見つからない。手動で確認してください');
    return html;
  }

  const gap = rest.slice(0, h1.index);
  const opens = (gap.match(/<(?:div|header|section)\b/gi) || []).length;
  const closes = (gap.match(/<\/(?:div|header|section)\s*>/gi) || []).length;
  if (opens > closes) {
    warn.push(
      '  [h1] <h1> が article-header 以外の要素に包まれている。手動で確認してください'
    );
    return html;
  }

  const absStart = afterArt + h1.index;
  const absEnd = absStart + h1[0].length;
  const title = oneLine(h1[0].replace(/<[^>]+>/g, ''), 50);
  log.push(`  [h1] マーカーに置換 : ${title}`);

  return tidyBlankLines(
    html.slice(0, absStart) + ARTICLEHEAD_BLOCK + html.slice(absEnd)
  );
}

/* ------------------------------------------------------------------ */
/* 3. <table> を .re-table-wrap で囲む                                 */
/* ------------------------------------------------------------------ */

function wrapTables(html, log) {
  const ranges = getAutoRanges(html);
  const re = /<table\b[\s\S]*?<\/table\s*>/gi;

  const targets = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (isInsideAuto(ranges, start, end)) continue;

    // 直前が re-table-wrap の開始タグなら、既に囲まれている
    const before = html.slice(Math.max(0, start - 300), start).replace(/\s+$/, '');
    if (/re-table-wrap[^>]*>$/i.test(before)) continue;

    targets.push({ start, end });
  }

  if (targets.length === 0) return html;

  let out = html;
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    const inner = out.slice(t.start, t.end);
    out =
      out.slice(0, t.start) +
      '<div class="re-table-wrap">\n' + inner + '\n</div>' +
      out.slice(t.end);
  }
  log.push(`  [table] ${targets.length}個を .re-table-wrap で囲んだ`);
  return out;
}

/* ------------------------------------------------------------------ */
/* 4. パンくず文言と BreadcrumbList の name を「記事一覧」に統一        */
/* ------------------------------------------------------------------ */

const CRUMB = '記事一覧';

function unifyBreadcrumb(html, log) {
  const ranges = getAutoRanges(html);
  let count = 0;

  // 4-1. <a href="/rare-earth/">…</a> のリンク文言
  const linkRe =
    /(<a\b[^>]*href=["'](?:https?:\/\/[^"']*?)?\/rare-earth\/["'][^>]*>)([\s\S]*?)(<\/a\s*>)/gi;
  let out = html.replace(linkRe, (whole, open, inner, close, offset) => {
    if (isInsideAuto(ranges, offset, offset + whole.length)) return whole;
    const text = inner.replace(/<[^>]+>/g, '').trim();
    if (text === CRUMB || text === '') return whole;
    count++;
    log.push(`  [パンくず] "${text}" → "${CRUMB}"`);
    return open + CRUMB + close;
  });

  // 4-2. BreadcrumbList 構造化データ側の "name"
  out = out.replace(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script\s*>/gi,
    (block, offset) => {
      if (isInsideAuto(ranges, offset, offset + block.length)) return block;
      if (!/BreadcrumbList/i.test(block)) return block;

      let b = block;
      // "name" が先、"item" が後
      b = b.replace(
        /"name"\s*:\s*"([^"]*)"(\s*,\s*"item"\s*:\s*"[^"]*?\/rare-earth\/")/g,
        (w, name, tail) => {
          if (name === CRUMB) return w;
          count++;
          log.push(`  [JSON-LD] "${name}" → "${CRUMB}"`);
          return '"name": "' + CRUMB + '"' + tail;
        }
      );
      // "item" が先、"name" が後
      b = b.replace(
        /("item"\s*:\s*"[^"]*?\/rare-earth\/"\s*,\s*"name"\s*:\s*)"([^"]*)"/g,
        (w, head, name) => {
          if (name === CRUMB) return w;
          count++;
          log.push(`  [JSON-LD] "${name}" → "${CRUMB}"`);
          return head + '"' + CRUMB + '"';
        }
      );
      return b;
    }
  );

  return out;
}

/* ------------------------------------------------------------------ */
/* 5. 「2027年1月」の検出（報告のみ）                                  */
/* ------------------------------------------------------------------ */

function checkJanuary(html, warn) {
  const re = /2027\s*年\s*1\s*月/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const ctx = html.slice(Math.max(0, m.index - 40), m.index + 40);
    warn.push(`  [要確認] 「2027年1月」を検出 → 正しくは2027年2月か？ : ${oneLine(ctx, 80)}`);
  }
}

/* ------------------------------------------------------------------ */
/* メイン                                                              */
/* ------------------------------------------------------------------ */

function listArticles() {
  if (!fs.existsSync(ARTICLE_DIR)) {
    console.error('rare-earth ディレクトリが見つかりません: ' + ARTICLE_DIR);
    process.exit(1);
  }
  return fs
    .readdirSync(ARTICLE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => (ONLY ? slug === ONLY : true))
    .map((slug) => ({ slug, file: path.join(ARTICLE_DIR, slug, 'index.html') }))
    .filter((a) => fs.existsSync(a.file))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function main() {
  const articles = listArticles();
  console.log('==========================================');
  console.log(APPLY ? '本実行モード（ファイルを書き換えます）' : 'dry-run モード（書き換えません）');
  console.log(`対象記事: ${articles.length}本`);
  console.log('==========================================\n');

  let changed = 0;
  let untouched = 0;
  const allWarn = [];

  for (const a of articles) {
    const before = fs.readFileSync(a.file, 'utf8');
    const log = [];
    const warn = [];

    let html = before;
    html = removeArticleStyles(html, log);
    html = replaceH1(html, log, warn);
    html = wrapTables(html, log);
    html = unifyBreadcrumb(html, log);
    checkJanuary(html, warn);

    const dirty = html !== before;

    if (dirty || warn.length) {
      console.log(`● ${a.slug}`);
      log.forEach((l) => console.log(l));
      warn.forEach((w) => console.log(w));
      console.log('');
    }

    if (dirty) {
      changed++;
      if (APPLY) fs.writeFileSync(a.file, html, 'utf8');
    } else {
      untouched++;
    }

    warn.forEach((w) => allWarn.push(`${a.slug}${w}`));
  }

  console.log('==========================================');
  console.log(`変更あり : ${changed}本`);
  console.log(`変更なし : ${untouched}本`);
  console.log(`要確認   : ${allWarn.length}件`);
  console.log('==========================================');

  if (allWarn.length) {
    console.log('\n--- 手動確認が必要な項目 ---');
    allWarn.forEach((w) => console.log(w));
  }

  if (!APPLY) {
    console.log('\n※ dry-run のため、ファイルは書き換えていません。');
    console.log('※ 内容に問題がなければ apply を true にして再実行してください。');
  }
}

main();

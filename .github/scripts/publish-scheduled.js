// 予約公開スクリプト
// _drafts/ 配下の記事のうち、メタ情報の publish_at を過ぎたものを
// 本来のパスへ移動する。移動した記事があれば終了コード0で
// ワークフローに moved=true を伝える。

const fs = require('fs');
const path = require('path');

const DRAFT_DIR = '_drafts';

// メタ情報コメント（ファイル最上部の最初のコメントブロック）から値を取り出す
function extractMeta(html, key) {
  const m = html.match(/<!--([\s\S]*?)-->/);
  if (!m) return null;
  const line = m[1].split('\n').find(l => l.trim().toLowerCase().startsWith(key + ':'));
  if (!line) return null;
  return line.slice(line.indexOf(':') + 1).trim();
}

// "2026-08-30 20:00" を日本時間として解釈し、UTCのDateにする
function parseJst(str) {
  const m = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h - 9, +mi));
}

// _drafts 配下の index.html を再帰的に集める
function findDrafts(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      findDrafts(full, acc);
    } else if (name === 'index.html') {
      acc.push(full);
    }
  }
  return acc;
}

const now = new Date();
const drafts = findDrafts(DRAFT_DIR);
let moved = 0;

console.log(`現在時刻（UTC）: ${now.toISOString()}`);
console.log(`下書き件数: ${drafts.length}`);

for (const file of drafts) {
  const html = fs.readFileSync(file, 'utf8');
  const raw = extractMeta(html, 'publish_at');

  if (!raw) {
    console.log(`  [スキップ] ${file} … publish_at がありません`);
    continue;
  }

  const at = parseJst(raw);
  if (!at) {
    console.log(`  [スキップ] ${file} … publish_at の書式が不正です（${raw}）`);
    continue;
  }

  if (at > now) {
    console.log(`  [待機] ${file} … 公開予定 ${raw}（日本時間）`);
    continue;
  }

  // _drafts/ を取り除いたパスが公開先
  const dest = path.relative(DRAFT_DIR, file);
  const destDir = path.dirname(dest);

  if (fs.existsSync(dest)) {
    console.log(`  [中止] ${file} … 公開先 ${dest} がすでに存在します`);
    continue;
  }

  fs.mkdirSync(destDir, { recursive: true });

  // publish_at 行は公開時に取り除く
  const cleaned = html.replace(/^[ \t]*publish_at:.*\r?\n/m, '');
  fs.writeFileSync(dest, cleaned, 'utf8');
  fs.unlinkSync(file);

  // 空になったフォルダを片付ける
  let dir = path.dirname(file);
  while (dir.startsWith(DRAFT_DIR) && dir !== DRAFT_DIR) {
    if (fs.readdirSync(dir).length > 0) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }

  console.log(`  [公開] ${file} → ${dest}（予定 ${raw}）`);
  moved++;
}

console.log(`公開した記事: ${moved}件`);

// ワークフローへ結果を渡す
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `moved=${moved > 0 ? 'true' : 'false'}\n`);
}
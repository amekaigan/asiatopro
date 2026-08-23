const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RARE_EARTH_DIR = path.join(ROOT, 'rare-earth');
const RARE_EARTH_INDEX = path.join(RARE_EARTH_DIR, 'index.html');
const TOP_INDEX = path.join(ROOT, 'index.html');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const SITE_URL = 'https://asiatopro.com';
const VISIBLE_COUNT = 5;

const CATEGORY_TO_ID = {
  '基礎・技術解説': 'basics',
  '最新動向・時事': 'news',
  '産業構造・技術動向': 'industry',
  '市場・投資': 'market',
  '企業分析': 'company',
};
const CATEGORY_ORDER = ['basics', 'news', 'industry', 'market', 'company'];

function extractMeta(content) {
  const m = content.match(/<!--([\s\S]*?)-->/);
  if (!m) return null;
  const block = m[1];
  const get = (key) => {
    const mm = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return mm ? mm[1].trim() : null;
  };
  return {
    title: get('title'),
    meta: get('meta'),
    permalink: get('permalink'),
    published: get('published'),
    updated: get('updated'),
    category: get('category'),
  };
}

function loadArticles() {
  const dirs = fs.readdirSync(RARE_EARTH_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const articles = [];
  for (const d of dirs) {
    const filePath = path.join(RARE_EARTH_DIR, d.name, 'index.html');
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('name="robots" content="noindex')) continue; // 統合案内ページ等は除外
    const info = extractMeta(content);
    if (!info || !info.permalink || !info.category) continue;
    articles.push(info);
  }
  articles.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  return articles;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cardHtml(article) {
  return `<div style="border:1px solid #e2e8f0; border-radius:8px; padding:20px; margin:20px 0;">
  <p style="font-size:0.8em; color:#d97706; font-weight:bold; margin:0 0 6px;">${escapeHtml(article.category)}</p>
  <h3 style="margin:0 0 8px; font-size:1.1em;"><a href="${article.permalink}" style="color:#0f172a; text-decoration:none;">${escapeHtml(article.title)}</a></h3>
  <p style="color:#64748b; margin:0;">${escapeHtml(article.meta)}</p>
</div>`;
}

function categoryBlockHtml(catArticles) {
  const visible = catArticles.slice(0, VISIBLE_COUNT);
  const rest = catArticles.slice(VISIBLE_COUNT);
  let html = visible.map(cardHtml).join('\n\n');
  if (rest.length > 0) {
    const restHtml = rest.map(cardHtml).join('\n\n');
    html += `\n\n<details style="margin-top:8px;">
  <summary style="cursor:pointer; color:#d97706; font-weight:bold; padding:10px 0; font-size:0.95em;">もっと見る（残り${rest.length}件）</summary>
  <div style="margin-top:8px;">
${restHtml}
  </div>
</details>`;
  }
  return html;
}

function replaceBetweenMarkers(content, markerName, innerHtml) {
  const startMarker = `<!-- AUTO:${markerName}:START -->`;
  const endMarker = `<!-- AUTO:${markerName}:END -->`;
  const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  if (!regex.test(content)) {
    console.warn(`マーカーが見つかりません: ${markerName}`);
    return content;
  }
  return content.replace(regex, `${startMarker}\n\n${innerHtml}\n\n${endMarker}`);
}

function updateRareEarthIndex(articles) {
  let content = fs.readFileSync(RARE_EARTH_INDEX, 'utf-8');
  for (const catId of CATEGORY_ORDER) {
    const catArticles = articles.filter((a) => CATEGORY_TO_ID[a.category] === catId);
    content = replaceBetweenMarkers(content, catId, categoryBlockHtml(catArticles));

    const countRegex = new RegExp(`(<span id="count-${catId}">)[^<]*(</span>)`);
    content = content.replace(countRegex, `$1${catArticles.length}$2`);
  }
  fs.writeFileSync(RARE_EARTH_INDEX, content);
}

function updateTopPage(articles) {
  let content = fs.readFileSync(TOP_INDEX, 'utf-8');
  const latest = articles.slice(0, 5);
  const cardsHtml = latest.map(cardHtml).join('\n\n');
  content = replaceBetweenMarkers(content, 'latest', cardsHtml);
  fs.writeFileSync(TOP_INDEX, content);
}

function updateSitemap(articles) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];
  urls.push({ loc: `${SITE_URL}/`, lastmod: today });
  urls.push({ loc: `${SITE_URL}/about/`, lastmod: '2026-08-18' });
  urls.push({ loc: `${SITE_URL}/rare-earth/`, lastmod: today });
  for (const a of articles) {
    urls.push({ loc: `${SITE_URL}${a.permalink}`, lastmod: a.updated || a.published || today });
  }
  const body = urls
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(SITEMAP, xml);
}

function main() {
  const articles = loadArticles();
  updateRareEarthIndex(articles);
  updateTopPage(articles);
  updateSitemap(articles);
  console.log(`サイト生成完了:記事${articles.length}件を反映しました`);
}

main();

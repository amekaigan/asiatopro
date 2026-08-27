const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RARE_EARTH_DIR = path.join(ROOT, 'rare-earth');
const RARE_EARTH_INDEX = path.join(RARE_EARTH_DIR, 'index.html');
const TOP_INDEX = path.join(ROOT, 'index.html');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const SEARCH_INDEX = path.join(ROOT, 'search-index.json');
const THUMB_DIR = path.join(ROOT, 'assets', 'thumb');
const SITE_URL = 'https://asiatopro.com';
const VISIBLE_COUNT = 5;

/* =========================================================
   ▼▼▼ ここだけ書き換えれば全ページに反映されます ▼▼▼
   ========================================================= */

// お知らせバー：text を空文字 '' にするとバー自体が非表示になります
const ANNOUNCE = {
  text: '',
  url: '',
};

// トップページのスライダーに出す「おすすめ記事」の slug（表示順）
const FEATURED_SLUGS = [
  'minamitorishima-mud',
  'supply-chain-map',
  'china-dependency',
  'investment-stocks',
  'neodymium-sagawa-magnet',
];

// 記事下の大きめCTA
const CTA = {
  heading: 'レアアース関連銘柄ハンドブック（無料）',
  body: '主要16銘柄を一次情報ベースで整理したPDFを無料で配布しています。煽らず、事実だけを積み上げた資料です。',
  button: '無料で受け取る →',
  url: '/lp/handbook/',
};

// 本文中の広告枠（AUTO:AD マーカーがある記事だけに挿入されます）
// 未提携のうちはハンドブックCTAを表示します。提携後は html を差し替えてください。
const AD_SLOT = {
  label: 'PR',
  html: `<p style="margin:0 0 10px; font-weight:bold; color:#0f172a;">レアアース関連銘柄ハンドブック、無料配布中</p>
<a href="/lp/handbook/" style="display:inline-block; background:#d97706; color:#1a1206; text-decoration:none; font-weight:bold; padding:9px 20px; border-radius:6px; font-size:0.9em;">無料で受け取る →</a>`,
};

/* =========================================================
   ▲▲▲ 書き換えるのはここまで ▲▲▲
   ========================================================= */

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
    thumb: get('thumb'),
  };
}

function slugOf(permalink) {
  return (permalink || '').replace(/\/$/, '').split('/').pop();
}

function thumbOf(article) {
  if (article.thumb) return article.thumb;
  const slug = slugOf(article.permalink);
  const p = path.join(THUMB_DIR, `${slug}.png`);
  return fs.existsSync(p) ? `/assets/thumb/${slug}.png` : null;
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
    info.file = filePath;
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

function replaceBetweenMarkers(content, markerName, innerHtml, quiet) {
  const startMarker = `<!-- AUTO:${markerName}:START -->`;
  const endMarker = `<!-- AUTO:${markerName}:END -->`;
  const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  if (!regex.test(content)) {
    if (!quiet) console.warn(`マーカーが見つかりません: ${markerName}`);
    return content;
  }
  return content.replace(regex, `${startMarker}\n${innerHtml}\n${endMarker}`);
}

function hasMarker(content, markerName) {
  return content.includes(`<!-- AUTO:${markerName}:START -->`);
}

/* ---------------- 共通パーツ ---------------- */

function headerHtml() {
  return `<header style="background:#0f172a; padding:14px 20px; position:sticky; top:0; z-index:100; box-shadow:0 2px 16px rgba(0,0,0,.3);">
  <div style="max-width:1100px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap;">
    <a href="/" style="text-decoration:none; display:flex; align-items:center; gap:10px;"><img src="/assets/logo/asiatopro-white.png" alt="Asiatopro" style="height:34px; width:auto; display:block;"><span style="font-size:0.65em; color:#94a3b8; font-weight:normal;">レアアース専門メディア</span></a>
    <input type="checkbox" id="navToggle" style="display:none;">
    <label for="navToggle" style="display:none; cursor:pointer; padding:6px;">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </label>
    <nav id="siteNav" style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
      <a href="/" style="color:#e2e8f0; text-decoration:none; margin-left:16px; font-size:0.9em;">ホーム</a>
      <a href="/rare-earth/" style="color:#e2e8f0; text-decoration:none; margin-left:16px; font-size:0.9em;">記事一覧</a>
      <a href="/rare-earth/#company" style="color:#e2e8f0; text-decoration:none; margin-left:16px; font-size:0.9em;">企業分析</a>
      <a href="/about/" style="color:#e2e8f0; text-decoration:none; margin-left:16px; font-size:0.9em;">asiatoproとは</a>
      <div id="searchWrap" style="position:relative; margin-left:16px;">
        <input id="siteSearch" type="search" placeholder="記事を検索" autocomplete="off" style="background:#1e293b; border:1px solid #334155; color:#e2e8f0; border-radius:999px; padding:6px 14px; font-size:0.85em; width:150px; outline:none;">
        <div id="searchResults" style="display:none; position:absolute; top:38px; right:0; width:290px; max-height:320px; overflow-y:auto; background:#fff; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.18); z-index:200; text-align:left;"></div>
      </div>
      <a href="/lp/handbook/" style="color:#1a1206; background:#d97706; text-decoration:none; margin-left:16px; font-size:0.85em; font-weight:bold; padding:6px 14px; border-radius:999px;">無料ハンドブック</a>
    </nav>
  </div>
</header>
<style>
  @media (max-width: 680px) {
    label[for="navToggle"] { display:block !important; }
    #siteNav { display:none !important; width:100%; flex-direction:column; align-items:flex-start; gap:10px; margin-top:14px; }
    #navToggle:checked ~ #siteNav { display:flex !important; }
    #searchWrap { width:100%; margin-left:16px; }
    #siteSearch { width:calc(100% - 32px); }
    #searchResults { width:100%; right:auto; left:0; }
  }
  .re-article h2, .re-article h3 { scroll-margin-top: 84px; }
</style>
<script>
(function(){
  var input=document.getElementById('siteSearch');
  var box=document.getElementById('searchResults');
  if(!input||!box)return;
  var data=null,loading=false;
  function load(){
    if(data||loading)return;loading=true;
    fetch('/search-index.json').then(function(r){return r.json();}).then(function(j){data=j;loading=false;render();}).catch(function(){loading=false;});
  }
  function render(){
    var q=input.value.trim().toLowerCase();
    if(!q||!data){box.style.display='none';box.innerHTML='';return;}
    var hits=data.filter(function(a){
      return (a.t+' '+a.m+' '+a.c).toLowerCase().indexOf(q)>-1;
    }).slice(0,8);
    if(hits.length===0){
      box.innerHTML='<p style="margin:0; padding:14px; color:#64748b; font-size:0.85em;">該当する記事がありません</p>';
    }else{
      box.innerHTML=hits.map(function(a){
        return '<a href="'+a.u+'" style="display:block; padding:11px 14px; border-bottom:1px solid #f1f5f9; text-decoration:none;">'+
        '<span style="display:block; font-size:0.72em; color:#d97706; font-weight:bold;">'+a.c+'</span>'+
        '<span style="display:block; font-size:0.86em; color:#0f172a; line-height:1.45;">'+a.t+'</span></a>';
      }).join('');
    }
    box.style.display='block';
  }
  input.addEventListener('focus',load);
  input.addEventListener('input',function(){load();render();});
  document.addEventListener('click',function(e){
    if(!document.getElementById('searchWrap').contains(e.target)){box.style.display='none';}
  });
})();
</script>`;
}

function announceHtml() {
  if (!ANNOUNCE.text) return '';
  return `<div style="background:#fef3c7; border-bottom:1px solid #fde68a;">
  <div style="max-width:1100px; margin:0 auto; padding:9px 20px; font-size:0.86em; line-height:1.5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
    <span style="background:#d97706; color:#fff; font-weight:bold; font-size:0.85em; padding:2px 8px; border-radius:4px; margin-right:8px;">お知らせ</span><a href="${ANNOUNCE.url}" style="color:#0f172a; text-decoration:underline;">${escapeHtml(ANNOUNCE.text)} →</a>
  </div>
</div>`;
}

function articleSchemaHtml(article) {
  if (!article) return '';
  const img = thumbOf(article);
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta,
    datePublished: article.published,
    dateModified: article.updated || article.published,
    mainEntityOfPage: { '@type': 'WebPage', '@id': SITE_URL + article.permalink },
    author: { '@type': 'Organization', name: 'Asiatopro' },
    publisher: {
      '@type': 'Organization',
      name: 'Asiatopro',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/logo/asiatopro-white.png` },
    },
  };
  if (img) obj.image = SITE_URL + img;
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

/* ---------------- 記事下のブロック ---------------- */

function thumbBoxHtml(article) {
  const img = thumbOf(article);
  if (img) {
    return `<div style="aspect-ratio:1200/630; background:#0f172a url('${img}') center/cover no-repeat; border-radius:6px;"></div>`;
  }
  return `<div style="aspect-ratio:1200/630; background:linear-gradient(135deg,#0f172a,#1e293b); border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-bottom:3px solid #d97706;"><span style="color:#d97706; font-size:0.72em; font-weight:bold; letter-spacing:.1em;">${escapeHtml(article.category)}</span><span style="color:#475569; font-size:0.62em; letter-spacing:.14em;">ASIATOPRO</span></div>`;
}

function thumbCardHtml(article) {
  return `<a href="${article.permalink}" style="display:block; text-decoration:none; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
  ${thumbBoxHtml(article)}
  <div style="padding:12px 14px;">
    <span style="display:block; font-size:0.74em; color:#d97706; font-weight:bold; margin-bottom:5px;">${escapeHtml(article.category)}</span>
    <span style="display:block; font-size:0.92em; color:#0f172a; font-weight:bold; line-height:1.5;">${escapeHtml(article.title)}</span>
  </div>
</a>`;
}

function gridHtml(list) {
  return `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:12px;">
${list.map(thumbCardHtml).join('\n')}
</div>`;
}

function sectionTitle(text) {
  return `<h2 style="font-size:1.15em; color:#0f172a; border-left:4px solid #d97706; padding-left:12px; margin:0 0 18px;">${text}</h2>`;
}

function ctaHtml() {
  return `<div style="background:#0f172a; border-radius:10px; padding:28px 24px; margin:0 0 40px; text-align:center;">
  <p style="margin:0 0 8px; color:#fff; font-weight:bold; font-size:1.15em;">${escapeHtml(CTA.heading)}</p>
  <p style="margin:0 0 18px; color:#94a3b8; font-size:0.92em; line-height:1.7;">${escapeHtml(CTA.body)}</p>
  <a href="${CTA.url}" style="display:inline-block; background:#d97706; color:#1a1206; text-decoration:none; font-weight:bold; padding:13px 34px; border-radius:6px; font-size:1em;">${escapeHtml(CTA.button)}</a>
</div>`;
}

function relatedHtml(articles, current) {
  if (!current) return '';
  let list = articles.filter((a) => a.permalink !== current.permalink && a.category === current.category).slice(0, 4);
  if (list.length < 4) {
    const extra = articles.filter(
      (a) => a.permalink !== current.permalink && !list.some((x) => x.permalink === a.permalink)
    );
    list = list.concat(extra.slice(0, 4 - list.length));
  }
  if (list.length === 0) return '';
  return `<section style="margin:0 0 40px;">
${sectionTitle('関連記事')}
${gridHtml(list)}
</section>`;
}

function tagsHtml(articles) {
  const items = CATEGORY_ORDER.map((id) => {
    const name = Object.keys(CATEGORY_TO_ID).find((k) => CATEGORY_TO_ID[k] === id);
    const count = articles.filter((a) => a.category === name).length;
    return `<a href="/rare-earth/#${id}" style="display:inline-block; background:#f1f5f9; color:#0f172a; text-decoration:none; font-size:0.85em; padding:7px 15px; border-radius:999px; margin:0 8px 8px 0;">${escapeHtml(name)} <span style="color:#64748b;">${count}</span></a>`;
  }).join('\n');
  return `<section style="margin:0 0 40px;">
${sectionTitle('カテゴリから探す')}
<div>
${items}
</div>
</section>`;
}

function latestHtml(articles, current) {
  const list = articles.filter((a) => !current || a.permalink !== current.permalink).slice(0, 4);
  return `<section style="margin:0 0 40px;">
${sectionTitle('最新記事')}
${gridHtml(list)}
<p style="margin:18px 0 0;"><a href="/rare-earth/" style="color:#d97706; font-weight:bold; text-decoration:none; font-size:0.92em;">記事一覧をすべて見る →</a></p>
</section>`;
}

function footerHtml() {
  return `<footer style="background:#0f172a; color:#94a3b8; padding:34px 20px; font-size:0.86em; line-height:1.8;">
  <div style="max-width:760px; margin:0 auto;">
    <div style="background:#1e293b; border-radius:8px; padding:20px; margin:0 0 20px;">
      <p style="margin:0 0 4px; color:#fff; font-weight:bold; font-size:1.05em;">レアアース関連銘柄ハンドブック、無料配布中</p>
      <p style="margin:0 0 14px; color:#94a3b8; font-size:0.92em;">主要16銘柄を一次情報ベースで整理した無料PDFです。</p>
      <a href="/lp/handbook/" style="display:inline-block; background:#d97706; color:#1a1206; text-decoration:none; font-weight:bold; padding:10px 22px; border-radius:6px; font-size:0.9em;">無料で受け取る →</a>
    </div>
    <p style="margin:0 0 16px;">
      <a href="/" style="color:#94a3b8; text-decoration:none; margin-right:14px;">ホーム</a>
      <a href="/rare-earth/" style="color:#94a3b8; text-decoration:none; margin-right:14px;">記事一覧</a>
      <a href="/about/" style="color:#94a3b8; text-decoration:none;">asiatoproとは</a>
    </p>
    <p style="margin:0 0 16px;">
      <a href="https://x.com/Asiatopro" style="color:#94a3b8; text-decoration:none; margin-right:16px;">X</a>
      <a href="https://bsky.app/profile/asiatopro.bsky.social" style="color:#94a3b8; text-decoration:none; margin-right:16px;">Bluesky</a>
      <a href="https://www.threads.net/@asiatopro" style="color:#94a3b8; text-decoration:none;">Threads</a>
    </p>
    <div style="border-top:1px solid #334155; padding-top:16px;">
      <p style="margin:0 0 8px; color:#64748b;">本サイトの記事は情報提供を目的としたものであり、特定銘柄の売買を推奨・勧誘するものではありません。投資判断はご自身の責任で行ってください。</p>
      <p style="margin:0; color:#64748b;">&copy; 2026 Asiatopro.com</p>
    </div>
  </div>
</footer>`;
}

function belowHtml(articles, current) {
  return `<div style="max-width:760px; margin:0 auto; padding:0 16px 20px;">
${ctaHtml()}
${relatedHtml(articles, current)}
${tagsHtml(articles)}
${latestHtml(articles, current)}
</div>
${footerHtml()}`;
}

function adHtml() {
  return `<div style="border:1px solid #e2e8f0; border-radius:8px; padding:18px; margin:28px 0; background:#f8fafc;">
  <span style="display:inline-block; font-size:0.7em; color:#64748b; border:1px solid #cbd5e1; border-radius:3px; padding:1px 6px; margin-bottom:10px;">${AD_SLOT.label}</span>
  ${AD_SLOT.html}
</div>`;
}

/* ---------------- スライダー（トップページ） ---------------- */

function sliderHtml(articles) {
  const picked = FEATURED_SLUGS.map((s) => articles.find((a) => slugOf(a.permalink) === s)).filter(Boolean);
  const list = picked.length > 0 ? picked : articles.slice(0, 5);
  const slides = list
    .map(
      (a) => `<div style="flex:0 0 260px; scroll-snap-align:start;">
${thumbCardHtml(a)}
</div>`
    )
    .join('\n');
  return `<div style="display:flex; gap:16px; overflow-x:auto; scroll-snap-type:x mandatory; padding:4px 0 16px; -webkit-overflow-scrolling:touch;">
${slides}
</div>
<p style="margin:0; color:#94a3b8; font-size:0.8em;">← 横にスクロールできます</p>`;
}

/* ---------------- 共通ブロックの一括反映 ---------------- */

function collectHtmlFiles(dir, acc) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.') || d.name === 'node_modules' || d.name === 'assets') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) collectHtmlFiles(p, acc);
    else if (d.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

function applyCommonBlocks(articles) {
  const files = collectHtmlFiles(ROOT, []);
  let count = 0;
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    if (!hasMarker(content, 'HEADER') && !hasMarker(content, 'BELOW') && !hasMarker(content, 'AD')) continue;

    const info = extractMeta(content);
    const current = info && info.permalink ? articles.find((a) => a.permalink === info.permalink) : null;

    if (hasMarker(content, 'HEADER')) {
      const inner = [headerHtml(), announceHtml(), articleSchemaHtml(current)].filter(Boolean).join('\n');
      content = replaceBetweenMarkers(content, 'HEADER', inner, true);
    }
    if (hasMarker(content, 'BELOW')) {
      content = replaceBetweenMarkers(content, 'BELOW', belowHtml(articles, current), true);
    }
    if (hasMarker(content, 'AD')) {
      content = replaceBetweenMarkers(content, 'AD', adHtml(), true);
    }
    fs.writeFileSync(file, content);
    count++;
  }
  console.log(`共通ブロック反映: ${count}ファイル`);
}

/* ---------------- 既存の処理 ---------------- */

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
  content = replaceBetweenMarkers(content, 'latest', latest.map(cardHtml).join('\n\n'));
  if (hasMarker(content, 'SLIDER')) {
    content = replaceBetweenMarkers(content, 'SLIDER', sliderHtml(articles), true);
  }
  fs.writeFileSync(TOP_INDEX, content);
}

function updateSearchIndex(articles) {
  const data = articles.map((a) => ({
    t: a.title,
    m: a.meta,
    c: a.category,
    u: a.permalink,
  }));
  fs.writeFileSync(SEARCH_INDEX, JSON.stringify(data));
  console.log(`検索インデックス生成: ${data.length}件`);
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
  updateSearchIndex(articles);
  applyCommonBlocks(articles);
  updateSitemap(articles);
  console.log(`サイト生成完了:記事${articles.length}件を反映しました`);
}

main();

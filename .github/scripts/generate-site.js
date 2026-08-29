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
  heading: 'レアアース関連銘柄ハンドブック（全14ページ・無料）',
  body: '南鳥島レアアース泥プロジェクトを軸に、採掘・精製・磁石加工・リサイクル・調達まで、日本の主要16銘柄を一冊で俯瞰できるPDFです。',
  publisher:
    'レアアース専門メディア「Asiatopro」が、各社の決算短信・IR資料・官公庁の公表資料のみをもとに、煽らず事実だけを積み上げて作成しました。',
  button: '無料で受け取る →',
  url: '/lp/handbook/',
  // 中身のプレビュー画像。空配列 [] にすると非表示になります
  previews: [
    { src: '/assets/handbook/preview-cover.png', label: '表紙' },
    { src: '/assets/handbook/preview-map.png', label: 'サプライチェーン全体マップ' },
    { src: '/assets/handbook/preview-profile.png', label: '企業プロファイル集' },
  ],
};

// Google Analytics 4 の測定ID（G-XXXXXXXXXX の形式）
// 空文字 '' のあいだは何も挿入されません。GA4登録後にIDを入れてください。
const GA4_ID = 'G-FTEMCMXTFV';

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
  return `<header style="background:#0f172a; border-bottom:2px solid #d97706; position:sticky; top:0; z-index:100; box-shadow:0 2px 16px rgba(15,23,42,.25);">
  <div style="max-width:860px; margin:0 auto; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
    <a href="/" style="text-decoration:none; display:flex; align-items:center; gap:10px; min-width:0;"><img src="/assets/logo/asiatopro-white.png" alt="Asiatopro" style="height:32px; width:auto; display:block;"><span style="font-size:0.62em; color:#94a3b8; white-space:nowrap;">レアアース専門メディア</span></a>
    <input type="checkbox" id="navToggle">
    <label for="navToggle" id="navBtn" aria-label="メニュー">
      <svg class="ic-open" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      <svg class="ic-close" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
    </label>
    <nav id="siteNav">
      <div id="searchWrap">
        <input id="siteSearch" type="search" placeholder="記事を検索" autocomplete="off">
        <button id="searchClear" type="button" aria-label="検索をやめる">✕</button>
        <div id="searchResults"></div>
      </div>
      <a href="/">ホーム</a>
      <a href="/rare-earth/">記事一覧</a>
      <a href="/rare-earth/#company">企業分析</a>
      <a href="/about/">asiatoproとは</a>
      <a href="/lp/handbook/" class="nav-cta">無料ハンドブック</a>
      <label for="navToggle" class="nav-close">✕ 閉じる</label>
    </nav>
  </div>
</header>
<style>
  body { margin:0; }
  #navToggle { display:none; }
  #siteNav, #siteNav *, #searchWrap, #searchWrap * { box-sizing:border-box; }
  #searchClear { display:none; position:absolute; top:50%; transform:translateY(-50%); right:10px; background:none; border:0; color:#64748b; font-size:0.9em; cursor:pointer; padding:4px 6px; line-height:1; }
  #searchClear:hover { color:#e2e8f0; }
  #navBtn .ic-close { display:none; }
  #navToggle:checked ~ #navBtn .ic-open { display:none; }
  #navToggle:checked ~ #navBtn .ic-close { display:block; }
  .nav-close { display:none; }
  #siteNav a { color:#e2e8f0; text-decoration:none; font-size:0.9em; }
  #siteNav a.nav-cta { color:#1a1206; background:#d97706; font-weight:bold; padding:7px 16px; border-radius:999px; font-size:0.85em; }
  #searchWrap { position:relative; }
  #siteSearch { box-sizing:border-box; max-width:100%; background:#1e293b; border:1px solid #334155; color:#e2e8f0; border-radius:999px; padding:7px 30px 7px 34px; font-size:0.85em; width:140px; outline:none; background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2364748b' stroke-width='2'><circle cx='7' cy='7' r='5'/><line x1='11' y1='11' x2='15' y2='15' stroke-linecap='round'/></svg>"); background-repeat:no-repeat; background-position:11px center; }
  #siteSearch::placeholder { color:#64748b; }
  #siteSearch:focus { border-color:#d97706; }
  #searchResults { display:none; position:absolute; top:42px; right:0; width:300px; max-height:320px; overflow-y:auto; background:#fff; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.25); z-index:200; text-align:left; }
  @media (min-width: 681px) {
    label[for="navToggle"] { display:none; }
    #siteNav { display:flex; align-items:center; gap:22px; }
    #siteSearch { width:210px; }
    .nav-close { display:none !important; }
    #siteNav a { position:relative; padding:6px 0; transition:color .15s; }
    #siteNav a:not(.nav-cta):hover { color:#fbbf24; }
    #siteNav a:not(.nav-cta)::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:#d97706; transform:scaleX(0); transition:transform .15s; }
    #siteNav a:not(.nav-cta):hover::after { transform:scaleX(1); }
    #siteNav a.nav-cta:hover { background:#b45309; }
  }
  @media (max-width: 680px) {
    label[for="navToggle"] { display:block; cursor:pointer; padding:4px; }
    #siteNav { display:none; order:3; width:100%; flex-direction:column; align-items:stretch; gap:0; margin:6px -16px -4px; padding:6px 16px 14px; border-top:1px solid #1e293b; }
    #navToggle:checked ~ #siteNav { display:flex; }
    #siteNav a { display:flex; align-items:center; justify-content:space-between; padding:15px 2px; border-bottom:1px solid #1e293b; font-size:0.95em; }
    #siteNav a::after { content:"›"; color:#475569; font-size:1.2em; }
    #siteNav a.nav-cta { justify-content:center; margin-top:16px; padding:14px; border-radius:8px; border-bottom:none; font-size:0.95em; }
    #siteNav a.nav-cta::after { content:""; }
    #searchWrap { margin:8px 0 10px; width:100%; }
    #siteSearch { width:100%; font-size:16px; padding-top:11px; padding-bottom:11px; }
    .nav-close { display:block; text-align:center; color:#64748b; font-size:0.85em; padding:16px 0 4px; cursor:pointer; }
    #searchResults { width:100%; right:auto; left:0; top:50px; }
  }
  .re-article h2, .re-article h3 { scroll-margin-top: 84px; }
  #toTop { position:fixed; right:16px; bottom:20px; width:46px; height:46px; border-radius:50%; background:#0f172a; border:1px solid #334155; color:#fff; display:none; align-items:center; justify-content:center; cursor:pointer; z-index:90; box-shadow:0 6px 18px rgba(15,23,42,.3); padding:0; }
  #toTop:hover { background:#1e293b; border-color:#d97706; }
  #toTop.show { display:flex; }
  @media (min-width: 681px) { #toTop { right:28px; bottom:28px; width:50px; height:50px; } }
</style>
<button id="toTop" type="button" aria-label="ページ上部へ戻る">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="6"/><polyline points="5,13 12,6 19,13"/></svg>
</button>
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
  function closeRow(){
    return '<button type="button" id="searchClose" style="display:block; width:100%; background:#f8fafc; border:0; border-top:1px solid #e2e8f0; color:#64748b; font-size:0.8em; padding:11px; cursor:pointer;">閉じる</button>';
  }
  function render(){
    var q=input.value.trim().toLowerCase();
    if(!q||!data){box.style.display='none';box.innerHTML='';return;}
    var hits=data.filter(function(a){
      return (a.t+' '+a.m+' '+a.c).toLowerCase().indexOf(q)>-1;
    }).slice(0,8);
    if(hits.length===0){
      box.innerHTML='<p style="margin:0; padding:16px; color:#64748b; font-size:0.85em;">該当する記事がありません</p>'+closeRow();
    }else{
      box.innerHTML=hits.map(function(a){
        return '<a href="'+a.u+'" style="display:block; padding:12px 15px; border-bottom:1px solid #f1f5f9; text-decoration:none;">'+
        '<span style="display:block; font-size:0.7em; color:#d97706; font-weight:bold; margin-bottom:3px;">'+a.c+'</span>'+
        '<span style="display:block; font-size:0.85em; color:#0f172a; line-height:1.45;">'+a.t+'</span></a>';
      }).join('')+closeRow();
    }
    box.style.display='block';
  }
  var clr=document.getElementById('searchClear');
  function close(){box.style.display='none';}
  function toggleClear(){if(clr)clr.style.display=input.value?'block':'none';}
  input.addEventListener('focus',load);
  input.addEventListener('input',function(){load();render();toggleClear();});
  input.addEventListener('keydown',function(e){if(e.key==='Escape'){input.value='';close();toggleClear();input.blur();}});
  if(clr)clr.addEventListener('click',function(){input.value='';close();toggleClear();input.focus();});
  box.addEventListener('click',function(e){
    if(e.target.id==='searchClose'){input.value='';close();toggleClear();}
  });
  document.addEventListener('click',function(e){
    if(!document.getElementById('searchWrap').contains(e.target)){close();}
  });
})();
(function(){
  var btn=document.getElementById('toTop');
  if(!btn)return;
  function upd(){ if(window.scrollY>400){btn.classList.add('show');}else{btn.classList.remove('show');} }
  window.addEventListener('scroll',upd,{passive:true});
  btn.addEventListener('click',function(){ window.scrollTo({top:0,behavior:'smooth'}); });
  upd();
})();
</script>`;
}

const HEAD_START = '<!-- AUTO:HEAD:START -->';
const HEAD_END = '<!-- AUTO:HEAD:END -->';

function headTagsHtml() {
  const css = `<link rel="stylesheet" href="/assets/css/article.css">`;
  if (!GA4_ID) return css;
  return `${css}
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA4_ID}');
</script>`;
}

// </head> の直前にブロックを差し込む。すでにあれば中身を入れ替える。
function applyHeadTags(content) {
  const inner = headTagsHtml();
  const block = `${HEAD_START}\n${inner}\n${HEAD_END}`;
  const regex = new RegExp(`${HEAD_START}[\\s\\S]*?${HEAD_END}`);
  if (regex.test(content)) return content.replace(regex, block);
  if (!content.includes('</head>')) return content;
  return content.replace('</head>', `${block}\n</head>`);
}

function announceHtml() {
  if (!ANNOUNCE.text) return '';
  return `<div style="background:#fef3c7; border-bottom:1px solid #fde68a;">
  <div style="max-width:860px; margin:0 auto; padding:9px 16px; font-size:0.86em; line-height:1.5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
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

/* ---------------- 記事上部の見出しブロック ---------------- */

// タイトルの「｜」を改行に変える（1行が長くなりすぎるのを防ぐ）
function headlineHtml(title) {
  const t = (title || '').replace(/\s*[|｜]\s*Asiatopro.*$/, '');
  const parts = t.split(/[|｜]/);
  return parts.map((s) => escapeHtml(s.trim())).join('<br>');
}

function formatJpDate(d) {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

function articleHeadHtml(article) {
  if (!article) return '';
  const pub = formatJpDate(article.published);
  const upd = formatJpDate(article.updated);
  let meta = `<span>公開：${pub}</span>`;
  if (upd && upd !== pub) meta += `<span>更新：${upd}</span>`;
  return `<div class="article-header">
  <div class="article-category">${escapeHtml(article.category)}</div>
  <h1>${headlineHtml(article.title)}</h1>
  <div class="article-meta">${meta}</div>
</div>`;
}

/* ---------------- 記事下のブロック ---------------- */

function thumbBoxHtml(article) {
  const img = thumbOf(article);
  if (img) {
    return `<div style="aspect-ratio:1200/630; background:#0f172a url('${img}') center/cover no-repeat; border-radius:6px;"></div>`;
  }
  return `<div style="aspect-ratio:1200/630; background:linear-gradient(135deg,#0f172a,#1e293b); border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; border-bottom:3px solid #d97706;"><span style="color:#d97706; font-size:0.7em; font-weight:bold; letter-spacing:.1em;">${escapeHtml(article.category)}</span><span style="color:#475569; font-size:0.6em; letter-spacing:.14em;">ASIATOPRO</span></div>`;
}

function shortTitle(title) {
  // 「｜」以降の説明部分を落として、企業名・主題だけを残す
  const t = (title || '').replace(/\s*[|｜]\s*Asiatopro.*$/, '');
  const sep = t.search(/[|｜]/);
  return sep > 0 && sep <= 24 ? t.slice(0, sep).trim() : t;
}

function thumbCardHtml(article) {
  return `<a href="${article.permalink}" style="display:block; text-decoration:none; background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
  ${thumbBoxHtml(article)}
  <div style="padding:11px 13px;">
    <span style="display:block; font-size:0.72em; color:#d97706; font-weight:bold; margin-bottom:4px;">${escapeHtml(article.category)}</span>
    <span style="display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; font-size:0.86em; color:#0f172a; font-weight:bold; line-height:1.55;">${escapeHtml(shortTitle(article.title))}</span>
  </div>
</a>`;
}

function gridHtml(list) {
  return `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:12px;">
${list.map(thumbCardHtml).join('\n')}
</div>`;
}

function sectionTitle(text) {
  return `<h2 style="font-size:1.05em; color:#0f172a; font-weight:700; letter-spacing:.02em; margin:0 0 16px; padding:0 0 8px; border-bottom:2px solid #e2e8f0; position:relative;"><span style="border-bottom:2px solid #d97706; padding-bottom:8px;">${text}</span></h2>`;
}

function ctaHtml() {
  const prev =
    CTA.previews && CTA.previews.length
      ? `<div style="display:flex; gap:10px; overflow-x:auto; scroll-snap-type:x mandatory; padding:2px 0 14px; -webkit-overflow-scrolling:touch;">
${CTA.previews
  .map(
    (p) => `<figure style="flex:0 0 128px; margin:0; scroll-snap-align:start;">
  <img src="${p.src}" alt="${escapeHtml(p.label)}" loading="lazy" style="width:100%; height:auto; display:block; border:1px solid #e7e5e4; border-radius:5px; box-shadow:0 4px 12px rgba(15,23,42,.12);">
  <figcaption style="margin:6px 0 0; font-size:0.68em; color:#a8a29e; text-align:center; line-height:1.4;">${escapeHtml(p.label)}</figcaption>
</figure>`
  )
  .join('\n')}
</div>
<p style="margin:0 0 18px; color:#a8a29e; font-size:0.72em;">← 中身を少しだけ公開しています</p>`
      : '';
  return `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:28px 22px; margin:0 0 44px;">
  <img src="/assets/logo/asiatopro-color.png" alt="Asiatopro" style="height:38px; width:auto; display:block; margin:0 0 16px;">
  <span style="display:inline-block; background:#d97706; color:#fff; font-size:0.68em; font-weight:bold; letter-spacing:.1em; padding:4px 10px; border-radius:4px; margin-bottom:12px;">無料配布中</span>
  <p style="margin:0 0 10px; color:#0f172a; font-weight:bold; font-size:1.1em; line-height:1.55;">${escapeHtml(CTA.heading)}</p>
  <p style="margin:0 0 16px; color:#57534e; font-size:0.89em; line-height:1.8;">${escapeHtml(CTA.body)}</p>
${prev}
  <a href="${CTA.url}" style="display:block; background:#0f172a; color:#fff; text-decoration:none; font-weight:bold; padding:15px; border-radius:8px; font-size:0.98em; text-align:center;">${escapeHtml(CTA.button)}</a>
  <p style="margin:12px 0 0; color:#a8a29e; font-size:0.75em; text-align:center;">メールアドレスの入力のみ／いつでも配信解除できます</p>
  <p style="margin:16px 0 0; padding:14px 0 0; border-top:1px solid #fde68a; color:#78716c; font-size:0.76em; line-height:1.75;">${escapeHtml(CTA.publisher)}</p>
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

function footerHtml(articles) {
  const cats = CATEGORY_ORDER.map((id) => {
    const name = Object.keys(CATEGORY_TO_ID).find((k) => CATEGORY_TO_ID[k] === id);
    return `<a href="/rare-earth/#${id}" style="color:#94a3b8; text-decoration:none; font-size:0.86em; display:block; padding:5px 0;">${escapeHtml(name)}</a>`;
  }).join('\n');
  const sns = [
    ['X', 'https://x.com/Asiatopro'],
    ['Bluesky', 'https://bsky.app/profile/asiatopro.bsky.social'],
    ['Threads', 'https://www.threads.net/@asiatopro'],
  ]
    .map(
      ([n, u]) =>
        `<a href="${u}" style="color:#cbd5e1; text-decoration:none; font-size:0.8em; border:1px solid #334155; border-radius:999px; padding:6px 16px;">${n}</a>`
    )
    .join('\n');
  return `<footer style="background:#0f172a; color:#94a3b8;">
  <div style="max-width:860px; margin:0 auto; padding:36px 16px 28px;">

    <div style="display:flex; flex-wrap:wrap; gap:28px 40px; margin:0 0 28px;">
      <div style="flex:1 1 200px; min-width:0;">
        <img src="/assets/logo/asiatopro-white.png" alt="Asiatopro" style="height:30px; width:auto; display:block; margin:0 0 12px;">
        <p style="margin:0; font-size:0.84em; line-height:1.85; color:#64748b;">日本のレアアース産業を、一次情報にもとづいて記録する専門メディアです。</p>
      </div>
      <div style="flex:0 1 130px;">
        <p style="margin:0 0 8px; color:#fff; font-size:0.8em; font-weight:bold; letter-spacing:.06em;">カテゴリ</p>
${cats}
      </div>
      <div style="flex:0 1 130px;">
        <p style="margin:0 0 8px; color:#fff; font-size:0.8em; font-weight:bold; letter-spacing:.06em;">サイト情報</p>
        <a href="/" style="color:#94a3b8; text-decoration:none; font-size:0.86em; display:block; padding:5px 0;">ホーム</a>
        <a href="/rare-earth/" style="color:#94a3b8; text-decoration:none; font-size:0.86em; display:block; padding:5px 0;">記事一覧</a>
        <a href="/about/" style="color:#94a3b8; text-decoration:none; font-size:0.86em; display:block; padding:5px 0;">asiatoproとは</a>
        <a href="/lp/handbook/" style="color:#94a3b8; text-decoration:none; font-size:0.86em; display:block; padding:5px 0;">無料ハンドブック</a>
      </div>
    </div>

    <div style="display:flex; flex-wrap:wrap; gap:10px; margin:0 0 26px;">
${sns}
    </div>

    <div style="border-top:1px solid #1e293b; padding-top:20px;">
      <p style="margin:0 0 10px; color:#64748b; font-size:0.78em; line-height:1.85;">本サイトの記事は情報提供を目的としたものであり、特定銘柄の売買を推奨・勧誘するものではありません。投資判断はご自身の責任で行ってください。掲載内容は執筆時点の公表資料に基づきます。</p>
      <p style="margin:0; color:#475569; font-size:0.78em;">&copy; 2026 Asiatopro.com</p>
    </div>

  </div>
</footer>`;
}

function belowHtml(articles, current) {
  return `<div style="background:#f8fafc; border-top:1px solid #e2e8f0;"><div style="max-width:860px; margin:0 auto; padding:36px 16px 24px;">
${ctaHtml()}
${relatedHtml(articles, current)}
${tagsHtml(articles)}
${latestHtml(articles, current)}
</div></div>
${footerHtml(articles)}`;
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
    const before = content;
    content = applyHeadTags(content);
    if (!hasMarker(content, 'HEADER') && !hasMarker(content, 'BELOW') && !hasMarker(content, 'AD') && !hasMarker(content, 'ARTICLEHEAD')) {
      if (content !== before) fs.writeFileSync(file, content);
      continue;
    }

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
    if (hasMarker(content, 'ARTICLEHEAD')) {
      content = replaceBetweenMarkers(content, 'ARTICLEHEAD', articleHeadHtml(current), true);
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

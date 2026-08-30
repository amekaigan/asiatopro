const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.cwd();
const RARE_EARTH_DIR = path.join(REPO_ROOT, 'rare-earth');
const POSTED_FILE = path.join(REPO_ROOT, 'social-post-config', 'posted.json');
const SITE_URL = 'https://asiatopro.com';

function loadPostedList() {
  const data = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf-8'));
  return new Set(data.posted);
}

function savePostedList(postedSet) {
  const sorted = Array.from(postedSet).sort();
  fs.writeFileSync(POSTED_FILE, JSON.stringify({ posted: sorted }, null, 2) + '\n');
}

function extractMeta(htmlContent) {
  const match = htmlContent.match(/<!--([\s\S]*?)-->/);
  if (!match) return null;
  const block = match[1];
  const get = (key) => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  return {
    title: get('title'),
    meta: get('meta'),
    permalink: get('permalink'),
    published: get('published'),
    category: get('category'),
  };
}

function findNewArticles(postedSet) {
  const newArticles = [];
  if (!fs.existsSync(RARE_EARTH_DIR)) return newArticles;
  const dirs = fs.readdirSync(RARE_EARTH_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const filePath = path.join(RARE_EARTH_DIR, dir.name, 'index.html');
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');

    // noindex(統合案内ページ等)は投稿対象から除外
    if (content.includes('name="robots" content="noindex')) continue;

    const info = extractMeta(content);
    if (!info || !info.permalink) continue;
    if (postedSet.has(info.permalink)) continue;

    newArticles.push(info);
  }
  return newArticles;
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// ---------- Bluesky ----------
async function postToBluesky(article) {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !appPassword) {
    console.log('[Bluesky] 認証情報未設定のためスキップ');
    return;
  }

  const sessionRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  if (!sessionRes.ok) {
    console.error('[Bluesky] ログイン失敗', await sessionRes.text());
    return;
  }
  const session = await sessionRes.json();

  const url = `${SITE_URL}${article.permalink}`;
  const text = truncate(`【新着】${article.title}\n\n${article.meta}`, 280) + `\n${url}`;

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: url,
        title: article.title,
        description: article.meta || '',
      },
    },
  };

  const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });
  if (!postRes.ok) {
    console.error('[Bluesky] 投稿失敗', await postRes.text());
  } else {
    console.log('[Bluesky] 投稿成功:', article.title);
  }
}

// ---------- X (Twitter) ----------
async function postToX(article) {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.log('[X] 認証情報未設定のためスキップ');
    return;
  }
  const url = `${SITE_URL}${article.permalink}`;
  const text = truncate(`【新着】${article.title}`, 230) + `\n${url}`;

  try {
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
    await client.v2.tweet(text);
    console.log('[X] 投稿成功:', article.title);
  } catch (e) {
    console.error('[X] 投稿失敗', e && e.message ? e.message : e);
  }
}


// ---------- Threads ----------
async function postToThreads(article) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!token || !userId) {
    console.log('[Threads] 認証情報未設定のためスキップ');
    return;
  }
  const url = `${SITE_URL}${article.permalink}`;
  const text = truncate(`【新着】${article.title}\n\n${article.meta}`, 450) + `\n${url}`;

  const createRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads?media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${token}`,
    { method: 'POST' }
  );
  if (!createRes.ok) {
    console.error('[Threads] コンテナ作成失敗', await createRes.text());
    return;
  }
  const created = await createRes.json();

  const publishRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${created.id}&access_token=${token}`,
    { method: 'POST' }
  );
  if (!publishRes.ok) {
    console.error('[Threads] 公開失敗', await publishRes.text());
  } else {
    console.log('[Threads] 投稿成功:', article.title);
  }
}

// ---------- メイン処理 ----------
async function main() {
  const postedSet = loadPostedList();
  const newArticles = findNewArticles(postedSet);

  if (newArticles.length === 0) {
    console.log('新着記事なし。処理終了。');
    return;
  }

  for (const article of newArticles) {
    console.log('新着記事を検知:', article.title);
    await postToBluesky(article);
    await postToX(article);
    await postToThreads(article);
    postedSet.add(article.permalink);
  }

  savePostedList(postedSet);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

function clean(text = '') {
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

function absolute(href, base) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

function isEpisodeUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'ncode.syosetu.com' && /^\/n[0-9a-z]+\/\d+\/?$/i.test(u.pathname);
  } catch { return false; }
}

function extractParagraphs($) {
  const selectors = [
    '.p-novel__text',
    '#novel_honbun',
    '.js-novel-text',
    '[class*="novel__text"]',
    '[class*="novel-text"]'
  ];
  let root = null;
  for (const selector of selectors) {
    const candidate = $(selector).first();
    if (candidate.length && clean(candidate.text()).length > 80) {
      root = candidate;
      break;
    }
  }
  if (!root) return [];

  let blocks = root.find('p');
  if (!blocks.length) blocks = root.children();
  const paragraphs = [];
  blocks.each((_, el) => {
    const text = clean($(el).text());
    if (text) paragraphs.push(text);
  });
  if (!paragraphs.length) {
    return clean(root.text()).split(/\n{2,}/).map(clean).filter(Boolean);
  }
  return paragraphs;
}

function findNav($, labels, base) {
  let found = null;
  $('a').each((_, el) => {
    if (found) return;
    const label = clean($(el).text());
    if (labels.some((x) => label === x || label.includes(x))) {
      const url = absolute($(el).attr('href'), base);
      if (url && url.includes('ncode.syosetu.com')) found = url;
    }
  });
  return found;
}

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('url') || '';
  if (!isEpisodeUrl(raw)) {
    return Response.json({ error: '対応している各話URLではありません。' }, { status: 400 });
  }

  try {
    const res = await fetch(raw, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; personal-reader/0.1)',
        'Accept-Language': 'ja,en;q=0.8'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, iframe').remove();

    const paragraphs = extractParagraphs($);
    if (!paragraphs.length) {
      return Response.json({ error: '本文を取得できませんでした。ページ構造が変わった可能性があります。' }, { status: 502 });
    }

    const h1 = clean($('h1').first().text());
    const title = clean($('title').text());
    let episodeTitle = h1 || title.split(' - ').at(-1) || '本文';
    let workTitle = clean($('.p-novel__title').first().text());
    if (!workTitle) {
      const candidate = $('a[href*="/n"]').filter((_, el) => /n[0-9a-z]+\/?$/i.test($(el).attr('href') || '')).first();
      workTitle = clean(candidate.text()) || title.split(' - ')[0] || '作品';
    }

    const bodyText = $('body').text();
    const count = bodyText.match(/(\d+)\s*\/\s*(\d+)/);
    const chapter = clean($('.p-novel__chapter-title, .chapter_title').first().text());

    return Response.json({
      sourceUrl: raw,
      workTitle,
      episodeTitle,
      chapter,
      current: count ? Number(count[1]) : null,
      total: count ? Number(count[2]) : null,
      prevUrl: findNav($, ['前へ', '前話'], raw),
      nextUrl: findNav($, ['次へ', '次話'], raw),
      indexUrl: findNav($, ['目次'], raw),
      paragraphs
    });
  } catch (error) {
    return Response.json({ error: 'ページの取得に失敗しました。', detail: String(error?.message || error) }, { status: 502 });
  }
}

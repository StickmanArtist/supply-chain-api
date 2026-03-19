require('dotenv').config();
const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const KEYWORDS = {
  oil:'석유 원유 공급망', lng:'LNG 액화천연가스', iron:'철광석 공급망',
  rare:'희토류 공급망', copper:'구리 공급망', nickel:'니켈 공급망',
  aluminum:'알루미늄 공급망', wheat:'밀 곡물 공급망', coffee:'커피 공급망',
  soy:'대두 콩 공급망', cotton:'면화 공급망', rubber:'천연고무 공급망',
  semi:'반도체 공급망', car:'자동차 공급망', battery:'배터리 공급망',
  steel:'철강 공급망', fertilizer:'비료 공급망',
};

const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

function stripHtml(str) {
  return str?.replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'") || '';
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000 / 60);
  if (diff < 60)          return `${diff}분 전`;
  if (diff < 60 * 24)     return `${Math.floor(diff / 60)}시간 전`;
  if (diff < 60 * 24 * 7) return `${Math.floor(diff / 60 / 24)}일 전`;
  return date.toLocaleDateString('ko-KR');
}

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const country  = req.query.country || '';
  const cacheKey = `${id}-${country}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json(cached.data);
  }

  const baseKeyword = KEYWORDS[id] || id;
  const query = country ? `${country} ${baseKeyword}` : baseKeyword;

  try {
    const response = await axios.get(
      'https://openapi.naver.com/v1/search/news.json',
      {
        params: { query, display: 5, sort: 'date' },
        headers: {
          'X-Naver-Client-Id':     process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
        },
        timeout: 10000,
      }
    );

    const news = response.data.items.map(item => ({
      title:   stripHtml(item.title),
      source:  item.originallink
        ? new URL(item.originallink).hostname.replace('www.', '')
        : '네이버 뉴스',
      time:    formatDate(item.pubDate),
      summary: stripHtml(item.description),
      url:     item.originallink || item.link,
    }));

    cache.set(cacheKey, { data: news, time: Date.now() });
    res.json(news);
  } catch (err) {
    console.error('네이버 뉴스 오류:', err.response?.data || err.message);
    res.status(500).json({ error: '뉴스를 불러올 수 없습니다' });
  }
});

module.exports = router;
require('dotenv').config();
const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

async function callAnthropic(body, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          timeout: 30000,
        }
      );
      return response.data;
    } catch (err) {
      console.log(`시도 ${i + 1} 실패:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const country = req.query.country || '';
  const cacheKey = `${id}-${country}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json(cached.data);
  }

  const { ITEMS } = require('../data/commodities');
  const item = ITEMS.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: '품목 없음' });

  const query = country
    ? `${country} ${item.name} 공급망 뉴스 최신`
    : `${item.name} 글로벌 공급망 최신 뉴스`;

  const prompt = `"${query}"에 관한 최신 뉴스 5건을 웹 검색으로 찾아라.
아래 규칙을 반드시 지켜라:
1. JSON 배열 형식으로만 출력
2. 각 필드값 안에 큰따옴표(") 절대 사용 금지
3. 줄바꿈 문자 절대 사용 금지
4. 다른 텍스트 일절 금지

[{"title":"제목","source":"언론사","time":"2시간 전","summary":"요약","url":""}]`;

  try {
    const data = await callAnthropic({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('') || '';

    console.log('뉴스 응답 원문:', text.slice(0, 400));

    // JSON 배열 추출
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) {
      console.error('JSON 배열 없음:', text);
      return res.status(500).json({ error: 'JSON 없음' });
    }

    // 깨진 JSON 복구: 필드값 안의 줄바꿈·탭 제거
    const cleaned = match[0]
      .replace(/[\r\n\t]/g, ' ')          // 줄바꿈·탭 → 공백
      .replace(/,\s*}/g, '}')             // 후행 쉼표 제거
      .replace(/,\s*]/g, ']');            // 후행 쉼표 제거

    let news;
    try {
      news = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON 파싱 실패. cleaned:', cleaned.slice(0, 400));
      return res.status(500).json({ error: 'JSON 파싱 실패' });
    }

    cache.set(cacheKey, { data: news, time: Date.now() });
    res.json(news);

  } catch (err) {
    console.error('뉴스 오류 상세:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

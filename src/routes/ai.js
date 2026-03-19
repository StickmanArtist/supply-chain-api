require('dotenv').config();
const express = require('express');
const router  = express.Router();
const axios   = require('axios');

router.post('/analyze', async (req, res) => {
  const { itemId, itemName, country } = req.body;
  if (!itemId || !itemName) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  const prompt = country
    ? `${country}의 ${itemName} 공급망을 분석하라.
반드시 아래 JSON 형식으로만 답하고 다른 텍스트는 절대 쓰지 마라:
{"position":"공급망 역할 2줄","key_policy":"핵심 정책 2줄","geopolitics":"지정학 리스크 2줄","outlook":"향후 전망 2줄"}`
    : `${itemName}의 글로벌 공급망을 분석하라.
반드시 아래 JSON 형식으로만 답하고 다른 텍스트는 절대 쓰지 마라:
{"raw_materials":"원료 구성 2줄","logistics":"물류 경로 2줄","risk_factors":"공급망 리스크 2줄","market_size":"시장 규모 요약"}`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      }
    );

    const data = response.data;
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'JSON 파싱 실패' });

    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('AI 오류:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
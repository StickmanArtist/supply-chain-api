require('dotenv').config();
const express = require('express');
const router  = express.Router();
const axios   = require('axios');

// 품목 → Yahoo Finance 티커 매핑
const TICKERS = {
  oil:        'CL=F',
  lng:        'NG=F',
  iron:       'TIO=F',
  rare:       null,
  copper:     'HG=F',
  nickel:     'NI=F',
  aluminum:   'ALI=F',
  wheat:      'ZW=F',
  coffee:     'KC=F',
  soy:        'ZS=F',
  cotton:     'CT=F',
  rubber:     null,
  semi:       'SOX',
  car:        null,
  battery:    'LIT',
  steel:      'SLX',
  fertilizer: null,
};

const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30분 캐시

async function fetchYahoo(ticker, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
  const response = await axios.get(url, {
    params: { range, interval, includePrePost: false },
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });
  return response.data;
}

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const range = req.query.range || '1mo'; // 1mo or 1y
  const ticker = TICKERS[id];

  if (!ticker) {
    return res.json({ available: false, message: '해당 품목은 선물 시세 데이터가 없습니다' });
  }

  const cacheKey = `${id}-${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const interval = range === '1mo' ? '1d' : '1wk';
    const data = await fetchYahoo(ticker, range, interval);
    const chart = data.chart.result[0];
    const timestamps = chart.timestamp;
    const closes = chart.indicators.quote[0].close;
    const meta = chart.meta;

    const prices = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      price: closes[i] ? parseFloat(closes[i].toFixed(2)) : null,
    })).filter(p => p.price !== null);

    const result = {
      available: true,
      ticker,
      name: meta.shortName || ticker,
      currency: meta.currency,
      currentPrice: parseFloat(meta.regularMarketPrice?.toFixed(2)),
      previousClose: parseFloat(meta.previousClose?.toFixed(2)),
      change: parseFloat((meta.regularMarketPrice - meta.previousClose).toFixed(2)),
      changePct: parseFloat(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2)),
      range,
      prices,
    };

    cache.set(cacheKey, { data: result, time: Date.now() });
    res.json(result);
  } catch (err) {
    console.error('시세 오류:', err.message);
    res.status(500).json({ error: '시세 데이터를 불러올 수 없습니다', message: err.message });
  }
});

module.exports = router;
const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// 품목 목록
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, cat, name, icon, unit FROM commodities ORDER BY cat, name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 품목 상세
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 기본 정보
    const base = await pool.query(
      'SELECT * FROM commodities WHERE id = $1', [id]
    );
    if (!base.rows.length) return res.status(404).json({ error: '품목 없음' });

    // 국가별 수급
    const stats = await pool.query(
      'SELECT country, lat, lng, production AS prod, consumption AS cons FROM country_stats WHERE commodity_id = $1',
      [id]
    );
    console.log(`${id} 국가 수:`, stats.rows.length);

    // 무역 흐름
    const flows = await pool.query(
      'SELECT from_country, to_country, share_pct AS pct FROM trade_flows WHERE commodity_id = $1',
      [id]
    );

    // 기업
    const companies = await pool.query(
      'SELECT name FROM companies WHERE commodity_id = $1', [id]
    );

    // 수급 데이터에 수입/수출 흐름 합치기
const regions = stats.rows.map(r => {
  const imports = flows.rows
    .filter(f => f.to_country === r.name && (!f.flow_type || f.flow_type === 'import'))
    .map(f => ({ from: f.from_country, pct: f.pct }));
  const exports = flows.rows
    .filter(f => f.from_country === r.name && f.flow_type === 'export')
    .map(f => ({ to: f.to_country, pct: f.pct }));
  return {
    name: r.name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lng),
    prod: parseFloat(r.prod),
    cons: parseFloat(r.cons),
    imports,
    exports,
  };
});

    res.json({
      ...base.rows[0],
      regions,
      companies: companies.rows.map(c => c.name),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

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

    const base = await pool.query(
      'SELECT * FROM commodities WHERE id = $1', [id]
    );
    if (!base.rows.length) return res.status(404).json({ error: '품목 없음' });

    const stats = await pool.query(
      'SELECT country, lat, lng, production AS prod, consumption AS cons FROM country_stats WHERE commodity_id = $1',
      [id]
    );

    const flows = await pool.query(
      'SELECT from_country, to_country, share_pct AS pct FROM trade_flows WHERE commodity_id = $1 ORDER BY share_pct DESC',
      [id]
    );

    const companies = await pool.query(
      'SELECT name FROM companies WHERE commodity_id = $1', [id]
    );

    const regions = stats.rows.map(r => {
      const imports = flows.rows
        .filter(f => f.to_country === r.country)
        .map(f => ({ from: f.from_country, pct: f.pct }));
      const exports = flows.rows
        .filter(f => f.from_country === r.country)
        .map(f => ({ to: f.to_country, pct: f.pct }));
      return {
        name: r.country,
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
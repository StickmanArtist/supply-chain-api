require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.RAILWAY_DB_HOST,
  port:     process.env.RAILWAY_DB_PORT,
  database: process.env.RAILWAY_DB_NAME,
  user:     process.env.RAILWAY_DB_USER,
  password: process.env.RAILWAY_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

async function check() {
  const result = await pool.query(`
    SELECT from_country, to_country, share_pct, flow_type
    FROM trade_flows
    WHERE commodity_id = 'oil' AND flow_type = 'export'
    AND from_country = '사우디아라비아'
    ORDER BY share_pct DESC
  `);
  console.log('사우디 수출 데이터:');
  result.rows.forEach(r => console.log(`  ${r.from_country} → ${r.to_country}: ${r.share_pct}% (${r.flow_type})`));
  pool.end();
}

check();
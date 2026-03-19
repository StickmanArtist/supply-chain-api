// check.js 교체
require('dotenv').config();
const { Pool } = require('pg');

const railPool = new Pool({
  host:     process.env.RAILWAY_DB_HOST,
  port:     process.env.RAILWAY_DB_PORT,
  database: process.env.RAILWAY_DB_NAME,
  user:     process.env.RAILWAY_DB_USER,
  password: process.env.RAILWAY_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

async function check() {
  const result = await railPool.query(
    `SELECT commodity_id, COUNT(*) as cnt 
     FROM country_stats 
     GROUP BY commodity_id 
     ORDER BY commodity_id`
  );
  console.log('품목별 국가 수:');
  result.rows.forEach(r => console.log(`  ${r.commodity_id}: ${r.cnt}개`));
  railPool.end();
}

check();
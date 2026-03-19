require('dotenv').config();
const { Pool } = require('pg');

// 로컬 DB
const localPool = new Pool({
  host:     'localhost',
  port:     5432,
  database: 'supply_chain',
  user:     'postgres',
  password: process.env.DB_PASSWORD,
});

// Railway DB
const railPool = new Pool({
  host:     process.env.RAILWAY_DB_HOST,
  port:     process.env.RAILWAY_DB_PORT,
  database: process.env.RAILWAY_DB_NAME,
  user:     process.env.RAILWAY_DB_USER,
  password: process.env.RAILWAY_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

async function sync() {
  console.log('🔄 로컬 → Railway DB 동기화 시작');

  // 1. 로컬에서 데이터 읽기
  const commodities  = await localPool.query('SELECT * FROM commodities');
  const countryStats = await localPool.query('SELECT * FROM country_stats');
  const tradeFlows   = await localPool.query('SELECT * FROM trade_flows');
  const companies    = await localPool.query('SELECT * FROM companies');

  console.log(`📦 품목: ${commodities.rows.length}개`);
  console.log(`🌍 국가 수급: ${countryStats.rows.length}개`);
  console.log(`↔️  무역흐름: ${tradeFlows.rows.length}개`);
  console.log(`🏢 기업: ${companies.rows.length}개`);

  const client = await railPool.connect();
  try {
    // 2. Railway DB 초기화
    console.log('\n🗑️  Railway DB 초기화 중...');
    await client.query('TRUNCATE TABLE trade_flows, companies, country_stats, commodities RESTART IDENTITY CASCADE');

    // 3. 품목 삽입
    console.log('📦 품목 삽입 중...');
    for (const row of commodities.rows) {
      await client.query(
        'INSERT INTO commodities (id, cat, name, icon, unit) VALUES ($1,$2,$3,$4,$5)',
        [row.id, row.cat, row.name, row.icon, row.unit]
      );
    }

    // 4. 국가 수급 삽입
    console.log('🌍 국가 수급 삽입 중...');
    for (const row of countryStats.rows) {
      await client.query(
        'INSERT INTO country_stats (commodity_id, country, lat, lng, production, consumption) VALUES ($1,$2,$3,$4,$5,$6)',
        [row.commodity_id, row.country, row.lat, row.lng, row.production, row.consumption]
      );
    }

    // 5. 무역흐름 삽입
    console.log('↔️  무역흐름 삽입 중...');
    for (const row of tradeFlows.rows) {
      await client.query(
        `INSERT INTO trade_flows (commodity_id, from_country, to_country, share_pct)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [row.commodity_id, row.from_country, row.to_country, row.share_pct]
      );
    }

    // 6. 기업 삽입
    console.log('🏢 기업 삽입 중...');
    for (const row of companies.rows) {
      await client.query(
        'INSERT INTO companies (commodity_id, name) VALUES ($1,$2)',
        [row.commodity_id, row.name]
      );
    }

    console.log('\n✅ 동기화 완료!');
  } catch (err) {
    console.error('❌ 오류:', err.message);
  } finally {
    client.release();
    localPool.end();
    railPool.end();
  }
}

sync();
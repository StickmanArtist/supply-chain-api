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

async function alter() {
  const client = await pool.connect();
  try {
    console.log('Railway DB 스키마 수정 중...');

    await client.query(`
      ALTER TABLE trade_flows ADD COLUMN IF NOT EXISTS flow_type VARCHAR(10) DEFAULT 'import';
    `);
    console.log('✓ flow_type 컬럼 추가');

    await client.query(`
      UPDATE trade_flows SET flow_type = 'import' WHERE flow_type IS NULL;
    `);
    console.log('✓ 기존 데이터 flow_type = import 설정');

    await client.query(`
      ALTER TABLE trade_flows DROP CONSTRAINT IF EXISTS trade_flows_unique;
    `);
    console.log('✓ 기존 UNIQUE 제약 삭제');

    await client.query(`
      ALTER TABLE trade_flows ADD CONSTRAINT trade_flows_unique 
        UNIQUE (commodity_id, from_country, to_country, flow_type);
    `);
    console.log('✓ 새 UNIQUE 제약 추가');

    console.log('\n✅ 완료!');
  } catch (err) {
    console.error('❌ 오류:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

alter();
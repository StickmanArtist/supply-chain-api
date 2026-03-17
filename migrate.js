require('dotenv').config();
const pool = require('./src/db');
const { ITEMS } = require('./src/data/commodities');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('테이블 초기화 중...');

    // 순서대로 삭제 (외래키 의존성 역순)
    await client.query('DELETE FROM trade_flows');
    await client.query('DELETE FROM companies');
    await client.query('DELETE FROM country_stats');
    await client.query('DELETE FROM commodities');

    console.log('데이터 삽입 중...');

    for (const item of ITEMS) {
      await client.query(
        'INSERT INTO commodities (id, cat, name, icon, unit) VALUES ($1,$2,$3,$4,$5)',
        [item.id, item.cat, item.name, item.icon, item.unit]
      );

      for (const r of item.regions) {
        await client.query(
          'INSERT INTO country_stats (commodity_id, country, lat, lng, production, consumption) VALUES ($1,$2,$3,$4,$5,$6)',
          [item.id, r.name, r.lat, r.lng, r.prod, r.cons]
        );

        for (const imp of (r.imports || [])) {
          // 중복 체크 후 삽입
          const exists = await client.query(
            'SELECT id FROM trade_flows WHERE commodity_id=$1 AND from_country=$2 AND to_country=$3',
            [item.id, imp.from, r.name]
          );
          if (!exists.rows.length) {
            await client.query(
              'INSERT INTO trade_flows (commodity_id, from_country, to_country, share_pct) VALUES ($1,$2,$3,$4)',
              [item.id, imp.from, r.name, imp.pct]
            );
          }
        }

        for (const exp of (r.exports || [])) {
          const exists = await client.query(
            'SELECT id FROM trade_flows WHERE commodity_id=$1 AND from_country=$2 AND to_country=$3',
            [item.id, r.name, exp.to]
          );
          if (!exists.rows.length) {
            await client.query(
              'INSERT INTO trade_flows (commodity_id, from_country, to_country, share_pct) VALUES ($1,$2,$3,$4)',
              [item.id, r.name, exp.to, exp.pct]
            );
          }
        }
      }

      for (const company of item.companies) {
        await client.query(
          'INSERT INTO companies (commodity_id, name) VALUES ($1,$2)',
          [item.id, company]
        );
      }

      console.log(`  ✓ ${item.name} 완료`);
    }

    console.log('✅ 마이그레이션 완료!');
  } catch (err) {
    console.error('❌ 마이그레이션 실패:', err.message);
    console.error('상세:', err.detail || '');
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
require('dotenv').config();
const EXTRA_COORDS = {
  'UAE':       { lat: 24,  lng: 54  },
  '카타르':    { lat: 25,  lng: 51  },
  '쿠웨이트':  { lat: 29,  lng: 47  },
  '이스라엘':  { lat: 31,  lng: 35  },
  '터키':      { lat: 39,  lng: 35  },
  '태국':      { lat: 15,  lng: 101 },
  '말레이시아':{ lat: 4,   lng: 109 },
  '필리핀':    { lat: 13,  lng: 122 },
  '방글라데시':{ lat: 23,  lng: 90  },
  '파키스탄':  { lat: 30,  lng: 70  },
  '스페인':    { lat: 40,  lng: -4  },
  '네덜란드':  { lat: 52,  lng: 5   },
  '스웨덴':    { lat: 60,  lng: 18  },
  '폴란드':    { lat: 52,  lng: 20  },
  '벨기에':    { lat: 50,  lng: 4   },
  '노르웨이':  { lat: 62,  lng: 10  },
  '칠레':      { lat: -30, lng: -71 },
};
const { Pool } = require('pg');
const { ITEMS } = require('./src/data/commodities');

const pool = new Pool({
  host:     process.env.RAILWAY_DB_HOST,
  port:     process.env.RAILWAY_DB_PORT,
  database: process.env.RAILWAY_DB_NAME,
  user:     process.env.RAILWAY_DB_USER,
  password: process.env.RAILWAY_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Railway DB 연결 성공!');
    console.log('테이블 생성 중...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS commodities (
        id      VARCHAR(20) PRIMARY KEY,
        cat     VARCHAR(10) NOT NULL,
        name    VARCHAR(50) NOT NULL,
        icon    VARCHAR(10),
        unit    VARCHAR(30)
      );
      CREATE TABLE IF NOT EXISTS country_stats (
        id           SERIAL PRIMARY KEY,
        commodity_id VARCHAR(20) REFERENCES commodities(id),
        country      VARCHAR(50) NOT NULL,
        lat          NUMERIC,
        lng          NUMERIC,
        production   NUMERIC,
        consumption  NUMERIC
      );
      CREATE TABLE IF NOT EXISTS trade_flows (
        id           SERIAL PRIMARY KEY,
        commodity_id VARCHAR(20) REFERENCES commodities(id),
        from_country VARCHAR(50),
        to_country   VARCHAR(50),
        share_pct    INTEGER,
        CONSTRAINT trade_flows_unique UNIQUE (commodity_id, from_country, to_country)
      );
      CREATE TABLE IF NOT EXISTS companies (
        id           SERIAL PRIMARY KEY,
        commodity_id VARCHAR(20) REFERENCES commodities(id),
        name         VARCHAR(100) NOT NULL
      );
    `);

    console.log('데이터 삽입 중...');

    // 기존 데이터 초기화
    await client.query('TRUNCATE TABLE trade_flows, companies, country_stats, commodities RESTART IDENTITY CASCADE');

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
          await client.query(
            `INSERT INTO trade_flows (commodity_id, from_country, to_country, share_pct)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [item.id, imp.from, r.name, imp.pct]
          );
        }

        for (const exp of (r.exports || [])) {
          await client.query(
            `INSERT INTO trade_flows (commodity_id, from_country, to_country, share_pct)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [item.id, r.name, exp.to, exp.pct]
          );
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

    console.log('✅ Railway DB 마이그레이션 완료!');
  } catch (err) {
    console.error('❌ 실패:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
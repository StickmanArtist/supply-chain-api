require('dotenv').config();
const { Pool } = require('pg');

const localPool = new Pool({
  host: 'localhost', port: 5432,
  database: 'supply_chain', user: 'postgres',
  password: process.env.DB_PASSWORD,
});

const railPool = new Pool({
  host:     process.env.RAILWAY_DB_HOST,
  port:     process.env.RAILWAY_DB_PORT,
  database: process.env.RAILWAY_DB_NAME,
  user:     process.env.RAILWAY_DB_USER,
  password: process.env.RAILWAY_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

const COUNTRY_COORDS = {
  '미국':{lat:40,lng:-100}, '캐나다':{lat:56,lng:-96}, '멕시코':{lat:23,lng:-102},
  '브라질':{lat:-15,lng:-50}, '아르헨티나':{lat:-34,lng:-64}, '칠레':{lat:-30,lng:-71},
  '콜롬비아':{lat:4,lng:-74}, '페루':{lat:-10,lng:-76},
  '독일':{lat:51,lng:10}, '영국':{lat:54,lng:-2}, '프랑스':{lat:46,lng:2},
  '이탈리아':{lat:42,lng:12}, '스페인':{lat:40,lng:-4}, '네덜란드':{lat:52,lng:5},
  '벨기에':{lat:50,lng:4}, '스웨덴':{lat:60,lng:18}, '노르웨이':{lat:62,lng:10},
  '폴란드':{lat:52,lng:20},
  '러시아':{lat:55,lng:70}, '터키':{lat:39,lng:35}, '우크라이나':{lat:49,lng:32},
  '카자흐스탄':{lat:48,lng:68},
  '사우디아라비아':{lat:24,lng:45}, '이란':{lat:32,lng:53}, '이라크':{lat:33,lng:44},
  '이집트':{lat:27,lng:30}, 'UAE':{lat:24,lng:54}, '카타르':{lat:25,lng:51},
  '쿠웨이트':{lat:29,lng:47}, '이스라엘':{lat:31,lng:35},
  '나이지리아':{lat:9,lng:8}, '남아프리카':{lat:-30,lng:25}, 'DR콩고':{lat:-4,lng:24},
  '인도':{lat:22,lng:80}, '중국':{lat:35,lng:105}, '일본':{lat:36,lng:138},
  '한국':{lat:37,lng:127}, '대만':{lat:24,lng:121}, '베트남':{lat:15,lng:108},
  '인도네시아':{lat:-5,lng:118}, '태국':{lat:15,lng:101}, '말레이시아':{lat:4,lng:109},
  '필리핀':{lat:13,lng:122}, '방글라데시':{lat:23,lng:90}, '파키스탄':{lat:30,lng:70},
  '호주':{lat:-25,lng:133},
};

async function addMissing() {
  console.log('🔍 누락된 국가 찾는 중...');

  // 로컬 trade_flows 에서 모든 국가 추출
  const flows = await localPool.query(
    'SELECT DISTINCT commodity_id, from_country AS country FROM trade_flows UNION SELECT DISTINCT commodity_id, to_country FROM trade_flows'
  );

  // 로컬 country_stats 에 있는 국가
  const existing = await localPool.query('SELECT commodity_id, country FROM country_stats');
  const existingSet = new Set(existing.rows.map(r => `${r.commodity_id}-${r.country}`));

  // 누락된 국가 찾기
  const missing = flows.rows.filter(r =>
    !existingSet.has(`${r.commodity_id}-${r.country}`) &&
    COUNTRY_COORDS[r.country]
  );

  console.log(`📍 누락된 국가: ${missing.length}개`);

  // 로컬 DB에 추가
  for (const r of missing) {
    const coords = COUNTRY_COORDS[r.country];
    await localPool.query(
      `INSERT INTO country_stats (commodity_id, country, lat, lng, production, consumption)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [r.commodity_id, r.country, coords.lat, coords.lng, 0, 0]
    );
    console.log(`  ✓ ${r.commodity_id} - ${r.country} 추가`);
  }

  console.log('\n✅ 로컬 DB 업데이트 완료!');
  console.log('이제 syncToRailway.js 를 실행하세요.');

  localPool.end();
  railPool.end();
}

addMissing();
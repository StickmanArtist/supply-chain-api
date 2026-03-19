require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.RAILWAY_DB_HOST,
  port:     process.env.RAILWAY_DB_PORT,
  database: process.env.RAILWAY_DB_NAME,
  user:     process.env.RAILWAY_DB_USER,
  password: process.env.RAILWAY_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

const COMMODITY_HS = {
  oil:        '2709',
  iron:       '2601',
  rare:       '2846',
  wheat:      '1001',
  coffee:     '0901',
  soy:        '1201',
  semi:       '8542',
  car:        '8703',
  battery:    '8507',
  lng:        '2711',
  copper:     '7403',
  nickel:     '7502',
  aluminum:   '7601',
  rubber:     '4001',
  cotton:     '5201',
  steel:      '7206',
  fertilizer: '3102',
};

const COUNTRIES = {
  '미국':'842', '캐나다':'124', '멕시코':'484',
  '브라질':'76', '아르헨티나':'32', '칠레':'152', '콜롬비아':'170',
  '독일':'276', '영국':'826', '프랑스':'251', '이탈리아':'381',
  '스페인':'724', '네덜란드':'528', '벨기에':'56',
  '스웨덴':'752', '노르웨이':'578', '폴란드':'616',
  '러시아':'643', '터키':'792', '카자흐스탄':'398',
  '사우디아라비아':'682', '이란':'364', '이라크':'368',
  '이집트':'818', 'UAE':'784', '카타르':'634', '쿠웨이트':'414',
  '나이지리아':'566', '남아프리카':'710',
  '인도':'356', '중국':'156', '일본':'392', '한국':'410',
  '대만':'490', '베트남':'704', '인도네시아':'360',
  '태국':'764', '말레이시아':'458', '호주':'36',
};

const ISO_TO_NAME = Object.fromEntries(
  Object.entries(COUNTRIES).map(([name, iso]) => [iso, name])
);

async function fetchExportData(hsCode, reporterIso, retry = 0) {
  try {
    const response = await axios.get(
      'https://comtradeapi.un.org/data/v1/get/C/A/HS',
      {
        params: {
          reporterCode: reporterIso,
          period: '2022',
          cmdCode: hsCode,
          flowCode: 'X', // X = 수출
          maxRecords: 20,
        },
        headers: {
          'Ocp-Apim-Subscription-Key': process.env.COMTRADE_API_KEY,
        },
        timeout: 20000,
      }
    );
    return response.data?.data || [];
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retry < 3) {
      const waitSec = (retry + 1) * 3;
      console.log(`  ⏳ Rate limit, ${waitSec}초 대기... (${reporterIso})`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      return fetchExportData(hsCode, reporterIso, retry + 1);
    }
    if (status === 403) {
      console.log('  ❌ API 할당량 초과. 중단합니다.');
      process.exit(1);
    }
    console.error(`  오류 (${reporterIso}): ${status}`);
    return [];
  }
}

async function updateExports(commodityId, hsCode) {
  const client = await pool.connect();
  try {
    console.log(`\n📦 ${commodityId} (HS: ${hsCode}) 수출 데이터 수집 중...`);

    // 기존 수출 데이터만 삭제
    await client.query(
      `DELETE FROM trade_flows WHERE commodity_id = $1 AND flow_type = 'export'`,
      [commodityId]
    );

    const check = await client.query(
      'SELECT id FROM commodities WHERE id = $1', [commodityId]
    );
    if (!check.rows.length) {
      console.log(`  ⚠️ ${commodityId} 없음. 건너뜀.`);
      return;
    }

    let totalInserted = 0;

    for (const [reporterName, iso] of Object.entries(COUNTRIES)) {
      const records = await fetchExportData(hsCode, iso);
      if (!records.length) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      const total = records.reduce((sum, r) => sum + (r.primaryValue || 0), 0);
      if (total === 0) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      const top5 = records
        .filter(r => r.partnerCode && r.primaryValue > 0)
        .sort((a, b) => b.primaryValue - a.primaryValue)
        .slice(0, 5);

      for (const record of top5) {
        const partnerName = ISO_TO_NAME[record.partnerCode];
        if (!partnerName || partnerName === reporterName) continue;
        const pct = Math.round((record.primaryValue / total) * 100);
        if (pct < 2) continue;

        await client.query(
          `INSERT INTO trade_flows (commodity_id, from_country, to_country, share_pct, flow_type)
           VALUES ($1,$2,$3,$4,'export') ON CONFLICT DO NOTHING`,
          [commodityId, reporterName, partnerName, pct]
        );
        totalInserted++;
      }

      console.log(`  ✓ ${reporterName}: ${top5.length}개 수출처`);
      await new Promise(r => setTimeout(r, 4000));
    }

    console.log(`  → ${totalInserted}개 수출 흐름 저장`);
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🌐 수출 데이터 수집 시작\n');

  for (const [id, code] of Object.entries(COMMODITY_HS)) {
    console.log(`\n=== ${id} ===`);
    await updateExports(id, code);
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('\n✅ 수출 데이터 수집 완료!');
  pool.end();
}

main().catch(err => {
  console.error('치명적 오류:', err.message);
  pool.end();
});
require('dotenv').config();
const axios = require('axios');
const pool  = require('./src/db');

// UN Comtrade HS 코드 매핑
// 우리 품목 → Comtrade HS 코드
const COMMODITY_HS = {
  oil:     { code: '2709',   name: '석유' },
  iron:    { code: '2601',   name: '철광석' },
  rare:    { code: '2846',   name: '희토류' },
  wheat:   { code: '1001',   name: '밀' },
  coffee:  { code: '0901',   name: '커피' },
  soy:     { code: '1201',   name: '대두' },
  semi:    { code: '8542',   name: '반도체' },
  car:     { code: '8703',   name: '자동차' },
  battery: { code: '8507',   name: '배터리' },
};

// 주요 국가 ISO 코드 (Comtrade 형식)
const COUNTRIES = {
  // 아시아
  '중국': '156',
  '일본': '392',
  '한국': '410',
  '인도': '356',
  '인도네시아': '360',
  '대만': '490',
  '태국': '764',
  '말레이시아': '458',
  '베트남': '704',
  '방글라데시': '50',
  '파키스탄': '586',
  '필리핀': '608',
  // 중동
  '사우디아라비아': '682',
  '이란': '364',
  '이라크': '368',
  'UAE': '784',
  '카타르': '634',
  '쿠웨이트': '414',
  '이스라엘': '376',
  '터키': '792',
  // 유럽
  '독일': '276',
  '영국': '826',
  '프랑스': '251',
  '이탈리아': '381',
  '스페인': '724',
  '네덜란드': '528',
  '스웨덴': '752',
  '폴란드': '616',
  '벨기에': '56',
  '노르웨이': '578',
  // 아메리카
  '미국': '842',
  '캐나다': '124',
  '멕시코': '484',
  '브라질': '76',
  '아르헨티나': '32',
  '콜롬비아': '170',
  '칠레': '152',
  // 아프리카
  '남아프리카': '710',
  '나이지리아': '566',
  '이집트': '818',
  // 오세아니아
  '호주': '36',
};

const ISO_TO_NAME = Object.fromEntries(
  Object.entries(COUNTRIES).map(([name, iso]) => [iso, name])
);

// Comtrade API 호출
async function fetchTradeData(hsCode, reporterIso, year = 2022, retry = 0) {
  try {
    const url = 'https://comtradeapi.un.org/data/v1/get/C/A/HS';
    const response = await axios.get(url, {
      params: {
        reporterCode: reporterIso,
        period: String(year),
        cmdCode: hsCode,
        flowCode: 'M',
        maxRecords: 20,
      },
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.COMTRADE_API_KEY,
      },
      timeout: 20000,
    });
    return response.data?.data || [];
  } catch (err) {
    const status = err.response?.status;

    // 429: 잠깐 기다렸다가 재시도
    if (status === 429 && retry < 3) {
      const waitSec = (retry + 1) * 3;
      console.log(`  ⏳ Rate limit, ${waitSec}초 대기 후 재시도... (${reporterIso})`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      return fetchTradeData(hsCode, reporterIso, year, retry + 1);
    }

    const detail = JSON.stringify(err.response?.data);
    console.error(`Comtrade 오류 (${reporterIso}, HS:${hsCode}): ${status}`, detail);
    return [];
  }
}

// 수입 데이터 → trade_flows 테이블 업데이트
async function updateTradeFlows(commodityId, hsCode) {
  const client = await pool.connect();
  try {
    console.log(`\n📦 ${commodityId} (HS: ${hsCode}) 데이터 수집 중...`);

    // 기존 데이터 삭제
    await client.query(
      'DELETE FROM trade_flows WHERE commodity_id = $1', [commodityId]
    );
    const check = await client.query(
    'SELECT id FROM commodities WHERE id = $1', [commodityId]
    );
    if (!check.rows.length) {
        console.log(`  ⚠️ ${commodityId} 가 commodities 테이블에 없음. 건너뜀.`);
        client.release();
    return;
    }
    const countryISOs = Object.values(COUNTRIES);
    let totalInserted = 0;

    for (const iso of countryISOs) {
      const records = await fetchTradeData(hsCode, iso);
      if (!records.length) continue;

      // 전체 수입량 합산
      const total = records.reduce((sum, r) => sum + (r.primaryValue || 0), 0);
      if (total === 0) continue;

      // 상위 5개 수입 출처만 저장
      const top5 = records
        .filter(r => r.partnerCode && r.primaryValue > 0)
        .sort((a, b) => b.primaryValue - a.primaryValue)
        .slice(0, 5);

      const reporterName = ISO_TO_NAME[iso];
      if (!reporterName) continue;

      for (const record of top5) {
        const partnerIso = record.partnerCode;
        const partnerName = ISO_TO_NAME[partnerIso];
        if (!partnerName || partnerName === reporterName) continue;

        const pct = Math.round((record.primaryValue / total) * 100);
        if (pct < 2) continue; // 2% 미만 제외

        await client.query(
          `INSERT INTO trade_flows (commodity_id, from_country, to_country, share_pct)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [commodityId, partnerName, reporterName, pct]
        );
        totalInserted++;
      }

      console.log(`  ✓ ${reporterName}: ${top5.length}개 파트너`);
      // API 요청 간격 (rate limit 방지)
      await new Promise(r => setTimeout(r, 4000));
    }

    console.log(`  → ${totalInserted}개 무역 흐름 저장 완료`);
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🌐 UN Comtrade 데이터 수집 시작\n');

  for (const [id, { code, name }] of Object.entries(COMMODITY_HS)) {
    console.log(`\n=== ${name} ===`);
    await updateTradeFlows(id, code);
    // 품목 간 간격
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('\n✅ 전체 완료!');
  pool.end();
}

main().catch(err => {
  console.error('치명적 오류:', err);
  pool.end();
});
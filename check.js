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

async function check() {
  const local = await localPool.query('SELECT COUNT(*) FROM country_stats');
  console.log('로컬 country_stats:', local.rows[0].count);

  const rail = await railPool.query('SELECT COUNT(*) FROM country_stats');
  console.log('Railway country_stats:', rail.rows[0].count);

  const localF = await localPool.query('SELECT COUNT(*) FROM trade_flows');
  console.log('로컬 trade_flows:', localF.rows[0].count);

  const railF = await railPool.query('SELECT COUNT(*) FROM trade_flows');
  console.log('Railway trade_flows:', railF.rows[0].count);

  localPool.end();
  railPool.end();
}

check();
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host:     'localhost',
        port:     5432,
        database: 'supply_chain',
        user:     'postgres',
        password: process.env.DB_PASSWORD,
      }
);

pool.connect()
  .then(() => console.log('DB 연결 성공'))
  .catch(err => console.error('DB 연결 실패:', err.message));

module.exports = pool;
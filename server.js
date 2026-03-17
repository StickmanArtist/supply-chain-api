process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/commodities', require('./src/routes/commodities'));
app.use('/api/news',        require('./src/routes/news'));
app.use('/api/ai',          require('./src/routes/ai'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`서버 실행 중 → http://localhost:${PORT}`));
const express = require('express');
const cors = require('cors');
const { lookupSingle, lookupBatch, validateIp, getClientIp, cacheStats } = require('./geo');

const app = express();
const PORT = process.env.PORT || 4500;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', cache: cacheStats() });
});

// Single IP lookup
app.get('/api/v1/lookup/:ip', async (req, res) => {
  try {
    const result = await lookupSingle(req.params.ip);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: true, message: err.message });
  }
});

// My IP lookup
app.get('/api/v1/me', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const result = await lookupSingle(ip);
    res.json({ clientIp: ip, ...result });
  } catch (err) {
    res.status(502).json({ error: true, message: err.message });
  }
});

// Batch lookup
app.post('/api/v1/batch', async (req, res) => {
  try {
    const { ips } = req.body;
    if (!Array.isArray(ips) || ips.length === 0) {
      return res.status(400).json({ error: true, message: 'Provide an array of IPs in body.ips' });
    }
    if (ips.length > 100) {
      return res.status(400).json({ error: true, message: 'Maximum 100 IPs per batch' });
    }
    const results = await lookupBatch(ips);
    res.json({ count: results.length, results });
  } catch (err) {
    res.status(502).json({ error: true, message: err.message });
  }
});

// Validate IP
app.get('/api/v1/validate/:ip', (req, res) => {
  res.json(validateIp(req.params.ip));
});

app.listen(PORT, () => {
  console.log(`ip-geo-api running on http://localhost:${PORT}`);
});

module.exports = app;

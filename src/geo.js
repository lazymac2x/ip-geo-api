const FIELDS = 'status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query';
const BASE_URL = 'http://ip-api.com';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BATCH_MAX = 100;

// In-memory cache: ip -> { data, ts }
const cache = new Map();

function getCached(ip) {
  const entry = cache.get(ip);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(ip);
    return null;
  }
  return entry.data;
}

function setCache(ip, data) {
  cache.set(ip, { data, ts: Date.now() });
}

function formatResult(raw) {
  if (raw.status === 'fail') {
    return { error: true, message: raw.message, query: raw.query };
  }
  return {
    ip: raw.query,
    country: raw.country,
    countryCode: raw.countryCode,
    region: raw.regionName,
    regionCode: raw.region,
    city: raw.city,
    zip: raw.zip,
    lat: raw.lat,
    lon: raw.lon,
    timezone: raw.timezone,
    isp: raw.isp,
    org: raw.org,
    as: raw.as,
  };
}

async function lookupSingle(ip) {
  const cached = getCached(ip);
  if (cached) return cached;

  const res = await fetch(`${BASE_URL}/json/${ip}?fields=${FIELDS}`);
  if (!res.ok) throw new Error(`ip-api returned ${res.status}`);
  const raw = await res.json();
  const result = formatResult(raw);
  if (!result.error) setCache(ip, result);
  return result;
}

async function lookupBatch(ips) {
  if (ips.length > BATCH_MAX) {
    throw new Error(`Batch limited to ${BATCH_MAX} IPs`);
  }

  // Separate cached vs uncached
  const results = new Map();
  const uncached = [];

  for (const ip of ips) {
    const cached = getCached(ip);
    if (cached) {
      results.set(ip, cached);
    } else {
      uncached.push(ip);
    }
  }

  if (uncached.length > 0) {
    const body = uncached.map((query) => ({ query, fields: FIELDS }));
    const res = await fetch(`${BASE_URL}/batch?fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ip-api batch returned ${res.status}`);
    const rawList = await res.json();

    for (const raw of rawList) {
      const result = formatResult(raw);
      if (!result.error) setCache(raw.query, result);
      results.set(raw.query, result);
    }
  }

  // Return in original order
  return ips.map((ip) => results.get(ip) || { error: true, message: 'Unknown', query: ip });
}

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const IPV6_RE = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?\d)?\d)\.){3}(25[0-5]|(2[0-4]|1?\d)?\d)|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?\d)?\d)\.){3}(25[0-5]|(2[0-4]|1?\d)?\d))$/;

function validateIp(ip) {
  const isV4 = IPV4_RE.test(ip);
  const isV6 = IPV6_RE.test(ip);
  return {
    ip,
    valid: isV4 || isV6,
    version: isV4 ? 4 : isV6 ? 6 : null,
  };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket.remoteAddress || '127.0.0.1';
}

function cacheStats() {
  return { entries: cache.size, ttl: CACHE_TTL };
}

module.exports = { lookupSingle, lookupBatch, validateIp, getClientIp, cacheStats };

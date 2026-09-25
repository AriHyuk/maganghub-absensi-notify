import fs from 'fs';
import path from 'path';
import axios from 'axios';

let memorySession = {
  token: process.env.AUTH_TOKEN || null,
  cookie: process.env.COOKIE || null,
  updatedAt: null,
};

function getKvCredentials() {
  const envKeys = Object.keys(process.env);
  
  let url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.REDIS_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.STORAGE_URL;
  let token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.REDIS_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.STORAGE_TOKEN;

  if (!url) {
    const foundKey = envKeys.find(k => 
      (k.includes('REDIS') || k.includes('UPSTASH') || k.includes('KV') || k.includes('STORAGE')) &&
      (k.endsWith('_URL') || k.endsWith('_REST_API_URL'))
    );
    if (foundKey) url = process.env[foundKey];
  }

  if (!token) {
    const foundKey = envKeys.find(k => 
      (k.includes('REDIS') || k.includes('UPSTASH') || k.includes('KV') || k.includes('STORAGE')) &&
      (k.endsWith('_TOKEN') || k.endsWith('_REST_API_TOKEN'))
    );
    if (foundKey) token = process.env[foundKey];
  }

  return { url, token };
}

const STATE_FILE = path.resolve('.state.json');
const ENV_FILE = path.resolve('.env');

export async function getSession() {
  const { url: KV_URL, token: KV_TOKEN } = getKvCredentials();
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await axios.get(`${KV_URL}/get/magang_session`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        timeout: 3500,
      });
      const data = res.data?.result;
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed.token) {
          memorySession = { ...memorySession, ...parsed };
          return memorySession;
        }
      }
    } catch (e) {
      console.warn('⚠️ Gagal membaca sesi dari KV:', e.message);
    }
  }

  if (memorySession.token) {
    return memorySession;
  }

  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (saved.authToken) {
        memorySession.token = saved.authToken;
        if (saved.cookie) memorySession.cookie = saved.cookie;
        return memorySession;
      }
    }
  } catch (_) {}

  return {
    token: process.env.AUTH_TOKEN || null,
    cookie: process.env.COOKIE || null,
    updatedAt: memorySession.updatedAt,
  };
}

export async function saveSession({ token, cookie }) {
  if (token) memorySession.token = token.trim().replace(/^Bearer\s+/i, '');
  if (cookie) memorySession.cookie = cookie.trim();
  memorySession.updatedAt = new Date().toISOString();

  const { url: KV_URL, token: KV_TOKEN } = getKvCredentials();
  if (KV_URL && KV_TOKEN) {
    try {
      await axios.post(
        `${KV_URL}/set/magang_session`,
        JSON.stringify(memorySession),
        {
          headers: { Authorization: `Bearer ${KV_TOKEN}` },
          timeout: 4000,
        }
      );
      console.log('✅ Sesi berhasil disimpan ke Vercel KV!');
    } catch (e) {
      console.warn('⚠️ Gagal menulis sesi ke KV:', e.message);
    }
  }

  try {
    let state = {};
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
    state.authToken = memorySession.token;
    if (memorySession.cookie) state.cookie = memorySession.cookie;
    state.lastTokenUpdate = memorySession.updatedAt;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    if (fs.existsSync(ENV_FILE)) {
      let envContent = fs.readFileSync(ENV_FILE, 'utf-8');
      if (memorySession.token && envContent.includes('AUTH_TOKEN=')) {
        envContent = envContent.replace(/^AUTH_TOKEN=.*/m, `AUTH_TOKEN=${memorySession.token}`);
      }
      if (memorySession.cookie && envContent.includes('COOKIE=')) {
        envContent = envContent.replace(/^COOKIE=.*/m, `COOKIE=${memorySession.cookie}`);
      }
      fs.writeFileSync(ENV_FILE, envContent, 'utf-8');
    }
  } catch (_) {}

  return memorySession;
}

export async function refreshAccessToken(currentCookie) {
  if (!currentCookie) return null;
  console.log('🔄 Mencoba auto-refresh access token ke MagangHub...');
  try {
    const res = await axios.post(
      'https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/refresh',
      null,
      {
        headers: {
          Cookie: currentCookie,
          Origin: 'https://monev.maganghub.kemnaker.go.id',
          Referer: 'https://monev.maganghub.kemnaker.go.id/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      }
    );

    const newToken = res.data?.access_token || res.data?.token || res.data?.data?.token;
    if (newToken) {
      let newCookie = currentCookie;
      const setCookies = res.headers['set-cookie'];
      if (setCookies && setCookies.length > 0) {
        newCookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      }

      await saveSession({ token: newToken, cookie: newCookie });
      return { token: newToken, cookie: newCookie };
    }
  } catch (err) {
    console.error('❌ Auto-refresh gagal:', err.response?.data || err.message);
  }
  return null;
}

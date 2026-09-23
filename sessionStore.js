import fs from 'fs';
import path from 'path';
import axios from 'axios';

let memorySession = {
  token: process.env.AUTH_TOKEN || null,
  cookie: process.env.COOKIE || null,
  updatedAt: null,
};

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_API_TOKEN;
const STATE_FILE = path.resolve('.state.json');
const ENV_FILE = path.resolve('.env');

/**
 * Mengambil sesi aktif (Token & Cookie)
 * Urutan prioritas:
 * 1. Vercel KV / Upstash Redis (jika terhubung)
 * 2. In-memory runtime cache
 * 3. File .state.json lokal
 * 4. process.env
 */
export async function getSession() {
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

/**
 * Menyimpan sesi baru ke semua storage yang tersedia
 */
export async function saveSession({ token, cookie }) {
  if (token) memorySession.token = token.trim().replace(/^Bearer\s+/i, '');
  if (cookie) memorySession.cookie = cookie.trim();
  memorySession.updatedAt = new Date().toISOString();

  // 1. Simpan ke Vercel KV / Upstash Redis
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

  // 2. Simpan ke .state.json & .env (di lingkungan lokal / self-hosted)
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
  } catch (_) {
    // Di Vercel serverless filesystem read-only, write fail adalah normal dan aman di-ignore
  }

  return memorySession;
}

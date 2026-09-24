import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import axios from 'axios';
import { saveSession } from '../sessionStore.js';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findBrowserPath() {
  for (const p of CHROME_PATHS) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

const PROFILE_DIR = path.resolve('.chrome-profile');
const SYNC_API_URL = process.env.VERCEL_SYNC_URL || 'https://maganghub-absensi-notify.vercel.app/api/sync';

async function syncLocalSession() {
  console.log('🚀 Memulai Auto-Sync Sesi MagangHub...');

  const executablePath = findBrowserPath();
  if (!executablePath) {
    console.error('❌ Tidak dapat menemukan Google Chrome atau Edge di komputer.');
    process.exit(1);
  }

  console.log(`🌐 Menggunakan browser: ${executablePath}`);
  console.log(`📁 Profil bot: ${PROFILE_DIR}`);

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      userDataDir: PROFILE_DIR,
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
    });
  } catch (err) {
    console.error('❌ Gagal membuka browser:', err.message);
    process.exit(1);
  }

  try {
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    console.log('⏳ Membuka Monev MagangHub...');
    await page.goto('https://monev.maganghub.kemnaker.go.id/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log('🔍 Memeriksa status login & sesi...');
    console.log('👉 Jika diminta login, silakan klik tombol Masuk di jendela Chrome...');

    let attempts = 0;
    const maxAttempts = 60;
    let success = false;

    while (attempts < maxAttempts) {
      try {
        const result = await page.evaluate(async () => {
          try {
            const res = await fetch('https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/refresh', {
              method: 'POST',
              credentials: 'include',
            });
            if (!res.ok) {
              return { ok: false, status: res.status };
            }
            const data = await res.json();
            const token = data.access_token || data.token || data.data?.token;
            return {
              ok: true,
              token,
              cookie: document.cookie,
            };
          } catch (err) {
            return { ok: false, error: err.message };
          }
        });

        if (result && result.ok && result.token) {
          console.log('\n✅ Sesi valid berhasil didapatkan dari browser!');
          console.log(`🔑 Token: ${result.token.substring(0, 30)}...`);

          await saveSession({
            token: result.token,
            cookie: result.cookie,
          });

          try {
            console.log(`☁️ Mengirim sesi ke Vercel Sync (${SYNC_API_URL})...`);
            const syncRes = await axios.post(
              SYNC_API_URL,
              {
                token: result.token,
                cookie: result.cookie,
              },
              { timeout: 8000 }
            );
            if (syncRes.data?.success) {
              console.log('🎉 Sesi sukses disinkronkan ke Vercel Cloud & Database KV!');
            }
          } catch (syncErr) {
            console.warn('⚠️ Gagal mengirim ke Vercel Sync API:', syncErr.response?.data || syncErr.message);
          }

          success = true;
          break;
        }
      } catch (evalErr) {
        if (evalErr.message.includes('Target closed') || evalErr.message.includes('Session closed')) {
          console.log('\nℹ️ Jendela browser ditutup.');
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }

    if (success) {
      console.log('\n✨ SELESAI! Token aktif baru sudah tersimpan.');
      console.log('💡 Kamu sekarang bisa jalankan: npm run check atau chat bot Telegram!');
    } else {
      console.log('\n⚠️ Belum berhasil mendapatkan token atau proses dibatalkan.');
    }
  } catch (outerErr) {
    if (!outerErr.message.includes('Target closed')) {
      console.error('❌ Terjadi kesalahan:', outerErr.message);
    }
  } finally {
    try {
      if (browser && browser.isConnected()) {
        await browser.close();
      }
    } catch (_) {}
  }
}

syncLocalSession().catch((err) => {
  console.error('❌ Terjadi kesalahan fatal:', err);
  process.exit(1);
});

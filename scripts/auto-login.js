import { chromium } from 'playwright';
import axios from 'axios';
import 'dotenv/config';

const EMAIL = process.env.KEMNAKER_EMAIL;
const PASSWORD = process.env.KEMNAKER_PASSWORD;
const SYNC_URL = process.env.SYNC_URL || 'https://maganghub-absensi-notify.vercel.app/api/sync';
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: TG_CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
  } catch (_) {}
}

async function autoLogin() {
  if (!EMAIL || !PASSWORD) {
    console.error('❌ KEMNAKER_EMAIL dan KEMNAKER_PASSWORD harus diset di environment!');
    process.exit(1);
  }

  console.log('🚀 Memulai auto-login ke MagangHub...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
    viewport: { width: 390, height: 844 },
    locale: 'id-ID',
  });

  const page = await context.newPage();

  // Sembunyikan tanda-tanda headless
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  let capturedAccessToken = null;

  // Intercept callback untuk ambil access_token dari response body
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/v1/auth/login/callback') || url.includes('/api/v1/auth/refresh')) {
      try {
        const data = await response.json();
        const token =
          data?.access_token ||
          data?.token ||
          data?.data?.access_token ||
          data?.data?.token;
        if (token) {
          capturedAccessToken = token;
          console.log('🎯 Access token berhasil dicapture dari response!');
        }
      } catch (_) {}
    }
  });

  try {
    // Buka portal monev → akan redirect ke login jika belum auth
    console.log('🌐 Membuka portal MagangHub...');
    await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Tunggu redirect ke halaman login
    await page.waitForURL('**/auth/login**', { timeout: 20000 });
    console.log('📝 Halaman login terdeteksi, mengisi kredensial...');

    // Isi field email/handphone
    await page.waitForSelector('input[type="text"], input[type="email"], input[placeholder*="email"], input[placeholder*="handphone"]', { timeout: 10000 });
    await page.fill(
      'input[type="text"], input[type="email"], input[placeholder*="email"], input[placeholder*="handphone"]',
      EMAIL
    );

    // Isi password
    await page.fill('input[type="password"]', PASSWORD);

    console.log('🔐 Menekan tombol Masuk...');
    await page.click('button[type="submit"]');

    // Tunggu redirect kembali ke monev setelah login berhasil
    await page.waitForURL('**/monev.maganghub.kemnaker.go.id/**', {
      timeout: 30000,
    });
    console.log('✅ Login berhasil! Mengambil cookies...');

    // Ambil SEMUA cookies termasuk HttpOnly (Playwright bisa akses ini!)
    const cookies = await context.cookies([
      'https://monev.maganghub.kemnaker.go.id',
      'https://monev-api.maganghub.kemnaker.go.id',
    ]);

    // Cek ada refresh token tidak
    const refreshTokenCookie = cookies.find((c) => c.name === 'monev_refresh_token');
    if (refreshTokenCookie) {
      console.log(`🍪 monev_refresh_token ditemukan! (expires: ${new Date(refreshTokenCookie.expires * 1000).toLocaleDateString('id-ID')})`);
    } else {
      console.warn('⚠️ monev_refresh_token tidak ditemukan di cookies.');
    }

    // Gabungkan semua cookies jadi satu string
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    // Jika access token belum dicapture dari intercept, coba dari localStorage
    if (!capturedAccessToken) {
      capturedAccessToken = await page.evaluate(() => {
        return (
          localStorage.getItem('access_token') ||
          localStorage.getItem('token') ||
          sessionStorage.getItem('access_token') ||
          sessionStorage.getItem('token') ||
          null
        );
      });
    }

    if (!capturedAccessToken) {
      console.warn('⚠️ Access token tidak berhasil dicapture langsung. Akan mengandalkan refresh via cookie.');
    }

    // Kirim ke /api/sync untuk disimpan ke Vercel KV
    console.log('📤 Mengirim session ke /api/sync...');
    const payload = { cookie: cookieStr };
    if (capturedAccessToken) payload.token = capturedAccessToken;

    const syncRes = await axios.post(SYNC_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    if (syncRes.data?.success) {
      console.log('🎉 Auto-login & session sync BERHASIL!');
      await sendTelegram(
        `🤖 <b>Auto-Login MagangHub Berhasil!</b>\n\n` +
        `✅ Token & cookie baru telah disimpan otomatis.\n` +
        `🍪 Refresh token valid hingga <b>30 hari ke depan</b>.\n` +
        `🕒 Dijalankan: ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`
      );
    } else {
      throw new Error('Sync API mengembalikan response tidak sukses');
    }
  } catch (err) {
    console.error('❌ Auto-login gagal:', err.message);
    await sendTelegram(
      `⚠️ <b>Auto-Login MagangHub Gagal!</b>\n\n` +
      `Error: <code>${err.message}</code>\n\n` +
      `Silakan sync manual via bookmarklet atau kirim token via /token.`
    );
    process.exit(1);
  } finally {
    await browser.close();
  }
}

autoLogin();

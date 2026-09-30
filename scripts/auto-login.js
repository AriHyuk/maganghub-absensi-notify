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
  // Tambah /sso/callback untuk handle OAuth2 SSO Kemnaker
  page.on('response', async (response) => {
    const url = response.url();
    if (
      url.includes('/api/v1/auth/login/callback') ||
      url.includes('/api/v1/auth/refresh') ||
      url.includes('/sso/callback')
    ) {
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
    // Buka portal monev -> akan redirect ke login jika belum auth
    console.log('🌐 Membuka portal MagangHub...');
    await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // FIX: MagangHub sekarang pakai SSO terpusat Kemnaker (account.kemnaker.go.id/auth).
    // Tunggu sampai halaman benar-benar me-render form login (tunggu selector #username atau input name="username").
    // Jangan hanya mengandalkan waitForURL karena bisa nyangkut di URL transit/redirect SSO.
    console.log('⏳ Menunggu redirect ke halaman login (MagangHub atau SSO Kemnaker)...');
    
    // Multi-selector fallback untuk berbagai variasi form SSO Kemnaker
    const emailSelectors = [
      '#username',
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="handphone" i]'
    ];

    let emailFilled = false;
    
    // Tunggu salah satu selector muncul dengan timeout 30 detik (menunggu redirect selesai)
    console.log('⏳ Menunggu input email/username muncul...');
    
    for (const selector of emailSelectors) {
      try {
        // Tunggu maksimal 10 detik per selector, tapi karena ini berurutan,
        // lebih baik kita kumpulkan semua selector lalu tunggu yang mana saja pakai locator.or() atau string koma
        // Tapi untuk simple-nya, kita bikin selector gabungan pakai koma (CSS selector OR)
        const combinedSelector = emailSelectors.join(', ');
        await page.waitForSelector(combinedSelector, { timeout: 30000 });
        
        // Coba isi satu per satu yang visible
        await page.fill(selector, EMAIL);
        console.log(`✅ Email diisi via selector: ${selector}`);
        emailFilled = true;
        break;
      } catch (_) {}
    }

    if (!emailFilled) {
      throw new Error('Tidak dapat menemukan input field email/username di halaman login');
    }

    const currentUrl = page.url();
    console.log(`📝 Halaman login terdeteksi: ${currentUrl}`);

    // Isi password
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.fill('input[type="password"]', PASSWORD);

    console.log('🔐 Menekan tombol Masuk...');

    // Multi-selector fallback untuk tombol submit
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Masuk")',
      'button:has-text("Login")',
      'button:has-text("Sign In")',
    ];

    let submitClicked = false;
    for (const selector of submitSelectors) {
      try {
        await page.click(selector, { timeout: 3000 });
        submitClicked = true;
        console.log(`✅ Submit via selector: ${selector}`);
        break;
      } catch (_) {}
    }

    if (!submitClicked) {
      throw new Error('Tidak dapat menemukan tombol submit di halaman login');
    }

    // Tunggu redirect kembali ke monev setelah SSO callback selesai
    console.log('⏳ Menunggu redirect kembali ke MagangHub setelah login...');
    await page.waitForURL(
      (url) => {
        try {
          return new URL(url).hostname.includes('monev.maganghub.kemnaker.go.id');
        } catch (_) {
          return false;
        }
      },
      { timeout: 30000 }
    );
    console.log('✅ Login berhasil! Mengambil cookies...');

    // Ambil SEMUA cookies termasuk HttpOnly (Playwright bisa akses ini!)
    const cookies = await context.cookies([
      'https://monev.maganghub.kemnaker.go.id',
      'https://monev-api.maganghub.kemnaker.go.id',
      'https://account.kemnaker.go.id',
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

    // Tunggu sejenak buat ngasih waktu ke interceptor response nangkep tokennya (async)
    for (let i = 0; i < 15; i++) {
      if (capturedAccessToken) break;
      await page.waitForTimeout(500); // Wait 500ms * 15 = 7.5 detik max
    }

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

    // Screenshot untuk debug — berguna saat jalan di CI/GitHub Actions
    try {
      await page.screenshot({ path: '/tmp/auto-login-error.png', fullPage: true });
      console.log('📸 Screenshot error disimpan ke /tmp/auto-login-error.png');
    } catch (_) {}

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

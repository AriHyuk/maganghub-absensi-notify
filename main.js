import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const COOKIE = process.env.SESSION_COOKIE;
const TELEGRAM_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_SECONDS || '60', 10) * 1000;

const STATE_FILE = path.resolve('.state.json');

// Helper: dapatkan tanggal hari ini dalam zona waktu WIB (Asia/Jakarta) format YYYY-MM-DD
function getTodayWIB() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

// Helper: baca state terakhir dari file
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('⚠️ Gagal membaca state file, inisialisasi state baru.');
  }
  return {};
}

// Helper: simpan state terakhir ke file
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Gagal menyimpan state ke file:', err.message);
  }
}

// Helper: kirim notifikasi ke Telegram
async function sendTelegramNotification(text) {
  const tgUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await axios.post(tgUrl, {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML',
  });
}

async function checkStatus(date) {
  const targetDate = date || getTodayWIB();
  console.log(`[${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB] Mengecek status jurnal tanggal: ${targetDate}...`);

  const state = loadState();

  // Jika sudah approved dan sudah dinotifikasi untuk tanggal ini, skip pengiriman ulang
  if (state.date === targetDate && state.status === 'approved' && state.notified) {
    console.log(`ℹ️ Jurnal tanggal ${targetDate} sudah di-approve dan notifikasi sudah pernah terkirim. Skip.`);
    return;
  }

  try {
    const res = await axios.get(
      `https://monev.maganghub.kemnaker.go.id/api/riwayat?date=${targetDate}`,
      {
        headers: {
          Cookie: COOKIE,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      }
    );

    // Sesuaikan field status dengan respons API MagangHub Kemnaker
    const status = res.data?.status || res.data?.data?.status;
    console.log(`📊 Status didapat: "${status}"`);

    if (status === 'approved' && (!state.notified || state.date !== targetDate)) {
      console.log('🎉 Status "approved" terdeteksi! Mengirim pesan Telegram...');
      await sendTelegramNotification(
        `✅ <b>Jurnal Magang Disetujui!</b>\n\n` +
        `📅 Tanggal: <code>${targetDate}</code>\n` +
        `📝 Status: <b>APPROVED</b> oleh mentor.`
      );
      console.log('✅ Notifikasi Telegram berhasil dikirim.');

      saveState({
        date: targetDate,
        status: 'approved',
        notified: true,
        updatedAt: new Date().toISOString(),
      });
    } else {
      saveState({
        date: targetDate,
        status: status || 'unknown',
        notified: false,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        console.error('❌ Cookie session tidak valid atau sudah expired! Silakan perbarui SESSION_COOKIE.');
      } else {
        console.error(`❌ API error (HTTP ${error.response.status}):`, error.response.data || error.message);
      }
    } else {
      console.error('❌ Gagal menghubungi server MagangHub:', error.message);
    }
  }
}

async function main() {
  // Validasi credentials
  if (!COOKIE || !TELEGRAM_TOKEN || !CHAT_ID) {
    console.error('❌ Harap lengkapi SESSION_COOKIE, TG_TOKEN, dan TG_CHAT_ID di .env atau GitHub Secrets!');
    process.exit(1);
  }

  const isRunOnce = process.argv.includes('--once') || process.env.GITHUB_ACTIONS === 'true';

  if (isRunOnce) {
    console.log('🚀 Menjalankan mode: Single Execution (Sekali Jalan)...');
    await checkStatus();
    console.log('🏁 Selesai.');
    process.exit(0);
  } else {
    console.log(`🚀 Menjalankan mode: Polling Daemon (setiap ${CHECK_INTERVAL / 1000} detik)...`);
    await checkStatus();
    setInterval(async () => {
      await checkStatus();
    }, CHECK_INTERVAL);
  }
}

main();
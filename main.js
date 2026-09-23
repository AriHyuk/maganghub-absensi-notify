import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const AUTH_TOKEN = process.env.AUTH_TOKEN;
const PARTICIPANT_ID = process.env.PARTICIPANT_ID;
const COOKIE = process.env.COOKIE;
const TELEGRAM_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_SECONDS || '60', 10) * 1000;

const STATE_FILE = path.resolve('.state.json');

// Helper: tanggal format YYYY-MM-DD zona waktu Asia/Jakarta (WIB)
function getTodayWIB() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️ Gagal membaca state file, inisialisasi state baru.');
  }
  return {};
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Gagal menyimpan state ke file:', err.message);
  }
}

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
  const timeStr = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
  console.log(`[${timeStr} WIB] 🔍 Mengecek status absensi untuk tanggal: ${targetDate}...`);

  const state = loadState();

  if (state.date === targetDate && state.approval_status === 'APPROVED' && state.notified) {
    console.log(`ℹ️ Jurnal/Absensi tanggal ${targetDate} sudah APPROVED dan notifikasi sudah pernah terkirim. Skip.`);
    return;
  }

  const bearerHeader = AUTH_TOKEN.startsWith('Bearer ') ? AUTH_TOKEN : `Bearer ${AUTH_TOKEN}`;

  // Rentang query: minta dari 7 hari lalu s.d hari ini
  const [year, month, day] = targetDate.split('-').map(Number);
  const startDateObj = new Date(Date.UTC(year, month - 1, day - 7));
  const startDate = startDateObj.toISOString().split('T')[0];
  const endDate = targetDate;

  const url = `https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances?participant_id=${PARTICIPANT_ID}&start_date=${startDate}&end_date=${endDate}`;

  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: bearerHeader,
        ...(COOKIE ? { Cookie: COOKIE } : {}),
        Origin: 'https://monev.maganghub.kemnaker.go.id',
        Referer: 'https://monev.maganghub.kemnaker.go.id/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });

    const items = res.data?.data || [];
    console.log(`📦 Ditemukan ${items.length} riwayat absensi dalam rentang ${startDate} s/d ${endDate}.`);

    // Cari catatan untuk tanggal target
    const todayRecord = items.find((item) => item.date === targetDate);

    if (!todayRecord) {
      console.log(`⚠️ Belum ada catatan absensi untuk tanggal ${targetDate}. (Mungkin belum submit/clock-in?)`);
      return;
    }

    const { status, approval_status, reviewed_at } = todayRecord;
    console.log(`📊 Status kehadiran: ${status} | Approval: ${approval_status}`);

    if (approval_status === 'APPROVED' && (!state.notified || state.date !== targetDate)) {
      console.log('🎉 Status APPROVED terdeteksi! Mengirim notifikasi Telegram...');
      
      const formattedReviewTime = reviewed_at
        ? new Date(reviewed_at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
        : '-';

      await sendTelegramNotification(
        `✅ <b>Jurnal & Absensi Disetujui!</b>\n\n` +
        `📅 <b>Tanggal:</b> <code>${targetDate}</code>\n` +
        `📌 <b>Kehadiran:</b> ${status}\n` +
        `⭐ <b>Status Approval:</b> <b>APPROVED</b>\n` +
        `⏰ <b>Waktu Review:</b> ${formattedReviewTime}\n\n` +
        `<i>Mantap, jurnal kamu sudah di-acc mentor! 👍</i>`
      );
      console.log('✅ Notifikasi Telegram sukses terkirim.');

      saveState({
        date: targetDate,
        attendanceId: todayRecord.id,
        status,
        approval_status: 'APPROVED',
        reviewed_at,
        notified: true,
        tokenExpiredWarned: false,
        updatedAt: new Date().toISOString(),
      });
    } else {
      console.log(`⏳ Belum di-approve mentor (status: ${approval_status || 'PENDING'}).`);
      saveState({
        date: targetDate,
        attendanceId: todayRecord.id,
        status,
        approval_status: approval_status || 'PENDING',
        notified: false,
        tokenExpiredWarned: false,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        console.error('❌ Token kedaluwarsa atau tidak valid (HTTP 401/403)! Harap perbarui AUTH_TOKEN.');
        if (!state.tokenExpiredWarned) {
          try {
            await sendTelegramNotification(
              `⚠️ <b>Peringatan Bot Absensi:</b>\nToken MagangHub kamu sudah expired (401 Unauthorized).\nSilakan update <code>AUTH_TOKEN</code> di GitHub Secrets / .env!`
            );
            saveState({ ...state, tokenExpiredWarned: true });
          } catch (_) {}
        }
      } else {
        console.error(`❌ API error (HTTP ${error.response.status}):`, error.response.data || error.message);
      }
    } else {
      console.error('❌ Gagal menghubungi server MagangHub:', error.message);
    }
  }
}

async function main() {
  if (!AUTH_TOKEN || !PARTICIPANT_ID || !TELEGRAM_TOKEN || !CHAT_ID) {
    console.error('❌ Harap lengkapi AUTH_TOKEN, PARTICIPANT_ID, TG_TOKEN, dan TG_CHAT_ID di .env atau GitHub Secrets!');
    process.exit(1);
  }

  const isRunOnce = process.argv.includes('--once') || process.env.GITHUB_ACTIONS === 'true';

  if (isRunOnce) {
    console.log('🚀 Menjalankan mode: Single Run...');
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
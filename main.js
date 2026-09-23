import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { generateJournalDraft } from './ai.js';

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

// Helper: dapatkan jam saat ini dalam WIB (angka 0 - 23)
function getCurrentHourWIB() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatter.format(new Date()), 10);
}

// Helper: cek apakah hari ini adalah hari kerja (Senin - Jumat)
function isWeekdayWIB() {
  const dateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  const day = new Date(dateStr).getDay();
  return day >= 1 && day <= 5;
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

async function sendTelegramNotification(text, targetChatId = CHAT_ID) {
  const tgUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await axios.post(tgUrl, {
    chat_id: targetChatId,
    text,
    parse_mode: 'HTML',
  });
}

// Cek status ke API MagangHub
async function checkStatus(date) {
  const targetDate = date || getTodayWIB();
  const currentHour = getCurrentHourWIB();
  const timeStr = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
  console.log(`[${timeStr} WIB] 🔍 Mengecek status absensi untuk tanggal: ${targetDate}...`);

  const state = loadState();

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

    const todayRecord = items.find((item) => item.date === targetDate);

    // FITUR 2: REMINDER JAM 15:00 WIB (JAM 3 SORE)
    // Jika belum ada record clock-in/jurnal hari ini pada hari kerja dan jam sudah >= 15:00 WIB
    if (!todayRecord) {
      console.log(`⚠️ Belum ada catatan absensi untuk tanggal ${targetDate}.`);
      
      if (isWeekdayWIB() && currentHour >= 15 && currentHour < 18 && state.reminderDate !== targetDate) {
        console.log('⏰ Jam 15:00+ terdeteksi dan jurnal belum diisi. Mengirim reminder Telegram...');
        await sendTelegramNotification(
          `⏰ <b>Pengingat Absensi & Jurnal Magang (Jam 3 Sore)!</b>\n\n` +
          `Halo! Sistem mendeteksi kamu <b>belum mengisi absensi/jurnal</b> untuk hari ini (<code>${targetDate}</code>).\n\n` +
          `💡 <i>Mau dibikinin draf jurnal formal? Balas bot ini dengan:</i>\n` +
          `<code>/draft &lt;kegiatan kamu hari ini&gt;</code>\n\n` +
          `<i>Segera lengkapi sebelum jam kerja berakhir ya! Semangat! 💪</i>`
        );
        state.reminderDate = targetDate;
        saveState(state);
      }
      return;
    }

    const { status, approval_status, reviewed_at } = todayRecord;
    console.log(`📊 Status kehadiran: ${status} | Approval: ${approval_status}`);

    // NOTIFIKASI APPROVAL MENTOR
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

      state.date = targetDate;
      state.attendanceId = todayRecord.id;
      state.status = status;
      state.approval_status = 'APPROVED';
      state.reviewed_at = reviewed_at;
      state.notified = true;
      state.tokenExpiredWarned = false;
      state.updatedAt = new Date().toISOString();
      saveState(state);
    } else {
      console.log(`⏳ Status saat ini: ${approval_status || 'PENDING'}.`);
      state.date = targetDate;
      state.attendanceId = todayRecord.id;
      state.status = status;
      state.approval_status = approval_status || 'PENDING';
      state.tokenExpiredWarned = false;
      state.updatedAt = new Date().toISOString();
      saveState(state);
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
            state.tokenExpiredWarned = true;
            saveState(state);
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

// FITUR 4: TELEGRAM INTERACTIVE LISTENER (/draft, /status, /help)
let lastUpdateId = 0;
async function pollTelegramCommands() {
  const tgUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`;
  try {
    const res = await axios.get(tgUrl, { timeout: 15000 });
    const updates = res.data?.result || [];

    for (const update of updates) {
      lastUpdateId = update.update_id;
      const message = update.message;
      if (!message || !message.text) continue;

      const text = message.text.trim();
      const senderChatId = message.chat.id;

      if (text.startsWith('/start') || text.startsWith('/help')) {
        await sendTelegramNotification(
          `👋 <b>Halo! Asisten Absensi & Jurnal MagangHub siap membantu.</b>\n\n` +
          `Perintah yang tersedia:\n` +
          `• <code>/status</code> - Cek status absensi hari ini\n` +
          `• <code>/draft &lt;kegiatan&gt;</code> - Generate teks jurnal formal otomatis dengan AI\n` +
          `• <code>/help</code> - Menampilkan bantuan ini`,
          senderChatId
        );
      } else if (text.startsWith('/status')) {
        const state = loadState();
        const targetDate = getTodayWIB();
        await sendTelegramNotification(
          `📊 <b>Status Terakhir Absensi:</b>\n\n` +
          `📅 Tanggal: <code>${state.date || targetDate}</code>\n` +
          `📌 Status Approval: <b>${state.approval_status || 'Belum ada data'}</b>\n` +
          `🕒 Terakhir dicek: ${state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : '-'}`,
          senderChatId
        );
      } else if (text.startsWith('/draft')) {
        const rawContent = text.replace(/^\/draft\s*/i, '');
        await sendTelegramNotification('⏳ <i>Sedang meracik draf jurnal formal untukmu...</i>', senderChatId);
        const draft = await generateJournalDraft(rawContent);
        await sendTelegramNotification(
          `📝 <b>Draf Jurnal Magang Kamu:</b>\n\n${draft}\n\n<i>Silakan copy-paste ke portal MagangHub! 👍</i>`,
          senderChatId
        );
      }
    }
  } catch (err) {
    // Abaikan timeout polling getUpdates
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
    console.log(`🚀 Menjalankan mode: Polling Daemon + Interactive Telegram Bot...`);
    console.log(`💡 Ketik /draft <kegiatan> di Telegram untuk tes AI generator kapanpun!`);
    await checkStatus();

    // Loop pengecekan status API MagangHub
    setInterval(async () => {
      await checkStatus();
    }, CHECK_INTERVAL);

    // Loop mendengarkan perintah Telegram
    setInterval(async () => {
      await pollTelegramCommands();
    }, 3000);
  }
}

main();
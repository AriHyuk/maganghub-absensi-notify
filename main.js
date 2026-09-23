import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { generateJournalDraft, generateMorningMotivation } from './ai.js';
import { getMonthlyRekap } from './rekap.js';
import { getGajianReadiness, calculateDaysRemaining } from './gajian.js';

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

function getCurrentHourWIB() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatter.format(new Date()), 10);
}

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

async function sendTelegramNotification(text, targetChatId = CHAT_ID, replyMarkup = null) {
  const tgUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await axios.post(tgUrl, {
    chat_id: targetChatId,
    text,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

// Cek status ke API MagangHub
async function checkStatus(date) {
  const targetDate = date || getTodayWIB();
  const currentHour = getCurrentHourWIB();
  const timeStr = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
  console.log(`[${timeStr} WIB] 🔍 Mengecek status absensi untuk tanggal: ${targetDate}...`);

  const state = loadState();

  // FITUR: ALARM MOTIVASI PAGI JAM 05:00 WIB
  if (currentHour === 5 && state.lastMorningAlarmDate !== targetDate) {
    console.log('🌅 Jam 05:00 WIB terdeteksi! Mengirim salam pagi & motivasi gajian...');
    const daysUntilGajian = calculateDaysRemaining('2026-10-20T16:00:00+07:00');
    const motivationMessage = await generateMorningMotivation(daysUntilGajian);
    await sendTelegramNotification(motivationMessage, CHAT_ID);
    state.lastMorningAlarmDate = targetDate;
    saveState(state);
  }

  // FITUR: ALERT PEMBUKAAN JENDELA PENGAJUAN (20 Oktober Jam 16:00 WIB)
  if (targetDate === '2026-10-20' && currentHour >= 16 && !state.submissionOpenAlertSent) {
    console.log('🚨 Jendela pengajuan uang saku resmi dibuka! Mengirim notifikasi darurat...');
    await sendTelegramNotification(
      `🚨 <b>PERHATIAN: JENDELA PENGAJUAN UANG SAKU RESMI DIBUKA!</b> 💸\n\n` +
      `Periode pengajuan uang saku bulan ini telah dibuka mulai <b>pukul 16:00 WIB hari ini</b>.\n` +
      `⚠️ <b>Batas Akhir:</b> 22 Oktober 2026 pukul 23:59 WIB (HANYA 2 HARI!).\n\n` +
      `Segera hubungi dan ingatkan <b>Mentor</b> kamu untuk mengklik tombol <b>Ajukan Pembayaran</b> di portal MagangHub sekarang juga!`,
      CHAT_ID,
      {
        inline_keyboard: [
          [{ text: '🌐 Buka Portal Uang Saku', url: 'https://monev.maganghub.kemnaker.go.id/dashboard/stipend' }],
        ],
      }
    );
    state.submissionOpenAlertSent = true;
    saveState(state);
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

    const todayRecord = items.find((item) => item.date === targetDate);

    // FITUR: REMINDER JAM 15:00 WIB
    if (!todayRecord) {
      console.log(`⚠️ Belum ada catatan absensi untuk tanggal ${targetDate}.`);
      
      if (isWeekdayWIB() && currentHour >= 15 && currentHour < 18 && state.reminderDate !== targetDate) {
        console.log('⏰ Jam 15:00+ terdeteksi dan jurnal belum diisi. Mengirim reminder Telegram...');
        const reminderText =
          `⚠️ <b>Last call — isi laporan harian sebelum jam 4, jangan ketinggalan!</b>\n` +
          `📅 Tanggal: <code>${targetDate}</code>\n\n` +
          `🔗 <b>Langsung isi di sini:</b>\n` +
          `https://monev.maganghub.kemnaker.go.id/dashboard/riwayat\n\n` +
          `💡 <i>Males mikir kata-katanya? Ketik aja:</i>\n` +
          `<code>/draft &lt;apa yang lo kerjain hari ini&gt;</code>\n` +
          `<i>(Nanti gue yang ubah jadi bahasa korporat formal buat lo copas)</i>`;

        const inlineButton = {
          inline_keyboard: [
            [
              {
                text: '🌐 Buka Portal MagangHub',
                url: 'https://monev.maganghub.kemnaker.go.id/dashboard/riwayat',
              },
            ],
          ],
        };

        await sendTelegramNotification(reminderText, CHAT_ID, inlineButton);
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

// TELEGRAM INTERACTIVE LISTENER
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
          `👋 <b>Halo! Asisten Absensi, Jurnal & Gajian MagangHub siap membantu.</b>\n\n` +
          `Perintah yang tersedia:\n` +
          `• <code>/status</code> - Cek status absensi hari ini\n` +
          `• <code>/rekap</code> - Dashboard statistik bulanan, progress bar & countdown\n` +
          `• <code>/gajian</code> - Tracking kesiapan pengajuan uang saku & blocker mentor\n` +
          `• <code>/draft &lt;kegiatan&gt;</code> - Generate teks jurnal formal 3 bagian resmi\n` +
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
      } else if (text.startsWith('/rekap')) {
        await sendTelegramNotification('📊 <i>Sedang mengkalkulasi rekapitulasi kehadiran...</i>', senderChatId);
        try {
          const rekapText = await getMonthlyRekap(AUTH_TOKEN, COOKIE);
          await sendTelegramNotification(rekapText, senderChatId);
        } catch (e) {
          await sendTelegramNotification(`❌ Gagal memuat rekap: ${e.message}`, senderChatId);
        }
      } else if (text.startsWith('/gajian')) {
        await sendTelegramNotification('💸 <i>Sedang memeriksa kesiapan pengajuan uang saku ke Kemnaker...</i>', senderChatId);
        try {
          const gajianText = await getGajianReadiness(AUTH_TOKEN, COOKIE);
          await sendTelegramNotification(gajianText, senderChatId, {
            inline_keyboard: [
              [{ text: '🌐 Buka Portal Uang Saku', url: 'https://monev.maganghub.kemnaker.go.id/dashboard/stipend' }],
            ],
          });
        } catch (e) {
          await sendTelegramNotification(`❌ Gagal memuat status gajian: ${e.message}`, senderChatId);
        }
      } else if (text.startsWith('/draft')) {
        const rawContent = text.replace(/^\/draft\s*/i, '');
        await sendTelegramNotification('⏳ <i>Sedang meracik draf jurnal formal untukmu...</i>', senderChatId);
        const draft = await generateJournalDraft(rawContent);
        await sendTelegramNotification(
          `📝 <b>Draf Jurnal Magang (Format Resmi):</b>\n\n${draft}\n\n<i>Silakan copy-paste ke portal MagangHub! 👍</i>`,
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
    await checkStatus();

    setInterval(async () => {
      await checkStatus();
    }, CHECK_INTERVAL);

    setInterval(async () => {
      await pollTelegramCommands();
    }, 3000);
  }
}

main();
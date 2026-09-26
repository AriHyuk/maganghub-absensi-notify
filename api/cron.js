import axios from 'axios';
import { generateMorningMotivation } from '../ai.js';
import { calculateDaysRemaining } from '../gajian.js';
import { calculateInternshipProgress } from '../rekap.js';
import { getSession, refreshAccessToken } from '../sessionStore.js';

const TELEGRAM_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;
const PARTICIPANT_ID = process.env.PARTICIPANT_ID || '57aaeb80-9724-4ecd-a89e-e7ad2abbf8ca';

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

async function sendTelegramNotification(text, targetChatId = CHAT_ID, replyMarkup = null) {
  if (!TELEGRAM_TOKEN || !targetChatId) return;
  const tgUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(tgUrl, {
      chat_id: targetChatId,
      text,
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  } catch (err) {
    console.error('❌ Gagal mengirim notifikasi Telegram:', err.message);
  }
}

function getKvCreds() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.REDIS_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.REDIS_REST_API_TOKEN;
  return { url, token };
}

// Baca key dari Vercel KV
async function kvGet(key) {
  const { url, token } = getKvCreds();
  if (!url || !token) return null;
  try {
    const res = await axios.get(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 3000,
    });
    return res.data?.result || null;
  } catch (_) { return null; }
}

// Simpan key ke Vercel KV dengan TTL (detik)
async function kvSet(key, value, exSeconds = 86400) {
  const { url, token } = getKvCreds();
  if (!url || !token) return;
  try {
    await axios.post(`${url}/set/${key}/${encodeURIComponent(value)}`, null, {
      headers: { Authorization: `Bearer ${token}` },
      params: { ex: exSeconds },
      timeout: 3000,
    });
  } catch (_) {}
}

export default async function handler(req, res) {
  const targetDate = getTodayWIB();
  const currentHour = getCurrentHourWIB();
  const timeStr = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
  console.log(`[${timeStr} WIB] ⏰ Vercel Cron triggered untuk tanggal: ${targetDate}, jam: ${currentHour}`);

  const session = await getSession();
  let currentToken = session.token;
  let currentCookie = session.cookie;

  // FITUR 1: ALARM MOTIVASI PAGI JAM 05:00 WIB
  // Pakai window >= 5 && <= 6 supaya tidak miss kalau Vercel sedikit delay
  if (currentHour >= 5 && currentHour <= 6) {
    const alarmKey = `morning_alarm_sent_${targetDate}`;
    const alreadySent = await kvGet(alarmKey);
    if (!alreadySent) {
      console.log('🌅 Alarm pagi terdeteksi! Mengirim motivasi...');
      const daysUntilGajian = calculateDaysRemaining('2026-10-20T16:00:00+07:00');
      const motivationMessage = await generateMorningMotivation(daysUntilGajian);
      await sendTelegramNotification(motivationMessage, CHAT_ID);
      await kvSet(alarmKey, '1', 86400); // lock 24 jam
    } else {
      console.log('⏭️ Alarm pagi sudah dikirim hari ini, skip.');
    }
  }

  // FITUR 2: ALERT PEMBUKAAN JENDELA PENGAJUAN (20 Oktober Jam 16:00 WIB)
  if (targetDate === '2026-10-20' && currentHour >= 16) {
    const alertKey = 'submission_open_alert_sent';
    const alreadySent = await kvGet(alertKey);
    if (!alreadySent) {
      await sendTelegramNotification(
        `🚨 <b>PERHATIAN: JENDELA PENGAJUAN UANG SAKU RESMI DIBUKA!</b> 🚨\n\n` +
        `Periode pengajuan uang saku bulan ini telah dibuka mulai <b>pukul 16:00 WIB hari ini</b>.\n` +
        `⏳ <b>Batas Akhir:</b> 22 Oktober 2026 pukul 23:59 WIB (HANYA 2 HARI!).\n\n` +
        `Segera hubungi dan ingatkan <b>Mentor</b> kamu untuk mengklik tombol <b>Ajukan Pembayaran</b> di portal MagangHub sekarang juga!`,
        CHAT_ID,
        {
          inline_keyboard: [
            [{ text: '🌐 Buka Portal Uang Saku', url: 'https://monev.maganghub.kemnaker.go.id/dashboard/stipend' }],
          ],
        }
      );
      await kvSet(alertKey, '1', 86400 * 3); // lock 3 hari
    }
  }

  if (!currentToken) {
    console.warn('⚠️ Tidak ada token yang tersedia di Database KV.');
    return res.status(200).json({ status: 'no_token', message: 'Token belum disinkronkan' });
  }

  const [year, month, day] = targetDate.split('-').map(Number);
  const startDateObj = new Date(Date.UTC(year, month - 1, day - 7));
  const startDate = startDateObj.toISOString().split('T')[0];
  const endDate = targetDate;

  const apiUrl = `https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances?participant_id=${PARTICIPANT_ID}&start_date=${startDate}&end_date=${endDate}`;

  const doFetch = async (tok, cook) => {
    const bearerHeader = tok.startsWith('Bearer ') ? tok : `Bearer ${tok}`;
    return await axios.get(apiUrl, {
      headers: {
        Authorization: bearerHeader,
        ...(cook ? { Cookie: cook } : {}),
        Origin: 'https://monev.maganghub.kemnaker.go.id',
        Referer: 'https://monev.maganghub.kemnaker.go.id/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });
  };

  try {
    let apiRes;
    try {
      apiRes = await doFetch(currentToken, currentCookie);
    } catch (firstErr) {
      if (firstErr.response?.status === 401 || firstErr.response?.status === 403) {
        console.log('🔄 Token expired (401), mencoba auto-refresh...');
        const refreshed = await refreshAccessToken(currentCookie);
        if (refreshed) {
          currentToken = refreshed.token;
          currentCookie = refreshed.cookie;
          apiRes = await doFetch(currentToken, currentCookie);
        } else {
          throw firstErr;
        }
      } else {
        throw firstErr;
      }
    }

    const items = apiRes.data?.data || [];
    const todayRecord = items.find((item) => item.date === targetDate);
    const progress = calculateInternshipProgress(targetDate);

    // FITUR 3: REMINDER ABSEN JAM 15:00 WIB (dengan deduplication via KV)
    if (!todayRecord) {
      if (isWeekdayWIB() && currentHour >= 15 && currentHour < 23) {
        const reminderKey = `reminder_sent_${targetDate}`;
        const alreadySent = await kvGet(reminderKey);
        if (!alreadySent) {
          console.log('⏰ Jam 15:00+ terdeteksi dan jurnal belum diisi. Mengirim reminder...');
          const reminderText =
            `👤 <b>${progress.name}</b> — <code>${progress.role}</code>\n` +
            `🎯 <b>HARI KE-${progress.currentDay} DARI ${progress.totalDays}</b> (Sisa ${progress.remainingDays} hari · ${progress.batch})\n` +
            `📈 Progress: ${progress.progressBar}\n\n` +
            `⚠️ <b>Last call - isi laporan harian sebelum jam 4, jangan ketinggalan!</b>\n` +
            `📅 Tanggal: <code>${targetDate}</code>\n\n` +
            `🔗 <b>Langsung isi di sini:</b>\n` +
            `https://monev.maganghub.kemnaker.go.id/dashboard/riwayat\n\n` +
            `💡 <i>Males mikir kata-katanya? Ketik aja di bot Telegram:</i>\n` +
            `<code>/draft <apa yang lo kerjain hari ini></code>\n` +
            `<i>(Nanti gue yang ubah jadi bahasa korporat formal buat lo copas)</i>`;

          await sendTelegramNotification(reminderText, CHAT_ID, {
            inline_keyboard: [
              [{ text: '🌐 Buka Portal MagangHub', url: 'https://monev.maganghub.kemnaker.go.id/dashboard/riwayat' }],
            ],
          });
          await kvSet(reminderKey, '1', 86400); // lock 24 jam
        } else {
          console.log('⏭️ Reminder hari ini sudah dikirim, skip.');
        }
      }
      return res.status(200).json({ status: 'ok', attendance: 'none' });
    }

    // FITUR 4: NOTIFIKASI APPROVAL MENTOR (dengan deduplication via KV)
    const { status, approval_status, reviewed_at } = todayRecord;
    if (approval_status === 'APPROVED') {
      const approvedKey = `approved_notif_${targetDate}`;
      const alreadyNotified = await kvGet(approvedKey);
      if (!alreadyNotified) {
        console.log('🎉 Status APPROVED terdeteksi! Mengirim notifikasi...');
        const formattedReviewTime = reviewed_at
          ? new Date(reviewed_at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
          : '-';

        await sendTelegramNotification(
          `🎉 <b>Jurnal & Absensi Disetujui!</b>\n\n` +
          `👤 <b>${progress.name}</b> — <code>${progress.role}</code>\n` +
          `🎯 <b>HARI KE-${progress.currentDay} DARI ${progress.totalDays}</b> (Sisa ${progress.remainingDays} hari · ${progress.batch})\n` +
          `📈 Progress: ${progress.progressBar}\n\n` +
          `📅 <b>Tanggal:</b> <code>${targetDate}</code>\n` +
          `📍 <b>Kehadiran:</b> ${status}\n` +
          `⭐ <b>Status Approval:</b> <b>APPROVED</b>\n` +
          `⏱️ <b>Waktu Review:</b> ${formattedReviewTime}\n\n` +
          `<i>Mantap, jurnal kamu sudah di-acc mentor! 🚀</i>`
        );
        await kvSet(approvedKey, '1', 86400); // lock 24 jam
      } else {
        console.log('⏭️ Notif APPROVED sudah dikirim hari ini, skip.');
      }
    }

    return res.status(200).json({
      status: 'ok',
      attendance: status,
      approval: approval_status,
    });
  } catch (err) {
    console.error('❌ Error cron handler:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

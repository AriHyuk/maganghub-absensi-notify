import axios from 'axios';
import { generateJournalDraft } from '../ai.js';
import { getMonthlyRekap, calculateInternshipProgress } from '../rekap.js';
import { getGajianReadiness } from '../gajian.js';
import { getSession, saveSession } from '../sessionStore.js';

const TELEGRAM_TOKEN = process.env.TG_TOKEN;
const ALLOWED_CHAT_ID = process.env.TG_CHAT_ID;
const PARTICIPANT_ID = process.env.PARTICIPANT_ID;

function getTodayWIB() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

async function sendTelegram(chatId, text, replyMarkup = null) {
  const tgUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await axios.post(tgUrl, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

/**
 * Mencoba merefresh token menggunakan monev_refresh_token yang ada di Cookie
 */
async function refreshAccessToken(currentCookie) {
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
          'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
          'x-frontend-build-id': '5554ff014eccd220f80524df263ae513d8ce1e25-production',
        },
        timeout: 10000,
      }
    );

    const newToken = res.data?.access_token || res.data?.token || res.data?.data?.token;
    if (newToken) {
      console.log('✅ Auto-refresh token BERHASIL!');
      let newCookie = currentCookie;
      const setCookies = res.headers['set-cookie'];
      if (setCookies && setCookies.length > 0) {
        newCookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      }

      await saveSession({ token: newToken, cookie: newCookie });
      return { token: newToken, cookie: newCookie };
    }
  } catch (err) {
    console.error('⚠️ Auto-refresh gagal:', err.response?.data || err.message);
  }
  return null;
}

async function fetchAttendanceData(token, cookie) {
  const today = getTodayWIB();
  const [year, month, day] = today.split('-').map(Number);
  const startDateObj = new Date(Date.UTC(year, month - 1, day - 7));
  const startDate = startDateObj.toISOString().split('T')[0];

  const bearerHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  const url = `https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances?participant_id=${PARTICIPANT_ID}&start_date=${startDate}&end_date=${today}`;

  return await axios.get(url, {
    headers: {
      Authorization: bearerHeader,
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: 'https://monev.maganghub.kemnaker.go.id',
      Referer: 'https://monev.maganghub.kemnaker.go.id/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 10000,
  });
}

async function getMagangStatus() {
  const today = getTodayWIB();
  const session = await getSession();
  let token = session.token;
  let cookie = session.cookie;

  if (!token) {
    return (
      '⚠️ <b>Token Belum Dikonfigurasi:</b>\n' +
      'Kirimkan tokenmu langsung ke chat ini dengan format:\n' +
      '<code>/token &lt;token_jwt_kamu&gt;</code>\n' +
      'Atau gunakan fitur <b>1-Click Sync dari Browser</b>.'
    );
  }

  try {
    let res;
    try {
      res = await fetchAttendanceData(token, cookie);
    } catch (firstErr) {
      if (firstErr.response?.status === 401 || firstErr.response?.status === 403) {
        console.log('⚠️ Token expired (401), mencoba auto-refresh...');
        const refreshed = await refreshAccessToken(cookie);
        if (refreshed) {
          token = refreshed.token;
          cookie = refreshed.cookie;
          res = await fetchAttendanceData(token, cookie);
        } else {
          throw firstErr;
        }
      } else {
        throw firstErr;
      }
    }

    const items = res.data?.data || [];
    const todayRecord = items.find((i) => i.date === today);

    if (!todayRecord) {
      const day = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getDay();
      if (day === 0 || day === 6) {
        return `📅 <b>Tanggal:</b> <code>${today}</code>\n🏖️ <i>Hari ini libur weekend bosku, selamat menikmati hari santai! (Tidak ada kewajiban absen)</i>`;
      }
      return `📅 <b>Tanggal:</b> <code>${today}</code>\n⚠️ <i>Belum ada catatan absensi/jurnal hari ini (Belum clock-in).</i>`;
    }

    const reviewTime = todayRecord.reviewed_at
      ? new Date(todayRecord.reviewed_at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
      : '-';

    return (
      `📅 <b>Tanggal:</b> <code>${today}</code>\n` +
      `📌 <b>Kehadiran:</b> ${todayRecord.status}\n` +
      `⭐ <b>Approval:</b> <b>${todayRecord.approval_status}</b>\n` +
      `⏰ <b>Waktu Review:</b> ${reviewTime}`
    );
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      return (
        '❌ <b>Sesi MagangHub Kedaluwarsa (401 Unauthorized):</b>\n\n' +
        '👉 <b>Cara paling cepat memperbarui (Pilih salah satu):</b>\n' +
        '1. <b>1-Klik Browser:</b> Buka <a href="https://maganghub-absensi-notify.vercel.app">Halaman Sync Bookmarklet</a> lalu klik bookmark saat buka web Kemnaker.\n' +
        '2. <b>Chat Bot:</b> Copas token Bearer langsung ke chat ini dengan perintah <code>/token &lt;token&gt;</code>!'
      );
    }
    return `❌ <b>Gagal cek status:</b> ${err.message}`;
  }
}

async function handleRekap() {
  const session = await getSession();
  let token = session.token;
  let cookie = session.cookie;

  try {
    try {
      return await getMonthlyRekap(token, cookie);
    } catch (firstErr) {
      if (firstErr.response?.status === 401 || firstErr.response?.status === 403) {
        const refreshed = await refreshAccessToken(cookie);
        if (refreshed) {
          return await getMonthlyRekap(refreshed.token, refreshed.cookie);
        }
      }
      throw firstErr;
    }
  } catch (err) {
    return `❌ <b>Gagal memuat rekap:</b> ${err.response?.data?.message || err.message}`;
  }
}

async function handleGajian() {
  const session = await getSession();
  let token = session.token;
  let cookie = session.cookie;

  try {
    try {
      return await getGajianReadiness(token, cookie);
    } catch (firstErr) {
      if (firstErr.response?.status === 401 || firstErr.response?.status === 403) {
        const refreshed = await refreshAccessToken(cookie);
        if (refreshed) {
          return await getGajianReadiness(refreshed.token, refreshed.cookie);
        }
      }
      throw firstErr;
    }
  } catch (err) {
    return `❌ <b>Gagal memuat status gajian:</b> ${err.response?.data?.message || err.message}`;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'MagangHub Bot Vercel Webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const update = req.body;
  const message = update?.message;

  if (!message || !message.text) {
    return res.status(200).json({ ok: true });
  }

  const senderChatId = message.chat.id;
  const text = message.text.trim();

  // Proteksi keamanan: hanya tanggapi owner bot
  if (ALLOWED_CHAT_ID && String(senderChatId) !== String(ALLOWED_CHAT_ID)) {
    await sendTelegram(senderChatId, '⛔ Maaf, bot ini diset khusus untuk pemiliknya.');
    return res.status(200).json({ ok: true });
  }

  try {
    if (text.startsWith('/start') || text.startsWith('/help')) {
      await sendTelegram(
        senderChatId,
        `👋 <b>Halo! Asisten Absensi, Jurnal & Gajian MagangHub siap membantu 24/7.</b>\n\n` +
        `Perintah yang tersedia:\n` +
        `• <code>/status</code> - Cek status kehadiran & persetujuan hari ini\n` +
        `• <code>/rekap</code> - Dashboard statistik bulanan, progress bar & countdown\n` +
        `• <code>/gajian</code> - Tracking kesiapan pengajuan uang saku & blocker mentor\n` +
        `• <code>/draft &lt;kegiatan&gt;</code> - Generate narasi jurnal formal (3 bagian resmi)\n` +
        `• <code>/token &lt;token&gt;</code> - Update token sesi MagangHub langsung dari chat\n` +
        `• <code>/sync</code> - Panduan sinkronisasi 1-klik dari browser\n` +
        `• <code>/help</code> - Panduan bantuan`
      );
    } else if (text.startsWith('/status')) {
      await sendTelegram(senderChatId, '🔍 <i>Sedang mengambil data absensi terbaru dari MagangHub...</i>');
      const statusText = await getMagangStatus();
      await sendTelegram(senderChatId, `📊 <b>Status Absensi MagangHub:</b>\n\n${statusText}`);
    } else if (text.startsWith('/rekap')) {
      await sendTelegram(senderChatId, '📊 <i>Sedang mengkalkulasi rekapitulasi kehadiran dan progress magang...</i>');
      const rekapText = await handleRekap();
      await sendTelegram(senderChatId, rekapText);
    } else if (text.startsWith('/gajian')) {
      await sendTelegram(senderChatId, '💸 <i>Sedang memeriksa kesiapan pengajuan uang saku ke server Kemnaker...</i>');
      const gajianText = await handleGajian();
      const inlineButton = {
        inline_keyboard: [
          [
            {
              text: '🌐 Buka Portal Uang Saku MagangHub',
              url: 'https://monev.maganghub.kemnaker.go.id/dashboard/stipend',
            },
          ],
        ],
      };
      await sendTelegram(senderChatId, gajianText, inlineButton);
    } else if (text.startsWith('/token') || (text.startsWith('eyJ') && text.length > 100)) {
      const rawToken = text.replace(/^\/token\s*/i, '').trim();
      if (!rawToken) {
        await sendTelegram(
          senderChatId,
          '⚠️ <b>Format salah:</b>\nKetik: <code>/token &lt;token_jwt_kamu&gt;</code>\n\n<i>Atau cukup copas langsung token JWT yang diawali eyJ... ke chat ini.</i>'
        );
      } else {
        await saveSession({ token: rawToken });
        await sendTelegram(
          senderChatId,
          '✅ <b>Token Berhasil Diperbarui!</b> 🎉\n\n' +
          'Sesi MagangHub kamu sekarang aktif. Silakan tes dengan mengetik <code>/status</code> atau <code>/gajian</code>!'
        );
      }
    } else if (text.startsWith('/cookie')) {
      const rawCookie = text.replace(/^\/cookie\s*/i, '').trim();
      if (!rawCookie) {
        await sendTelegram(senderChatId, '⚠️ Format salah. Ketik: <code>/cookie &lt;cookie_string&gt;</code>');
      } else {
        await saveSession({ cookie: rawCookie });
        await sendTelegram(senderChatId, '✅ <b>Cookie Berhasil Diperbarui!</b> 🎉');
      }
    } else if (text.startsWith('/sync')) {
      await sendTelegram(
        senderChatId,
        `⚡ <b>Sinkronisasi 1-Klik dari Browser:</b>\n\n` +
        `Gak perlu lagi buka Vercel! Cukup pasang bookmarklet 1-klik di browser kamu:\n` +
        `🌐 Buka: <a href="https://maganghub-absensi-notify.vercel.app">https://maganghub-absensi-notify.vercel.app</a>\n\n` +
        `Tarik tombol <b>🚀 Sync MagangHub Bot</b> ke Bookmark Bar browsermu. Setiap kali buka web Kemnaker, cukup klik tombol itu sekali!`
      );
    } else if (text.startsWith('/draft')) {
      const rawContent = text.replace(/^\/draft\s*/i, '');
      await sendTelegram(senderChatId, '⏳ <i>Sedang meracik draf jurnal formal dengan Gemini AI...</i>');
      const draft = await generateJournalDraft(rawContent);
      await sendTelegram(
        senderChatId,
        `📝 <b>Draf Jurnal Magang (Format Resmi):</b>\n\n${draft}\n\n<i>Silakan copy-paste ke portal MagangHub! 👍</i>`
      );
    } else {
      await sendTelegram(
        senderChatId,
        'Perintah tidak dikenali. Ketik <code>/status</code>, <code>/rekap</code>, <code>/gajian</code>, <code>/token &lt;jwt&gt;</code>, atau <code>/draft &lt;kegiatan&gt;</code>.'
      );
    }
  } catch (error) {
    console.error('Error handling webhook:', error);
    try {
      await sendTelegram(senderChatId, `❌ Terjadi kesalahan pada server bot: ${error.message}`);
    } catch (_) {}
  }

  return res.status(200).json({ ok: true });
}


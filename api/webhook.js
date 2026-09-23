import axios from 'axios';
import { generateJournalDraft } from '../ai.js';

const TELEGRAM_TOKEN = process.env.TG_TOKEN;
const ALLOWED_CHAT_ID = process.env.TG_CHAT_ID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const PARTICIPANT_ID = process.env.PARTICIPANT_ID;
const COOKIE = process.env.COOKIE;

function getTodayWIB() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

async function sendTelegram(chatId, text) {
  const tgUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await axios.post(tgUrl, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  });
}

async function getMagangStatus() {
  const today = getTodayWIB();
  const [year, month, day] = today.split('-').map(Number);
  const startDateObj = new Date(Date.UTC(year, month - 1, day - 7));
  const startDate = startDateObj.toISOString().split('T')[0];

  const bearerHeader = AUTH_TOKEN?.startsWith('Bearer ') ? AUTH_TOKEN : `Bearer ${AUTH_TOKEN}`;
  const url = `https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances?participant_id=${PARTICIPANT_ID}&start_date=${startDate}&end_date=${today}`;

  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: bearerHeader,
        ...(COOKIE ? { Cookie: COOKIE } : {}),
        Origin: 'https://monev.maganghub.kemnaker.go.id',
        Referer: 'https://monev.maganghub.kemnaker.go.id/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    const items = res.data?.data || [];
    const todayRecord = items.find((i) => i.date === today);

    if (!todayRecord) {
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
      return '❌ <b>Gagal cek status:</b> Token MagangHub kamu sudah expired (401). Silakan perbarui <code>AUTH_TOKEN</code>!';
    }
    return `❌ <b>Gagal cek status:</b> ${err.message}`;
  }
}

export default async function handler(req, res) {
  // Health check endpoint
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
        `👋 <b>Halo! Asisten Absensi & Jurnal MagangHub siap membantu 24/7 di Vercel.</b>\n\n` +
        `Perintah yang tersedia:\n` +
        `• <code>/status</code> - Cek status kehadiran & persetujuan hari ini\n` +
        `• <code>/draft &lt;kegiatan&gt;</code> - Generate narasi jurnal formal dengan AI\n` +
        `• <code>/help</code> - Panduan bantuan`
      );
    } else if (text.startsWith('/status')) {
      await sendTelegram(senderChatId, '🔍 <i>Sedang mengambil data absensi terbaru dari MagangHub...</i>');
      const statusText = await getMagangStatus();
      await sendTelegram(senderChatId, `📊 <b>Status Absensi MagangHub:</b>\n\n${statusText}`);
    } else if (text.startsWith('/draft')) {
      const rawContent = text.replace(/^\/draft\s*/i, '');
      await sendTelegram(senderChatId, '⏳ <i>Sedang meracik draf jurnal formal dengan Gemini AI...</i>');
      const draft = await generateJournalDraft(rawContent);
      await sendTelegram(
        senderChatId,
        `📝 <b>Draf Jurnal Magang:</b>\n\n${draft}\n\n<i>Silakan copy-paste ke portal MagangHub! 👍</i>`
      );
    } else {
      await sendTelegram(
        senderChatId,
        'Perintah tidak dikenali. Ketik <code>/status</code> untuk cek absensi atau <code>/draft &lt;kegiatan&gt;</code> untuk buat draf jurnal.'
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

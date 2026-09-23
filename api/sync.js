import axios from 'axios';
import { saveSession } from '../sessionStore.js';

const TELEGRAM_TOKEN = process.env.TG_TOKEN;
const ALLOWED_CHAT_ID = process.env.TG_CHAT_ID;

async function sendTelegram(chatId, text) {
  if (!TELEGRAM_TOKEN || !chatId) return;
  const tgUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(tgUrl, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch (e) {
    console.error('Failed to send Telegram notification:', e.message);
  }
}

export default async function handler(req, res) {
  // Setup CORS headers agar browser di monev.maganghub.kemnaker.go.id bisa POST langsung
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token, cookie } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    await saveSession({ token, cookie });
    console.log('✅ Token berhasil disinkronkan via /api/sync!');

    if (ALLOWED_CHAT_ID) {
      await sendTelegram(
        ALLOWED_CHAT_ID,
        `✅ <b>Sesi MagangHub Berhasil Disinkronkan dari Browser!</b> 🚀\n\n` +
        `Token aktif baru telah disimpan ke sistem bot. Sekarang kamu bisa cek <code>/status</code>, <code>/gajian</code>, atau <code>/rekap</code> langsung di Telegram tanpa kendala!`
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Sesi MagangHub berhasil disinkronkan ke bot Telegram.',
    });
  } catch (error) {
    console.error('Error on /api/sync:', error);
    return res.status(500).json({ error: error.message });
  }
}

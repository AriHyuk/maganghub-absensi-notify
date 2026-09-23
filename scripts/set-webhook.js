import 'dotenv/config';
import axios from 'axios';

const TELEGRAM_TOKEN = process.env.TG_TOKEN;
const vercelUrl = process.argv[2];

if (!vercelUrl) {
  console.error('❌ Harap masukkan URL Vercel kamu!\nContoh: node scripts/set-webhook.js https://nama-project.vercel.app');
  process.exit(1);
}

const cleanedUrl = vercelUrl.replace(/\/+$/, '');
const webhookUrl = `${cleanedUrl}/api/telegram`;

async function main() {
  console.log(`🔗 Mendaftarkan webhook Telegram ke: ${webhookUrl}`);
  try {
    const res = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
    );
    if (res.data?.ok) {
      console.log('✅ Webhook BERHASIL didaftarkan!');
      console.log('🎉 Sekarang bot Telegram kamu sudah terhubung ke Vercel 24/7.');
    } else {
      console.error('⚠️ Respon Telegram:', res.data);
    }
  } catch (err) {
    console.error('❌ Gagal set webhook:', err.response?.data || err.message);
  }
}

main();

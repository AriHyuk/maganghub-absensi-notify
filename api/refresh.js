import axios from 'axios';
import { getSession, saveSession } from '../sessionStore.js';

export default async function handler(req, res) {
  console.log('🔄 Menjalankan proactive keep-alive refresh token...');
  const session = await getSession();
  const currentCookie = session.cookie;

  if (!currentCookie) {
    return res.status(400).json({ error: 'Cookie belum tersedia di storage.' });
  }

  try {
    const refreshRes = await axios.post(
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

    const newToken = refreshRes.data?.access_token || refreshRes.data?.token || refreshRes.data?.data?.token;
    if (newToken) {
      let newCookie = currentCookie;
      const setCookies = refreshRes.headers['set-cookie'];
      if (setCookies && setCookies.length > 0) {
        newCookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      }

      await saveSession({ token: newToken, cookie: newCookie });
      console.log('✅ Proactive token refresh BERHASIL dan tersimpan ke persistent storage!');
      return res.status(200).json({
        ok: true,
        message: 'Sesi berhasil diperpanjang 30 hari ke depan dan disimpan ke storage.',
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('❌ Proactive refresh gagal:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || err.message,
    });
  }

  return res.status(500).json({ error: 'Gagal mendapatkan token baru.' });
}

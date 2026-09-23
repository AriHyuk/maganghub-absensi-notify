import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'qwen/qwen3.8-27b:free';

const SYSTEM_PROMPT = `
Kamu adalah asisten profesional yang bertugas membantu peserta MagangHub Kemnaker menulis jurnal harian/logbook kegiatan magang.

Ubahlah catatan kegiatan kasar dari user menjadi deskripsi jurnal magang yang formal, terstruktur, profesional, dan menggunakan Bahasa Indonesia baku (EYD).
Hindari kata-kata informal/slang, gunakan kata kerja operasional (seperti: Mengimplementasikan, Melakukan analisis, Menyusun, Mengidentifikasi, dsb).

Format output yang diinginkan:
1. Ringkasan Aktivitas (1-2 kalimat padat dan formal)
2. Rincian Poin Kegiatan (3-4 butir poin kegiatan teknis/operasional)
3. Hasil / Capaian (1 kalimat pencapaian hari ini)

Output HANYA teks jurnal dalam format markdown bersih tanpa kata pembuka/penutup.
`;

/**
 * Panggil AI via Google Gemini API
 */
async function callGemini(rawInput) {
  if (!GEMINI_API_KEY) return null;
  const prompt = `${SYSTEM_PROMPT}\n\nCatatan Kasar Pengguna:\n"${rawInput}"`;
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    },
    { timeout: 15000 }
  );
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

/**
 * Panggil AI via OpenRouter API
 */
async function callOpenRouter(rawInput) {
  if (!OPENROUTER_API_KEY) return null;
  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Catatan Kegiatan Kasar:\n"${rawInput}"` },
      ],
      temperature: 0.3,
      max_tokens: 600,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://github.com/AriHyuk/maganghub-absensi-notify',
        'X-Title': 'MagangHub Absensi Bot',
      },
      timeout: 15000,
    }
  );
  return res.data?.choices?.[0]?.message?.content?.trim();
}

/**
 * Generate narasi jurnal formal MagangHub Kemnaker berdasarkan catatan kasar user.
 * Prioritas: Gemini 2.5 Flash -> OpenRouter -> Fallback Template
 * @param {string} rawInput - Catatan kegiatan harian santai dari user
 * @returns {Promise<string>} - Hasil narasi jurnal formal siap copas
 */
export async function generateJournalDraft(rawInput) {
  if (!rawInput || rawInput.trim().length === 0) {
    return 'Silakan sertakan kegiatan kamu, contoh: <code>/draft benerin bug login dan riset api</code>';
  }

  // 1. Prioritas Utama: Gemini 2.5 Flash (Sangat stabil, cepat, kuota besar)
  if (GEMINI_API_KEY) {
    try {
      console.log(`🤖 Menghasilkan draf via Gemini Direct (${GEMINI_MODEL})...`);
      const result = await callGemini(rawInput);
      if (result) return result;
    } catch (err) {
      console.warn('⚠️ Gemini API error, mencoba alternatif:', err.response?.data?.error?.message || err.message);
    }
  }

  // 2. Alternatif: OpenRouter
  if (OPENROUTER_API_KEY) {
    try {
      console.log(`🤖 Menghasilkan draf via OpenRouter (${OPENROUTER_MODEL})...`);
      const result = await callOpenRouter(rawInput);
      if (result) return result;
    } catch (err) {
      console.warn('⚠️ OpenRouter error / limit:', err.response?.data?.error?.message || err.message);
    }
  }

  // 3. Fallback jika kedua API offline
  const capitalized = rawInput.charAt(0).toUpperCase() + rawInput.slice(1);
  return (
    `📌 <b>Draf Jurnal Harian:</b>\n\n` +
    `• Melakukan pelaksanaan dan penyelesaian tugas harian terkait: ${capitalized}.\n` +
    `• Berkoordinasi dengan tim/mentor mengenai progres dan evaluasi hasil kerja.\n` +
    `• Memastikan seluruh dokumentasi dan catatan teknis tercatat dengan baik.\n\n` +
    `<i>(Dibuat dengan template otomatis bot).</i>`
  );
}

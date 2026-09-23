import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'qwen/qwen3.8-27b:free';

const SYSTEM_PROMPT = `
Kamu adalah asisten profesional yang bertugas membantu peserta MagangHub Kemnaker menulis jurnal harian/logbook kegiatan magang sesuai formulir resmi portal MagangHub Kemnaker.

Ubahlah catatan kegiatan kasar dari user menjadi deskripsi jurnal magang yang formal, terstruktur, profesional, dan menggunakan Bahasa Indonesia baku (EYD).
Hindari kata-kata informal/slang, gunakan kata kerja operasional (seperti: Mengimplementasikan, Melakukan analisis, Menyusun, Mengidentifikasi, dsb).

WAJIB ikuti format resmi 3 bagian berikut secara persis:

1. Uraian Aktivitas
(Jelaskan kegiatan teknis/operasional yang dikerjakan hari ini secara jelas, terstruktur dalam 2-4 poin ringkas)

2. Pembelajaran yang Diperoleh
(Jelaskan insight, keterampilan baru, pemahaman sistem, atau pelajaran kerja yang didapatkan dari aktivitas tersebut)

3. Kendala yang Dialami
(Jelaskan kendala teknis/tantangan yang dihadapi serta solusi penyelesaiannya. Jika dari catatan user tidak tampak kendala fatal, jelaskan tantangan kecil yang berhasil diatasi atau tuliskan bahwa kegiatan berjalan lancar dengan koordinasi tim yang baik).

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
      max_tokens: 1000,
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
 * Format Resmi:
 * 1. Uraian Aktivitas
 * 2. Pembelajaran yang Diperoleh
 * 3. Kendala yang Dialami
 * @param {string} rawInput - Catatan kegiatan harian santai dari user
 * @returns {Promise<string>} - Hasil narasi jurnal formal siap copas
 */
export async function generateJournalDraft(rawInput) {
  if (!rawInput || rawInput.trim().length === 0) {
    return 'Silakan sertakan kegiatan kamu, contoh: <code>/draft benerin bug login dan riset api</code>';
  }

  // 1. Prioritas Utama: Gemini 2.5 Flash
  if (GEMINI_API_KEY) {
    try {
      console.log(`🤖 Menghasilkan draf resmi Kemnaker via Gemini (${GEMINI_MODEL})...`);
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

  // 3. Fallback jika kedua API offline (Tetap sesuai format 3 bagian resmi)
  const capitalized = rawInput.charAt(0).toUpperCase() + rawInput.slice(1);
  return (
    `<b>1. Uraian Aktivitas</b>\n` +
    `• Melaksanakan penyelesaian tugas teknis terkait: ${capitalized}.\n` +
    `• Melakukan pengujian fungsional serta validasi data dari hasil pekerjaan.\n` +
    `• Berkoordinasi dengan mentor dan tim terkait progres kegiatan hari ini.\n\n` +
    `<b>2. Pembelajaran yang Diperoleh</b>\n` +
    `• Memahami alur kerja implementasi sistem dan teknik pemecahan masalah secara lebih sistematis dan terstruktur.\n\n` +
    `<b>3. Kendala yang Dialami</b>\n` +
    `• Tidak ada kendala teknis yang signifikan; seluruh tugas dapat diselesaikan dengan baik melalui koordinasi aktif.`
  );
}

import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();

/**
 * Generate narasi jurnal formal MagangHub Kemnaker berdasarkan catatan kasar user.
 * @param {string} rawInput - Catatan kegiatan harian santai dari user
 * @returns {Promise<string>} - Hasil narasi jurnal formal siap copas
 */
export async function generateJournalDraft(rawInput) {
  if (!rawInput || rawInput.trim().length === 0) {
    return 'Silakan sertakan kegiatan kamu, contoh: <code>/draft benerin bug login dan riset api</code>';
  }

  // Jika user menyertakan GEMINI_API_KEY, gunakan Google Gemini API
  if (GEMINI_API_KEY) {
    try {
      const prompt = `
Kamu adalah asisten profesional yang bertugas membantu peserta MagangHub Kemnaker menulis jurnal harian/logbook kegiatan magang.

Ubahlah catatan kegiatan kasar berikut menjadi deskripsi jurnal magang yang formal, terstruktur, profesional, dan menggunakan Bahasa Indonesia baku (EYD).
Hindari kata-kata informal/slang, gunakan kata kerja operasional (seperti: Mengimplementasikan, Melakukan analisis, Menyusun, Mengidentifikasi, dsb).

Format output yang diinginkan:
1. Ringkasan Aktivitas (1-2 kalimat padat dan formal)
2. Rincian Poin Kegiatan (3-4 butir poin kegiatan teknis/operasional)
3. Hasil / Capaian (1 kalimat pencapaian hari ini)

Catatan Kasar Pengguna:
"${rawInput}"

Output HANYA teks jurnal dalam format markdown bersih tanpa kata pembuka/penutup.
`;

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          },
        },
        { timeout: 15000 }
      );

      const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (aiText) {
        return aiText.trim();
      }
    } catch (err) {
      console.warn('⚠️ Gemini API error, beralih ke fallback template:', err.message);
    }
  }

  // Fallback profesional jika tidak ada API key
  const capitalized = rawInput.charAt(0).toUpperCase() + rawInput.slice(1);
  return (
    `📌 <b>Draf Jurnal Harian:</b>\n\n` +
    `• Melakukan pelaksanaan dan penyelesaian tugas harian terkait: ${capitalized}.\n` +
    `• Berkoordinasi dengan tim/mentor mengenai progres dan evaluasi hasil kerja.\n` +
    `• Memastikan seluruh dokumentasi dan catatan teknis tercatat dengan baik.\n\n` +
    `<i>(Tips: Tambahkan GEMINI_API_KEY di .env atau GitHub Secrets untuk hasil AI yang lebih detail).</i>`
  );
}

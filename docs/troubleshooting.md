# 🛠️ Troubleshooting Guide: Telegram Bot & Vercel Cron

Dokumen ini berisi catatan *post-mortem* dan panduan *troubleshooting* dari kasus dimana notifikasi Telegram (seperti Reminder Absen) **gagal terkirim secara diam-diam (silent failure)** meskipun cron job di Vercel berjalan dengan status 200 OK.

## ⚠️ Kasus yang Terjadi (September 2026)
1. **Gejala:** Cron job Vercel berjalan otomatis jam 15:00 WIB, API mengembalikan status `200 OK`, log menunjukkan "Mengirim reminder...", tapi pesan tidak pernah masuk ke Telegram.
2. **Kendala Debugging:** Vercel Cron tidak menampilkan error di layar saat dipanggil secara manual, dan Vercel KV (database Redis) terlanjur mengunci status menjadi `alreadySent = true`, sehingga percobaan berikutnya otomatis di-*skip*.

## 🔍 Akar Masalah (Root Cause)
Setelah ditelusuri, masalahnya bukan pada token atau Vercel, melainkan:
1. **Telegram API Error (Bad Request - can't parse entities):** 
   Pesan mengandung string `<apa yang lo kerjain hari ini>`. Telegram (yang di-set menggunakan `parse_mode: 'HTML'`) mengira ini adalah tag HTML `<apa>` yang tidak valid, sehingga API Telegram menolak pesan tersebut.
2. **Error Tersembunyi (Swallowed Error):** 
   Fungsi `sendTelegramNotification` menggunakan `try...catch`. Saat axios melempar error, error hanya di-print menggunakan `console.error` dan fungsi tidak me-return status gagal.
3. **Premature Caching (Locking):** 
   Kode langsung mengeksekusi `kvSet(reminderKey, '1', 86400)` setelah memanggil fungsi pengirim pesan, TANPA mengecek apakah pesan benar-benar sukses terkirim. Akibatnya, meskipun Telegram gagal mengirim, sistem menganggap sudah sukses dan memblokir pengiriman berikutnya.

---

## 🛠️ Cara Mencegah & Memperbaiki di Masa Depan

### 1. Jangan Gunakan Karakter `<` atau `>` Sembarangan
Jika mengirim pesan menggunakan `parse_mode: 'HTML'`, **hindari penggunaan angle brackets (`<` atau `>`)** untuk teks biasa (contoh: *placeholder*). Gunakan kurung siku `[` dan `]` atau *escape characters* (`&lt;` dan `&gt;`).

- ❌ Salah: `Ketik /draft <pekerjaanmu>` (Telegram akan crash)
- ✅ Benar: `Ketik /draft [pekerjaanmu]`

### 2. Tangkap & Return Pesan Error dari Telegram
Jika fungsi bot API gagal, error HTTP-nya harus diekstrak agar kita tahu persis di mana salahnya.
```javascript
// Di dalam sendTelegramNotification:
try {
  await axios.post(tgUrl, { ... });
  return 'Success';
} catch (err) {
  const errMsg = err.response?.data?.description || err.message;
  console.error('❌ Gagal mengirim notifikasi Telegram:', errMsg);
  return errMsg; // <- PENTING: Return errornya agar bisa dibaca pemanggil
}
```

### 3. Hanya Kunci Cache Jika Benar-Benar Sukses (Strict Deduplication)
Jangan me-lock Vercel KV (atau database apapun) sebelum memastikan bahwa pengiriman dari pihak ke-3 (Telegram API) benar-benar mengembalikan status sukses.
```javascript
const tgResult = await sendTelegramNotification(text, CHAT_ID);
if (tgResult === 'Success') {
  await kvSet(reminderKey, '1', 86400); // Lock hanya jika sukses!
} else {
  // Biarkan terbuka agar bisa dicoba ulang (retry)
  console.error('Batal lock cache karena pengiriman gagal:', tgResult);
}
```

### 4. Teknik Debugging Endpoint Vercel Serverless
Kalau API Vercel lo gagal tapi statusnya `200 OK` (seperti cron), tambahkan *payload debug* yang me-return *environment variables* (tanpa mengekspos token) dan pesan error terakhir, lalu pasang di fitur **early return**.

```javascript
// Contoh payload debug
return res.status(200).json({ 
  status: 'ok',
  debug: {
    has_tg_token: !!TELEGRAM_TOKEN,
    has_chat_id: !!CHAT_ID,
    telegram_error: tgResult
  }
});
```

Dengan langkah di atas, jika bot kembali *silent*, panggil endpoint `/api/cron` secara manual di browser dan baca key `telegram_error` pada file JSON yang muncul.

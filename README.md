# 🤖 MagangHub Absensi, Jurnal & Uang Saku Notification Bot

Bot cerdas serba otomatis untuk memantau status persetujuan (*approval*) jurnal & absensi harian pada portal **MagangHub Kemnaker** (`monev.maganghub.kemnaker.go.id`), dilengkapi **Tracking Kesiapan Uang Saku / Gaji**, **Self-Healing Auto-Refresh Sesi**, **Alarm Semangat Pagi Jam 5**, **Pengingat Jam 3 Sore**, **AI Jurnal Generator**, dan dukungan **Vercel Serverless Webhook 24/7**.

---

## ✨ Fitur Utama

1. **🔔 Approval Notification (Real-time)**:
   - Notifikasi instan ke Telegram saat jurnal & absensi kamu di-approve mentor.
   - Dilengkapi *state caching* anti-spam (hanya 1 notif per hari).

2. **💸 Tracking Uang Saku & Periode Klaim (`/gajian`)**:
   - Memantau kesiapan pengajuan uang saku bulanan langsung dari endpoint resmi Kemnaker.
   - Menampilkan status persyaratan (rekening bank & PKS), hitung mundur waktu pembukaan sistem pengajuan klaim, serta rincian kendala (*blockers*) bila ada absensi/jurnal yang belum disetujui.

3. **🔄 Self-Healing Session & Dynamic Store**:
   - Sistem membaca sesi secara dinamis dari **Vercel KV / Upstash Redis** $\rightarrow$ `.state.json` $\rightarrow$ `.env`.
   - **Auto-Refresh Otomatis**: Jika token expired saat bot berjalan (HTTP 401/403), bot otomatis mencoba refresh token baru di latar belakang tanpa mengganggu jalannya bot.

4. **🌅 Alarm Semangat Pagi (Jam 05:00 WIB)**:
   - Setiap pagi pukul 05:00 WIB, bot menyapa dengan kata motivasi ceria & jenaka dari AI plus hitung mundur menuju tanggal pembukaan klaim uang saku.

5. **⏰ Reminder Jam 15:00 WIB (Jam 3 Sore)**:
   - Setiap hari kerja (Senin-Jumat) pukul 15:00 WIB, bot otomatis memeriksa apakah kamu sudah mengisi jurnal/absensi hari ini.
   - Disertai tautan langsung ke portal dan tombol praktis agar tidak terlewat sebelum jam kerja usai.

6. **✍️ AI Jurnal Generator (Interaktif 24/7 di Vercel)**:
   - Chat langsung ke bot Telegram: `<b>/draft <aktivitas kasar kamu></b>`
   - Draf otomatis disusun dalam 3 format baku portal Kemnaker:
     1. **Uraian Aktivitas**
     2. **Pembelajaran yang Diperoleh**
     3. **Kendala yang Dialami**
   - Didukung **Google Gemini 2.5 Flash** (dengan fallback **OpenRouter**).

7. **📊 Cek Status & Rekap Kapan Saja**:
   - Kirim `/status` atau `/rekap` di Telegram untuk melihat riwayat kehadiran, persetujuan mentor, dan progress bar magang secara instan.

---

## 🔑 Persiapan Credentials

### 1. Telegram Bot Token (`TG_TOKEN`) & Chat ID (`TG_CHAT_ID`)
- Buat bot di [@BotFather](https://t.me/BotFather) untuk mendapatkan `TG_TOKEN`.
- Cek ID akun Telegram kamu di [@userinfobot](https://t.me/userinfobot) untuk mendapatkan `TG_CHAT_ID`.
- Klik **Start** pada bot kamu agar bot memiliki izin mengirimkan pesan.

### 2. Bearer Token (`AUTH_TOKEN`), `PARTICIPANT_ID`, `SCHEDULE_ID` & `COOKIE`
- Buka browser dan login ke portal [monev.maganghub.kemnaker.go.id](https://monev.maganghub.kemnaker.go.id).
- Cukup gunakan salah satu metode sinkronisasi otomatis di bawah tanpa perlu inspect element manual.
- Data ID:
  - `PARTICIPANT_ID`: ID peserta magang kamu di MagangHub.
  - `SCHEDULE_ID`: ID jadwal batch magang.
  - `PERIOD_START`: Tanggal awal periode magang berjalan (contoh: `2026-09-21`).

### 3. AI Key (`GEMINI_API_KEY` / `OPENROUTER_API_KEY`)
- **`GEMINI_API_KEY`** *(Recommended)*: Dapatkan gratis di [Google AI Studio](https://aistudio.google.com/app/apikey). Kuota 1.500 request/hari gratis tanpa biaya.
- **`OPENROUTER_API_KEY`** *(Opsional)*: Dari [OpenRouter](https://openrouter.ai/keys) jika ingin menggunakan model alternatif.

---

## ⚡ Cara Sinkronisasi Token (Zero Inspect Element!)

Kamu punya 3 cara super mudah untuk memperbarui token tanpa harus membuka tab Network atau inspect element:

### Opsi 1: 1-Line Quick Grab via Console Browser (Paling Cepat 3 Detik)
Saat kamu sedang membuka tab [monev.maganghub.kemnaker.go.id](https://monev.maganghub.kemnaker.go.id):
1. Tekan `F12` atau `Ctrl + Shift + J` (buka tab **Console**).
2. Paste 1 baris kode ini lalu tekan **Enter**:
   ```javascript
   fetch('https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/refresh',{method:'POST',credentials:'include'}).then(r=>r.json()).then(d=>prompt('Tekan Ctrl+C untuk salin token:',d.access_token||d.token||d.data?.token));
   ```
3. Tekan `Ctrl + C` pada kotak dialog yang muncul.
4. Paste token ke chat bot Telegram kamu (diawali `/token <token>` atau copas langsung `eyJ...`). Bot otomatis menyimpannya ke Database Vercel KV!

---

### Opsi 2: Auto-Sync Headless Browser (`npm run sync-local`)
Script otomatis menggunakan profil browser lokal:
```bash
npm run sync-local
```
Script akan membuka browser, mengecek sesi aktif, menyedot token segar, menyimpannya ke `.env`, `.state.json`, dan otomatis mengirimkannya ke Database Cloud Vercel KV.

---

### Opsi 3: Kirim Langsung ke Chat Bot Telegram
Setiap kali kamu mendapatkan token baru, kamu tidak perlu mengedit `.env` manual atau membuka Vercel Dashboard. Cukup kirimkan langsung ke bot:
```text
/token eyJhbGciOi...
```
Atau copas langsung tokennya (jika diawali `eyJ...`), bot akan otomatis mendeteksi dan memperbarui database.

---

## ☁️ Deploy ke Vercel (Bot 24/7 Standby di Cloud)

Dengan Vercel Serverless Webhook, bot Telegram kamu standby 24 jam di cloud dan merespons pesan secara instan tanpa perlu komputer menyala.

### 1. Hubungkan ke Vercel
1. Buka [Vercel Dashboard](https://vercel.com) > Import repo GitHub kamu.
2. Tambahkan **Database Vercel KV / Upstash Redis** di tab **Storage** agar sesi token tersimpan persisten selamanya.

### 2. Isi Environment Variables
Pastikan variabel berikut ada di Vercel:
- `AUTH_TOKEN`, `COOKIE`, `PARTICIPANT_ID`, `SCHEDULE_ID`, `PERIOD_START`
- `TG_TOKEN`, `TG_CHAT_ID`
- `GEMINI_API_KEY` (atau `OPENROUTER_API_KEY`)
- Variabel Vercel KV (`KV_REST_API_URL` & `KV_REST_API_TOKEN` / Upstash Redis)

### 3. Daftarkan Webhook Telegram (Hanya Sekali)
Jalankan perintah ini di terminal:
```bash
npm run set-webhook https://nama-project-kamu.vercel.app
```
Jika muncul pesan `✅ Webhook BERHASIL didaftarkan!`, bot kamu sudah resmi aktif 24/7 di Vercel!

---

## 🖥️ Menjalankan di Komputer Lokal

Jika ingin menjalankan bot secara lokal:

```bash
# 1. Jalankan sekali cek status (Single Run)
npm run check

# 2. Jalankan bot polling interaktif lokal (Daemon)
npm start

# 3. Jalankan auto-grabber sesi dari browser
npm run sync-local
```

---

## 💬 Daftar Perintah Bot Telegram

| Perintah | Deskripsi |
| :--- | :--- |
| **`/status`** | Mengecek status kehadiran dan status persetujuan mentor hari ini secara instan |
| **`/gajian`** | Memeriksa kesiapan pengajuan uang saku, countdown jendela klaim, dan rincian blocker |
| **`/rekap`** | Menampilkan dashboard statistik bulanan, progress bar magang, dan countdown sisa hari |
| **`/draft <kegiatan>`** | Meracik catatan kerja kasar menjadi draf jurnal formal berstandar Kemnaker (3 format seksi) menggunakan AI |
| **`/token <token>`** | Memperbarui token akses MagangHub langsung dari chat Telegram tanpa buka Vercel |
| **`/sync`** | Menampilkan panduan sinkronisasi token cepat |
| **`/help`** | Menampilkan panduan bantuan bot |

---

## 🛡️ Catatan Keamanan
- File `.env`, `.state.json`, dan `.chrome-profile/` sudah terdaftar di `.gitignore` sehingga tidak akan pernah terunggah ke repositori publik.
- Nilai token dan kredensial hanya disimpan secara aman di environment Vercel KV dan GitHub Encrypted Secrets.

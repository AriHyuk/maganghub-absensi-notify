# 🔔 MagangHub Absensi & AI Jurnal Notification Bot

Bot cerdas serba otomatis untuk memantau status persetujuan (*approval*) jurnal & absensi harian pada portal **MagangHub Kemnaker** (`monev-api.maganghub.kemnaker.go.id`), dilengkapi **Pengingat Jam 3 Sore**, **AI Jurnal Generator**, dan dukungan **Vercel Serverless Webhook 24/7**.

---

## ✨ Fitur Utama

1. **⚡ Approval Notification (Real-time)**:
   - Notifikasi instan ke Telegram saat jurnal & absensi kamu di-approve mentor.
   - Dilengkapi *state caching* anti-spam (hanya 1 notif per hari).

2. **⏰ Reminder Jam 15:00 WIB (Jam 3 Sore)**:
   - Setiap hari kerja (Senin–Jumat) pukul 15:00 WIB, bot otomatis memeriksa apakah kamu sudah mengisi jurnal/absensi hari ini.
   - Jika belum ada catatan kehadiran/jurnal, bot akan mengingatkanmu di Telegram agar tidak terlewat sebelum jam kerja usai.

3. **🤖 AI Jurnal Generator (Interaktif 24/7 di Vercel)**:
   - Chat langsung ke bot Telegram dari HP: `<b>/draft &lt;aktivitas kasar kamu&gt;</b>`
   - Contoh: `/draft benerin bug auth login, integrasi webhook vercel, dan testing endpoint absensi`
   - Bot otomatis meracik narasi laporan formal profesional berstandar Kemnaker (didukung **Google Gemini 2.5 Flash** & **OpenRouter**) yang siap kamu copy-paste ke portal!

4. **📊 Cek Status Kapan Saja**:
   - Kirim `/status` di Telegram untuk melihat status kehadiran & approval hari ini secara instan langsung dari HP tanpa perlu membuka web Kemnaker.

---

## 🛠️ Persiapan Credentials

### 1. Telegram Bot Token (`TG_TOKEN`) & Chat ID (`TG_CHAT_ID`)
- Buat bot di [@BotFather](https://t.me/BotFather) untuk mendapatkan `TG_TOKEN`.
- Cek ID akun Telegram kamu di [@userinfobot](https://t.me/userinfobot) untuk mendapatkan `TG_CHAT_ID`.
- Klik **Start** pada bot kamu agar bot memiliki izin mengirimkan pesan.

### 2. Bearer Token (`AUTH_TOKEN`), `PARTICIPANT_ID` & `COOKIE`
- Buka browser dan login ke portal [monev.maganghub.kemnaker.go.id](https://monev.maganghub.kemnaker.go.id).
- Tekan `F12` (Network Tab) > Buka menu **Riwayat / Absensi**.
- Cari request `attendances?participant_id=...`:
  - `PARTICIPANT_ID`: Nilai parameter `participant_id` dari URL request tersebut.
  - `AUTH_TOKEN`: Token JWT dari header `Authorization` (setelah kata `Bearer `, diawali `eyJ...`).
  - `COOKIE`: Nilai seluruh string pada baris header `Cookie` (termasuk `cf_clearance`, `acw_tc`, dan `monev_refresh_token`).

### 3. AI Key (`GEMINI_API_KEY` / `OPENROUTER_API_KEY`)
- **`GEMINI_API_KEY`** *(Recommended)*: Dapatkan gratis di [Google AI Studio](https://aistudio.google.com/app/apikey). Kuota 1.500 request/hari gratis tanpa antrean.
- **`OPENROUTER_API_KEY`** *(Opsional)*: Dari [OpenRouter](https://openrouter.ai/keys) jika ingin menggunakan model alternatif seperti Llama atau Qwen.

---

## ☁️ Deploy ke Vercel (Bot 24/7 Aktif di Cloud)

Dengan Vercel Serverless Webhook, bot Telegram kamu standby 24 jam di cloud dan merespons pesan secara instan tanpa perlu laptop/PC menyala.

### Langkah 1: Hubungkan ke Vercel
1. Buka [Vercel Dashboard](https://vercel.com) > Klik **Add New Project**.
2. Pilih dan Import repositori GitHub kamu (`maganghub-absensi-notify`).

### Langkah 2: Copy-Paste Environment Variables
Di halaman konfigurasi project sebelum klik Deploy, buka bagian **Environment Variables**:
- Kamu bisa langsung **copy seluruh isi file `.env` lokal kamu** dan **paste langsung** ke dalam kolom input Vercel. Vercel akan otomatis mengenali semua pasangan key dan value:
  - `AUTH_TOKEN`
  - `PARTICIPANT_ID`
  - `COOKIE`
  - `TG_TOKEN`
  - `TG_CHAT_ID`
  - `GEMINI_API_KEY`
  - `OPENROUTER_API_KEY` *(opsional)*
3. Klik tombol **Deploy** dan tunggu hingga deployment selesai.

### Langkah 3: Daftarkan Webhook Telegram (Hanya Sekali)
Setelah selesai deploy, salin URL domain yang diberikan Vercel (contoh: `https://maganghub-absensi-notify.vercel.app`), lalu jalankan perintah berikut di terminal komputer:
```bash
npm run set-webhook https://maganghub-absensi-notify.vercel.app
```
Jika muncul pesan `✅ Webhook BERHASIL didaftarkan!`, bot kamu sudah resmi terhubung 24/7 ke Vercel!

---

## 🚀 Setup di GitHub Actions (Monitoring Berkala & Reminder)

GitHub Actions bertugas memeriksa persetujuan jurnal secara berkala dan mengirimkan reminder jam 15:00 WIB tanpa server.

1. Buka repo kamu di GitHub: **Settings** > **Secrets and variables** > **Actions**.
2. Masukkan **Repository Secrets** yang sama (`AUTH_TOKEN`, `PARTICIPANT_ID`, `COOKIE`, `TG_TOKEN`, `TG_CHAT_ID`, `GEMINI_API_KEY`).
3. Workflow otomatis berjalan setiap **30 menit** di jam kerja (Senin–Jumat 08:00 – 18:00 WIB), termasuk tepat jam **15:00 WIB** untuk reminder harian.

---

## 💻 Menjalankan di Komputer Lokal

Jika kamu ingin menjalankan bot secara lokal di terminal komputermu:

```bash
# 1. Jalankan sekali cek status (Single Run)
npm run check

# 2. Jalankan bot polling interaktif (Daemon)
npm start

# 3. Atau jalankan di background terminal dengan PM2
pm2 start main.js --name "magang-bot"
```

---

## 📱 Daftar Perintah Chat Telegram

| Perintah | Deskripsi |
| :--- | :--- |
| **`/status`** | Mengecek status kehadiran dan status persetujuan mentor hari ini secara instan |
| **`/rekap`** | Menampilkan dashboard statistik bulanan, progress bar magang, dan countdown sisa hari |
| **`/draft <kegiatan>`** | Meracik catatan kerja kasar menjadi draf jurnal formal berstandar Kemnaker menggunakan AI |
| **`/help`** | Menampilkan panduan penggunaan bot |

---

## 🔒 Catatan Keamanan
- File `.env` dan `.state.json` sudah terdaftar di `.gitignore` sehingga tidak akan pernah terunggah ke repositori publik.
- Nilai token dan credential hanya disimpan secara aman di environment Vercel dan GitHub Encrypted Secrets.

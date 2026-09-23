# 🔔 MagangHub Absensi & AI Jurnal Notification Bot

Bot cerdas serba otomatis untuk memantau status persetujuan (*approval*) jurnal & absensi harian pada portal **MagangHub Kemnaker** (`monev-api.maganghub.kemnaker.go.id`), dilengkapi **Pengingat Jam 3 Sore**, **AI Jurnal Generator**, dan dukungan **Vercel Serverless Webhook 24/7**.

---

## ✨ Fitur Utama

1. **⚡ Approval Notification (Real-time)**:
   - Notifikasi instan ke Telegram saat jurnal & absensi kamu di-approve mentor.
   - Dilengkapi *state caching* anti-spam (hanya 1 notif per hari).

2. **⏰ Reminder Jam 15:00 WIB (Jam 3 Sore)**:
   - Setiap hari kerja (Senin–Jumat) pukul 15:00 WIB, bot memeriksa apakah kamu sudah mengisi jurnal/absensi hari ini.
   - Jika belum ada catatan kehadiran/jurnal, bot akan mengingatkanmu di Telegram agar tidak terlewat sebelum jam kerja usai.

3. **🤖 AI Jurnal Generator (Interaktif 24/7 di Vercel)**:
   - Chat langsung ke bot Telegram dari HP: `<b>/draft &lt;aktivitas kasar kamu&gt;</b>`
   - Contoh: `/draft benerin bug auth login, integrasi webhook vercel, dan testing endpoint absensi`
   - Bot otomatis meracik narasi laporan formal profesional berstandar Kemnaker (didukung **Google Gemini 2.5 Flash** & **OpenRouter**) yang siap kamu copy-paste ke portal!

4. **📊 Cek Status Kapan Saja**:
   - Kirim `/status` di Telegram untuk melihat status persetujuan hari ini secara instan dari HP tanpa perlu membuka web Kemnaker.

---

## 🛠️ Persiapan Credentials

### 1. Telegram Bot Token (`TG_TOKEN`) & Chat ID (`TG_CHAT_ID`)
- Buat bot di [@BotFather](https://t.me/BotFather) untuk mendapatkan `TG_TOKEN`.
- Cek ID akun Telegram kamu di [@userinfobot](https://t.me/userinfobot) untuk mendapatkan `TG_CHAT_ID`.
- Klik **Start** pada bot kamu agar bot bisa mengirim pesan.

### 2. Bearer Token (`AUTH_TOKEN`) & Participant ID (`PARTICIPANT_ID`)
- Buka browser dan login ke portal [monev.maganghub.kemnaker.go.id](https://monev.maganghub.kemnaker.go.id).
- Tekan `F12` (Network Tab) > Buka menu Riwayat/Absensi.
- Cari request `attendances?participant_id=...`:
  - `PARTICIPANT_ID`: ID peserta dari URL parameter.
  - `AUTH_TOKEN`: Token JWT dari header `Authorization` (setelah kata `Bearer `).

### 3. AI Keys (`GEMINI_API_KEY` / `OPENROUTER_API_KEY`)
- **`GEMINI_API_KEY`** *(Recommended)*: Dapatkan gratis di [Google AI Studio](https://aistudio.google.com/app/apikey). Kuota 1.500 request/hari tanpa antrean.
- **`OPENROUTER_API_KEY`** *(Opsional)*: Dari [OpenRouter](https://openrouter.ai/keys) jika ingin bereksperimen dengan model lain.

---

## ☁️ Cara 1: Deploy ke Vercel (Bot 24/7 Interaktif dari HP)

Dengan Vercel Serverless Webhook, bot Telegram aktif 24 jam di cloud tanpa perlu komputer menyala.

1. Buka [Vercel Dashboard](https://vercel.com) > Klik **Add New Project** > Import repositori GitHub ini (`maganghub-absensi-notify`).
2. Masukkan **Environment Variables** di Vercel:
   - `AUTH_TOKEN`
   - `PARTICIPANT_ID`
   - `TG_TOKEN`
   - `TG_CHAT_ID`
   - `GEMINI_API_KEY`
   - `OPENROUTER_API_KEY` *(opsional)*
   - `COOKIE` *(opsional)*
3. Klik **Deploy** dan tunggu sampai URL Vercel kamu jadi (contoh: `https://maganghub-notify.vercel.app`).
4. Daftarkan URL tersebut ke webhook Telegram dengan menjalankan perintah berikut di terminal komputer:
   ```bash
   npm run set-webhook https://maganghub-notify.vercel.app
   ```
5. Selesai! Buka Telegram dan coba kirim pesan `/status` atau `/draft kerjaan kamu`.

---

## 🚀 Cara 2: GitHub Actions (Otomatis & Gratis Tanpa Server)

GitHub Actions bertugas memantau status persetujuan berkala dan mengirimkan reminder jam 15:00 WIB.

1. Buka repo GitHub kamu: **Settings** > **Secrets and variables** > **Actions**.
2. Masukkan Repository Secrets yang sama dengan di atas.
3. Workflow otomatis berjalan setiap **30 menit** di jam kerja (Senin–Jumat 08:00 – 18:00 WIB).

---

## 💻 Cara 3: Menjalankan di Komputer Lokal

```bash
# 1. Jalankan bot
npm start

# 2. Atau jalankan di background terminal dengan PM2
pm2 start main.js --name "magang-bot"
```

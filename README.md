# 🔔 MagangHub Absensi & AI Jurnal Notification Bot

Bot cerdas untuk memantau status persetujuan (*approval*) jurnal & absensi harian pada portal **MagangHub Kemnaker** (`monev-api.maganghub.kemnaker.go.id`), dilengkapi **Pengingat Jam 3 Sore** dan **AI Jurnal Generator**.

---

## ✨ Fitur Utama

1. **⚡ Approval Notification (Real-time)**:
   - Notifikasi instan ke Telegram saat jurnal & absensi kamu di-approve mentor.
   - Dilengkapi *state caching* anti-spam (hanya 1 notif per hari).

2. **⏰ Reminder Jam 15:00 WIB (Jam 3 Sore)**:
   - Setiap hari kerja (Senin–Jumat) pukul 15:00 WIB, bot memeriksa apakah kamu sudah mengisi jurnal/absensi hari ini.
   - Jika belum ada catatan kehadiran/jurnal, bot akan mengingatkanmu di Telegram agar tidak terlewat sebelum jam kerja usai.

3. **🤖 AI Jurnal Generator (Interaktif)**:
   - Chat langsung ke bot Telegram: `<b>/draft &lt;aktivitas kasar kamu&gt;</b>`
   - Contoh: `/draft tadi benerin bug auth, deploy backend, meeting sprint`
   - Bot otomatis meracik narasi laporan formal profesional berstandar Kemnaker (didukung oleh Google Gemini AI) yang siap kamu copy-paste ke web!

4. **📊 Cek Status Kapan Saja**:
   - Kirim `/status` di Telegram untuk melihat status persetujuan hari ini secara instan dari HP.

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

### 3. Google Gemini API Key (`GEMINI_API_KEY`) *(Opsional tapi Recommended)*
- Dapatkan API key gratis di [Google AI Studio](https://aistudio.google.com/app/apikey).
- Digunakan untuk fitur peracik narasi jurnal otomatis `/draft`. (Jika tidak diisi, bot tetap menyediakan template formal bawaan).

---

## 🚀 Setup di GitHub Actions (Cloud & Gratis)

1. Buka repo kamu di GitHub: **Settings** > **Secrets and variables** > **Actions**.
2. Masukkan Secrets:
   - `AUTH_TOKEN`
   - `PARTICIPANT_ID`
   - `TG_TOKEN`
   - `TG_CHAT_ID`
   - `GEMINI_API_KEY` *(opsional)*
   - `COOKIE` *(opsional)*
3. Workflow berjalan otomatis setiap **30 menit** di hari kerja (08:00 – 18:00 WIB), termasuk tepat jam **15:00 WIB** untuk reminder harian.

---

## 💻 Menjalankan di Komputer Lokal (Interactive Daemon)

Jika kamu menjalankan bot di komputer lokal, bot akan aktif mendengarkan perintah chat Telegram kamu:

```bash
# 1. Jalankan bot
npm start

# 2. Atau jalankan di background terminal dengan PM2
pm2 start main.js --name "magang-bot"
```

Buka Telegram kamu dan coba kirim:
- `/status`
- `/draft riset api kemnaker dan integrasi telegram bot`

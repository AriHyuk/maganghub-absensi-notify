# 🔔 MagangHub Absensi / Jurnal Notification Bot

Bot otomatis untuk memantau status persetujuan (*approval*) jurnal & absensi harian pada portal **MagangHub Kemnaker** (`monev-api.maganghub.kemnaker.go.id`) dan mengirimkan notifikasi instan ke **Telegram** begitu jurnal kamu di-approve oleh mentor.

---

## ✨ Fitur

- ⚡ **Otomatis & 100% Gratis**: Berjalan terjadwal menggunakan **GitHub Actions** (tanpa perlu laptop/PC menyala).
- 🎯 **Akurat**: Terhubung langsung ke API `/api/v1/attendances` dan membaca field `approval_status: "APPROVED"`.
- 🛡️ **Anti-Spam**: Dilengkapi sistem *state caching* sehingga hanya mengirimkan 1 kali notifikasi saat jurnal hari tersebut berstatus `APPROVED`.
- 🕒 **Timezone Aware**: Menggunakan waktu Indonesia Barat (`Asia/Jakarta` - WIB).
- 🚨 **Token Expiry Alert**: Mengirim peringatan ke Telegram jika token autentikasi kamu sudah kedaluwarsa.

---

## 🛠️ Persiapan Credentials

### 1. Telegram Bot Token (`TG_TOKEN`) & Chat ID (`TG_CHAT_ID`)
1. Buka Telegram, cari [@BotFather](https://t.me/BotFather), ketik `/newbot`, lalu ikuti petunjuk untuk mendapatkan **Bot Token**.
2. Cari [@userinfobot](https://t.me/userinfobot) di Telegram lalu ketik `/start` untuk melihat **Id** akun Telegram kamu.
3. Buka bot yang baru kamu buat, lalu klik **Start** agar bot bisa mengirim pesan ke kamu.

### 2. Bearer Token (`AUTH_TOKEN`) & Participant ID (`PARTICIPANT_ID`)
1. Buka browser dan login ke portal [monev.maganghub.kemnaker.go.id](https://monev.maganghub.kemnaker.go.id).
2. Tekan `F12` untuk membuka **Developer Tools** > pilih tab **Network**.
3. Buka menu **Riwayat / Absensi**.
4. Cari request bernama **`attendances?participant_id=...`**:
   - **`PARTICIPANT_ID`**: Lihat nilai parameter `participant_id` pada URL request tersebut (contoh: `57aaeb80-9724-4ecd-a89e-e7ad2abbf8ca`).
   - **`AUTH_TOKEN`**: Klik request tersebut, buka tab **Headers** > cari bagian **Request Headers** > temukan baris `Authorization`. Salin token JWT setelah kata `Bearer ` (yang diawali `eyJ...`).
   - *(Opsional)* **`COOKIE`**: Salin seluruh string di baris header `Cookie`.

---

## 🚀 Setup di GitHub Actions (Recommended)

1. Buka repositori kamu di GitHub.
2. Buka tab **Settings** > **Secrets and variables** > **Actions**.
3. Tambahkan Repository Secrets berikut:
   - `AUTH_TOKEN` : Token JWT dari header Authorization
   - `PARTICIPANT_ID` : ID peserta kamu
   - `TG_TOKEN` : Token bot Telegram dari @BotFather
   - `TG_CHAT_ID` : ID chat Telegram kamu
   - `COOKIE` *(opsional)* : Cookie browser jika diperlukan
4. Masuk ke tab **Actions** di GitHub > pilih workflow **Check MagangHub Absensi Status** > klik **Run workflow** untuk uji coba.

> ℹ️ **Jadwal Otomatis:** Workflow berjalan otomatis setiap **30 menit** pada hari kerja (**Senin – Jumat**) antara pukul **08:00 – 18:00 WIB**.

---

## 💻 Menjalankan di Komputer Lokal

1. Salin `.env.example` ke `.env`:
   ```bash
   cp .env.example .env
   ```
2. Isi nilai credentials di file `.env`.
3. Jalankan sekali pengecekan:
   ```bash
   npm run check
   ```
4. Atau jalankan terus-menerus di background:
   ```bash
   npm start
   # atau via PM2:
   pm2 start main.js --name "magang-notify"
   ```

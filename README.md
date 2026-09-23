# 🔔 MagangHub Absensi / Jurnal Notification Bot

Bot otomatis untuk memantau status persetujuan (*approval*) jurnal/absensi harian pada portal **MagangHub Kemnaker** (`monev.maganghub.kemnaker.go.id`) dan mengirimkan notifikasi instan ke **Telegram** saat jurnal sudah di-approve oleh mentor.

---

## ✨ Fitur

- ⚡ **Otomatis & Gratis**: Berjalan menggunakan **GitHub Actions** (tanpa perlu laptop/PC menyala).
- 🛡️ **Anti-Spam**: Dilengkapi sistem *state caching* sehingga hanya mengirimkan 1 kali notifikasi ketika jurnal hari tersebut berstatus `approved`.
- 🕒 **Timezone Aware**: Menggunakan waktu Indonesia Barat (`Asia/Jakarta` - WIB).
- 💻 **Dual Mode**: Bisa dijalankan otomatis via GitHub Actions atau di background PC lokal (PM2 / Node.js).

---

## 🛠️ Persiapan Credentials

Sebelum menjalankan bot, siapkan 3 nilai berikut:

### 1. Telegram Bot Token (`TG_TOKEN`)
1. Buka Telegram dan cari [@BotFather](https://t.me/BotFather).
2. Kirim perintah `/newbot` dan ikuti petunjuk untuk memberi nama bot.
3. Salin token API yang diberikan (contoh format: `123456789:AAFg...`).

### 2. Telegram Chat ID (`TG_CHAT_ID`)
1. Cari [@userinfobot](https://t.me/userinfobot) di Telegram lalu ketik `/start`.
2. Salin angka `Id` kamu (contoh format: `987654321`).
3. **Penting:** Buka bot yang baru kamu buat di langkah 1, lalu klik **Start** agar bot memiliki izin mengirimkan pesan ke akunmu.

### 3. Session Cookie MagangHub (`SESSION_COOKIE`)
1. Buka browser dan login ke portal [monev.maganghub.kemnaker.go.id](https://monev.maganghub.kemnaker.go.id).
2. Tekan `F12` untuk membuka **Developer Tools**, lalu pilih tab **Network**.
3. Buka halaman riwayat jurnal/absensi.
4. Cari salah satu request API (misal `riwayat`), klik request tersebut lalu buka tab **Headers**.
5. Pada bagian **Request Headers**, cari `Cookie` dan salin seluruh nilainya.

---

## 🚀 Cara 1: Menjalankan Otomatis via GitHub Actions (Recommended)

Dengan cara ini, bot berjalan di cloud GitHub secara gratis tanpa perlu menyalakan laptop.

1. Buka repository ini di GitHub.
2. Masuk ke tab **Settings** > **Secrets and variables** > **Actions**.
3. Klik tombol **New repository secret** dan tambahkan ketiga secret berikut:
   - `SESSION_COOKIE` : Nilai cookie dari browser
   - `TG_TOKEN` : Token dari BotFather
   - `TG_CHAT_ID` : ID Telegram kamu
4. Buka tab **Actions** di GitHub, pilih workflow **Check MagangHub Absensi Status**, lalu klik **Run workflow** untuk melakukan pengetesan pertama kali.

> ℹ️ **Jadwal Otomatis:** Workflow berjalan otomatis setiap **30 menit** pada hari kerja (**Senin – Jumat**) antara pukul **08:00 – 18:00 WIB**.

---

## 💻 Cara 2: Menjalankan di Lokal (PC / Laptop)

Jika kamu ingin menjalankan bot secara langsung di komputermu:

### 1. Install Dependencies
```bash
npm install
```

### 2. Konfigurasi Environment
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Isi nilai `SESSION_COOKIE`, `TG_TOKEN`, dan `TG_CHAT_ID` di dalam file `.env`.

### 3. Menjalankan Sekali Cek
```bash
npm run check
```

### 4. Menjalankan di Background Terminal (Polling)
```bash
npm start
```

### 5. (Opsional) Menjalankan di Background dengan PM2
Agar terminal bisa ditutup dan bot tetap berjalan:
```bash
# Install PM2 secara global
npm install -g pm2

# Jalankan bot
pm2 start main.js --name "magang-notify"

# Melihat status & log
pm2 status
pm2 logs magang-notify

# Menghentikan bot
pm2 stop magang-notify
```

---

## 🔒 Catatan Keamanan
- File `.env` dan `.state.json` sudah dimasukkan ke `.gitignore` sehingga tidak akan terunggah ke repositori Git.
- Jangan pernah membagikan nilai `SESSION_COOKIE` atau `TG_TOKEN` kepada publik.
- Jika cookie session habis masa berlakunya (expired), cukup perbarui nilai `SESSION_COOKIE` di GitHub Secrets atau file `.env`.

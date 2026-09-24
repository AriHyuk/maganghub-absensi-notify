(function () {
  const syncUrl = 'https://maganghub-absensi-notify.vercel.app/api/sync';

  // Bersihkan toast lama jika ada
  const oldToast = document.getElementById('maganghub-bot-sync-toast');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.id = 'maganghub-bot-sync-toast';
  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '99999999',
    background: '#1e293b',
    color: '#ffffff',
    padding: '16px 24px',
    borderRadius: '12px',
    boxShadow: '0 10px 35px rgba(0,0,0,0.4)',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: '500',
    transition: 'all 0.3s ease',
  });

  // Validasi domain: Bookmarklet HANYA bekerja jika diklik di domain Kemnaker
  if (!window.location.hostname.includes('maganghub.kemnaker.go.id')) {
    toast.style.background = '#e11d48';
    toast.innerHTML = '⚠️ <b>Salah Tempat Klik!</b><br>Buka tab <b>monev.maganghub.kemnaker.go.id</b> dulu, baru klik tombol bookmark ini di sana ya.';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 7000);
    return;
  }

  toast.innerText = '🔄 Menyinkronkan sesi MagangHub ke Bot Telegram...';
  document.body.appendChild(toast);

  fetch('https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => {
      if (!r.ok) {
        throw new Error('Sesi di browser sudah kedaluwarsa (HTTP ' + r.status + '). Silakan login ulang.');
      }
      return r.json();
    })
    .then((data) => {
      const token = data.access_token || data.token || data.data?.token;
      if (!token) throw new Error('Token tidak ditemukan dalam respons API');

      return fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, cookie: document.cookie }),
      });
    })
    .then((r) => r.json())
    .then((res) => {
      toast.style.background = '#16a34a';
      toast.innerText = '✅ Berhasil! Sesi MagangHub telah terhubung ke Bot Telegram.';
      setTimeout(() => toast.remove(), 5000);
    })
    .catch((err) => {
      toast.style.background = '#dc2626';
      toast.innerText = '❌ Gagal: ' + err.message;
      setTimeout(() => toast.remove(), 6000);
    });
})();

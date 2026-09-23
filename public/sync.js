(function () {
  const syncUrl = 'https://maganghub-absensi-notify.vercel.app/api/sync';

  // Bersihkan toast lama jika ada
  const oldToast = document.getElementById('maganghub-bot-sync-toast');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.id = 'maganghub-bot-sync-toast';
  toast.innerText = '⏳ Menyinkronkan sesi MagangHub ke Bot Telegram...';
  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '9999999',
    background: '#1e293b',
    color: '#ffffff',
    padding: '14px 22px',
    borderRadius: '12px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: '500',
    transition: 'all 0.3s ease',
  });
  document.body.appendChild(toast);

  fetch('https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => {
      if (!r.ok) {
        throw new Error('Sesi di browser sudah habis (HTTP ' + r.status + '). Silakan login ulang.');
      }
      return r.json();
    })
    .then((data) => {
      const token = data.access_token || data.token || data.data?.token;
      if (!token) throw new Error('Token tidak ditemukan dalam respons');

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
      setTimeout(() => toast.remove(), 4000);
    })
    .catch((err) => {
      toast.style.background = '#dc2626';
      toast.innerText = '❌ Gagal: ' + err.message;
      setTimeout(() => toast.remove(), 6000);
    });
})();

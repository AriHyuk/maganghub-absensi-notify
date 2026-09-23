import axios from 'axios';

const PARTICIPANT_ID = process.env.PARTICIPANT_ID || '57aaeb80-9724-4ecd-a89e-e7ad2abbf8ca';
const SCHEDULE_ID = process.env.SCHEDULE_ID || '19273eb6-983a-4b47-bb6e-6ff4c183c8b1';
const PERIOD_START = process.env.PERIOD_START || '2026-09-21';

/**
 * Hitung selisih hari menuju tanggal pembukaan
 */
export function calculateDaysRemaining(targetDateStr) {
  const target = new Date(targetDateStr);
  const now = new Date();
  const diffMs = target - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Fetch kesiapan pengajuan uang saku dari API Kemnaker
 */
export async function getGajianReadiness(token, cookie) {
  const bearerHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  const url = `https://monev-api.maganghub.kemnaker.go.id/api/v1/payment/claims/readiness?participant_id=${PARTICIPANT_ID}&schedule_id=${SCHEDULE_ID}&period_start=${PERIOD_START}`;

  const res = await axios.get(url, {
    headers: {
      Authorization: bearerHeader,
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: 'https://monev.maganghub.kemnaker.go.id',
      Referer: 'https://monev.maganghub.kemnaker.go.id/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 15000,
  });

  const data = res.data?.data;
  if (!data) throw new Error('Data klaim tidak ditemukan dari server.');

  const {
    ready,
    period_start,
    period_end,
    submission_window,
    requirements,
    blockers = [],
  } = data;

  // Format Tanggal
  const opensAt = new Date(submission_window.opens_at);
  const closesAt = new Date(submission_window.closes_at);
  const isOpen = submission_window.is_open;

  const opensStr = opensAt.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' WIB';

  const closesStr = closesAt.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' WIB';

  // Hitung countdown
  const now = new Date();
  let countdownText = '';
  if (isOpen) {
    const diffHours = Math.max(0, Math.ceil((closesAt - now) / (1000 * 60 * 60)));
    countdownText = `🔥 <b>JENDELA SEDANG DIBUKA!</b> Sisa <b>${diffHours} jam lagi</b> sebelum ditutup!`;
  } else if (now < opensAt) {
    const diffDays = Math.ceil((opensAt - now) / (1000 * 60 * 60 * 24));
    countdownText = `⏳ <b>H-${diffDays}</b> menuju pembukaan pengajuan uang saku!`;
  } else {
    countdownText = `🔒 Periode pengajuan telah ditutup.`;
  }

  // Berkas Peserta
  const rekIcon = requirements?.bank_account ? '✅ LENGKAP' : '❌ BELUM ADA';
  const spmIcon = requirements?.internship_agreement ? '✅ LENGKAP' : '❌ BELUM ADA';

  // Blocker Mentor
  const attendanceBlocker = blockers.find((b) => b.code === 'ATTENDANCE_PENDING_APPROVAL');
  const reportBlocker = blockers.find((b) => b.code === 'MONTHLY_REPORT_INCOMPLETE');

  let attendanceStatus = '✅ Seluruh kehadiran telah disetujui';
  if (attendanceBlocker) {
    const pendingDates = attendanceBlocker.dates?.join(', ') || '-';
    attendanceStatus = `❌ Menunggu keputusan mentor (Tanggal: <code>${pendingDates}</code>)`;
  }

  const reportStatus = reportBlocker
    ? '❌ Belum diselesaikan oleh mentor'
    : '✅ Telah diselesaikan oleh mentor';

  const readyBadge = ready
    ? '🟢 <b>SIAP DIAJUKAN OLEH MENTOR!</b>'
    : '🟡 <b>Persyaratan Belum Lengkap (Menunggu Mentor)</b>';

  return (
    `💸 <b>STATUS PENGAJUAN UANG SAKU MAGANG</b>\n` +
    `🗓️ <i>Periode: ${period_start} s/d ${period_end}</i>\n\n` +
    `⏰ <b>Jendela Pengajuan (Waktu Sangat Terbatas):</b>\n` +
    `• Buka: <b>${opensStr}</b>\n` +
    `• Tutup: <b>${closesStr}</b>\n` +
    `• Status: ${countdownText}\n\n` +
    `📋 <b>Kesiapan Berkas Peserta:</b>\n` +
    `• Rekening Bank: ${rekIcon}\n` +
    `• Surat Perjanjian Magang: ${spmIcon}\n\n` +
    `🚧 <b>Kesiapan Pihak Mentor:</b>\n` +
    `• Tinjau Kehadiran: ${attendanceStatus}\n` +
    `• Evaluasi Bulanan: ${reportStatus}\n\n` +
    `🎯 <b>Kesimpulan:</b>\n${readyBadge}\n\n` +
    `<i>💡 Catatan: Yang berhak mengklik tombol "Ajukan Pembayaran" adalah <b>Mentor</b> kamu. Pastikan ingatkan mentor saat jendela dibuka ya!</i>`
  );
}

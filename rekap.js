import axios from 'axios';

const PARTICIPANT_ID = process.env.PARTICIPANT_ID;
const TOTAL_MAGANG_DAYS = parseInt(process.env.MAGANG_TOTAL_DAYS || '120', 10);
const MAGANG_END_DATE = process.env.MAGANG_END_DATE?.trim(); // Format: YYYY-MM-DD (opsional)

function getTodayWIB() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function getMonthNameID(monthIndex) {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return months[monthIndex];
}

function makeProgressBar(current, total, length = 10) {
  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  const filledLength = Math.round((length * percent) / 100);
  const bar = '█'.repeat(filledLength) + '░'.repeat(length - filledLength);
  return `<code>[${bar}]</code> <b>${percent}%</b> (${current}/${total} Hari)`;
}

/**
 * Generate rekapitulasi kehadiran dan status approval magang bulan ini
 */
export async function getMonthlyRekap(token, cookie) {
  const today = getTodayWIB();
  const [year, month, day] = today.split('-').map(Number);

  // Ambil tanggal awal bulan ini (misal 2026-09-01)
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;

  // Ambil tanggal akhir bulan ini
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

  const bearerHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  const url = `https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances?participant_id=${PARTICIPANT_ID}&start_date=${startDate}&end_date=${endDate}`;

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

  const items = res.data?.data || [];

  // Hitung status kehadiran
  let presentCount = 0;
  let otherCount = 0;
  let approvedCount = 0;
  let submittedCount = 0;
  let rejectedCount = 0;

  for (const item of items) {
    if (item.status === 'PRESENT') presentCount++;
    else otherCount++;

    if (item.approval_status === 'APPROVED') approvedCount++;
    else if (item.approval_status === 'SUBMITTED') submittedCount++;
    else if (item.approval_status === 'REJECTED') rejectedCount++;
  }

  // Hitung sisa hari menuju selesai jika MAGANG_END_DATE ada
  let countdownText = '';
  if (MAGANG_END_DATE) {
    const end = new Date(MAGANG_END_DATE);
    const now = new Date(today);
    const diffTime = end - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      countdownText = `⏳ <b>Sisa ${diffDays} hari lagi menuju selesai magang!</b> 🎓\n`;
    } else if (diffDays === 0) {
      countdownText = `🎉 <b>HARI INI ADALAH HARI TERAKHIR MAGANG KAMU!</b> 🥳\n`;
    } else {
      countdownText = `🎓 <i>Periode magang sudah selesai!</i>\n`;
    }
  } else {
    const remainingDays = Math.max(0, TOTAL_MAGANG_DAYS - items.length);
    countdownText = `⏳ <b>Estimasi sisa ${remainingDays} hari kerja menuju target!</b> 🎓\n`;
  }

  const progressBar = makeProgressBar(items.length, TOTAL_MAGANG_DAYS);
  const currentMonthName = getMonthNameID(month - 1);

  return (
    `📊 <b>REKAP ABSENSI & JURNAL MAGANGHUB</b>\n` +
    `🗓️ <i>Periode: ${currentMonthName} ${year}</i>\n\n` +
    `📈 <b>Statistik Kehadiran Bulan Ini:</b>\n` +
    `• Hadir (PRESENT): <b>${presentCount} Hari</b>\n` +
    (otherCount > 0 ? `• Izin / Sakit: <b>${otherCount} Hari</b>\n` : '') +
    `• Total Absen Tercatat: <b>${items.length} Hari</b>\n\n` +
    `⭐ <b>Status Approval Mentor:</b>\n` +
    `• ✅ APPROVED: <b>${approvedCount}</b>\n` +
    `• ⏳ SUBMITTED (Pending): <b>${submittedCount}</b>\n` +
    (rejectedCount > 0 ? `• ❌ REJECTED: <b>${rejectedCount}</b>\n` : '') +
    `\n🎯 <b>Progress Keseluruhan Magang:</b>\n` +
    `${progressBar}\n\n` +
    `${countdownText}`
  );
}

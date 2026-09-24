import axios from 'axios';

const PARTICIPANT_ID = process.env.PARTICIPANT_ID || '57aaeb80-9724-4ecd-a89e-e7ad2abbf8ca';
const PERIOD_START = process.env.PERIOD_START || '2026-09-21';
const TOTAL_MAGANG_DAYS = parseInt(process.env.MAGANG_TOTAL_DAYS || '181', 10);
const BATCH_NAME = process.env.MAGANG_BATCH || 'Batch 2 Tahun 2026';
const PARTICIPANT_NAME = process.env.PARTICIPANT_NAME || 'Ari Awaludin';
const PARTICIPANT_ROLE = process.env.PARTICIPANT_ROLE || 'Programmer';
const PARTICIPANT_AGENCY = process.env.PARTICIPANT_AGENCY || 'Pusat Pengembangan Sumber Daya Manusia Standardisasi dan Penilaian Kesesuaian';

export function getTodayWIB() {
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
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return months[monthIndex];
}

export function makeProgressBar(current, total, length = 10) {
  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  const filledLength = Math.max(percent > 0 ? 1 : 0, Math.round((length * percent) / 100));
  const bar = '█'.repeat(filledLength) + '░'.repeat(length - filledLength);
  return `<code>[${bar}]</code> <b>${percent}%</b>`;
}

/**
 * Hitung kalkulasi hari & progress magang sesuai portal MagangHub
 */
export function calculateInternshipProgress(dateStr) {
  const today = dateStr || getTodayWIB();
  const start = new Date(PERIOD_START + 'T00:00:00+07:00');
  const now = new Date(today + 'T00:00:00+07:00');
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const currentDay = Math.max(1, diffDays + 1);
  const remainingDays = Math.max(0, TOTAL_MAGANG_DAYS - currentDay);
  const percent = Math.min(100, Math.max(0, Math.round((currentDay / TOTAL_MAGANG_DAYS) * 100)));
  const progressBar = makeProgressBar(currentDay, TOTAL_MAGANG_DAYS);

  return {
    today,
    currentDay,
    totalDays: TOTAL_MAGANG_DAYS,
    remainingDays,
    percent,
    progressBar,
    batch: BATCH_NAME,
    name: PARTICIPANT_NAME,
    role: PARTICIPANT_ROLE,
    agency: PARTICIPANT_AGENCY,
  };
}

/**
 * Generate rekapitulasi kehadiran dan status approval magang bulan ini
 */
export async function getMonthlyRekap(token, cookie) {
  const today = getTodayWIB();
  const [year, month] = today.split('-').map(Number);
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;

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

  const progress = calculateInternshipProgress(today);
  const currentMonthName = getMonthNameID(month - 1);

  return (
    `📊 <b>REKAP MAGANG & KEHADIRAN</b>\n` +
    `👤 <b>${progress.name}</b> — <code>${progress.role}</code>\n` +
    `🏢 <i>${progress.agency}</i>\n\n` +
    `🎯 <b>HARI KE-${progress.currentDay} DARI ${progress.totalDays}</b>\n` +
    `⏳ <b>Sisa ${progress.remainingDays} hari · ${progress.batch}</b>\n` +
    `📈 Progress: ${progress.progressBar}\n\n` +
    `🗓️ <b>Statistik Bulan Ini (${currentMonthName} ${year}):</b>\n` +
    `  ✅ Hadir (PRESENT): <b>${presentCount} Hari</b>\n` +
    (otherCount > 0 ? `  ℹ️ Izin / Sakit: <b>${otherCount} Hari</b>\n` : '') +
    `  📋 Total Hari Kerja Tercatat: <b>${items.length} Hari</b>\n\n` +
    `📝 <b>Status Approval Mentor:</b>\n` +
    `  ✅ APPROVED: <b>${approvedCount}</b>\n` +
    `  ⏳ SUBMITTED (Pending): <b>${submittedCount}</b>\n` +
    (rejectedCount > 0 ? `  ❌ REJECTED: <b>${rejectedCount}</b>\n` : '')
  );
}


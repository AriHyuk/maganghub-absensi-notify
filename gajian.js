import axios from 'axios';
import { calculateInternshipProgress } from './rekap.js';

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

  const submission_window = data.submission_window || {};
  const opensAt = new Date(submission_window.opens_at);
  const closesAt = new Date(submission_window.closes_at);
  const isOpen = submission_window.is_open;

  // Hitung countdown ringkas
  const now = new Date();
  let countdownText = '';
  if (isOpen) {
    const diffHours = Math.max(0, Math.ceil((closesAt - now) / (1000 * 60 * 60)));
    countdownText = `🚨 <b>JENDELA SEDANG DIBUKA!</b> Sisa <b>${diffHours} jam lagi</b> sebelum ditutup!`;
  } else if (now < opensAt) {
    const diffDays = Math.ceil((opensAt - now) / (1000 * 60 * 60 * 24));
    countdownText = `⏳ <b>H-${diffDays}</b> menuju pembukaan pengajuan uang saku!`;
  } else {
    countdownText = `🔒 Periode pengajuan telah ditutup.`;
  }

  const progress = calculateInternshipProgress();

  return (
    `👤 <b>${progress.name}</b> — <code>${progress.role}</code>\n` +
    `🏢 <i>${progress.agency}</i>\n` +
    `🎯 <b>HARI KE-${progress.currentDay} DARI ${progress.totalDays}</b> (Sisa ${progress.remainingDays} hari · ${progress.batch})\n` +
    `📈 Progress: ${progress.progressBar}\n\n` +
    `💸 <b>STATUS PENGAJUAN UANG SAKU MAGANG</b>\n` +
    `📅 Periode: 21 September – 20 Oktober 2026\n` +
    `📊 Status Klaim: ${countdownText}\n\n` +
    `<i>💡 Catatan: Yang berhak mengklik tombol "Ajukan Pembayaran" adalah <b>Mentor</b> kamu. Pastikan ingatkan mentor saat jendela dibuka ya!</i>`
  );
}

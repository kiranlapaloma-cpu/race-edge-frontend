
'use client';

import { jsPDF } from 'jspdf';

type RaceOption = { key: string | number; label: string };
type ScenarioRow = { Rank: number; 'No.': number; Horse: string; 'Margin Behind Previous (L)': number };
type CardResponse = {
  card: { name: string; distance: number; surfaceDescr: string; time: string; clubName: string };
  prediction_runners: Array<{ 'No.': number; Horse: string; Claim?: number }>;
  prediction: { scenarios: Record<string, ScenarioRow[]> };
};

type Params = {
  date: string; club: string; meetingName: string; races: RaceOption[];
  onProgress?: (done: number, total: number) => void;
};

const NAVY = [14, 29, 49] as const;
const GOLD = [202, 161, 91] as const;
const INK = [35, 49, 69] as const;
const GREY = [104, 118, 136] as const;
const safe = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const setFill = (pdf: jsPDF, c: readonly number[]) => pdf.setFillColor(c[0], c[1], c[2]);
const setText = (pdf: jsPDF, c: readonly number[]) => pdf.setTextColor(c[0], c[1], c[2]);

async function fetchRace(date: string, club: string, race: RaceOption): Promise<CardResponse> {
  const query = new URLSearchParams({ action: 'predictions', race_date: date, club, race: String(race.key), include_peak: 'false' });
  const response = await fetch(`/api/proxy?${query}`, { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${race.label}: ${json.detail || json.error || `HTTP ${response.status}`}`);
  if (!json?.prediction?.scenarios || !Array.isArray(json?.prediction_runners)) throw new Error(`${race.label}: incomplete prediction data`);
  return json as CardResponse;
}

function drawLogo(pdf: jsPDF, logo: string | null, x: number, y: number, w: number, h: number) {
  if (logo) {
    try { pdf.addImage(logo, 'PNG', x, y, w, h, undefined, 'FAST'); return; } catch { /* fallback to text */ }
  }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); setText(pdf, GOLD);
  pdf.text('RACE EDGE 2.0', x, y + h / 2 + 2);
}

async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch('/race-edge-header.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL('image/png');
  } catch { return null; }
}

function header(pdf: jsPDF, logo: string | null, title: string, subtitle: string, page: number) {
  const W = 297;
  setFill(pdf, NAVY); pdf.rect(0, 0, W, 36, 'F');
  drawLogo(pdf, logo, 11, 5, 35, 25);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); setText(pdf, [255, 255, 255]);
  pdf.text(title, 53, 16);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); setText(pdf, [217, 224, 233]);
  pdf.text(subtitle, 53, 25);
  setFill(pdf, GOLD); pdf.rect(0, 36, W, 1.5, 'F');
  setText(pdf, GREY); pdf.setFontSize(8);
  pdf.text('Race Edge analytical guide only - not a guarantee of race results.', 11, 199);
  pdf.text(String(page), 285, 199, { align: 'right' });
}

function drawTable(pdf: jsPDF, x: number, y: number, width: number, heading: string, detail: string, rows: ScenarioRow[]) {
  setFill(pdf, NAVY); pdf.roundedRect(x, y, width, 13, 1.5, 1.5, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); setText(pdf, GOLD);
  pdf.text(heading, x + 4, y + 5.5);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); setText(pdf, [229, 235, 242]);
  pdf.text(detail, x + 4, y + 10.5);
  const colsY = y + 21;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); setText(pdf, GREY);
  pdf.text('RANK', x + 3, colsY); pdf.text('NO.', x + 19, colsY);
  pdf.text('HORSE', x + 34, colsY); pdf.text('BEHIND', x + width - 4, colsY, { align: 'right' });
  let total = 0;
  rows.slice(0, 6).forEach((r, i) => {
    total += num(r['Margin Behind Previous (L)']);
    const rowY = colsY + 6 + i * 10;
    if (i % 2 === 0) { pdf.setFillColor(240, 244, 248); pdf.rect(x, rowY - 6, width, 10, 'F'); }
    setText(pdf, INK); pdf.setFont('helvetica', i === 0 ? 'bold' : 'normal'); pdf.setFontSize(9);
    pdf.text(String(r.Rank ?? i + 1), x + 4, rowY);
    pdf.text(String(r['No.']), x + 20, rowY);
    const maxHorseWidth = width - 65;
    const horse = safe(r.Horse);
    const truncated = pdf.getTextWidth(horse) > maxHorseWidth ? horse.slice(0, 23) + '...' : horse;
    pdf.text(truncated, x + 34, rowY);
    pdf.text(i === 0 ? 'LEADER' : `${total.toFixed(1)} L`, x + width - 4, rowY, { align: 'right' });
  });
  if (!rows.length) { setText(pdf, GREY); pdf.setFontSize(10); pdf.text('No usable predictions', x + 4, colsY + 12); }
}

function drawRace(pdf: jsPDF, logo: string | null, race: RaceOption, card: CardResponse, date: string, meeting: string, page: number) {
  header(pdf, logo, `RACE DAY PREDICTION GUIDE`, `${meeting}  |  ${date}`, page);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); setText(pdf, INK);
  pdf.text(`${race.label} - ${safe(card.card.name)}`, 11, 49, { maxWidth: 275 });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); setText(pdf, GREY);
  pdf.text(`${safe(card.card.distance)}m  |  ${safe(card.card.surfaceDescr)}  |  ${safe(card.card.time)}`, 11, 56);
  const latest = card.prediction.scenarios['Latest Form'] || [];
  const recent = card.prediction.scenarios['Recent Best'] || [];
  drawTable(pdf, 11, 62, 134, 'LATEST FORM', 'Most recent recorded run', latest);
  drawTable(pdf, 152, 62, 134, 'RECENT BEST', 'Best performance from last 3 recorded runs', recent);

  const latestNos = new Set(latest.map(r => Number(r['No.'])));
  const recentNos = new Set(recent.map(r => Number(r['No.'])));
  const noData = card.prediction_runners.filter(r => !latestNos.has(Number(r['No.'])) && !recentNos.has(Number(r['No.'])));
  const partial = card.prediction_runners.filter(r => latestNos.has(Number(r['No.'])) !== recentNos.has(Number(r['No.'])));
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); setText(pdf, INK);
  pdf.text(`DATA COVERAGE: ${card.prediction_runners.length} runners | ${latestNos.size} latest rated | ${recentNos.size} recent rated`, 11, 157);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setText(pdf, GREY);
  const list = (rs: typeof noData) => rs.map(r => `#${r['No.']} ${r.Horse}`).join('   |   ');
  const drawWrapped = (text: string, y: number) => {
    const lines = pdf.splitTextToSize(text, 274).slice(0, 3);
    pdf.text(lines, 11, y);
    return y + lines.length * 4;
  };
  let y = 164;
  if (noData.length) y = drawWrapped(`NO USABLE RACE EDGE PROJECTION: ${list(noData)}`, y) + 2;
  if (partial.length) y = drawWrapped(`PARTIALLY RATED (ONE MODE ONLY): ${list(partial)}`, y) + 2;
  if (!noData.length && !partial.length) y = drawWrapped('All carded runners have projections in both modes.', y);
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); setText(pdf, GREY);
  pdf.text('Unrated does not mean inferior ability. Apprentice claims are not applied to predictions.', 11, Math.min(188, y + 3));
}

export async function downloadMeetingPdf({ date, club, meetingName, races, onProgress }: Params): Promise<void> {
  if (!races.length) throw new Error('No races are available for the selected meeting.');
  const results: CardResponse[] = new Array(races.length);
  let cursor = 0; let done = 0;
  const failures: string[] = [];
  const worker = async () => {
    while (cursor < races.length) {
      const i = cursor++;
      try { results[i] = await fetchRace(date, club, races[i]); }
      catch (e) { failures.push(e instanceof Error ? e.message : `${races[i].label}: failed`); }
      finally { done++; onProgress?.(done, races.length); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, races.length) }, () => worker()));
  if (failures.length) throw new Error(`PDF not generated because ${failures.length} race(s) failed: ${failures.join('; ')}`);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const logo = await loadLogo();
  header(pdf, logo, 'RACE DAY PREDICTION GUIDE', `${meetingName}  |  ${date}`, 1);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(23); setText(pdf, INK);
  pdf.text(meetingName, 15, 62);
  pdf.setFontSize(14); setText(pdf, GOLD); pdf.text(date, 15, 73);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(12); setText(pdf, INK);
  pdf.text(`${races.length} races | Latest Form first | Recent Best second`, 15, 90);
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.text('HOW TO READ THIS GUIDE', 15, 111);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  pdf.text('LATEST FORM: Ranking based on each horse\'s most recent recorded run.', 15, 121);
  pdf.text('RECENT BEST: Ranking based on each horse\'s best run among its last three recorded runs.', 15, 130);
  pdf.text('BEHIND: Cumulative predicted lengths behind the scenario leader.', 15, 139);
  pdf.text('NO USABLE PROJECTION: A runner with insufficient data for a numerical ranking.', 15, 148);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('IMPORTANT', 15, 166);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  const disclaimer = 'This publication is an analytical guide for race day only. It is based on historical Race Edge performance data, not a guarantee of finishing positions or results. It should support, not replace, independent form study. Runners without usable predictions must not be assumed to have inferior ability.';
  pdf.text(pdf.splitTextToSize(disclaimer, 260), 15, 176);
  results.forEach((card, i) => { pdf.addPage(); drawRace(pdf, logo, races[i], card, date, meetingName, i + 2); });
  const fileName = `Race-Edge-Guide-${date}-${meetingName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.pdf`;
  pdf.save(fileName);
}

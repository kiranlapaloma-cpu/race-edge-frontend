'use client';

import { jsPDF } from 'jspdf';

type RaceOption = { key: string | number; label: string };
type ScenarioRow = { Rank: number; 'No.': number; Horse: string; 'Margin Behind Previous (L)': number };
type Runner = { 'No.': number; Horse: string; Claim?: number };
type CardResponse = {
  card: { name: string; distance: number; surfaceDescr: string; time: string; clubName: string };
  prediction_runners: Runner[];
  prediction: { scenarios: Record<string, ScenarioRow[]> };
};
type Params = {
  date: string; club: string; meetingName: string; races: RaceOption[];
  onProgress?: (done: number, total: number) => void;
};
type RaceStats = {
  latest: ScenarioRow[]; recent: ScenarioRow[];
  latestIds: Set<number>; recentIds: Set<number>;
  sharedTopSix: Set<number>; unrated: Runner[]; partial: Runner[];
  runnerCount: number; fullyRated: number; coverage: number;
};
const NAVY = [14, 29, 49] as const;
const GOLD = [202, 161, 91] as const;
const INK = [35, 49, 69] as const;
const GREY = [104, 118, 136] as const;
const PALE = [240, 244, 248] as const;
const WHITE = [255, 255, 255] as const;
const W = 297;
const H = 210;
const safe = (v: unknown) => String(v ?? '').trim();
const validNo = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : NaN;
const number = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const setFill = (pdf: jsPDF, c: readonly number[]) => pdf.setFillColor(c[0], c[1], c[2]);
const setText = (pdf: jsPDF, c: readonly number[]) => pdf.setTextColor(c[0], c[1], c[2]);

async function fetchRace(date: string, club: string, race: RaceOption): Promise<CardResponse> {
  const query = new URLSearchParams({
    action: 'predictions', race_date: date, club,
    race: String(race.key), include_peak: 'false',
  });
  const response = await fetch(`/api/proxy?${query}`, { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${race.label}: ${json.detail || json.error || `HTTP ${response.status}`}`);
  if (!json?.prediction?.scenarios || !Array.isArray(json?.prediction_runners)) {
    throw new Error(`${race.label}: incomplete prediction data`);
  }
  const scenarios = json.prediction.scenarios as Record<string, unknown>;
  if (!Array.isArray(scenarios['Latest Form']) || !Array.isArray(scenarios['Recent Best'])) {
    throw new Error(`${race.label}: missing Latest Form or Recent Best rankings`);
  }
  return json as CardResponse;
}

async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch('/race-edge-header.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL('image/png');
  } catch { return null; }
}

function logo(pdf: jsPDF, data: string | null) {
  if (data) {
    try { pdf.addImage(data, 'PNG', 11, 4, 29, 27, undefined, 'FAST'); return; }
    catch { /* Text fallback */ }
  }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setText(pdf, GOLD);
  pdf.text('RACE EDGE', 11, 20);
}

function pageFrame(pdf: jsPDF, image: string | null, meeting: string, date: string, page: number, total: number) {
  setFill(pdf, NAVY); pdf.rect(0, 0, W, 34, 'F');
  logo(pdf, image);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); setText(pdf, WHITE);
  pdf.text('RACE DAY PREDICTION GUIDE', 48, 15);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setText(pdf, [221, 229, 238]);
  pdf.text(`${meeting}  |  ${date}`, 48, 23, { maxWidth: 236 });
  setFill(pdf, GOLD); pdf.rect(0, 34, W, 1.4, 'F');
  // Consistent publication footer on every page.
  setFill(pdf, GOLD); pdf.rect(11, 193, 275, 0.5, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); setText(pdf, GOLD);
  pdf.text('RACE EDGE ANALYTICS', 11, 199);
  pdf.setFont('helvetica', 'normal'); setText(pdf, INK);
  pdf.text('Kiran Singh', 104, 199);
  setText(pdf, GREY); pdf.setFontSize(7.2);
  pdf.text(`Page ${page} of ${total}`, 286, 199, { align: 'right' });
  pdf.text('Analytical guide only - not a guarantee. Independent form study recommended.', 11, 205);
}

function stats(card: CardResponse): RaceStats {
  const latest = card.prediction.scenarios['Latest Form'];
  const recent = card.prediction.scenarios['Recent Best'];
  const latestIds = new Set(latest.map(r => validNo(r['No.'])).filter(Number.isFinite));
  const recentIds = new Set(recent.map(r => validNo(r['No.'])).filter(Number.isFinite));
  const topRecent = new Set(recent.slice(0, 6).map(r => validNo(r['No.'])));
  const sharedTopSix = new Set(latest.slice(0, 6).map(r => validNo(r['No.'])).filter(id => topRecent.has(id)));
  const runners = card.prediction_runners;
  const unrated = runners.filter(r => !latestIds.has(validNo(r['No.'])) && !recentIds.has(validNo(r['No.'])));
  const partial = runners.filter(r => latestIds.has(validNo(r['No.'])) !== recentIds.has(validNo(r['No.'])));
  const fullyRated = runners.filter(r => latestIds.has(validNo(r['No.'])) && recentIds.has(validNo(r['No.']))).length;
  return {
    latest, recent, latestIds, recentIds, sharedTopSix, unrated, partial,
    runnerCount: runners.length, fullyRated,
    coverage: runners.length ? Math.round(100 * fullyRated / runners.length) : 0,
  };
}

function fitText(pdf: jsPDF, value: string, maxWidth: number, startSize: number, minSize: number) {
  let size = startSize;
  pdf.setFontSize(size);
  while (size > minSize && pdf.getTextWidth(value) > maxWidth) {
    size -= 0.25;
    pdf.setFontSize(size);
  }
  return size;
}

function cumulative(rows: ScenarioRow[]): number[] {
  let sum = 0;
  return rows.map(row => {
    sum += number(row['Margin Behind Previous (L)']);
    return sum;
  });
}

function drawRanking(pdf: jsPDF, x: number, y: number, width: number, title: string,
  detail: string, rows: ScenarioRow[], shared: Set<number>) {
  setFill(pdf, NAVY); pdf.roundedRect(x, y, width, 14, 1.5, 1.5, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setText(pdf, GOLD);
  pdf.text(title, x + 4, y + 6);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.4); setText(pdf, WHITE);
  pdf.text(detail, x + 4, y + 11);
  const head = y + 23;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); setText(pdf, GREY);
  pdf.text('RANK', x + 3, head);
  pdf.text('NO.', x + 19, head);
  pdf.text('HORSE', x + 32, head);
  pdf.text('BEHIND', x + width - 4, head, { align: 'right' });
  const margins = cumulative(rows);
  rows.slice(0, 6).forEach((r, i) => {
    const rowTop = head + 3 + i * 11;
    const rowY = rowTop + 5;
    if (i % 2 === 0) { setFill(pdf, PALE); pdf.rect(x, rowTop, width, 11, 'F'); }
    const isShared = shared.has(validNo(r['No.']));
    if (isShared) { setFill(pdf, GOLD); pdf.rect(x, rowTop, 1.4, 11, 'F'); }
    setText(pdf, INK);
    pdf.setFont('helvetica', i === 0 ? 'bold' : 'normal'); pdf.setFontSize(9);
    pdf.text(String(r.Rank ?? i + 1), x + 4, rowY);
    pdf.text(String(r['No.']), x + 20, rowY);
    const horse = safe(r.Horse);
    // Use full names; shrink font as needed rather than truncating.
    const nameWidth = width - 66;
    fitText(pdf, horse, nameWidth, 9, 5.5);
    pdf.text(horse, x + 32, rowY, { maxWidth: nameWidth });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
    const margin = margins[i];
    const label = i === 0 ? 'LEADER' : `${margin.toFixed(1)} L${Math.abs(margin) < 0.05 ? ' (TIE)' : ''}`;
    pdf.text(label, x + width - 4, rowY, { align: 'right' });
  });
  if (!rows.length) {
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(9); setText(pdf, GREY);
    pdf.text('No usable predictions', x + 4, head + 10);
  }
  const top = margins[Math.min(5, margins.length - 1)];
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setText(pdf, GREY);
  pdf.text(rows.length >= 6 ? `1st-6th spread: ${top.toFixed(1)} L` :
    `${rows.length} rated runner${rows.length === 1 ? '' : 's'} in this scenario`, x + 3, y + 101);
}

function raceNumber(race: RaceOption, index: number): string {
  const match = safe(race.label).match(/\brace\s*[-#:]*\s*(\d+)/i);
  return match ? String(Number(match[1])) : String(index + 1);
}

function drawRace(pdf: jsPDF, image: string | null, race: RaceOption, card: CardResponse,
  date: string, meeting: string, page: number, total: number, index: number) {
  pageFrame(pdf, image, meeting, date, page, total);
  const s = stats(card);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); setText(pdf, INK);
  pdf.text(`RACE ${raceNumber(race, index)}`, 11, 46);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); setText(pdf, GOLD);
  pdf.text(`${safe(card.card.time)}  |  ${safe(card.card.distance)}m  |  ${safe(card.card.surfaceDescr)}`, 53, 46);
  const raceName = safe(card.card.name) || safe(race.label);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); setText(pdf, INK);
  const nameLines = pdf.splitTextToSize(raceName, 272).slice(0, 2);
  pdf.text(nameLines, 11, 53);
  const tableY = 63;
  drawRanking(pdf, 11, tableY, 134, 'LATEST FORM', 'Most recent recorded run', s.latest, s.sharedTopSix);
  drawRanking(pdf, 152, tableY, 134, 'RECENT BEST', 'Best of last three recorded runs', s.recent, s.sharedTopSix);
  // Lower panel, deliberately bounded above the footer.
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); setText(pdf, INK);
  pdf.text(`DATA COVERAGE: ${s.fullyRated}/${s.runnerCount} runners rated in both modes (${s.coverage}%)`, 11, 174);
  setFill(pdf, PALE); pdf.roundedRect(11, 177, 275, 3, 1, 1, 'F');
  setFill(pdf, GOLD); pdf.roundedRect(11, 177, 275 * s.coverage / 100, 3, 1, 1, 'F');
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.4); setText(pdf, GREY);
  const format = (r: Runner) => `#${r['No.']} ${safe(r.Horse)}`;
  const info = s.unrated.length
    ? `NO USABLE PROJECTION: ${s.unrated.map(format).join(' | ')}`
    : 'All carded runners have at least one usable prediction.';
  const partial = s.partial.length ? `ONE MODE ONLY: ${s.partial.map(format).join(' | ')}` : '';
  const combined = [info, partial].filter(Boolean).join('   /   ');
  // Up to two lines. When a large unrated field exceeds the space, use a compact font.
  fitText(pdf, combined, 274, 7.0, 4.5);
  let lines = pdf.splitTextToSize(combined, 274) as string[];
  while (lines.length > 3 && pdf.getFontSize() > 4.5) {
    pdf.setFontSize(pdf.getFontSize() - 0.25);
    lines = pdf.splitTextToSize(combined, 274) as string[];
  }
  if (lines.length > 3) {
    throw new Error(`Too many unrated runner names to fit on the race page: ${race.label}`);
  }
  pdf.text(lines, 11, 183.5);
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7); setText(pdf, GREY);
  pdf.text('Gold markers: top-six in both modes. Unrated does not mean inferior ability. Claims not applied.', 11, 191);
}

function drawCover(pdf: jsPDF, image: string | null, date: string, meeting: string,
  races: RaceOption[], total: number) {
  pageFrame(pdf, image, meeting, date, 1, total);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(24); setText(pdf, INK);
  fitText(pdf, meeting, 265, 24, 16);
  pdf.text(meeting, 15, 65, { maxWidth: 265 });
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); setText(pdf, GOLD);
  pdf.text(date, 15, 77);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); setText(pdf, INK);
  pdf.text(`${races.length} races  |  Latest Form  |  Recent Best`, 15, 92);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
  pdf.text('HOW TO READ THE GUIDE', 15, 111);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
  const notes = [
    'LATEST FORM: Based on each horse\'s most recent recorded run.',
    'RECENT BEST: Based on the best of the last three recorded runs.',
    'BEHIND: Cumulative predicted lengths behind the scenario leader; 0.0 L may indicate a tie.',
    'GOLD MARKER: A runner appears in both scenario Top 6 lists.',
    'COVERAGE: Share of carded runners with usable projections in both modes.',
    'SPREAD: Predicted separation from first to sixth, not a confidence score.',
  ];
  notes.forEach((note, i) => pdf.text(note, 15, 121 + i * 8));
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('IMPORTANT', 15, 174);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
  const disclaimer = 'This is a race-day analytical guide, not a guarantee of results. It is based on available historical Race Edge data and is not a substitute for independent form study. Missing projections do not imply inferior ability.';
  pdf.text(pdf.splitTextToSize(disclaimer, 265), 15, 182);
}

function drawSummary(pdf: jsPDF, image: string | null, date: string, meeting: string,
  races: RaceOption[], results: CardResponse[], total: number) {
  pageFrame(pdf, image, meeting, date, 2, total);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); setText(pdf, INK);
  pdf.text('MEETING AT A GLANCE', 11, 48);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setText(pdf, GREY);
  pdf.text('Scenario leaders are not guaranteed winners. Coverage reflects usable data, not predictive confidence.', 11, 55);
  setFill(pdf, NAVY); pdf.roundedRect(11, 62, 275, 10, 1, 1, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); setText(pdf, WHITE);
  pdf.text('RACE', 15, 68.5);
  pdf.text('LATEST FORM LEADER', 40, 68.5);
  pdf.text('RECENT BEST LEADER', 126, 68.5);
  pdf.text('BOTH TOP 6', 211, 68.5);
  pdf.text('COVER', 282, 68.5, { align: 'right' });
  const rowHeight = Math.min(11, 109 / Math.max(1, results.length));
  results.forEach((card, i) => {
    const y = 73 + i * rowHeight;
    if (i % 2 === 0) { setFill(pdf, PALE); pdf.rect(11, y, 275, rowHeight, 'F'); }
    const s = stats(card);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setText(pdf, INK);
    pdf.text(raceNumber(races[i], i), 15, y + rowHeight * 0.68);
    const leader1 = safe(s.latest[0]?.Horse) || 'No projection';
    const leader2 = safe(s.recent[0]?.Horse) || 'No projection';
    fitText(pdf, leader1, 78, 8.5, 6); pdf.text(leader1, 40, y + rowHeight * 0.68, { maxWidth: 78 });
    fitText(pdf, leader2, 78, 8.5, 6); pdf.text(leader2, 126, y + rowHeight * 0.68, { maxWidth: 78 });
    pdf.setFontSize(8.5);
    pdf.text(String(s.sharedTopSix.size), 221, y + rowHeight * 0.68);
    pdf.text(`${s.coverage}%`, 282, y + rowHeight * 0.68, { align: 'right' });
  });
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); setText(pdf, GREY);
  pdf.text('Both Top 6 = number of runners appearing in the top six of both scenarios.', 11, 187);
}

export async function downloadMeetingPdf({ date, club, meetingName, races, onProgress }: Params): Promise<void> {
  if (!races.length) throw new Error('No races are available for the selected meeting.');
  const results: CardResponse[] = new Array(races.length);
  let cursor = 0;
  let done = 0;
  const failures: string[] = [];
  const worker = async () => {
    while (cursor < races.length) {
      const i = cursor++;
      try { results[i] = await fetchRace(date, club, races[i]); }
      catch (error) { failures.push(error instanceof Error ? error.message : `${races[i].label}: failed`); }
      finally { done++; onProgress?.(done, races.length); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, races.length) }, () => worker()));
  if (failures.length) throw new Error(`PDF not generated because ${failures.length} race(s) failed: ${failures.join('; ')}`);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const image = await loadLogo();
  const total = races.length + 2;
  drawCover(pdf, image, date, meetingName, races, total);
  pdf.addPage();
  drawSummary(pdf, image, date, meetingName, races, results, total);
  results.forEach((card, i) => {
    pdf.addPage();
    drawRace(pdf, image, races[i], card, date, meetingName, i + 3, total, i);
  });
  const slug = meetingName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  pdf.save(`Race-Edge-Analytics-Guide-${date}-${slug}.pdf`);
}

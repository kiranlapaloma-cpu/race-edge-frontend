
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
  pdf.setFont('helvetica', 'bold'); setText(pdf, GOLD); pdf.setFontSize(10);
  pdf.text('RACE EDGE ANALYTICS', 15, 54);
  pdf.setFont('helvetica', 'bold'); setText(pdf, INK); pdf.setFontSize(26);
  pdf.text('RACE DAY', 15, 72);
  pdf.text('PREDICTION GUIDE', 15, 85);
  setFill(pdf, GOLD); pdf.rect(15, 92, 82, 1.1, 'F');
  pdf.setFont('helvetica', 'bold'); setText(pdf, INK);
  fitText(pdf, meeting, 260, 19, 12);
  pdf.text(meeting, 15, 111, { maxWidth: 260 });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); setText(pdf, GREY);
  pdf.text(`${date}  |  ${races.length} races`, 15, 124);
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(11); setText(pdf, INK);
  pdf.text('An independent, data-driven approach to horse racing analysis.', 15, 146);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); setText(pdf, GOLD);
  pdf.text('Prepared by Kiran Singh', 15, 161);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setText(pdf, GREY);
  const disclaimer = 'Predictions are analytical projections based on available historical performance data. They are not guaranteed outcomes and should be considered alongside independent form study.';
  pdf.text(pdf.splitTextToSize(disclaimer, 260), 15, 177);
}

function drawDefinitions(pdf: jsPDF, image: string | null, date: string, meeting: string,
  total: number) {
  pageFrame(pdf, image, meeting, date, 2, total);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); setText(pdf, INK);
  pdf.text('UNDERSTANDING RACE EDGE ANALYTICS', 11, 47);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setText(pdf, GREY);
  pdf.text('How to interpret the rankings, projected margins and the limits of historical data.', 11, 54);

  const definitions = [
    { title: 'Latest Form', body: 'Uses each horse\'s most recent recorded performance available to the prediction model. This indicates recently demonstrated ability, not necessarily its best ability.' },
    { title: 'Recent Best', body: 'Uses the strongest performance among the last three recorded runs considered by the model. It shows what a horse has recently demonstrated it can achieve, not what it must repeat today.' },
    { title: 'Predicted Lengths Behind', body: 'Shows cumulative projected lengths behind the scenario leader. These are relative estimates, not guaranteed finishing margins. A displayed 0.0 L may reflect rounding.' },
    { title: 'Agreement Between Scenarios', body: 'A gold marker identifies a runner in both Top 6 lists. This highlights overlap between the two views; it is not a calibrated winning probability.' },
    { title: 'Data Coverage', body: 'The percentage of carded runners with usable projections in both modes. Higher coverage means more of the field is represented, not that the predictions are more certain.' },
    { title: 'Race Competitiveness', body: 'The first-to-sixth spread shows how closely the top six rated horses are grouped in a scenario. A smaller spread indicates tighter projected margins, not greater certainty.' },
    { title: 'Unrated Runners', body: 'A runner without a usable projection is not automatically weaker. Missing or insufficient data limits the model\'s ability to assess that horse.' },
  ];
  const left = definitions.slice(0, 4);
  const right = definitions.slice(4);
  const drawColumn = (items: typeof definitions, x: number) => {
    let y = 65;
    for (const item of items) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); setText(pdf, INK);
      pdf.text(item.title, x, y);
      setFill(pdf, GOLD); pdf.rect(x, y + 2, 128, 0.35, 'F');
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.1); setText(pdf, GREY);
      const lines = pdf.splitTextToSize(item.body, 127) as string[];
      pdf.text(lines, x, y + 8);
      y += 23;
    }
  };
  drawColumn(left, 11);
  drawColumn(right, 153);
  setFill(pdf, PALE); pdf.roundedRect(11, 163, 275, 26, 2, 2, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); setText(pdf, INK);
  pdf.text('HOW TO USE RACE EDGE ANALYTICS', 16, 170);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.1); setText(pdf, INK);
  const guidance = 'Compare Latest Form with Recent Best to identify current form and demonstrated potential. Use the projected margins to judge how closely the rated runners are matched. Then assess pace, draw, distance, weights, conditions and other relevant form independently. Race Edge projects relative ability; it cannot guarantee that ability will be reproduced today.';
  pdf.text(pdf.splitTextToSize(guidance, 264), 16, 176);
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
  drawDefinitions(pdf, image, date, meetingName, total);
  results.forEach((card, i) => {
    pdf.addPage();
    drawRace(pdf, image, races[i], card, date, meetingName, i + 3, total, i);
  });
  const slug = meetingName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  pdf.save(`Race-Edge-Analytics-Guide-${date}-${slug}.pdf`);
}

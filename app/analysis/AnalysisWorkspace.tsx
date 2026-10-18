
'use client';

import {
  useState,
  type ChangeEvent,
} from 'react';

import CoreMetricsDashboard from './CoreMetricsDashboard';
import RacePlaneDashboard from './RacePlaneDashboard';

import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileSpreadsheet,
  Flag,
  Gauge,
  Play,
  RefreshCw,
  Upload,
  Database,
} from 'lucide-react';

type DataRow = Record<string, unknown>;

type AnalysisResult = {
  distance_m: number;
  step: number;
  markers: number[];
  race_diagnostics: Record<string, unknown>;
  rows: DataRow[];
  saved: boolean;
};

type RatingsRow = DataRow & {
  Horse: string;
  Age: number | null;
  'Age Source': string;
  'Official MR': number | null;
  'MR Achieved'?: number | null;
  'MR Edge'?: number | null;
};

type RatingsResult = {
  rows: RatingsRow[];
  suggested_line_horse: string | null;
  line_horse: string;
  line_mr: number;
  missing_ages: string[];
  ready: boolean;
  saved: boolean;
};

type PlaneDraftResult = {
  race_test_profile: { label: string };
  rows: Array<Record<string, unknown> & {
    Horse: string;
    Sustain_Residual: number;
    Sustain_Profile: string;
  }>;
};

function draftNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function phaseValue(value: unknown): string {
  const n = draftNumber(value);
  return n === null ? '—' : n.toFixed(1);
}

function firstValue(row: DataRow, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== null && row[key] !== undefined && row[key] !== '') return row[key];
  }
  return null;
}

type RaceMetadata = {
  date: string;
  track: string;
  course: string;
  surface: string;
  going: string;
  distance: number;
  raceNumber: string;
};

const COLORS = {
  background: '#091321',
  panel: '#101e30',
  border: '#28384d',
  gold: '#d7ae65',
  text: '#e8edf4',
  muted: '#98a7bb',
};

function parseCSV(text: string): string[][] {
  const output: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const input = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (
      (char === '\n' || char === '\r') &&
      !quoted
    ) {
      if (
        char === '\r' &&
        input[i + 1] === '\n'
      ) {
        i++;
      }

      row.push(cell);

      if (row.some(value => value.trim())) {
        output.push(row);
      }

      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (quoted) {
    throw new Error(
      'The CSV contains an unclosed quoted field.'
    );
  }

  row.push(cell);

  if (row.some(value => value.trim())) {
    output.push(row);
  }

  return output;
}

function convertValue(value: string): unknown {
  const trimmed = value.trim();

  if (!trimmed) return null;

  if (
    /^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)
  ) {
    const numeric = Number(trimmed);

    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return trimmed;
}

function readCSV(text: string): DataRow[] {
  const parsed = parseCSV(text);

  if (parsed.length < 3) {
    throw new Error(
      'The CSV must contain a header and at least two runners.'
    );
  }

  const headers = parsed[0].map(
    header => header.trim()
  );

  if (headers.some(header => !header)) {
    throw new Error(
      'The CSV contains an empty column heading.'
    );
  }

  if (new Set(headers).size !== headers.length) {
    throw new Error(
      'The CSV contains duplicate column headings.'
    );
  }

  if (!headers.includes('Finish_Time')) {
    throw new Error(
      'The CSV must contain Finish_Time.'
    );
  }

  const markers = headers.filter(
    header => /^\d+_Time$/.test(header)
  );

  if (!markers.length) {
    throw new Error(
      'No sectional time columns were found.'
    );
  }

  return parsed.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`
      );
    }

    const record: DataRow = {};

    headers.forEach((header, column) => {
      record[header] = convertValue(
        values[column] ?? ''
      );
    });

    return record;
  });
}

function detectStep(rows: DataRow[]): 100 | 200 {
  const first = rows[0];

  const markers = Object.keys(first)
    .filter(key => /^\d+_Time$/.test(key))
    .map(key => Number(key.split('_')[0]))
    .sort((a, b) => b - a);

  if (markers.length < 2) {
    throw new Error(
      'At least two sectional markers are needed to detect the interval.'
    );
  }

  const differences = markers
    .slice(1)
    .map((value, index) =>
      markers[index] - value
    );

  if (differences.every(value => value === 100)) {
    return 100;
  }

  if (differences.every(value => value === 200)) {
    return 200;
  }

  throw new Error(
    'The sectional markers do not form a consistent 100m or 200m interval.'
  );
}

function metadataFromRows(
  rows: DataRow[]
): RaceMetadata {
  const first = rows[0];

  const get = (key: string) =>
    first[key] == null
      ? ''
      : String(first[key]);

  const distance = Number(first.Distance);

  return {
    date: get('Race Date'),
    track: get('Track'),
    course: get('Course'),
    surface: get('Surface'),
    going: get('Going') || 'Good',
    distance:
      Number.isFinite(distance) &&
      distance > 0
        ? distance
        : 0,
    raceNumber: get('Race Number'),
  };
}

function formatValue(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? String(Math.round(value * 1000) / 1000)
      : '—';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function errorMessage(
  value: unknown,
  fallback: string
): string {
  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (
          item &&
          typeof item === 'object' &&
          'msg' in item
        ) {
          return String(item.msg);
        }

        return formatValue(item);
      })
      .join('; ');
  }

  return fallback;
}

const panelStyle = {
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 12,
  padding: 18,
};

const inputStyle = {
  width: '100%',
  background: '#0a1626',
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 7,
  padding: '11px 12px',
  fontSize: 14,
};


// External report: only Merit Rating values and ordinary race facts are numeric.
// Uses the browser's native Save as PDF; no server upload or third-party PDF service.
function exportPerformanceReport(
  result: AnalysisResult,
  sourceRows: DataRow[],
  metadata: RaceMetadata | null,
  ratings: RatingsResult | null,
  ratingsDirty: boolean,
  planeData: PlaneDraftResult | null,
  analystConclusion: string,
) {
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
  const numeric = (value: unknown) => draftNumber(value);
  const get = (row: DataRow, keys: string[]) => numeric(firstValue(row, keys));
  const ratingsReady = !!ratings?.ready && !ratingsDirty;
  const ratingMap = new Map((ratingsReady ? ratings!.rows : []).map(r => [r.Horse.trim().toUpperCase(), r]));
  const planeMap = new Map((planeData?.rows ?? []).map(r => [r.Horse.trim().toUpperCase(), r]));
  const sourceMap = new Map(sourceRows.map(r => [String(r.Horse ?? '').trim().toUpperCase(), r]));
  const rpss = numeric(result.race_diagnostics?.RPSS ?? result.race_diagnostics?.rpss ?? result.rows[0]?.RPSS);
  const tempo = rpss === null ? 'Not assessed' : rpss < 97 ? 'Slow / weak' : rpss < 98.5 ? 'Measured / fair' : rpss < 99.5 ? 'Approaching strong' : rpss <= 100.5 ? 'Strong' : rpss <= 102 ? 'Very strong' : 'Exceptional';
  const caution = rpss === null || rpss < 98.5;
  const defs = [
    { title: 'Early race performance', keys: ['F200_idx', 'F200', 'F200_Index', 'F200 index'] },
    { title: 'Mid-race efficiency', keys: ['tsSPI'] },
    { title: 'Acceleration response', keys: ['Accel'] },
    { title: 'Finishing strength', keys: ['Grind_CG', 'Corrected_Grind', 'Corrected Grind'] },
  ];
  const qualitative = (row: DataRow, keys: string[]) => {
    const value = get(row, keys);
    const values = result.rows.map(r => get(r, keys)).filter((v): v is number => v !== null).sort((a,b) => b-a);
    if (value === null || values.length < 2) return 'Not assessed';
    const rank = values.findIndex(v => v <= value) + 1;
    const fraction = (rank - 1) / (values.length - 1);
    return fraction <= .2 ? 'Strong' : fraction <= .4 ? 'Above average' : fraction <= .65 ? 'Average' : fraction <= .85 ? 'Below average' : 'Weak';
  };
  const runners = result.rows.map(row => {
    const horse = String(row.Horse ?? '').trim();
    const key = horse.toUpperCase();
    const rating = ratingMap.get(key);
    const official = rating ? get(rating, ['Official MR']) : null;
    const achieved = rating ? get(rating, ['MR Achieved']) : null;
    const edge = official !== null && achieved !== null ? achieved - official : null;
    const finish = get(row, ['Finish_Pos', 'Finish Position', 'Fin', 'Position']) ?? get(sourceMap.get(key) ?? {}, ['Finish_Pos', 'Finish Position', 'Fin', 'Position']);
    const phases = defs.map(d => qualitative(row, d.keys));
    const sustain = get(planeMap.get(key) ?? {}, ['Sustain_Residual']);
    const notes: string[] = [];
    if (edge !== null && edge >= 4) notes.push('Performed above its current handicap mark on the selected assessment line.');
    if (sustain !== null && sustain > 0) notes.push('Showed a favourable sustained-effort pattern relative to the race model.');
    if (phases[2] === 'Strong' && phases[3] === 'Strong') notes.push('Displayed a strong combination of acceleration response and finishing strength.');
    if (phases[0] === 'Strong' && (phases[3] === 'Weak' || phases[3] === 'Below average')) notes.push('Early pace was not maintained to the same standard in the closing stages.');
    if (!notes.length) notes.push('Sectional characteristics are presented below for further form assessment.');
    return { horse, finish, official, achieved, edge, phases, notes };
  });
  const mr = (n: number | null) => n === null ? '—' : String(Math.round(n));
  const date = metadata?.date && /^\d{4}-\d{2}-\d{2}$/.test(metadata.date)
    ? new Date(`${metadata.date}T12:00:00`).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' })
    : metadata?.date || 'Not specified';

  // Build the published chart from the same sectional source and segment definitions
  // as CoreMetricsDashboard, but quantise to qualitative bands. No raw speeds,
  // axes values, tooltip payloads, or proprietary metrics are embedded in the PDF.
  const markers = Object.keys(sourceRows[0] ?? {}).filter(k => /^\d+_Time$/.test(k)).map(k => Number(k.split('_')[0])).sort((a,b) => b-a);
  const segments: Array<{ remaining:number; distance:number; key:string }> = [];
  if (markers.length) {
    if (result.distance_m > markers[0]) segments.push({ remaining:markers[0], distance:result.distance_m-markers[0], key:`${markers[0]}_Time` });
    for (let i=1;i<markers.length;i++) segments.push({ remaining:markers[i], distance:markers[i-1]-markers[i], key:`${markers[i]}_Time` });
    segments.push({ remaining:0, distance:result.step, key:'Finish_Time' });
  }
  const speeds = runners.map(r => segments.map(seg => {
    const time = get(sourceMap.get(r.horse.toUpperCase()) ?? {}, [seg.key]);
    return time !== null && time > 0 ? seg.distance / time : null;
  }));
  const fieldAverages = segments.map((_, i) => {
    const v = speeds.map(s => s[i]).filter((n): n is number => n !== null);
    return v.length ? v.reduce((a,b) => a+b,0)/v.length : null;
  });
  const palette = ['#b88437','#2778a6','#5d7699','#ae6b7d','#459080','#7b64a8','#9a783d','#508caa','#a05d50','#6c8b58','#8a71a4','#71818f'];
  const width = 740, height = 310, left = 48, right = 18, top = 26, bottom = 52;
  const chartWidth = width-left-right, chartHeight = height-top-bottom;
  const band = (speed: number | null, avg: number | null) => {
    if (speed === null || avg === null || avg <= 0) return null;
    const ratio = (speed / avg - 1) * 100;
    return ratio >= 4 ? 4 : ratio >= 1.5 ? 3 : ratio > -1.5 ? 2 : ratio > -4 ? 1 : 0;
  };
  const x = (i: number) => left + (segments.length < 2 ? 0 : i * chartWidth / (segments.length-1));
  const y = (b: number) => top + (4-b) * chartHeight/4;
  const chartLines = runners.map((runner,i) => {
    const points = speeds[i].map((v,j) => {
      const b = band(v, fieldAverages[j]);
      return b === null ? null : `${x(j).toFixed(1)},${y(b).toFixed(1)}`;
    });
    const d = points.map((pt,j) => pt ? `${j===0 || !points[j-1] ? 'M':'L'}${pt}` : '').join(' ');
    return `<path d="${d}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="${i<3?2.5:1.7}" stroke-linejoin="round" opacity=".86"/>`;
  }).join('');
  const gridLines = ['Well above','Above','In line','Below','Well below'].map((label,i) => `<line x1="${left}" y1="${y(4-i)}" x2="${width-right}" y2="${y(4-i)}" stroke="#dce2e9" stroke-width="1"/><text x="${left-7}" y="${y(4-i)+4}" text-anchor="end" fill="#556577" font-size="9">${label}</text>`).join('');
  const xLabels = segments.map((s,i) => `<text x="${x(i)}" y="${height-23}" text-anchor="middle" fill="#556577" font-size="10">${escapeHtml(s.remaining === 0 ? 'Finish' : `${s.remaining}m`)}</text>`).join('');
  const chart = segments.length >= 2 ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Qualitative pace patterns relative to the field average" style="width:100%;height:auto"><rect width="${width}" height="${height}" fill="#fff"/>${gridLines}<line x1="${left}" y1="${y(2)}" x2="${width-right}" y2="${y(2)}" stroke="#142a42" stroke-dasharray="6 5" stroke-width="1.5"/>${chartLines}${xLabels}<text x="${width/2}" y="${height-4}" text-anchor="middle" font-size="11" fill="#33465a">Distance remaining</text></svg>` : '<p>Insufficient sectional data for a pace curve.</p>';
  const legend = runners.map((r,i) => `<span class="legend"><i style="background:${palette[i%palette.length]}"></i>${escapeHtml(r.horse)}</span>`).join('');
  const horseCards = runners.map(r => `<article class="runner"><div class="runner-head"><h3>${escapeHtml(r.horse)}</h3><span>${r.finish === null ? 'Finishing position unavailable' : `Finished ${escapeHtml(r.finish)} of ${runners.length}`}</span></div><div class="merit"><span>Official Merit Rating <b>${mr(r.official)}</b></span><span>Performance Merit Rating <b>${mr(r.achieved)}</b></span><span>Rating Differential <b>${r.edge === null ? '—' : `${r.edge > 0 ? '+' : ''}${mr(r.edge)}`}</b></span></div><div class="phases">${defs.map((d,i) => `<div><small>${escapeHtml(d.title)}</small><strong>${escapeHtml(r.phases[i])}</strong></div>`).join('')}</div><p>${escapeHtml(r.notes.join(' '))}</p></article>`).join('');
  const notable = runners.filter(r => r.notes[0] !== 'Sectional characteristics are presented below for further form assessment.').slice(0,6);
  const notableHtml = notable.length ? notable.map(r => `<p><strong>${escapeHtml(r.horse)}</strong> — ${escapeHtml(r.notes.join(' '))}</p>`).join('') : '<p>No runners met the predefined noteworthy-performance signals. Individual profiles are included for context.</p>';
  const narrative = analystConclusion.trim() ? `<section class="section"><h2>Analyst Observations</h2><p>${escapeHtml(analystConclusion).replace(/\n/g,'<br>')}</p></section>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Race Edge - Performance Intelligence Report</title><style>
    @page{size:A4 portrait;margin:15mm 14mm}*{box-sizing:border-box}body{margin:0;color:#18293c;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.55}header{background:#102238;color:#fff;padding:24px 25px;border-bottom:5px solid #c49a55}header .brand{font-size:15px;font-weight:800;letter-spacing:2px;color:#e0b86e}header h1{font-size:23px;letter-spacing:.3px;margin:10px 0 3px}header p{margin:0;color:#d6deea;font-size:12px}.page{page-break-before:always}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:18px 0}.meta div{background:#eef1f5;padding:10px 12px}.meta small,.phases small{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#627286}.meta strong{display:block;font-size:12px}.section{margin:20px 0}.section h2{font-size:15px;color:#14283f;border-bottom:2px solid #c49a55;padding-bottom:6px;margin:0 0 12px}.section p{margin:7px 0}.chart-wrap{border:1px solid #dce2e9;padding:8px;margin:14px 0}.legend-wrap{display:flex;flex-wrap:wrap;gap:6px 14px}.legend{display:inline-flex;align-items:center;font-size:10px}.legend i{width:17px;height:3px;display:inline-block;margin-right:5px}.runner{border:1px solid #dce2e9;border-left:4px solid #c49a55;padding:12px 14px;margin:12px 0;break-inside:avoid}.runner-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.runner h3{margin:0;font-size:13px}.runner-head span{font-size:10px;color:#68798a}.merit{display:flex;gap:16px;flex-wrap:wrap;background:#f1f4f7;padding:8px;margin:9px 0}.merit span{font-size:10px}.merit b{font-size:12px;margin-left:4px}.phases{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.phases strong{font-size:11px}.runner p{margin:10px 0 0}.note{color:#637286;font-size:10px;margin-top:12px}footer{border-top:1px solid #cbd4df;margin-top:25px;padding-top:8px;font-size:9px;color:#667588}button{background:#c49a55;color:#112238;border:0;padding:12px 20px;font-weight:700;cursor:pointer;margin:15px}.toolbar{background:#102238;text-align:center}@media print{.toolbar{display:none}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}.meta div,.merit{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">Save / Print PDF</button></div><header><div class="brand">RACE EDGE</div><h1>Performance Intelligence Report</h1><p>In-Depth Race Analysis</p></header><main><div class="meta"><div><small>Racecourse</small><strong>${escapeHtml(metadata?.track || 'Not specified')}</strong></div><div><small>Race</small><strong>${escapeHtml(metadata?.raceNumber || '—')}</strong></div><div><small>Distance</small><strong>${escapeHtml(result.distance_m)}m</strong></div><div><small>Race Date</small><strong>${escapeHtml(date)}</strong></div><div><small>Surface / Course</small><strong>${escapeHtml([metadata?.surface,metadata?.course].filter(Boolean).join(' · ') || '—')}</strong></div><div><small>Field</small><strong>${runners.length} runners</strong></div></div><section class="section"><h2>Race Overview</h2><p><strong>Race tempo:</strong> ${escapeHtml(tempo)}.</p><p>${caution ? 'The pace context calls for caution when interpreting individual performances and transferring this form to future races.' : 'The pace context supports a more informative comparison of the runners, although future performances will depend on conditions and race shape.'}</p></section><section class="section"><h2>Noteworthy Performances</h2>${notableHtml}</section>${narrative}<p class="note">All performance characteristics are relative assessments, not independently verified predictions. Merit Ratings depend on the chosen assessment line.</p><div class="page"><section class="section"><h2>Race Pace Patterns</h2><p>Qualitative pace patterns relative to the field at each stage. The central reference represents the field average. Vertical bands are descriptive, not a numerical speed scale.</p><div class="chart-wrap">${chart}</div><div class="legend-wrap">${legend}</div><p class="note">This presentation intentionally excludes raw sectional speeds and proprietary performance indices. Lines are quantised to broad relative-pace bands; they should not be used to infer precise sectional times.</p></section></div><div class="page"><section class="section"><h2>Individual Performance Assessments</h2><p>Qualitative phase assessments and Merit Ratings for every runner.</p>${horseCards}</section></div></main><footer>RACE EDGE · PERFORMANCE INTELLIGENCE REPORT · Proprietary methodology withheld · For professional analysis only</footer></body></html>`;
  const win = window.open('', '_blank');
  if (!win) { window.alert('Allow pop-ups for Race Edge to open the PDF report.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

// Race Summary 2.0: interpretation only. The underlying metrics are never modified.
function RaceIntelligenceSummary({
  result, sourceRows, metadata, ratings, ratingsDirty, planeData, analystConclusion, setAnalystConclusion,
  onVerify, canVerify,
}: {
  result: AnalysisResult;
  sourceRows: DataRow[];
  metadata: RaceMetadata | null;
  ratings: RatingsResult | null;
  ratingsDirty: boolean;
  planeData: PlaneDraftResult | null;
  analystConclusion: string;
  setAnalystConclusion: (value: string) => void;
  onVerify: () => void;
  canVerify: boolean;
}) {
  const rpss = draftNumber(firstValue(result.race_diagnostics, ['RPSS', 'rpss']) ?? result.rows[0]?.RPSS);
  const paceLabel = rpss === null ? 'Unavailable' : rpss < 97 ? 'Weak pace' : rpss < 98.5 ? 'Fair pace' : rpss < 99.5 ? 'Slightly below strong' : rpss <= 100.5 ? 'Genuine / strong pace' : rpss <= 102 ? 'Very strong pace' : 'Exceptional pace';
  const caution = rpss === null || rpss < 98.5;
  const ratingsReady = !!ratings?.ready && !ratingsDirty;
  const ratingMap = new Map((ratingsReady ? ratings!.rows : []).map(r => [r.Horse.trim().toUpperCase(), r]));
  const planeMap = new Map((planeData?.rows ?? []).map(r => [r.Horse.trim().toUpperCase(), r]));
  const num = (row: DataRow, keys: string[]) => draftNumber(firstValue(row, keys));
  const field = result.rows.length;
  const metricDefs = [
    { label: 'F200', keys: ['F200_idx', 'F200', 'F200_Index', 'F200 index'] },
    { label: 'tsSPI', keys: ['tsSPI'] },
    { label: 'Accel', keys: ['Accel'] },
    { label: 'Corrected Grind', keys: ['Grind_CG', 'Corrected_Grind', 'Corrected Grind'] },
  ];
  const ranked = (keys: string[]) => result.rows.filter(r => num(r, keys) !== null)
    .slice().sort((a, b) => (num(b, keys) ?? -Infinity) - (num(a, keys) ?? -Infinity));
  const piRanking = ranked(['PI']);
  const positions = new Map(piRanking.map((r, i) => [String(r.Horse ?? '').trim().toUpperCase(), i + 1]));
  const average = (values: Array<number | null>) => {
    const valid = values.filter((v): v is number => v !== null);
    return valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : '—';
  };
  const insights = result.rows.map(row => {
    const horse = String(row.Horse ?? '').trim();
    const key = horse.toUpperCase();
    const rating = ratingMap.get(key);
    const plane = planeMap.get(key);
    const finish = num(row, ['Finish_Pos', 'Finish Position', 'Fin', 'Position']);
    const piRank = positions.get(key);
    const official = rating ? num(rating, ['Official MR']) : null;
    const achieved = rating ? num(rating, ['MR Achieved']) : null;
    const edge = official !== null && achieved !== null ? achieved - official : null;
    const sustain = plane ? num(plane, ['Sustain_Residual']) : null;
    const evidence: string[] = [];
    const labels: string[] = [];
    if (edge !== null && edge >= 4) {
      labels.push('Handicap outperformer');
      evidence.push(`MR Achieved ${achieved} vs Official MR ${official} (+${edge.toFixed(1)} MR)`);
    }
    if (sustain !== null && sustain > 0) {
      labels.push('Positive sustain');
      evidence.push(`Race Plane sustain residual +${sustain.toFixed(2)}`);
    }
    if (finish !== null && Number.isInteger(finish) && finish >= 1 && finish <= field && piRank !== undefined && finish - piRank >= 3) {
      labels.push('PI / result discrepancy');
      evidence.push(`Finished ${finish}/${field}; PI ranked ${piRank}/${piRanking.length}`);
    }
    const metricRanks = metricDefs.map(def => {
      const sorted = ranked(def.keys);
      const rank = sorted.findIndex(r => String(r.Horse ?? '').trim().toUpperCase() === key);
      return { label: def.label, rank: rank < 0 ? null : rank + 1, count: sorted.length, value: num(row, def.keys) };
    });
    const accel = metricRanks[2], cg = metricRanks[3], front = metricRanks[0];
    if (field >= 5 && accel.rank !== null && cg.rank !== null && accel.rank <= Math.max(2, Math.ceil(field * .25)) && cg.rank <= Math.max(2, Math.ceil(field * .25))) {
      labels.push('Strong late phases');
      evidence.push(`Accel rank ${accel.rank}/${accel.count}; Corrected Grind rank ${cg.rank}/${cg.count}`);
    }
    if (field >= 5 && front.rank !== null && cg.rank !== null && front.rank <= Math.max(2, Math.ceil(field * .25)) && cg.rank >= Math.ceil(field * .75)) {
      labels.push('Early / late contrast');
      evidence.push(`F200 rank ${front.rank}/${front.count}; Corrected Grind rank ${cg.rank}/${cg.count}`);
    }
    return { horse, labels, evidence, metricRanks, finish, piRank, edge, sustain };
  });
  const watchlist = insights.filter(item => item.labels.length).sort((a, b) => b.labels.length - a.labels.length || a.horse.localeCompare(b.horse));
  const card = { background: COLORS.background, border: `1px solid ${COLORS.border}`, padding: 16, borderRadius: 9 };
  const sectionTitle = { color: COLORS.gold, fontWeight: 800 as const, fontSize: 12, letterSpacing: .7 };
  return (
    <section style={{ ...panelStyle, marginBottom: 20 }}>
      <div style={{ color: COLORS.gold, fontWeight: 800, letterSpacing: 1, fontSize: 13 }}>05 / RACE INTELLIGENCE SUMMARY</div>
      <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.6 }}>Measured signals and model-based interpretations. No additional composite score or changes to Race Edge calculations.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          ['RPSS', rpss === null ? '—' : rpss.toFixed(2)],
          ['PACE CLASSIFICATION', paceLabel],
          ['FIELD', String(field)],
          ['AVERAGE OFFICIAL MR', ratingsReady ? average(ratings!.rows.map(r => num(r, ['Official MR']))) : '—'],
          ['AVERAGE MR ACHIEVED', ratingsReady ? average(ratings!.rows.map(r => num(r, ['MR Achieved']))) : '—'],
        ].map(([label, value]) => <div key={label} style={card}><div style={{ color: COLORS.muted, fontSize: 10 }}>{label}</div><div style={{ color: COLORS.gold, fontSize: label === 'PACE CLASSIFICATION' ? 15 : 22, fontWeight: 800, marginTop: 9 }}>{value}</div></div>)}
      </div>
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={sectionTitle}>PACE CONTEXT & INTERPRETATION</div>
        <p style={{ color: COLORS.text, fontSize: 13, lineHeight: 1.65, marginBottom: 0 }}>
          {rpss === null ? 'RPSS is unavailable; race pace reliability cannot be assessed.' : `RPSS ${rpss.toFixed(2)} — ${paceLabel}. `}
          {caution ? 'Treat individual sectional rankings and form conclusions cautiously: the pace was weak/fair or unavailable.' : 'The RPSS pace reading provides a more useful context for studying sectional performances, but does not guarantee form reliability.'}
        </p>
      </div>
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={sectionTitle}>FOUR-METRIC FIELD LEADERS</div>
        <p style={{ color: COLORS.muted, fontSize: 12 }}>Raw metric rankings; these are not independent indicators and are not added together.</p>
        {metricDefs.map(def => {
          const top = ranked(def.keys)[0];
          const value = top ? num(top, def.keys) : null;
          return <div key={def.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${COLORS.border}`, fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ color: COLORS.muted }}>{def.label}</span>
            <strong>{top ? `${String(top.Horse ?? '—')} · ${value?.toFixed(2) ?? '—'}` : 'Not available'}</strong>
          </div>;
        })}
      </div>
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={sectionTitle}>PERFORMANCE WATCHLIST · {watchlist.length} FLAGGED</div>
        <p style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.6 }}>Evidence-based observations, not betting selections. A positive sustain residual describes performance relative to the Race Plane model, not an unlucky passage. MR edges depend on the selected line horse.</p>
        {!ratingsReady && <p style={{ color: '#e6bb71', fontSize: 12 }}>Calculate current Handicap Ratings to enable MR edge signals.</p>}
        {!planeData && <p style={{ color: '#e6bb71', fontSize: 12 }}>Calculate Race Plane to enable sustain signals.</p>}
        {watchlist.length ? watchlist.map(item => <div key={item.horse} style={{ borderTop: `1px solid ${COLORS.border}`, padding: '14px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{item.horse}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {item.labels.map(label => <span key={label} style={{ fontSize: 11, color: COLORS.gold, background: '#1c3047', padding: '5px 8px', borderRadius: 5 }}>{label}</span>)}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.7, marginTop: 8 }}>{item.evidence.join(' · ')}</div>
        </div>) : <p style={{ color: COLORS.muted, fontSize: 13 }}>No runners meet the current watchlist criteria. This does not mean there were no noteworthy performances.</p>}
      </div>
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={sectionTitle}>RUNNER PERFORMANCE PROFILES</div>
        <p style={{ color: COLORS.muted, fontSize: 12 }}>Relative ranks within this field. A missing metric is shown as —. PI and finish are shown separately, not treated as interchangeable.</p>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, whiteSpace: 'nowrap' }}>
            <thead><tr>{['HORSE', 'FINISH', 'PI RANK', 'F200', 'tsSPI', 'ACCEL', 'CG', 'MR EDGE', 'SUSTAIN'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: COLORS.gold, borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>)}</tr></thead>
            <tbody>{insights.map(item => <tr key={item.horse}>
              {[item.horse, item.finish === null ? '—' : `${item.finish}/${field}`, item.piRank === undefined ? '—' : `${item.piRank}/${piRanking.length}`, ...item.metricRanks.map(m => m.rank === null ? '—' : `${m.rank}/${m.count}`), item.edge === null ? '—' : `${item.edge > 0 ? '+' : ''}${item.edge.toFixed(1)}`, item.sustain === null ? '—' : item.sustain.toFixed(2)].map((value, i) => <td key={i} style={{ padding: '10px 12px', borderBottom: `1px solid ${COLORS.border}`, color: i === 0 ? COLORS.text : COLORS.muted, fontWeight: i === 0 ? 700 : 400 }}>{value}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      <button type="button" onClick={() => exportPerformanceReport(result, sourceRows, metadata, ratings, ratingsDirty, planeData, analystConclusion)}
        style={{ ...inputStyle, background: COLORS.gold, color: COLORS.background, fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}>
        EXPORT PERFORMANCE INTELLIGENCE REPORT (PDF) →
      </button>
      <p style={{ color: COLORS.muted, fontSize: 12, marginTop: -6 }}>Opens a print-ready A4 report. Choose “Save as PDF” in the browser print dialog. Only Merit Ratings and ordinary race facts appear as numbers.</p>
      <label htmlFor="race-edge-analyst-conclusion" style={{ display: 'block', ...sectionTitle, marginBottom: 8 }}>ANALYST CONCLUSIONS</label>
      <textarea id="race-edge-analyst-conclusion" value={analystConclusion} onChange={e => setAnalystConclusion(e.target.value)} placeholder="Your interpretation of race shape, noteworthy performances and horses to monitor..." rows={5} style={{ ...inputStyle, resize: 'vertical', boxSizing: 'border-box' }} />
      <p style={{ color: COLORS.muted, fontSize: 12 }}>Workspace-only notes; these are not saved in the existing database draft. Runner Analyst Notes remain editable on Database Verification.</p>
      <button type="button" onClick={onVerify} disabled={!canVerify} style={{ ...inputStyle, background: canVerify ? COLORS.gold : '#596273', color: COLORS.background, fontWeight: 800, cursor: canVerify ? 'pointer' : 'not-allowed' }}>VERIFY ENTIRE RACE →</button>
    </section>
  );
}

export default function AnalysisWorkspace() {
  const [activeTab, setActiveTab] = useState<'metrics' | 'pace' | 'handicap' | 'plane' | 'summary'>('metrics');
  const [showImport, setShowImport] = useState(true);
  const [analystConclusion, setAnalystConclusion] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<DataRow[]>([]);
  const [metadata, setMetadata] =
    useState<RaceMetadata | null>(null);

  const [distance, setDistance] = useState(0);
  const [step, setStep] = useState<100 | 200>(100);
  const [going, setGoing] = useState('Good');

  const [useCG, setUseCG] = useState(true);
  const [dampenCG, setDampenCG] = useState(true);
  const [useRaceShape, setUseRaceShape] =
    useState(true);

  const [result, setResult] =
    useState<AnalysisResult | null>(null);

  const [ratings, setRatings] = useState<RatingsResult | null>(null);
  const [planeData, setPlaneData] = useState<PlaneDraftResult | null>(null);
  const [lineHorse, setLineHorse] = useState('');
  const [lineMR, setLineMR] = useState('');
  const [missingAges, setMissingAges] = useState<Record<string, string>>({});
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [ratingsDirty, setRatingsDirty] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setError('');
    setSuccess('');
    setResult(null);
    setPlaneData(null);
    setRatings(null);
    setRatingsDirty(false);
    setLineHorse('');
    setLineMR('');
    setMissingAges({});
    setRows([]);
    setMetadata(null);
    setFileName('');
    setShowImport(true);
    setAnalystConclusion('');

    try {
      const text = await file.text();
      const parsed = readCSV(text);
      const detectedStep = detectStep(parsed);
      const detectedMetadata =
        metadataFromRows(parsed);

      if (
        !detectedMetadata.distance ||
        detectedMetadata.distance > 3600
      ) {
        throw new Error(
          'The CSV needs a valid Distance value between 1m and 3600m.'
        );
      }

      const markerNames = Object.keys(parsed[0])
        .filter(key => /^\d+_Time$/.test(key));

      for (let i = 0; i < parsed.length; i++) {
        const row = parsed[i];

        const required = [
          'Finish_Time',
          ...markerNames,
        ];

        for (const column of required) {
          const value = row[column];

          if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value <= 0
          ) {
            throw new Error(
              `Runner ${i + 1} has an invalid ${column} value.`
            );
          }
        }
      }

      setRows(parsed);
      setMetadata(detectedMetadata);
      setDistance(detectedMetadata.distance);
      setStep(detectedStep);
      setGoing(detectedMetadata.going);
      setFileName(file.name);

      setSuccess(
        `Loaded ${parsed.length} runners with ${detectedStep}m sectionals.`
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to read CSV.'
      );
    } finally {
      event.target.value = '';
    }
  }

  async function calculate() {
    if (!rows.length || !distance) return;

    setLoading(true);
    setError('');
    setSuccess('');
    setResult(null);
    setPlaneData(null);
    setRatings(null);
    setRatingsDirty(false);
    setLineHorse('');
    setLineMR('');
    setMissingAges({});

    try {
      const response = await fetch(
        '/api/proxy?action=analysis',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            distance_m: distance,
            step,
            rows,
            use_cg: useCG,
            dampen_cg: dampenCG,
            use_race_shape: useRaceShape,
            going_type: going,
          }),
          cache: 'no-store',
        }
      );

      const json = await response
        .json()
        .catch(() => ({}));

      if (response.status === 401) {
        window.location.replace('/login');
        return;
      }

      if (!response.ok) {
        throw new Error(
          errorMessage(
            json.detail || json.error,
            `Calculation failed (${response.status})`
          )
        );
      }

      if (
        !json ||
        !Array.isArray(json.rows)
      ) {
        throw new Error(
          'The backend returned an invalid analysis response.'
        );
      }

      setResult(json as AnalysisResult);
      setActiveTab('metrics');
      setShowImport(false);

      setSuccess(
        `Calculation completed for ${json.rows.length} runners.`
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to calculate analysis.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function calculateRatings(selectedHorse = lineHorse, assignedMR = lineMR) {
    if (!result || !metadata) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.date)) {
      setError('The CSV needs a race date in YYYY-MM-DD format for WFA calculations.');
      return;
    }
    if (assignedMR.trim() && (!/^\d+$/.test(assignedMR) || Number(assignedMR) > 200)) {
      setError('Line MR must be a whole number between 0 and 200.');
      return;
    }
    const manual: Record<string, number> = {};
    for (const [horse, age] of Object.entries(missingAges)) {
      if (!age.trim()) continue;
      if (!/^\d+$/.test(age) || Number(age) < 2 || Number(age) > 15) {
        setError(`Age for ${horse} must be a whole number between 2 and 15.`);
        return;
      }
      manual[horse] = Number(age);
    }
    setRatingsLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/proxy?action=ratings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_m: result.distance_m,
          race_date: metadata.date,
          metrics_rows: result.rows,
          source_rows: rows,
          race_diagnostics: result.race_diagnostics,
          line_horse: selectedHorse || null,
          line_mr: assignedMR.trim() ? Number(assignedMR) : null,
          missing_ages: manual,
        }),
        cache: 'no-store',
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.replace('/login');
        return;
      }
      if (!response.ok) {
        throw new Error(errorMessage(json.detail || json.error, `Ratings failed (${response.status})`));
      }
      if (!json || !Array.isArray(json.rows)) {
        throw new Error('The backend returned an invalid ratings response.');
      }
      const data = json as RatingsResult;
      setRatings(data);
      setRatingsDirty(false);
      setLineHorse(data.line_horse);
      setLineMR(String(data.line_mr));
      setSuccess(data.ready
        ? `Calculated MR Achieved for ${data.rows.length} runners. Not saved.`
        : `Enter the ${data.missing_ages.length} missing age(s) to calculate MR Achieved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to calculate ratings.');
    } finally {
      setRatingsLoading(false);
    }
  }


  function prepareDatabaseDraft() {
    if (!result || !metadata || !ratings?.ready || ratingsDirty || !planeData) {
      setError('Calculate current handicap ratings and Race Plane before preparing the database draft.');
      return;
    }
    const ratingByHorse = new Map(ratings.rows.map(r => [r.Horse.trim().toUpperCase(), r]));
    const planeByHorse = new Map(planeData.rows.map(r => [r.Horse.trim().toUpperCase(), r]));
    const sourceByHorse = new Map(rows.map(r => [String(r.Horse ?? '').trim().toUpperCase(), r]));
    const fieldSize = result.rows.length;
    const runners = result.rows.map((metric, index) => {
      const horse = String(metric.Horse ?? '').trim();
      const key = horse.toUpperCase();
      const rating = ratingByHorse.get(key);
      const plane = planeByHorse.get(key);
      const source = sourceByHorse.get(key) ?? {};
      const finish = firstValue(metric, ['Finish_Pos', 'Finish Position', 'Fin', 'Position'])
        ?? firstValue(source, ['Finish_Pos', 'Finish Position', 'Fin', 'Position']);
      const finishNumber = draftNumber(finish);
      const front = firstValue(metric, ['F200_idx', 'F200', 'F200_Index', 'F200 index']);
      const cg = firstValue(metric, ['Grind_CG', 'Corrected_Grind', 'Corrected Grind']);
      return {
        horse,
        finish_position: finishNumber !== null && Number.isInteger(finishNumber)
          ? `${finishNumber}/${fieldSize}` : `—/${fieldSize}`,
        official_mr: draftNumber(rating?.['Official MR'] ?? firstValue(metric, ['Official MR', 'Official_MR'])),
        mr_achieved: draftNumber(rating?.['MR Achieved']),
        sustain_residual: draftNumber(plane?.Sustain_Residual),
        sustain_verdict: plane?.Sustain_Profile ?? 'Unavailable',
        analyst_note: `F ${phaseValue(front)} | T ${phaseValue(metric.tsSPI)} | A ${phaseValue(metric.Accel)} | CG ${phaseValue(cg)}\n\nNotes:\n`,
      };
    });
    const draft = {
      race_date: metadata.date,
      track: metadata.track,
      course: metadata.course,
      race_number: Number(metadata.raceNumber),
      distance: result.distance_m,
      rpss: draftNumber(result.race_diagnostics?.RPSS ?? result.race_diagnostics?.rpss ?? result.rows[0]?.RPSS),
      race_test: planeData.race_test_profile.label,
      runners,
    };
    try {
      sessionStorage.setItem('race-edge-database-draft-v1', JSON.stringify(draft));
      window.location.assign('/database');
    } catch {
      setError('Could not store the race draft in this browser. Please check storage settings.');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.background,
        color: COLORS.text,
        fontFamily:
          'Arial, Helvetica, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '18px 20px',
          borderBottom: `1px solid ${COLORS.border}`,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 21,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          >
            RACE{' '}
            <span style={{ color: COLORS.gold }}>
              EDGE
            </span>
            <sup
              style={{
                fontSize: 10,
                color: COLORS.muted,
              }}
            >
              {' '}2.0
            </sup>
          </div>

          <div
            style={{
              color: COLORS.muted,
              fontSize: 10,
              letterSpacing: 1.6,
              marginTop: 4,
            }}
          >
            PERFORMANCE INTELLIGENCE
          </div>
        </div>

        <a
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            color: COLORS.gold,
            textDecoration: 'none',
            fontSize: 13,
            border: `1px solid ${COLORS.border}`,
            padding: '10px 12px',
            borderRadius: 7,
          }}
        >
          <ArrowLeft size={15} />
          Race Control
        </a>
      </header>

      <main
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: '24px 16px 60px',
        }}
      >
        <div style={{ marginBottom: 25 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: COLORS.gold,
              fontWeight: 700,
            }}
          >
            02 / RACE ANALYSIS
          </div>

          <h1
            style={{
              fontSize: 'clamp(26px, 5vw, 38px)',
              margin: '10px 0',
              letterSpacing: -0.7,
            }}
          >
            Sectional Performance Lab
          </h1>

          <p
            style={{
              color: COLORS.muted,
              fontSize: 14,
              lineHeight: 1.6,
              maxWidth: 680,
            }}
          >
            Import complete race sectionals and
            calculate performance metrics using
            the existing Race Edge engine.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              ...panelStyle,
              marginBottom: 16,
              borderColor: '#a64d56',
              color: '#ffb8bf',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              overflowWrap: 'anywhere',
            }}
          >
            <CircleAlert size={19} />
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            style={{
              ...panelStyle,
              marginBottom: 16,
              borderColor: '#386a5d',
              color: '#a2dfc7',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <CheckCircle2 size={19} />
            {success}
          </div>
        )}

        <section style={{ ...panelStyle, marginBottom: 18, padding: 14 }}>
          <button type="button" onClick={() => setShowImport(v => !v)}
            aria-expanded={showImport}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 0, color: COLORS.gold, cursor: 'pointer', fontWeight: 800, fontSize: 13, padding: 5 }}>
            <span>IMPORT & CALCULATION SETTINGS {fileName ? `· ${fileName}` : ''}</span>
            <ChevronDown size={17} style={{ transform: showImport ? 'rotate(180deg)' : 'none' }} />
          </button>
          {showImport && <div style={{ marginTop: 18 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 330px), 1fr))',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <section style={panelStyle}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                color: COLORS.gold,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                marginBottom: 16,
              }}
            >
              <Upload size={17} />
              01 / IMPORT SECTIONALS
            </div>

            <label
              style={{
                display: 'block',
                border: `1px dashed ${COLORS.gold}`,
                borderRadius: 10,
                padding: '30px 15px',
                textAlign: 'center',
                cursor: 'pointer',
                background: '#0b1829',
              }}
            >
              <FileSpreadsheet
                size={35}
                color={COLORS.gold}
                style={{ margin: '0 auto 12px' }}
              />

              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                Select sectional CSV
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: COLORS.muted,
                  marginTop: 8,
                }}
              >
                Race Edge CSV Builder export
              </div>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                style={{ display: 'none' }}
              />
            </label>

            {fileName && (
              <div
                style={{
                  marginTop: 15,
                  fontSize: 12,
                  color: COLORS.gold,
                  overflowWrap: 'anywhere',
                }}
              >
                <CheckCircle2
                  size={14}
                  style={{
                    display: 'inline',
                    verticalAlign: 'middle',
                    marginRight: 7,
                  }}
                />
                {fileName}
              </div>
            )}
          </section>

          <section style={panelStyle}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                color: COLORS.gold,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                marginBottom: 16,
              }}
            >
              <Flag size={17} />
              02 / RACE INFORMATION
            </div>

            {metadata ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 15,
                }}
              >
                {[
                  ['DATE', metadata.date],
                  ['TRACK', metadata.track],
                  ['COURSE', metadata.course],
                  ['SURFACE', metadata.surface],
                  ['RACE', metadata.raceNumber],
                  ['RUNNERS', String(rows.length)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div
                      style={{
                        color: COLORS.muted,
                        fontSize: 10,
                        marginBottom: 5,
                      }}
                    >
                      {label}
                    </div>

                    <strong style={{ fontSize: 14 }}>
                      {value || '—'}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{
                  color: COLORS.muted,
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                Upload a CSV to automatically
                identify the meeting, distance,
                surface and sectional format.
              </p>
            )}
          </section>
        </div>

        <section
          style={{
            ...panelStyle,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              color: COLORS.gold,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              marginBottom: 20,
            }}
          >
            <Gauge size={17} />
            03 / CALCULATION SETTINGS
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
              gap: 15,
            }}
          >
            <label>
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.muted,
                  marginBottom: 8,
                }}
              >
                RACE DISTANCE (M)
              </div>

              <input
                type="number"
                min={1}
                max={3600}
                value={distance || ''}
                onChange={e =>
                  setDistance(Number(e.target.value))
                }
                style={inputStyle}
              />
            </label>

            <label>
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.muted,
                  marginBottom: 8,
                }}
              >
                SECTIONAL INTERVAL
              </div>

              <div style={{ position: 'relative' }}>
                <select
                  value={step}
                  onChange={e =>
                    setStep(
                      Number(e.target.value) as
                        100 | 200
                    )
                  }
                  style={{
                    ...inputStyle,
                    appearance: 'none',
                  }}
                >
                  <option value={100}>100m</option>
                  <option value={200}>200m</option>
                </select>

                <ChevronDown
                  size={15}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 14,
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </label>

            <label>
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.muted,
                  marginBottom: 8,
                }}
              >
                GOING
              </div>

              <input
                value={going}
                onChange={e =>
                  setGoing(e.target.value)
                }
                style={inputStyle}
              />
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
              marginTop: 22,
            }}
          >
            {[
              {
                label: 'Corrected Grind',
                checked: useCG,
                change: setUseCG,
              },
              {
                label: 'CG Dampening',
                checked: dampenCG,
                change: setDampenCG,
              },
              {
                label: 'Race Shape',
                checked: useRaceShape,
                change: setUseRaceShape,
              },
            ].map(option => (
              <label
                key={option.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={option.checked}
                  onChange={e =>
                    option.change(e.target.checked)
                  }
                  style={{
                    accentColor: COLORS.gold,
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={
              !rows.length ||
              !distance ||
              distance > 3600 ||
              loading
            }
            onClick={calculate}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: 15,
              marginTop: 25,
              border: 0,
              borderRadius: 8,
              background:
                !rows.length || loading
                  ? '#596273'
                  : COLORS.gold,
              color: '#091321',
              fontWeight: 800,
              fontSize: 14,
              cursor:
                !rows.length || loading
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {loading ? (
              <>
                <RefreshCw size={17} />
                CALCULATING...
              </>
            ) : (
              <>
                <Play size={17} />
                CALCULATE RACE ANALYSIS
              </>
            )}
          </button>
        </section>

          </div>}
        </section>

        {result && (
          <>
            <div style={{ ...panelStyle, marginBottom: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: COLORS.gold, fontWeight: 800, letterSpacing: 1 }}>ANALYSED RACE</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 5 }}>
                  {metadata?.track || 'Race'} · R{metadata?.raceNumber || '—'} · {result.distance_m}m
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
                  {metadata?.date || '—'} · {result.rows.length} runners · RPSS {(() => {
                    const value = draftNumber(result.race_diagnostics?.RPSS ?? result.race_diagnostics?.rpss ?? result.rows[0]?.RPSS);
                    return value === null ? '—' : value.toFixed(2);
                  })()}
                </div>
              </div>
              <button type="button" onClick={prepareDatabaseDraft}
                disabled={!ratings?.ready || ratingsDirty || !planeData}
                title={!ratings?.ready || ratingsDirty || !planeData ? 'Complete current handicap ratings and Race Plane first' : 'Open Database Verification'}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', border: 0, borderRadius: 8, background: ratings?.ready && !ratingsDirty && planeData ? COLORS.gold : '#596273', color: COLORS.background, fontWeight: 800, cursor: ratings?.ready && !ratingsDirty && planeData ? 'pointer' : 'not-allowed' }}>
                <Database size={17} /> VERIFY & SAVE
              </button>
            </div>
            <nav aria-label="Analysis tabs" style={{ display: 'flex', gap: 7, overflowX: 'auto', WebkitOverflowScrolling: 'touch', position: 'sticky', top: 0, zIndex: 20, background: COLORS.background, padding: '10px 0 13px', marginBottom: 8 }}>
              {([['metrics','Core Metrics'],['pace','Pace Curves'],['handicap','Handicap Ratings'],['plane','Race Plane'],['summary','Race Summary']] as const).map(([id,label]) => (
                <button key={id} type="button" onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined}
                  style={{ flexShrink: 0, padding: '11px 15px', borderRadius: 8, border: `1px solid ${activeTab === id ? COLORS.gold : COLORS.border}`, background: activeTab === id ? COLORS.gold : COLORS.panel, color: activeTab === id ? COLORS.background : COLORS.text, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </nav>
          </>
        )}

        {result && (
          <div style={{ display: activeTab === 'handicap' ? 'block' : 'none' }}>
          <section style={{ ...panelStyle, marginBottom: 20 }}>
            <div style={{ color: COLORS.gold, fontWeight: 800, fontSize: 13, letterSpacing: 1, marginBottom: 12 }}>
              04 / AHEAD OF THE HANDICAP
            </div>
            <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.6 }}>
              Calculate the original line-horse anchored, WFA-adjusted MR Achieved. Ages supplied in the CSV are locked; only missing ages can be entered.
            </p>
            {!ratings ? (
              <button type="button" disabled={ratingsLoading} onClick={() => calculateRatings()}
                style={{ ...inputStyle, background: COLORS.gold, color: COLORS.background, fontWeight: 800, cursor: 'pointer' }}>
                {ratingsLoading ? 'CALCULATING RATINGS...' : 'LOAD HANDICAP RATINGS'}
              </button>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 14, marginTop: 18 }}>
                  <label>
                    <div style={{ color: COLORS.muted, fontSize: 11, marginBottom: 7 }}>LINE HORSE</div>
                    <select value={lineHorse} onChange={e => {
                      const horse = e.target.value;
                      setLineHorse(horse);
                      setRatingsDirty(true);
                      const row = ratings.rows.find(r => r.Horse === horse);
                      setLineMR(String(row?.['Official MR'] ?? 100));
                    }} style={inputStyle}>
                      {ratings.rows.map(r => <option key={r.Horse} value={r.Horse}>{r.Horse}</option>)}
                    </select>
                  </label>
                  <label>
                    <div style={{ color: COLORS.muted, fontSize: 11, marginBottom: 7 }}>ASSIGNED LINE MR</div>
                    <input type="number" min={0} max={200} step={1} value={lineMR}
                      onChange={e => { setLineMR(e.target.value); setRatingsDirty(true); }} style={inputStyle}/>
                  </label>
                </div>
                {ratings.suggested_line_horse && (
                  <p style={{ color: COLORS.muted, fontSize: 12 }}>
                    Suggested line horse: <strong style={{ color: COLORS.gold }}>{ratings.suggested_line_horse}</strong>
                  </p>
                )}
                {ratings.missing_ages.length > 0 && (
                  <div style={{ marginTop: 15 }}>
                    <div style={{ color: COLORS.gold, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>MISSING AGES — ENTRY REQUIRED</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
                      {ratings.missing_ages.map(horse => (
                        <label key={horse}>
                          <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>{horse}</div>
                          <input type="number" min={2} max={15} step={1} placeholder="Enter age"
                            value={missingAges[horse] || ''}
                            onChange={e => { setMissingAges(prev => ({ ...prev, [horse]: e.target.value })); setRatingsDirty(true); }}
                            style={inputStyle}/>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <button type="button" disabled={ratingsLoading} onClick={() => calculateRatings()}
                  style={{ ...inputStyle, background: COLORS.gold, color: COLORS.background, fontWeight: 800, marginTop: 17, cursor: 'pointer' }}>
                  {ratingsLoading ? 'CALCULATING...' : 'RECALCULATE MR ACHIEVED'}
                </button>
                {ratingsDirty && <p style={{ color: '#ffcb88', fontSize: 12 }}>Inputs changed — recalculate to update the ratings below.</p>}
                <div style={{ overflowX: 'auto', marginTop: 18, WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, whiteSpace: 'nowrap' }}>
                    <thead><tr>{['HORSE','AGE','PI','PERFORMANCE MR','OFFICIAL MR','MR ACHIEVED','MR EDGE'].map(col =>
                      <th key={col} style={{ textAlign: 'left', color: COLORS.gold, padding: '10px 12px', borderBottom: `1px solid ${COLORS.border}` }}>{col}</th>)}</tr></thead>
                    <tbody>{ratings.rows.map(r => (
                      <tr key={r.Horse}>
                        {[r.Horse, r.Age == null ? 'Missing' : `${r.Age} (CSV${r['Age Source'] === 'CSV' ? '' : ': entered'})`, r.PI, r['Performance MR'], r['Official MR'], r['MR Achieved'], r['MR Edge']].map((value, index) =>
                          <td key={index} style={{ padding: '10px 12px', borderBottom: `1px solid ${COLORS.border}`, color: index === 5 ? COLORS.gold : COLORS.text, fontWeight: index === 5 ? 800 : 400 }}>{formatValue(value)}</td>) }
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <p style={{ color: COLORS.muted, fontSize: 12, marginTop: 12 }}>
                  {ratings.ready ? 'MR Achieved calculated. Results are not saved.' : 'MR Achieved is withheld until all missing ages are supplied.'}
                </p>
              </>
            )}
          </section>
          </div>
        )}

        {result && (
          <div className="race-edge-core-tabs" data-view={activeTab} style={{ display: activeTab === 'metrics' || activeTab === 'pace' ? 'block' : 'none' }}>
          <style>{`
            .race-edge-core-tabs[data-view="metrics"] > section:nth-of-type(2) { display: none; }
            .race-edge-core-tabs[data-view="pace"] > section:nth-of-type(1),
            .race-edge-core-tabs[data-view="pace"] > section:nth-of-type(3) { display: none; }
          `}</style>
          <CoreMetricsDashboard
            result={result}
            sourceRows={rows}
            ratings={ratings && !ratingsDirty && ratings.ready ? ratings : null}
          />
          </div>
        )}

        {result && (
          <div style={{ display: activeTab === 'plane' ? 'block' : 'none' }}>
            <RacePlaneDashboard result={result} onPlaneChange={setPlaneData} />
          </div>
        )}

        {result && activeTab === 'summary' && (
          <RaceIntelligenceSummary
            result={result}
            sourceRows={rows}
            metadata={metadata}
            ratings={ratings}
            ratingsDirty={ratingsDirty}
            planeData={planeData}
            analystConclusion={analystConclusion}
            setAnalystConclusion={setAnalystConclusion}
            onVerify={prepareDatabaseDraft}
            canVerify={!!ratings?.ready && !ratingsDirty && !!planeData}
          />
        )}


        <div
          style={{
            textAlign: 'center',
            color: COLORS.muted,
            fontSize: 11,
            marginTop: 35,
            lineHeight: 1.7,
          }}
        >
          RACE EDGE 2.0 · PRIVATE PERFORMANCE INTELLIGENCE
          <div>
            Calculations are not saved to the database.
          </div>
        </div>
      </main>
    </div>
  );
}

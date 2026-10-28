
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

function csvOfficialMR(row: DataRow | undefined): number | null {
  if (!row) return null;
  return draftNumber(firstValue(row, ['Official MR', 'Official_MR', 'OfficialMR', 'MR', 'Merit Rating', 'Merit_Rating']));
}

function csvHorse(row: DataRow): string {
  return String(firstValue(row, ['Horse', 'horse', 'Horse Name', 'Horse_Name']) ?? '').trim();
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


// Public-facing report. All proprietary indices remain internal to this workspace.
function exportPerformanceReport(
  result: AnalysisResult, sourceRows: DataRow[], metadata: RaceMetadata | null,
  ratings: RatingsResult | null, ratingsDirty: boolean,
  planeData: PlaneDraftResult | null, analystConclusion: string,
  selectedHorse: string,
) {
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
  const num = (r: DataRow | undefined, keys: string[]) => r ? draftNumber(firstValue(r, keys)) : null;
  const key = (v: unknown) => String(v ?? '').trim().toUpperCase();
  const selected = result.rows.find(r => key(r.Horse) === key(selectedHorse));
  if (!selected) { window.alert('Select a horse for the Performance Intelligence Report.'); return; }
  if (!ratings?.ready || ratingsDirty) { window.alert('Calculate current MR Achieved before exporting the report.'); return; }
  const ratingsMap = new Map(ratings.rows.map(r => [key(r.Horse), r]));
  const sourceMap = new Map(sourceRows.map(r => [key(r.Horse), r]));
  const planeMap = new Map((planeData?.rows ?? []).map(r => [key(r.Horse), r]));
  const selectedKey = key(selected.Horse);
  const rating = ratingsMap.get(selectedKey);
  const official = num(rating, ['Official MR']);
  const achieved = num(rating, ['MR Achieved']);
  const position = num(selected, ['Finish_Pos','Finish Position','Fin','Position']) ?? num(sourceMap.get(selectedKey), ['Finish_Pos','Finish Position','Fin','Position']);
  const winner = result.rows.find(r => (num(r, ['Finish_Pos','Finish Position','Fin','Position']) ?? num(sourceMap.get(key(r.Horse)), ['Finish_Pos','Finish Position','Fin','Position'])) === 1);
  const lineName = ratings.line_horse || '';
  const rpss = draftNumber(result.race_diagnostics?.RPSS ?? result.race_diagnostics?.rpss ?? result.rows[0]?.RPSS);
  const pace = rpss === null ? 'Not assessed' : rpss > 98 ? 'Fast-paced race' : rpss >= 94 ? 'Evenly run race' : 'Slow-paced race';
  const paceContext = rpss === null ? 'Race pace cannot be classified reliably from the available data.' : rpss > 98 ? 'A fast overall pace places greater emphasis on energy expenditure and the ability to sustain speed under pressure. Late deceleration must be considered against the demands of the earlier stages.' : rpss < 94 ? 'A slow overall pace may preserve energy for the finish. Late acceleration is not by itself proof of exceptional stamina or finishing ability.' : 'An even overall pace offers a useful reference for sustained performance, although the distribution of speed across individual sections remains important.';
  const metricDefs = [
    {name:'Gate Speed', keys:['F200_idx','F200','F200_Index','F200 index']},
    {name:'Cruising Speed', keys:['tsSPI']},
    {name:'Acceleration', keys:['Accel']},
    {name:'Finishing Strength', keys:['Grind_CG','Corrected_Grind','Corrected Grind']},
  ];
  const positive = (s: string) => s === 'Strong' || s === 'Above average';
  const negative = (s: string) => s === 'Weak' || s === 'Below average';
  const assessment = (keys: string[]) => {
    const value = num(selected, keys);
    const values = result.rows.map(r => num(r, keys)).filter((v): v is number => v !== null).sort((a,b) => b-a);
    if (value === null || values.length < 2) return 'Not assessed';
    const rank = values.filter(v => v > value).length;
    const fraction = rank / (values.length - 1);
    return fraction <= .2 ? 'Strong' : fraction <= .4 ? 'Above average' : fraction <= .65 ? 'Average' : fraction <= .85 ? 'Below average' : 'Weak';
  };
  const phases = metricDefs.map(d => assessment(d.keys));
  const normalGrind = num(selected, ['Grind','Normal_Grind','Normal Grind']);
  const correctedGrind = num(selected, ['Grind_CG','Corrected_Grind','Corrected Grind']);
  const correctionGap = normalGrind !== null && correctedGrind !== null ? normalGrind - correctedGrind : null;
  const fieldAssisted = correctionGap !== null && correctionGap > 0;
  const correctionCaution = correctionGap === null ? 'The distinction between apparent and adjusted finishing strength could not be assessed.' : fieldAssisted ? 'The apparent finishing performance was reduced after allowing for the wider field pattern. Some of the visual finishing advantage may reflect opponents weakening; the size of this effect should not be overstated.' : correctionGap > 0 ? 'The adjusted assessment is slightly less favourable than the apparent finish; the difference is not sufficient on its own to conclude that the finish was field-assisted.' : 'The adjusted finishing assessment does not indicate a material benefit from the field weakening.';
  const markerNumbers = Object.keys(sourceRows[0] ?? {}).filter(k => /^\d+_Time$/.test(k)).map(k => Number(k.split('_')[0])).sort((a,b) => b-a);
  const segments: {remaining:number; distance:number; key:string}[] = [];
  if (markerNumbers.length) {
    if (result.distance_m > markerNumbers[0]) segments.push({remaining:markerNumbers[0],distance:result.distance_m-markerNumbers[0],key:`${markerNumbers[0]}_Time`});
    for (let i=1;i<markerNumbers.length;i++) segments.push({remaining:markerNumbers[i],distance:markerNumbers[i-1]-markerNumbers[i],key:`${markerNumbers[i]}_Time`});
    segments.push({remaining:0,distance:result.step,key:'Finish_Time'});
  }
  // Exactly the same distance/time construction as the existing CoreMetricsDashboard; convert m/s to km/h.
  const speed = (horseName: string) => segments.map(s => { const t = num(sourceMap.get(key(horseName)), [s.key]); return t !== null && t > 0 ? 3.6*s.distance/t : null; });
  const allSpeeds = result.rows.map(r => speed(String(r.Horse ?? '')));
  const avg = segments.map((_,i) => { const a = allSpeeds.map(s => s[i]).filter((v): v is number => v !== null); return a.length ? a.reduce((x,y)=>x+y,0)/a.length : null; });
  const selectedSpeeds = speed(String(selected.Horse));
  const winnerName = String(winner?.Horse ?? '');
  const series: {label:string; color:string; dashed?:boolean; values:(number|null)[]}[] = [{label:'Field average',color:'#8a96a5',dashed:true,values:avg}];
  const featured = [{name:winnerName,label:'Winner',color:'#c59b48'},{name:lineName,label:'Line horse',color:'#168e91'},{name:String(selected.Horse),label:'Selected horse',color:'#8059c7'}];
  for (const item of featured) {
    if (!item.name || series.some(s => s.label !== 'Field average' && key(s.label.split(' — ')[1]) === key(item.name))) continue;
    const roles = featured.filter(f => key(f.name) === key(item.name)).map(f => f.label).join(' / ');
    series.push({label:`${roles} — ${item.name}`,color:item.color,values:speed(item.name)});
  }
  const values = series.flatMap(s => s.values).filter((v):v is number => v !== null);
  const lo = values.length ? Math.floor((Math.min(...values)-1)/2)*2 : 40;
  const hi = values.length ? Math.ceil((Math.max(...values)+1)/2)*2 : 70;
  const W=950,H=345,L=64,R=20,T=18,B=54;
  const x=(i:number)=>L+(segments.length>1?i/(segments.length-1):.5)*(W-L-R);
  const y=(v:number)=>T+(hi-v)/(hi-lo||1)*(H-T-B);
  const path=(v:(number|null)[])=>v.map((n,i)=>n===null?'':`${i===0||v[i-1]===null?'M':'L'}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
  const grid=Array.from({length:5},(_,i)=>{const v=lo+(hi-lo)*i/4;return `<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#e3e8ef"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#58697b">${v.toFixed(1)}</text>`;}).join('');
  const ticks=segments.map((s,i)=>`<text x="${x(i)}" y="${H-27}" text-anchor="middle" font-size="11" fill="#536478">${s.remaining===0?'Finish':`${s.remaining}m`}</text>`).join('');
  const lines=series.map(s=>`<path d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="${s.dashed?2.5:3.7}" ${s.dashed?'stroke-dasharray="8 5"':''} stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const chart=segments.length>1 && values.length ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Actual sectional speed curves in kilometres per hour"><rect width="${W}" height="${H}" fill="white"/>${grid}${ticks}${lines}<text x="${W/2}" y="${H-5}" text-anchor="middle" font-size="12" fill="#263d55">Distance remaining</text><text transform="translate(15 ${H/2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#263d55">Actual speed (km/h)</text></svg>` : '<p>Actual sectional speeds unavailable.</p>';
  const legend=series.map(s=>`<span class="legend"><i style="background:${s.color};${s.dashed?'border-top:2px dashed #8a96a5;background:none;height:0;':''}"></i>${esc(s.label)}</span>`).join('');
  const delta = selectedSpeeds.map((v,i)=>v!==null && avg[i]!==null?v-avg[i]!:null);
  const first = delta.find(v=>v!==null) ?? null;
  const last = [...delta].reverse().find(v=>v!==null) ?? null;
  const late = selectedSpeeds.length>1 ? selectedSpeeds[selectedSpeeds.length-1] : null;
  const penultimate = selectedSpeeds.length>1 ? selectedSpeeds[selectedSpeeds.length-2] : null;
  const speedTrend = late === null || penultimate === null ? 'The closing speed trend cannot be assessed reliably.' : late > penultimate + .5 ? 'The horse increased its actual speed in the final sectional interval.' : late < penultimate - .5 ? 'The horse decelerated into the finish.' : 'The horse broadly maintained its speed through the final sectional interval.';
  const relativeTrend = first === null || last === null ? 'There is insufficient comparable sectional evidence to establish its change relative to the field.' : last > first + .7 ? 'Its relative position against the field speed average improved from the opening to the closing section.' : last < first - .7 ? 'Its relative sectional speed deteriorated against the field between the opening and closing stages.' : 'Its relative sectional speed remained broadly consistent between the opening and closing stages.';
  const distanceVerdict = !segments.length || late === null ? 'Distance suitability inconclusive' : negative(phases[3]) && negative(phases[1]) ? 'Consider shorter — provisional' : positive(phases[1]) && positive(phases[3]) && !fieldAssisted && rpss !== null && rpss > 98 ? 'Consider further — provisional' : 'Current distance / inconclusive';
  const distanceReason = distanceVerdict.startsWith('Consider further') ? 'The combination of sustained cruising speed, adjusted finishing strength and a demanding overall tempo provides a reason to investigate a longer trip. This race alone does not prove the horse will stay further.' : distanceVerdict.startsWith('Consider shorter') ? 'The weaker sustained and finishing phases suggest that a shorter trip may merit investigation. A difficult pace distribution, race position or other race circumstances could also explain the decline.' : 'The present race does not supply sufficiently decisive evidence to recommend a distance change. Compare MR Achieved and sectional profiles across the horse’s previous runs at different distances before making a stronger recommendation.';
  const ratingNote = achieved===null ? 'MR Achieved is unavailable for this runner.' : official===null ? 'MR Achieved is available; an official mark was not supplied for a direct comparison.' : achieved>official ? 'MR Achieved exceeded the official rating in this assessment.' : achieved<official ? 'MR Achieved was below the official rating in this assessment.' : 'MR Achieved matched the official rating in this assessment.';
  const date = metadata?.date && /^\d{4}-\d{2}-\d{2}$/.test(metadata.date) ? new Date(`${metadata.date}T12:00:00`).toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}) : metadata?.date || 'Not specified';
  const metricCards = metricDefs.map((d,i)=>`<div class="metric"><div class="eyebrow">${esc(d.name)}</div><h3>${esc(phases[i])}</h3><p>${esc(i===0 ? `The opening-speed assessment is ${phases[i].toLowerCase()} relative to this field. ${rpss!==null && rpss>98?'A demanding overall tempo increases the importance of early energy use.':'Early speed must be interpreted alongside the overall race tempo.'}` : i===1 ? `Sustained cruising speed was ${phases[i].toLowerCase()} compared with the runners in this race. The actual curve helps show whether this advantage persisted through the middle stages.` : i===2 ? `Acceleration was ${phases[i].toLowerCase()} relative to the field. A late burst after a restrained tempo should not be confused with proven acceleration under sustained pressure.` : `Adjusted finishing strength was ${phases[i].toLowerCase()} relative to the field. ${correctionCaution}`)}</p></div>`).join('');
  const page = (n:number,subtitle:string,content:string)=>`<section class="page"><div class="top"><span>RACE EDGE <b>ANALYTICS</b></span><span>PERFORMANCE INTELLIGENCE / ${String(n).padStart(2,'0')}</span></div><div class="heading"><h1>${esc(subtitle)}</h1><p>${esc(metadata?.track || 'Race')} · Race ${esc(metadata?.raceNumber || '—')} · ${result.distance_m}m · ${esc(date)} · ${esc(selected.Horse)}</p></div>${content}<div class="footer"><span>RACE EDGE ANALYTICS | Kiran Singh</span><span>Page ${n} of 4</span></div></section>`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Race Edge Analytics — ${esc(selected.Horse)} — Performance Intelligence</title><style>
  @page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#152b43;background:#e9edf2;font-size:11px;line-height:1.45}.toolbar{background:#10243c;padding:12px;text-align:center;color:white}.toolbar button{background:#d2a757;border:0;border-radius:5px;padding:10px 20px;font-weight:800;cursor:pointer}.page{width:297mm;height:210mm;padding:13mm 17mm 15mm;background:#fff;margin:8mm auto;position:relative;overflow:hidden;page-break-after:always}.page:last-child{page-break-after:auto}.top{display:flex;justify-content:space-between;border-bottom:2px solid #c69d50;padding-bottom:8px;font-size:10px;font-weight:800;letter-spacing:1.5px}.top span:first-child{color:#102a46}.top b{color:#bb8c39}.heading{margin:15px 0 16px}.heading h1{font-size:23px;margin:0 0 5px;color:#102a46}.heading p{margin:0;color:#6a7b8c;font-size:11px}.eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#637487;font-weight:800}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.box,.metric{border:1px solid #dce3eb;padding:13px;border-radius:4px;break-inside:avoid}.box h2{font-size:13px;color:#102a46;margin:0 0 7px}.box p,.metric p{margin:5px 0}.metric h3{font-size:17px;margin:6px 0;color:#102a46}.gold{color:#a77c30}.large{font-size:25px;font-weight:800;color:#102a46}.strip{background:#f1f4f8;padding:13px 15px;border-left:4px solid #c69d50;margin:12px 0}.strip h2{margin:0 0 5px;font-size:13px}.strip p{margin:0}.section{font-size:13px;font-weight:800;color:#102a46;margin:17px 0 8px;border-bottom:1px solid #d6a95b;padding-bottom:5px}.legend{display:inline-flex;align-items:center;gap:6px;margin-right:18px;font-size:10px}.legend i{width:21px;height:4px;display:inline-block}.legendrow{margin:4px 0 8px}.chart{border:1px solid #dce3eb;padding:5px 12px 0}.muted{color:#637487}.note{font-size:10px;color:#607186}.footer{position:absolute;bottom:10mm;left:17mm;right:17mm;display:flex;justify-content:space-between;border-top:1px solid #c69d50;padding-top:8px;color:#607186;font-size:9px;font-weight:800;letter-spacing:.5px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:11px}.metric{min-height:115px}.quote{white-space:pre-wrap}.tight p{margin:5px 0}.small{font-size:10px}@media print{body{background:#fff}.toolbar{display:none}.page{margin:0;box-shadow:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}}@media screen{.page{box-shadow:0 5px 24px #0002}} </style></head><body><div class="toolbar"><button onclick="window.print()">Save / Print PDF</button> &nbsp; Select A4 landscape, disable browser headers/footers and enable background graphics.</div>
  ${page(1,'Race Context & Pace Assessment',`<div class="grid"><div class="box"><div class="eyebrow">Selected horse</div><div class="large">${esc(selected.Horse)}</div><p>${position===null?'Finish position unavailable':`Finished ${esc(position)} of ${result.rows.length}`}</p></div><div class="box"><div class="eyebrow">MR Achieved</div><div class="large gold">${achieved===null?'—':Math.round(achieved)}</div><p>Official MR: ${official===null?'—':Math.round(official)}</p></div><div class="box"><div class="eyebrow">Race pace</div><div class="large" style="font-size:20px">${esc(pace)}</div><p>Overall race-tempo assessment</p></div></div><div class="section">Race shape and its implications</div><div class="strip"><h2>Understanding the pace</h2><p>${esc(paceContext)}</p></div><div class="two"><div class="box"><h2>Performance context</h2><p>${esc(ratingNote)}</p><p>All sectional interpretations are relative to this field and should be read in the context of the overall race tempo.</p></div><div class="box"><h2>Race reference horses</h2><p><b>Winner:</b> ${esc(winnerName||'Not identified')}</p><p><b>Line horse:</b> ${esc(lineName||'Not available')}</p><p>The line horse anchors the MR Achieved assessment. The winner, line horse and whole-field average provide speed-curve comparisons.</p></div></div><p class="note">The pace category is derived from Race Edge's internal race assessment. The underlying calculation is not published. Race pace does not by itself establish the cause of an individual performance.</p>`)}
  ${page(2,'Actual Sectional Speed Curve',`<p class="muted">Recorded sectional speeds, expressed in km/h. The average is calculated independently for every sectional interval using all runners. Duplicate reference roles share one line.</p><div class="legendrow">${legend}</div><div class="chart">${chart}</div><div class="two" style="margin-top:12px"><div class="box tight"><h2>Speed progression</h2><p>${esc(speedTrend)}</p><p>${esc(relativeTrend)}</p></div><div class="box tight"><h2>Interpreting the race shape</h2><p>${esc(paceContext)}</p><p>The speed curve shows observed speed changes, not whether a horse was fully extended, interfered with or deliberately restrained.</p></div></div>`)}
  ${page(3,'Selected Horse Performance Intelligence',`<div class="metrics">${metricCards}</div><div class="strip"><h2>Finishing strength: genuine or field-assisted?</h2><p>${esc(correctionCaution)}</p></div><div class="two"><div class="box"><h2>Merit Rating Achieved</h2><p><strong>MR Achieved: ${achieved===null?'—':Math.round(achieved)}</strong> &nbsp; | &nbsp; Official MR: ${official===null?'—':Math.round(official)}</p><p>${esc(ratingNote)} The assessment is anchored to the selected line horse and must be interpreted alongside race pace and the sectional evidence.</p></div><div class="box"><h2>Overall assessment</h2><p>${esc(`Gate speed: ${phases[0].toLowerCase()}; cruising speed: ${phases[1].toLowerCase()}; acceleration: ${phases[2].toLowerCase()}; finishing strength: ${phases[3].toLowerCase()}.`)}</p><p>${esc(paceContext)}</p></div></div>`)}
  ${page(4,'Distance Suitability & Future Implications',`<div class="strip"><h2>Distance suitability: ${esc(distanceVerdict)}</h2><p>${esc(distanceReason)}</p></div><div class="two"><div class="box"><h2>Evidence from the speed curve</h2><p>${esc(speedTrend)}</p><p>${esc(relativeTrend)}</p><p>${esc(correctionCaution)}</p></div><div class="box"><h2>What to test next</h2><p>Compare MR Achieved at the current distance with previous and subsequent performances at shorter and longer trips. Check whether the horse retains speed when the race is run at a genuinely demanding tempo.</p><p>Consider course configuration, surface, race position, field strength and pace distribution before treating a distance change as established.</p></div></div><div class="section">Analyst's conclusion</div><div class="box"><p class="quote">${esc(analystConclusion.trim() || 'No additional analyst observations entered. The distance assessment above is a provisional interpretation of this race, not a confirmed prediction.')}</p></div><p class="note">Evidence hierarchy: recorded speeds and MR Achieved are observations/model outputs; performance explanations are interpretations; distance suitability and future-race conditions are hypotheses to validate. Proprietary performance indices and internal race-pace values are intentionally omitted.</p>`)}
  </body></html>`;
  const win=window.open('','_blank');
  if (!win) { window.alert('Allow pop-ups for Race Edge to open the report.'); return; }
  win.document.open(); win.document.write(html); win.document.close(); win.focus();
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
  const [reportHorse, setReportHorse] = useState('');
  const selectedReportHorse = result.rows.some(r => csvHorse(r) === reportHorse) ? reportHorse : csvHorse(result.rows.find(r => draftNumber(r.Finish_Pos) === 1) ?? result.rows[0]);
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
      <label htmlFor="race-edge-report-horse" style={{ display: 'block', ...sectionTitle, marginBottom: 8 }}>SELECT HORSE FOR IN-DEPTH REPORT</label>
      <select id="race-edge-report-horse" value={selectedReportHorse} onChange={e => setReportHorse(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
        {result.rows.map(r => <option key={csvHorse(r)} value={csvHorse(r)}>{csvHorse(r)}</option>)}
      </select>
      <button type="button" disabled={!ratings?.ready || ratingsDirty} onClick={() => exportPerformanceReport(result, sourceRows, metadata, ratings, ratingsDirty, planeData, analystConclusion, selectedReportHorse)}
        style={{ ...inputStyle, background: COLORS.gold, color: COLORS.background, fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}>
        EXPORT SELECTED HORSE PERFORMANCE INTELLIGENCE REPORT (PDF) →
      </button>
      <p style={{ color: COLORS.muted, fontSize: 12, marginTop: -6 }}>Opens a print-ready A4 report. Choose “Save as PDF” in the browser print dialog. The report includes actual sectional speeds and MR Achieved; proprietary metric values and RPSS figures remain private.</p>
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
  const [lineMROverridden, setLineMROverridden] = useState(false);

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
    setLineMROverridden(false);
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

      const initialHorse = csvHorse(parsed[0]);
      const initialMR = csvOfficialMR(parsed[0]);
      setLineHorse(initialHorse);
      setLineMR(initialMR === null ? '' : String(initialMR));
      setLineMROverridden(false);
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

  function selectLineHorse(horse: string) {
    const source = rows.find(r => csvHorse(r) === horse);
    const official = csvOfficialMR(source);
    setLineHorse(horse);
    setLineMR(official === null ? '' : String(official));
    setLineMROverridden(false);
    if (result) setRatingsDirty(true);
  }

  function updateLineMR(value: string) {
    setLineMR(value);
    const official = csvOfficialMR(rows.find(r => csvHorse(r) === lineHorse));
    setLineMROverridden(value !== (official === null ? '' : String(official)));
    if (result) setRatingsDirty(true);
  }

  function resetLineMR() {
    const official = csvOfficialMR(rows.find(r => csvHorse(r) === lineHorse));
    setLineMR(official === null ? '' : String(official));
    setLineMROverridden(false);
    if (result) setRatingsDirty(true);
  }

  async function calculate() {
    if (!rows.length || !distance) return;
    if (!lineHorse.trim()) { setError('Select a line horse before calculating.'); return; }
    if (!lineMR.trim()) { setError('The selected line horse has no Official MR in the CSV. Enter an assigned MR to continue.'); return; }
    if (!/^\d+$/.test(lineMR) || Number(lineMR) > 200) { setError('Line MR must be a whole number between 0 and 200.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');
    setResult(null);
    setPlaneData(null);
    setRatings(null);
    setRatingsDirty(false);
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

      const analysed = json as AnalysisResult;
      setResult(analysed);
      // Handicap ratings are derived after the sectional engine completes,
      // using the reference horse and MR selected before calculation.
      await calculateRatings(lineHorse, lineMR, analysed);
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

  async function calculateRatings(selectedHorse = lineHorse, assignedMR = lineMR, analysisOverride?: AnalysisResult) {
    const analysis = analysisOverride ?? result;
    if (!analysis || !metadata) return;
    if (!selectedHorse.trim()) {
      setError('Choose a line horse before calculating handicap ratings.');
      return;
    }
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
          distance_m: analysis.distance_m,
          race_date: metadata.date,
          metrics_rows: analysis.rows,
          source_rows: rows,
          race_diagnostics: analysis.race_diagnostics,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <img
            src="/race-edge-logo.png"
            alt="Race Edge logo"
            style={{ width: 58, height: 58, objectFit: 'contain', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 1 }}>
              RACE <span style={{ color: COLORS.gold }}>EDGE</span>
              <sup style={{ fontSize: 10, color: COLORS.muted }}> 2.0</sup>
            </div>
            <div style={{ color: COLORS.muted, fontSize: 10, letterSpacing: 1.6, marginTop: 4 }}>
              PERFORMANCE INTELLIGENCE
            </div>
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

        {rows.length > 0 && (
          <section style={{ ...panelStyle, marginBottom: 20, borderColor: COLORS.gold }}>
            <div style={{ color: COLORS.gold, fontSize: 12, fontWeight: 800, letterSpacing: 1, marginBottom: 10 }}>
              03 / HANDICAP REFERENCE · SELECT BEFORE CALCULATING
            </div>
            <p style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.6 }}>
              Choose your line horse. Its Official MR comes from the CSV and can be overridden. You can change either later without repeating the sectional calculation.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 14 }}>
              <label>
                <div style={{ color: COLORS.muted, fontSize: 11, marginBottom: 7 }}>LINE HORSE</div>
                <select value={lineHorse} onChange={e => selectLineHorse(e.target.value)} style={inputStyle}>
                  {rows.map((r, i) => <option key={`${csvHorse(r)}-${i}`} value={csvHorse(r)}>{csvHorse(r)}</option>)}
                </select>
              </label>
              <label>
                <div style={{ color: COLORS.muted, fontSize: 11, marginBottom: 7 }}>ASSIGNED LINE MR · EDITABLE</div>
                <input type="number" min={0} max={200} step={1} value={lineMR}
                  onChange={e => updateLineMR(e.target.value)} placeholder="Official MR unavailable" style={inputStyle} />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <span style={{ color: COLORS.muted, fontSize: 12 }}>
                CSV Official MR: {csvOfficialMR(rows.find(r => csvHorse(r) === lineHorse)) ?? 'Unavailable'}
                {lineMROverridden ? ' · Manual override' : ' · Using CSV default'}
              </span>
              <button type="button" onClick={resetLineMR} style={{ background: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: '8px 11px', color: COLORS.gold, cursor: 'pointer' }}>
                Reset to Official MR
              </button>
            </div>
          </section>
        )}

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
              !lineHorse ||
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
                    <div style={{ color: COLORS.muted, fontSize: 11, marginBottom: 7 }}>LINE HORSE · CHANGE ANYTIME</div>
                    <select value={lineHorse} onChange={e => selectLineHorse(e.target.value)} style={inputStyle}>
                      {rows.map((r, i) => <option key={`${csvHorse(r)}-${i}`} value={csvHorse(r)}>{csvHorse(r)}</option>)}
                    </select>
                  </label>
                  <label>
                    <div style={{ color: COLORS.muted, fontSize: 11, marginBottom: 7 }}>ASSIGNED LINE MR · EDITABLE</div>
                    <input type="number" min={0} max={200} step={1} value={lineMR}
                      onChange={e => updateLineMR(e.target.value)} style={inputStyle} />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                  <span style={{ color: COLORS.muted, fontSize: 12 }}>
                    CSV Official MR: {csvOfficialMR(rows.find(r => csvHorse(r) === lineHorse)) ?? 'Unavailable'}
                    {lineMROverridden ? ' · Manual override' : ' · CSV default'}
                  </span>
                  <button type="button" onClick={resetLineMR} style={{ background: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: '8px 11px', color: COLORS.gold, cursor: 'pointer' }}>Reset to Official MR</button>
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

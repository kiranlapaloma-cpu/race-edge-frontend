
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Flag,
  Gauge,
  History,
  LogOut,
  RefreshCw,
  Search,
  Trophy,
  X,
} from 'lucide-react';

type Meeting = {
  date: string;
  club: number;
  name: string;
};

type RaceOption = {
  key: string | number;
  label: string;
};

type Runner = {
  'No.': number;
  Horse: string;
  Draw: number | null;
  Age: number | null;
  Weight: number | null;
  Claim: number;
  'Official MR': number | null;
  Status: string;
  Jockey?: string;
};

type PredictionRow = {
  'No.': number;
  Horse: string;
  'Current MR': number | null;
  'Latest Projection': number | null;
  'Recent Best Projection': number | null;
  'Peak Projection': number | null;
  'Latest Form Rank': number | null;
  'Recent Best Rank': number | null;
  'Peak Ability Rank': number | null;
  Evidence?: string;
  'Apprentice Claim'?: number;
};

type ScenarioRow = {
  Rank: number;
  'No.': number;
  Horse: string;
  'Margin Behind Previous (L)': number;
  [key: string]: unknown;
};

type CardResponse = {
  card: {
    name: string;
    distance: number;
    surfaceDescr: string;
    clubName: string;
    time: string;
    runners: Array<{
      saddleNo: number;
      horseName: string;
    }>;
  };
  prediction_runners: Runner[];
  prediction: {
    rows: PredictionRow[];
    scenarios: Record<string, ScenarioRow[]>;
  };
  visible_scenarios: string[];
};

type HorseRun = {
  race_date?: string;
  race_number?: number;
  horse?: string;
  track?: string;
  course?: string;
  distance?: number;
  finish_position?: string;
  official_mr?: number;
  mr_achieved?: number;
  rpss?: number;
  sustain_residual?: number;
  analyst_note?: string;
};

type ExplorerRunner = {
  race_run: HorseRun;
  subsequent_runs: HorseRun[];
  subsequent_runs_recorded: number;
  next_recorded_run: HorseRun | null;
};
type ExplorerResponse = {
  race: { race_date: string; track: string; course: string; race_number: number; distance: number | null };
  runners: ExplorerRunner[];
  saved_runner_count: number;
  coverage_note: string;
};

type FormValidation = {
  verdict: string;
  verdict_explanation: string;
  verdict_caveat?: string;
  settings: { follow_up_starts: number; mr_confirmation_tolerance_points: number; placing_definition: string };
  coverage: { saved_original_runners: number; runners_with_saved_followups: number; runners_with_mr_comparisons: number; followup_starts_analysed: number; note: string };
  mr_validation: { confirmed_runners: number; below_original_runners: number; mixed_followup_runners: number; insufficient_evidence_runners: number; median_individual_mr_change: number | null };
  subsequent_results: {
    next_recorded_start: { wins: number; placings_excluding_wins: number; unique_winners: number; unique_placed_horses: number };
    followup_window: { wins: number; placings_excluding_wins: number; unique_winners: number; unique_placed_horses: number };
  };
  runners: Array<{
    horse: string;
    original_mr_achieved: number | null;
    mr_status: string;
    starts_analysed: number;
    subsequent_runs: Array<{race_date?: string; finish_position?: string; mr_achieved: number | null; mr_change: number | null; won: boolean; placed: boolean}>;
  }>;
};

type TelemetryMetric = 'F200' | 'tsSPI' | 'Accel' | 'CG';
type MetricSummary = {
  metric: string; label: string; readings: number; runs_considered: number;
  latest: number | null; latest_date: string | null; median: number | null;
  best: number | null; above_101: number; above_101_denominator: number;
  above_101_percent: number | null;
};
type TelemetryDistance = {
  distance: number; recorded_runs: number;
  mr_achieved: { recorded: number; peak: number | null; median: number | null; latest: number | null };
  metrics: Record<TelemetryMetric, MetricSummary>;
};
type TelemetryResult = {
  horse: string; recorded_runs: number; before_date: string | null;
  metrics: Record<TelemetryMetric, MetricSummary>;
  by_distance: Record<string, TelemetryDistance>;
  interpretation_note: string;
};
type TelemetryCompareResponse = { horses: TelemetryResult[]; before_date: string | null; note: string };
const TELEMETRY_KEYS: TelemetryMetric[] = ['F200', 'tsSPI', 'Accel', 'CG'];
const TELEMETRY_NAMES: Record<TelemetryMetric, string> = {
  F200: 'Opening speed', tsSPI: 'Mid-race speed', Accel: 'Acceleration', CG: 'Corrected Grind',
};
const telemNum = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(1);

function TelemetryPanel({ result }: { result: TelemetryResult }) {
  const distances = Object.values(result.by_distance || {}).sort((a, b) => a.distance - b.distance);
  const [distance, setDistance] = useState('all');
  const selection = distance === 'all' ? null : result.by_distance?.[distance];
  const metrics = selection ? selection.metrics : result.metrics;
  return (
    <div className="telemetry-panel">
      <div className="telemetry-topline">
        <div><div className="eyebrow">SECTIONAL PERFORMANCE PROFILE</div>
          <h4>{result.horse}</h4>
          <small>{selection ? `${selection.recorded_runs} recorded runs at ${selection.distance}m` : `${result.recorded_runs} recorded runs across all distances`}</small>
        </div>
        <label>Distance
          <select value={distance} onChange={e => setDistance(e.target.value)}>
            <option value="all">All distances</option>
            {distances.map(d => <option key={d.distance} value={String(d.distance)}>{d.distance}m ({d.recorded_runs})</option>)}
          </select>
        </label>
      </div>
      <div className="telemetry-grid">
        {TELEMETRY_KEYS.map(key => {
          const m = metrics?.[key];
          return <div className="telemetry-metric" key={key}>
            <div className="telemetry-metric-name">{key === 'CG' ? 'CORRECTED GRIND' : key}<small>{TELEMETRY_NAMES[key]}</small></div>
            <div className="telemetry-primary"><span>MEDIAN</span><strong>{telemNum(m?.median)}</strong></div>
            <div className="telemetry-values"><span>Latest <b>{telemNum(m?.latest)}</b></span><span>Best <b>{telemNum(m?.best)}</b></span></div>
            <div className="telemetry-frequency"><strong>{m?.above_101 ?? 0}/{m?.above_101_denominator ?? 0}</strong> readings &gt;101
              <small>{m?.above_101_percent == null ? 'No readings' : `${telemNum(m.above_101_percent)}%`} · {m?.readings ?? 0} recorded readings</small>
            </div>
          </div>;
        })}
      </div>
      {selection && <div className="telemetry-mr">MR ACHIEVED AT {selection.distance}M <span>Latest <b>{telemNum(selection.mr_achieved.latest)}</b></span><span>Median <b>{telemNum(selection.mr_achieved.median)}</b></span><span>Peak <b>{telemNum(selection.mr_achieved.peak)}</b></span></div>}
      <p className="telemetry-caveat">{result.interpretation_note} {result.before_date ? `Only runs before ${dateLabel(result.before_date)} are included.` : ''} No average MR or composite score.</p>
    </div>
  );
}

function FieldComparisonPanel({ result }: { result: TelemetryCompareResponse }) {
  const [distance, setDistance] = useState('all');
  const distances = [...new Set(result.horses.flatMap(h => Object.keys(h.by_distance || {})))].sort((a,b) => Number(a)-Number(b));
  const getMetrics = (horse: TelemetryResult) => distance === 'all' ? horse.metrics : horse.by_distance?.[distance]?.metrics;
  return <div className="telemetry-panel comparison-panel">
    <div className="telemetry-topline"><div><div className="eyebrow">SIDE-BY-SIDE EVIDENCE</div><h4>Field Comparison</h4></div>
      <label>Distance <select value={distance} onChange={e => setDistance(e.target.value)}>
        <option value="all">All distances</option>{distances.map(d => <option key={d} value={d}>{d}m</option>)}
      </select></label>
    </div>
    <div className="comparison-scroll"><table className="comparison-table"><thead><tr><th>MEASURE</th>
      {result.horses.map((h,i) => <th key={i}>{h.horse}<small>{distance === 'all' ? `${h.recorded_runs} runs` : `${h.by_distance?.[distance]?.recorded_runs ?? 0} runs at ${distance}m`}</small></th>)}
    </tr></thead><tbody>
      {TELEMETRY_KEYS.map(key => <FragmentComparisonRows key={key} metric={key} horses={result.horses} getMetrics={getMetrics} />)}
      {distance !== 'all' && <><tr className="comparison-category"><td colSpan={result.horses.length+1}>MR ACHIEVED AT {distance}M</td></tr>
        {(['latest','median','peak'] as const).map(field => <tr key={field}><td>{field.toUpperCase()}</td>{result.horses.map((h,i) => <td key={i}>{telemNum(h.by_distance?.[distance]?.mr_achieved?.[field])}</td>)}</tr>)}
      </>}
    </tbody></table></div>
    <p className="telemetry-caveat">{result.note} Missing distance-specific history is shown as —, not zero. Above 101 means strictly greater than 101. {result.before_date ? `Only runs before ${dateLabel(result.before_date)}.` : ''}</p>
  </div>;
}

function FragmentComparisonRows({ metric, horses, getMetrics }: {
  metric: TelemetryMetric; horses: TelemetryResult[];
  getMetrics: (horse: TelemetryResult) => Record<TelemetryMetric, MetricSummary> | undefined;
}) {
  const values = (field: 'median' | 'latest' | 'best') => <tr><td>{field.toUpperCase()}</td>{horses.map((h,i) => <td key={i}>{telemNum(getMetrics(h)?.[metric]?.[field])}</td>)}</tr>;
  return <><tr className="comparison-category"><td colSpan={horses.length+1}>{metric === 'CG' ? 'CORRECTED GRIND' : metric} · {TELEMETRY_NAMES[metric]}</td></tr>
    {values('median')}{values('latest')}{values('best')}
    <tr><td>&gt;101 FREQUENCY</td>{horses.map((h,i) => { const m = getMetrics(h)?.[metric]; return <td key={i}>{m ? `${m.above_101}/${m.above_101_denominator}` : '—'}</td>; })}</tr>
  </>;
}

function FormValidationPanel({ result }: { result: FormValidation }) {
  const win = result.subsequent_results.followup_window;
  const next = result.subsequent_results.next_recorded_start;
  const verdictLabel: Record<string, string> = {
    subsequently_supported: 'SUBSEQUENTLY SUPPORTED',
    questionable: 'QUESTIONABLE FORM',
    mixed_evidence: 'MIXED EVIDENCE',
    insufficient_evidence: 'INSUFFICIENT EVIDENCE',
  };
  return (
    <div className="flv-panel">
      <div className="flv-title">FORM LINE VALIDATION <span>{verdictLabel[result.verdict] || result.verdict.replaceAll('_', ' ').toUpperCase()}</span></div>
      <p>{result.verdict_explanation}</p>
      <div className="flv-stats">
        <div><small>MR CONFIRMED</small><strong>{result.mr_validation.confirmed_runners}/{result.coverage.runners_with_mr_comparisons}</strong></div>
        <div><small>FOLLOW-UP WINS</small><strong>{win.wins}</strong><small>{win.unique_winners} unique winners</small></div>
        <div><small>FOLLOW-UP PLACES</small><strong>{win.placings_excluding_wins}</strong><small>{win.unique_placed_horses} unique horses</small></div>
        <div><small>MR BELOW ORIGINAL</small><strong>{result.mr_validation.below_original_runners}</strong></div>
      </div>
      <p className="flv-note">Next recorded start: {next.wins} wins, {next.placings_excluding_wins} placings. First {result.settings.follow_up_starts} saved subsequent starts per horse; placings are 2nd/3rd, excluding wins.</p>
      <div className="flv-runner-list">
        {result.runners.map((r, i) => (
          <details key={`${r.horse}-${i}`}>
            <summary><strong>{r.horse}</strong><span>Original MR {fmt(r.original_mr_achieved)} · {r.mr_status.replaceAll('_', ' ')}</span></summary>
            {r.subsequent_runs.length ? r.subsequent_runs.map((later, j) => (
              <div key={j} className="flv-followup">
                <span>{dateLabel(later.race_date)} · {fmt(later.finish_position)} {later.won ? '· WIN' : later.placed ? '· PLACE' : ''}</span>
                <span>MR {fmt(later.mr_achieved)} · {later.mr_change == null ? '—' : `${later.mr_change > 0 ? '+' : ''}${number(later.mr_change)}`} pts</span>
              </div>
            )) : <p>No subsequent saved runs.</p>}
          </details>
        ))}
      </div>
      <p className="flv-note">{result.coverage.note} {result.verdict_caveat} MR confirmation tolerance: {result.settings.mr_confirmation_tolerance_points} points (provisional). No average MR is used.</p>
    </div>
  );
}

const placeOf = (value: unknown): number | null => {
  const match = String(value ?? '').match(/^\s*(\d+)/);
  return match ? Number(match[1]) : null;
};
const dateLabel = (value: unknown) => {
  const date = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || '—';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
};

const fmt = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : String(v);

const number = (v: number | null | undefined) =>
  v == null
    ? '—'
    : v.toFixed(1).replace(/\.0$/, '');

async function api<T>(
  action: string,
  params: Record<string, string | number | boolean> = {}
): Promise<T> {
  const q = new URLSearchParams({
    action,
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ),
  });

  const response = await fetch(`/api/proxy?${q}`, {
    cache: 'no-store',
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      json.detail ||
      json.error ||
      `Request failed (${response.status})`
    );
  }

  return json as T;
}

function behind(rows: ScenarioRow[]): Map<number, number> {
  let total = 0;
  const map = new Map<number, number>();

  for (const row of rows) {
    total += Number(row['Margin Behind Previous (L)'] || 0);
    map.set(row['No.'], total);
  }

  return map;
}

function apprenticeClaim(data: CardResponse, saddle: number): number {
  const runner = data.prediction_runners.find(r => r['No.'] === saddle);
  const prediction = data.prediction.rows.find(r => r['No.'] === saddle);
  const raw = runner?.Claim ?? prediction?.['Apprentice Claim'];
  const claim = Number(raw);
  return Number.isFinite(claim) && claim > 0 ? claim : 0;
}

function todayInSouthAfrica(): string {
  // en-CA produces YYYY-MM-DD without converting to the browser timezone.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export default function RaceControl() {
  const [workspaceTab, setWorkspaceTab] = useState<'race' | 'intelligence'>('race');
  const [date, setDate] = useState('');
  const predictionRequest = useRef(0);
  // Cache completed predictions per date, meeting, race and Peak setting.
  const predictionCache = useRef<Map<string, CardResponse>>(new Map());
  const meetingsRequest = useRef(0);
  const racesRequest = useRef(0);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [club, setClub] = useState('');
  const [races, setRaces] = useState<RaceOption[]>([]);
  const [race, setRace] = useState('');
  const [data, setData] = useState<CardResponse | null>(null);
  const [peak, setPeak] = useState(false);

  const [mode, setMode] = useState<
    'Recent Best' | 'Latest Form'
  >('Recent Best');

  const [selected, setSelected] = useState<number | null>(null);
  const [horseRuns, setHorseRuns] = useState<HorseRun[]>([]);
  // Session-only historical cache and in-flight request deduplication.
  const historyCache = useRef<Map<string, HorseRun[]>>(new Map());
  const historyPending = useRef<Map<string, Promise<HorseRun[]>>>(new Map());
  const historyRequest = useRef(0);
  const prefetchGeneration = useRef(0);
  const [raceHistoryLoading, setRaceHistoryLoading] = useState(false);
  const [raceHistoryError, setRaceHistoryError] = useState('');
  const telemetryCache = useRef<Map<string, TelemetryResult>>(new Map());
  const telemetryPending = useRef<Map<string, Promise<TelemetryResult>>>(new Map());
  const [telemetryRetry, setTelemetryRetry] = useState(0);

  const getHorseHistory = useCallback((horse: string): Promise<HorseRun[]> => {
    const key = horse.trim().toUpperCase();
    const cached = historyCache.current.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = historyPending.current.get(key);
    if (pending) return pending;
    const promise = api<{ runs: HorseRun[] }>('horse', { horse })
      .then(response => {
        const runs = response.runs || [];
        historyCache.current.set(key, runs);
        return runs;
      })
      .finally(() => { historyPending.current.delete(key); });
    historyPending.current.set(key, promise);
    return promise;
  }, []);

  const getHorseTelemetry = useCallback((horse: string, beforeDate?: string): Promise<TelemetryResult> => {
    const key = JSON.stringify([horse.trim().toUpperCase(), beforeDate || '']);
    const cached = telemetryCache.current.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = telemetryPending.current.get(key);
    if (pending) return pending;
    const request = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await api<TelemetryResult>('horse-telemetry', {
            horse, ...(beforeDate ? { before_date: beforeDate } : {}),
          });
          telemetryCache.current.set(key, result);
          return result;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise<void>(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        }
      }
      throw new Error('Telemetry unavailable.');
    })().finally(() => { telemetryPending.current.delete(key); });
    telemetryPending.current.set(key, request);
    return request;
  }, []);

  const [explorerKey, setExplorerKey] = useState('');
  const [explorerData, setExplorerData] = useState<ExplorerResponse | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState('');
  const [expandedRunner, setExpandedRunner] = useState('');
  const explorerRequest = useRef(0);
  const explorerCache = useRef<Map<string, ExplorerResponse>>(new Map());
  const [validationKey, setValidationKey] = useState('');
  const [validationData, setValidationData] = useState<FormValidation | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const validationRequest = useRef(0);
  const validationCache = useRef<Map<string, FormValidation>>(new Map());

  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const [mobileTab, setMobileTab] = useState<
    'rankings' | 'form'
  >('rankings');

  const [filter, setFilter] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  // Database-only horse search, independent of the selected race.
  const [horseQuery, setHorseQuery] = useState('');
  const [horseMatches, setHorseMatches] = useState<string[]>([]);
  const [horseSearchLoading, setHorseSearchLoading] = useState(false);
  const [horseSearchError, setHorseSearchError] = useState('');
  const [searchedHorse, setSearchedHorse] = useState('');
  const [searchedRuns, setSearchedRuns] = useState<HorseRun[]>([]);
  const [searchedRunsLoading, setSearchedRunsLoading] = useState(false);
  const [searchedRunsError, setSearchedRunsError] = useState('');
  const horseSearchRequest = useRef(0);
  const horseHistoryRequest = useRef(0);
  const [telemetryResult, setTelemetryResult] = useState<TelemetryResult | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState('');
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const telemetryRequest = useRef(0);
  const [raceTelemetry, setRaceTelemetry] = useState<TelemetryResult | null>(null);
  const [raceTelemetryLoading, setRaceTelemetryLoading] = useState(false);
  const [raceTelemetryError, setRaceTelemetryError] = useState('');
  const raceTelemetryRequest = useRef(0);
  const [comparisonHorses, setComparisonHorses] = useState<string[]>([]);
  const [comparisonResult, setComparisonResult] = useState<TelemetryCompareResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const comparisonRequest = useRef(0);

  const loadSavedTelemetry = useCallback(async (horse: string) => {
    const request = ++telemetryRequest.current;
    setTelemetryOpen(true); setTelemetryResult(null); setTelemetryError(''); setTelemetryLoading(true);
    try {
      const response = await getHorseTelemetry(horse);
      if (request === telemetryRequest.current) setTelemetryResult(response);
    } catch (e) {
      if (request === telemetryRequest.current) setTelemetryError(e instanceof Error ? e.message : 'Telemetry unavailable.');
    } finally {
      if (request === telemetryRequest.current) setTelemetryLoading(false);
    }
  }, [getHorseTelemetry]);

  const loadComparison = useCallback(async () => {
    if (comparisonHorses.length < 2 || comparisonHorses.length > 4) return;
    const request = ++comparisonRequest.current;
    setComparisonResult(null); setComparisonError(''); setComparisonLoading(true);
    try {
      const q = new URLSearchParams({ action: 'horse-telemetry-compare' });
      comparisonHorses.forEach(horse => q.append('horses', horse));
      const response = await fetch(`/api/proxy?${q}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || body.error || `Request failed (${response.status})`);
      if (request === comparisonRequest.current) setComparisonResult(body as TelemetryCompareResponse);
    } catch (e) {
      if (request === comparisonRequest.current) setComparisonError(e instanceof Error ? e.message : 'Comparison unavailable.');
    } finally {
      if (request === comparisonRequest.current) setComparisonLoading(false);
    }
  }, [comparisonHorses]);


  useEffect(() => {
    const query = horseQuery.trim();
    const request = ++horseSearchRequest.current;
    if (query.length < 2) {
      setHorseMatches([]);
      setHorseSearchLoading(false);
      setHorseSearchError('');
      return;
    }
    setHorseSearchLoading(true);
    setHorseSearchError('');
    const timer = setTimeout(() => {
      api<unknown>('horse-search', { q: query })
        .then(response => {
          if (request !== horseSearchRequest.current) return;
          // Accept both a simple names array and the backend's named results envelope.
          const record = response && typeof response === 'object' && !Array.isArray(response)
            ? response as Record<string, unknown> : null;
          const items = Array.isArray(response) ? response
            : record?.horses ?? record?.matches ?? record?.results ?? [];
          const names = Array.isArray(items) ? items.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const obj = item as Record<string, unknown>;
              return String(obj.horse ?? obj.name ?? '');
            }
            return '';
          }).filter(Boolean) : [];
          setHorseMatches([...new Set(names)].slice(0, 50));
        })
        .catch(e => {
          if (request === horseSearchRequest.current) {
            setHorseMatches([]);
            setHorseSearchError(e instanceof Error ? e.message : 'Horse search failed.');
          }
        })
        .finally(() => {
          if (request === horseSearchRequest.current) setHorseSearchLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [horseQuery]);

  const openSavedHorse = useCallback(async (horse: string) => {
    const request = ++horseHistoryRequest.current;
    setSearchedHorse(horse);
    ++telemetryRequest.current; setTelemetryOpen(false); setTelemetryResult(null); setTelemetryError(''); setTelemetryLoading(false);
    setSearchedRuns([]);
    setSearchedRunsError('');
    setSearchedRunsLoading(true);
    // Avoid leaving a race explorer open for a different horse.
    ++explorerRequest.current;
    setExplorerKey('');
    setExplorerData(null);
    setExplorerError('');
    try {
      const runs = await getHorseHistory(horse);
      const response = { runs };
      if (request === horseHistoryRequest.current) {
        setSearchedRuns([...((response.runs || []))].sort((a, b) =>
          String(b.race_date || '').localeCompare(String(a.race_date || ''))));
      }
    } catch (e) {
      if (request === horseHistoryRequest.current) {
        setSearchedRunsError(e instanceof Error ? e.message : 'Unable to load horse history.');
      }
    } finally {
      if (request === horseHistoryRequest.current) setSearchedRunsLoading(false);
    }
  }, [getHorseHistory]);

  const searchedRatedRuns = useMemo(() => searchedRuns
    .filter(run => run.mr_achieved != null && Number.isFinite(Number(run.mr_achieved))), [searchedRuns]);
  const searchedBestMR = searchedRatedRuns.length
    ? Math.max(...searchedRatedRuns.map(run => Number(run.mr_achieved))) : null;


  const loadMeetings = useCallback(async (day: string) => {
    const request = ++meetingsRequest.current;
    ++racesRequest.current;
    ++predictionRequest.current;
    setLoading('Loading meetings');
    setError('');
    setData(null);
    setRaces([]);
    setRace('');
    setClub('');
    setSelected(null);

    try {
      const result = await api<{ meetings: Meeting[] }>(
        'meetings',
        { race_date: day }
      );

      if (request !== meetingsRequest.current) return;
      setMeetings(result.meetings || []);

      if (!result.meetings?.length) {
        setError('No meetings found for this date.');
      }
    } catch (e) {
      if (request === meetingsRequest.current) {
        setError((e as Error).message);
        setMeetings([]);
      }
    } finally {
      if (request === meetingsRequest.current) setLoading('');
    }
  }, []);

  const loadRaces = useCallback(
    async (day: string, clubId: string) => {
      const request = ++racesRequest.current;
      ++predictionRequest.current;
      setClub(clubId);
      setRace('');
      setData(null);
      setRaces([]);
      setSelected(null);

      if (!clubId) return;

      setLoading('Loading races');
      setError('');

      try {
        const r = await api<{ races: RaceOption[] }>(
          'races',
          {
            race_date: day,
            club: clubId,
          }
        );

        if (request === racesRequest.current) setRaces(r.races || []);
      } catch (e) {
        if (request === racesRequest.current) setError((e as Error).message);
      } finally {
        if (request === racesRequest.current) setLoading('');
      }
    },
    []
  );

  const loadPrediction = useCallback(
    async (
      day: string,
      clubId: string,
      raceId: string,
      includePeak: boolean,
      forceRefresh = false
    ) => {
      if (!clubId || !raceId) return;
      const request = ++predictionRequest.current;
      setRace(raceId);
      setData(null); // Do not show the previous race while the new one loads.
      setSelected(null);
      setHorseRuns([]);
      setFilter('');
      setError('');
      const cacheKey = JSON.stringify([day, clubId, raceId, includePeak]);
      if (!forceRefresh) {
        const cached = predictionCache.current.get(cacheKey);
        if (cached) {
          setData(cached);
          setSelected(cached.prediction.rows[0]?.['No.'] ?? null);
          setLoading('');
          return;
        }
      }
      setLoading('Calculating predictions');

      try {
        const r = await api<CardResponse>(
          'predictions',
          {
            race_date: day,
            club: clubId,
            race: raceId,
            include_peak: includePeak,
          }
        );

        if (request !== predictionRequest.current) return;
        predictionCache.current.set(cacheKey, r);
        setData(r);
        setSelected(r.prediction.rows[0]?.['No.'] ?? null);
      } catch (e) {
        if (request === predictionRequest.current) {
          setError((e as Error).message);
          setData(null);
        }
      } finally {
        if (request === predictionRequest.current) setLoading('');
      }
    },
    []
  );

  useEffect(() => {
    const today = todayInSouthAfrica();
    setDate(today);
    void loadMeetings(today);
    // Initial load only. Manually selected dates remain in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ++explorerRequest.current;
    setExplorerKey('');
    setExplorerData(null);
    setExplorerError('');
    setExplorerLoading(false);
    setExpandedRunner('');
  }, [selected, data]);

  const loadFormValidation = useCallback(async (run: HorseRun) => {
    if (!run.race_date || !run.track || !run.course || !run.race_number) return;
    const key = JSON.stringify([run.race_date, run.track, run.course, run.race_number]);
    const request = ++validationRequest.current;
    setValidationKey(key);
    setValidationError('');
    const cached = validationCache.current.get(key);
    if (cached) { setValidationData(cached); setValidationLoading(false); return; }
    setValidationData(null);
    setValidationLoading(true);
    try {
      const result = await api<FormValidation>('form-line-validation', {
        race_date: run.race_date, track: run.track, course: run.course,
        race_number: run.race_number, follow_up_starts: 3,
      });
      if (request !== validationRequest.current) return;
      validationCache.current.set(key, result);
      setValidationData(result);
    } catch (e) {
      if (request === validationRequest.current)
        setValidationError(e instanceof Error ? e.message : 'Form validation unavailable.');
    } finally {
      if (request === validationRequest.current) setValidationLoading(false);
    }
  }, []);

  const renderValidation = (run: HorseRun) => {
    const key = JSON.stringify([run.race_date, run.track, run.course, run.race_number]);
    return (
      <div className="flv-wrap">
        <button type="button" className="flv-button" disabled={validationLoading && validationKey === key}
          onClick={() => void loadFormValidation(run)}>
          {validationLoading && validationKey === key ? 'Validating form…' : 'Validate Form Line · MR / Winners / Placings'}
        </button>
        {validationKey === key && validationError && <p className="saved-search-error">{validationError}</p>}
        {validationKey === key && validationData && <FormValidationPanel result={validationData} />}
      </div>
    );
  };

  const openHistoricalRace = useCallback(async (run: HorseRun) => {
    if (!run.race_date || !run.track || !run.course || !run.race_number) return;
    const key = JSON.stringify([run.race_date, run.track, run.course, run.race_number]);
    if (explorerKey === key) {
      ++explorerRequest.current;
      setExplorerKey('');
      setExplorerData(null);
      setExplorerLoading(false);
      return;
    }
    const request = ++explorerRequest.current;
    setExplorerKey(key);
    setExplorerData(null);
    setExplorerError('');
    setExpandedRunner('');
    const cached = explorerCache.current.get(key);
    if (cached) { setExplorerData(cached); setExplorerLoading(false); return; }
    setExplorerLoading(true);
    try {
      const result = await api<ExplorerResponse>('historical-race', {
        race_date: run.race_date,
        track: run.track,
        course: run.course,
        race_number: run.race_number,
        subsequent_limit: 5,
      });
      if (request !== explorerRequest.current) return;
      explorerCache.current.set(key, result);
      setExplorerData(result);
    } catch (e) {
      if (request === explorerRequest.current) setExplorerError((e as Error).message);
    } finally {
      if (request === explorerRequest.current) setExplorerLoading(false);
    }
  }, [explorerKey]);

  // Preload all runner histories after predictions are available. The selected
  // horse is fetched first; other runners are fetched with bounded concurrency.
  useEffect(() => {
    const generation = ++prefetchGeneration.current;
    if (!data) return;
    const horses = [...new Set(data.prediction_runners.map(r => r.Horse).filter(Boolean))];
    const selectedHorse = data.prediction_runners.find(r => r['No.'] === selected)?.Horse;
    const remaining = horses.filter(h => h !== selectedHorse);
    let cursor = 0;
    const worker = async () => {
      while (generation === prefetchGeneration.current && cursor < remaining.length) {
        const horse = remaining[cursor++];
        try { await getHorseHistory(horse); } catch { /* selected-horse load can retry */ }
      }
    };
    // Small delay keeps the initially selected horse's request ahead of prefetch.
    const timer = setTimeout(() => {
      if (generation === prefetchGeneration.current) {
        void worker();
        void worker();
      }
    }, 350);
    return () => { clearTimeout(timer); };
  }, [data, getHorseHistory]);

  useEffect(() => {
    const request = ++historyRequest.current;
    const horse = data?.prediction_runners.find(r => r['No.'] === selected)?.Horse;
    setRaceHistoryError('');
    if (!horse) { setHorseRuns([]); setRaceHistoryLoading(false); return; }
    const cached = historyCache.current.get(horse.trim().toUpperCase());
    if (cached) {
      setHorseRuns(cached.filter(run => !run.race_date || run.race_date < date));
      setRaceHistoryLoading(false);
      return;
    }
    setHorseRuns([]);
    setRaceHistoryLoading(true);
    getHorseHistory(horse)
      .then(runs => {
        if (request === historyRequest.current)
          setHorseRuns(runs.filter(run => !run.race_date || run.race_date < date));
      })
      .catch(e => {
        if (request === historyRequest.current)
          setRaceHistoryError(e instanceof Error ? e.message : 'Historical runs unavailable.');
      })
      .finally(() => {
        if (request === historyRequest.current) setRaceHistoryLoading(false);
      });
  }, [selected, data, date, getHorseHistory]);

  useEffect(() => {
    const horse = data?.prediction_runners.find(r => r['No.'] === selected)?.Horse;
    const request = ++raceTelemetryRequest.current;
    setRaceTelemetry(null); setRaceTelemetryError(''); setRaceTelemetryLoading(false);
    if (!horse || !date) return;
    setRaceTelemetryLoading(true);
    getHorseTelemetry(horse, date)
      .then(result => { if (request === raceTelemetryRequest.current) setRaceTelemetry(result); })
      .catch(e => { if (request === raceTelemetryRequest.current) setRaceTelemetryError(e instanceof Error ? e.message : 'Telemetry unavailable.'); })
      .finally(() => { if (request === raceTelemetryRequest.current) setRaceTelemetryLoading(false); });
  }, [data, selected, date, getHorseTelemetry, telemetryRetry]);

  const chronologicalRuns = useMemo(() =>
    [...horseRuns].sort((a, b) => String(a.race_date || '').localeCompare(String(b.race_date || ''))),
    [horseRuns]
  );
  const ratedRuns = chronologicalRuns.filter(run => run.mr_achieved != null && Number.isFinite(Number(run.mr_achieved)));
  const firstRated = ratedRuns[0];
  const lastRated = ratedRuns[ratedRuns.length - 1];
  const ratingChange = firstRated && lastRated && ratedRuns.length > 1
    ? Number(lastRated.mr_achieved) - Number(firstRated.mr_achieved)
    : null;
  const bestAchieved = ratedRuns.length ? Math.max(...ratedRuns.map(run => Number(run.mr_achieved))) : null;

  const currentRunner = data?.prediction_runners.find(
    r => r['No.'] === selected
  );

  const currentRow = data?.prediction.rows.find(
    r => r['No.'] === selected
  );

  const scenario = data?.prediction.scenarios[mode] || [];

  const marginMap = useMemo(
    () => behind(scenario),
    [scenario]
  );

  const contenders = useMemo(
    () =>
      scenario.filter(
        row =>
          (marginMap.get(row['No.']) ?? Infinity) <= 4
      ),
    [scenario, marginMap]
  );

  const visible = useMemo(
    () =>
      scenario.filter(r =>
        `${r.Horse} ${r['No.']}`
          .toLowerCase()
          .includes(filter.toLowerCase())
      ),
    [scenario, filter]
  );

  const leader = scenario[0];

  const raceIndex = races.findIndex(r => String(r.key) === race);

  function selectRace(nextRace: string) {
    if (!club || !nextRace || nextRace === race) return;
    void loadPrediction(date, club, nextRace, peak);
  }

  const selectedMeeting = meetings.find(
    m => String(m.club) === club
  );

  // Secure logout using the existing session endpoint.
  async function handleLogout() {
    if (signingOut) return;

    setSigningOut(true);
    setError('');

    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      window.location.replace('/login');
    } catch {
      setError(
        'Unable to sign out. Please try again.'
      );
      setSigningOut(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div
          className="brand"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          <img
            src="/race-edge-header.png"
            alt="Race Edge horse and telemetry logo"
            style={{
              display: 'block',
              width: 132,
              height: 58,
              objectFit: 'contain',
              objectPosition: 'left center',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 'clamp(16px, 2vw, 23px)', fontWeight: 800, letterSpacing: '0.07em', color: '#e7edf6' }}>
                RACE <span style={{ color: '#d7ae65' }}>EDGE</span>
              </span>
              <sup style={{ color: '#d7ae65', fontSize: 10, fontWeight: 700 }}>2.0</sup>
            </div>
            <span style={{ color: '#9eafc5', fontSize: 'clamp(9px, 1.1vw, 11px)', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>
              PERFORMANCE INTELLIGENCE
            </span>
          </div>
        </div>

        <div className="header-actions">
          <span className="status">
            <i /> SYSTEM ONLINE
          </span>

          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            title="Sign out of Race Edge"
            aria-label="Sign out of Race Edge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '9px 12px',
              background: '#172338',
              color: '#d6ad60',
              border: '1px solid #39465a',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: signingOut
                ? 'wait'
                : 'pointer',
              opacity: signingOut ? 0.6 : 1,
            }}
          >
            <LogOut size={15} />
            {signingOut ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      </header>

      <nav className="primary-workspace-tabs" aria-label="Race Edge main workspaces">
        <button type="button" className={workspaceTab === 'race' ? 'active' : ''}
          aria-current={workspaceTab === 'race' ? 'page' : undefined}
          onClick={() => { setWorkspaceTab('race'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <Flag size={17} /> <span>Race Control</span>
          <small>Meetings & predictions</small>
        </button>
        <button type="button" className={workspaceTab === 'intelligence' ? 'active' : ''}
          aria-current={workspaceTab === 'intelligence' ? 'page' : undefined}
          onClick={() => { setWorkspaceTab('intelligence'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <Search size={17} /> <span>Horse Intelligence</span>
          <small>Database & comparison</small>
        </button>
      </nav>
      {/* Both workspaces stay mounted: switching tabs never resets race or horse state. */}
      <div style={{ display: workspaceTab === 'intelligence' ? 'block' : 'none' }}>
      <section className="saved-horse-search" aria-label="Saved horse search">
        <div className="saved-horse-head">
          <div>
            <div className="eyebrow">DATABASE / HORSE INTELLIGENCE</div>
            <h2>Saved Horse Search</h2>
            <p>Search horses recorded in Race Edge. No meeting or race selection required.</p>
          </div>
          <span className="saved-db-tag"><History size={14} /> SUPABASE RECORDS ONLY</span>
        </div>
        <div className="saved-horse-input-wrap">
          <Search size={19} color="#d7ae65" />
          <input
            type="search"
            aria-label="Search saved horses"
            placeholder="Type at least 2 letters of a horse's name…"
            value={horseQuery}
            onChange={e => setHorseQuery(e.target.value)}
            autoComplete="off"
          />
          {horseSearchLoading && <RefreshCw size={16} className="spin" />}
          {horseQuery && <button type="button" aria-label="Clear horse search" onClick={() => {
            setHorseQuery(''); setHorseMatches([]); setSearchedHorse(''); setSearchedRuns([]); ++telemetryRequest.current; setTelemetryOpen(false); setTelemetryResult(null);
            ++horseHistoryRequest.current; ++explorerRequest.current; setExplorerKey(''); setExplorerData(null);
          }}><X size={17} /></button>}
        </div>
        {horseSearchError && <p className="saved-search-error" role="alert">{horseSearchError}</p>}
        {horseQuery.trim().length >= 2 && !horseSearchLoading && !horseSearchError && !horseMatches.length &&
          <p className="saved-search-hint">No matching saved horses found.</p>}
        {!!horseMatches.length && <div className="saved-match-list" role="list" aria-label="Matching saved horses">
          {horseMatches.map(name => <button key={name} type="button" role="listitem"
            className={searchedHorse === name ? 'saved-match selected' : 'saved-match'}
            onClick={() => void openSavedHorse(name)}>
            <span>{name}</span><ChevronRight size={16} />
          </button>)}
        </div>}
        <div className="comparison-selector">
          <div className="eyebrow">FIELD COMPARISON / SELECT 2–4 HORSES</div>
          <p>Search above, then add matching horses to compare their sectional evidence side by side.</p>
          {!!horseMatches.length && <div className="comparison-pick-list">{horseMatches.slice(0, 12).map(name => {
            const added = comparisonHorses.includes(name);
            return <button key={name} type="button" disabled={!added && comparisonHorses.length >= 4}
              onClick={() => { setComparisonHorses(current => added ? current.filter(h => h !== name) : [...current, name]); ++comparisonRequest.current; setComparisonResult(null); setComparisonError(''); }}>
              {added ? '✓ ' : '+ '}{name}
            </button>;
          })}</div>}
          <div className="comparison-picked">{comparisonHorses.map(name => <button type="button" key={name} title={`Remove ${name}`} onClick={() => { setComparisonHorses(current => current.filter(h => h !== name)); ++comparisonRequest.current; setComparisonResult(null); }}>{name} ×</button>)}</div>
          <button className="telemetry-action" type="button" disabled={comparisonHorses.length < 2 || comparisonLoading} onClick={() => void loadComparison()}>
            {comparisonLoading ? 'Comparing horses…' : `Compare ${comparisonHorses.length} horses`}
          </button>
          {comparisonError && <p className="saved-search-error">{comparisonError}</p>}
          {comparisonResult && <FieldComparisonPanel result={comparisonResult} />}
        </div>
        {searchedHorse && <div className="saved-horse-profile">
          <div className="saved-profile-heading">
            <div><div className="eyebrow">SAVED PERFORMANCE PROFILE</div><h3>{searchedHorse}</h3></div>
            <button type="button" onClick={() => { ++horseHistoryRequest.current; ++explorerRequest.current;
              setSearchedHorse(''); setSearchedRuns([]); setExplorerKey(''); setExplorerData(null); ++telemetryRequest.current; setTelemetryOpen(false); setTelemetryResult(null);
            }} aria-label="Close horse profile"><X size={18} /></button>
          </div>
          {searchedRunsLoading && <p className="saved-search-hint">Loading recorded performances…</p>}
          {searchedRunsError && <p className="saved-search-error" role="alert">{searchedRunsError}</p>}
          {!searchedRunsLoading && !searchedRunsError && <>
            <div className="saved-profile-stats">
              <div><small>RECORDED RUNS</small><strong>{searchedRuns.length}</strong></div>
              <div><small>BEST MR ACHIEVED</small><strong>{fmt(searchedBestMR)}</strong></div>
              <div><small>LATEST MR ACHIEVED</small><strong>{fmt(searchedRatedRuns[0]?.mr_achieved)}</strong></div>
            </div>
            <div className="telemetry-launch">
              <button type="button" className="telemetry-action" onClick={() => telemetryOpen ? (setTelemetryOpen(false), ++telemetryRequest.current) : void loadSavedTelemetry(searchedHorse)}>
                {telemetryOpen ? 'Hide Horse Telemetry' : 'View Horse Telemetry · F200 / tsSPI / Accel / CG'}
              </button>
              {telemetryOpen && telemetryLoading && <p className="saved-search-hint">Loading sectional telemetry…</p>}
              {telemetryOpen && telemetryError && <p className="saved-search-error">{telemetryError}</p>}
              {telemetryOpen && telemetryResult && <TelemetryPanel key={searchedHorse} result={telemetryResult} />}
            </div>
            {searchedRuns.length ? <div className="saved-history">
              <div className="saved-history-head"><span>DATE / COURSE</span><span>FINISH</span><span>OFF. MR</span><span>MR ACH.</span><span>RPSS</span></div>
              {searchedRuns.map((run, i) => {
                const raceKey = JSON.stringify([run.race_date, run.track, run.course, run.race_number]);
                return <article key={`${raceKey}-${i}`} className="saved-history-item">
                  <div className="saved-history-row">
                    <div><strong>{dateLabel(run.race_date)}</strong><small>{fmt(run.track)} / {fmt(run.course)} · {fmt(run.distance)}m · R{fmt(run.race_number)}</small></div>
                    <strong>{fmt(run.finish_position)}</strong>
                    <span>{fmt(run.official_mr)}</span>
                    <strong className="saved-gold">{fmt(run.mr_achieved)}</strong>
                    <span>{fmt(run.rpss)}</span>
                  </div>
                  <details className="saved-run-details"><summary>Sectional intelligence <ChevronDown size={14} /></summary>
                    <div><span>Sustain Residual: <strong>{fmt(run.sustain_residual)}</strong></span>
                      {run.analyst_note && <p>{run.analyst_note}</p>}</div>
                  </details>
                  {run.race_date && run.track && run.course && Number(run.race_number) > 0 && <>
                    <button type="button" className="saved-race-link" onClick={() => void openHistoricalRace(run)}>
                      {explorerKey === raceKey ? 'Close Full Race ▲' : 'View Full Race →'}
                    </button>
                    {explorerKey === raceKey && <div className="saved-race-explorer">
                      {explorerLoading && <p>Loading historical race…</p>}
                      {explorerError && <p className="saved-search-error">{explorerError}</p>}
                      {explorerData && <>
                        {renderValidation(run)}
                        <strong>HISTORICAL RACE · {explorerData.saved_runner_count} SAVED RUNNERS</strong>
                        {explorerData.runners.map((entry, j) => <details key={`${entry.race_run.horse}-${j}`}>
                          <summary>{fmt(entry.race_run.finish_position)} · {fmt(entry.race_run.horse)} · MR {fmt(entry.race_run.mr_achieved)}</summary>
                          <p>{entry.subsequent_runs_recorded} subsequent recorded runs</p>
                          {entry.subsequent_runs.map((later, k) => <p key={k}>{dateLabel(later.race_date)} · {fmt(later.track)} · {fmt(later.distance)}m · MR {fmt(later.mr_achieved)}</p>)}
                        </details>)}
                        <p>{explorerData.coverage_note}</p>
                      </>}
                    </div>}
                  </>}
                </article>;
              })}
            </div> : <p className="saved-search-hint">No recorded runs found for this horse.</p>}
          </>}
        </div>}
      </section>
      </div>
      <div style={{ display: workspaceTab === 'race' ? 'block' : 'none' }}>
      <div className="toolbar">
        <div className="toolbar-heading">
          <div className="eyebrow">
            RACE CONTROL
            <span className="slash"> / </span>
            MEETING SELECTOR
          </div>

          <h1>
            {data?.card.name || 'Performance workspace'}
          </h1>
        </div>

        <div className="selectors">
          <label className="field">
            <span>
              <CalendarDays size={13} />
              DATE
            </span>

            <input
              type="date"
              value={date}
              onChange={e => {
                if (!e.target.value) return;
                setDate(e.target.value);
                void loadMeetings(e.target.value);
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              const today = todayInSouthAfrica();
              setDate(today);
              void loadMeetings(today);
            }}
            title="Return to today's South African meetings"
            style={{ alignSelf: 'flex-end', padding: '12px 13px', border: '1px solid #39465a', borderRadius: 8, background: '#172338', color: '#d7ae65', fontWeight: 700, cursor: 'pointer' }}
          >Today</button>

          <label className="field">
            <span>
              <Flag size={13} />
              MEETING
            </span>

            <select
              value={club}
              onChange={e =>
                loadRaces(date, e.target.value)
              }
            >
              <option value="">
                Select meeting
              </option>

              {meetings.map(m => (
                <option
                  key={m.club}
                  value={m.club}
                >
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field race-select">
            <span>
              <Gauge size={13} />
              RACE
            </span>

            <select
              value={race}
              onChange={e => selectRace(e.target.value)}
            >
              <option value="">
                Select race
              </option>

              {races.map(r => (
                <option
                  key={r.key}
                  value={r.key}
                >
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="refresh"
            disabled={!club || !race || !!loading}
            onClick={() =>
              loadPrediction(
                date,
                club,
                race,
                peak,
                true
              )
            }
            title="Refresh race"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {club && races.length > 0 && (
        <nav aria-label="Quick race navigation" style={{ margin: '12px 20px 18px', padding: '12px', border: '1px solid #28384d', borderRadius: 12, background: '#101e30' }}>
          <div style={{ color: '#98a7bb', fontSize: 10, fontWeight: 800, letterSpacing: 1.6, marginBottom: 10 }}>QUICK RACE NAVIGATION</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" aria-label="Previous race" title="Previous race" disabled={raceIndex <= 0 || !!loading}
              onClick={() => selectRace(String(races[raceIndex - 1].key))}
              style={{ flexShrink: 0, padding: 11, borderRadius: 8, border: '1px solid #35455a', background: '#172338', color: '#d7ae65', opacity: raceIndex <= 0 || !!loading ? 0.4 : 1, cursor: raceIndex <= 0 || !!loading ? 'not-allowed' : 'pointer' }}><ChevronLeft size={18} /></button>
            <div style={{ display: 'flex', flex: 1, gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 3 }}>
              {races.map((option, index) => {
                const active = String(option.key) === race;
                const match = option.label.match(/(?:race\s*)?(\d+)/i);
                const shortLabel = match ? `R${match[1].padStart(2, '0')}` : `R${String(index + 1).padStart(2, '0')}`;
                return <button key={String(option.key)} type="button" aria-current={active ? 'true' : undefined}
                  title={option.label} disabled={!!loading} onClick={() => selectRace(String(option.key))}
                  style={{ flexShrink: 0, minWidth: 58, padding: '11px 12px', borderRadius: 8, border: `1px solid ${active ? '#d7ae65' : '#35455a'}`, background: active ? '#d7ae65' : '#172338', color: active ? '#091321' : '#e8edf4', fontSize: 13, fontWeight: 800, opacity: loading && !active ? 0.65 : 1, cursor: loading ? 'wait' : 'pointer' }}>{shortLabel}</button>;
              })}
            </div>
            <button type="button" aria-label="Next race" title="Next race" disabled={raceIndex < 0 || raceIndex >= races.length - 1 || !!loading}
              onClick={() => selectRace(String(races[raceIndex + 1].key))}
              style={{ flexShrink: 0, padding: 11, borderRadius: 8, border: '1px solid #35455a', background: '#172338', color: '#d7ae65', opacity: raceIndex < 0 || raceIndex >= races.length - 1 || !!loading ? 0.4 : 1, cursor: raceIndex < 0 || raceIndex >= races.length - 1 || !!loading ? 'not-allowed' : 'pointer' }}><ChevronRight size={18} /></button>
          </div>
        </nav>
      )}

      {error && (
        <div className="notice error">
          <CircleAlert size={17} />
          {error}

          <button
            onClick={() => setError('')}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading && (
        <div className="notice loading">
          <RefreshCw
            className="spin"
            size={17}
          />
          {loading}…
        </div>
      )}

      {!data ? (
        <div className="empty-state">
          <div className="empty-mark">
            <Flag size={42} />
          </div>

          <div className="eyebrow">
            AWAITING RACE DATA
          </div>

          <h2>Select a meeting and race</h2>

          <p>
            Race Edge will retrieve the race card,
            load historical performances and
            calculate predictions automatically.
          </p>

          {!meetings.length && (
            <button
              className="primary"
              onClick={() => loadMeetings(date)}
            >
              Find meetings
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="race-meta">
            <span className="race-pill">
              R{race}
            </span>

            <strong>
              {selectedMeeting?.name ||
                data.card.clubName}
            </strong>

            <span className="dot">·</span>
            <span>{data.card.distance}M</span>
            <span className="dot">·</span>
            <span>{data.card.surfaceDescr}</span>
            <span className="dot">·</span>
            <span>{data.card.time}</span>

            <span className="spacer" />

            <span className="subtle">
              CLAIMS SHOWN, NOT APPLIED
            </span>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <span>TOP PROJECTION</span>

              <strong>
                {leader
                  ? fmt(
                      leader[
                        mode === 'Recent Best'
                          ? 'Recent Best Projection'
                          : 'Latest Projection'
                      ]
                    )
                  : '—'}
              </strong>

              <small>
                {leader?.Horse || 'No predictions'}
              </small>
            </div>

            <div className="stat">
              <span>LEADING RUNNER</span>

              <strong>
                #{leader?.['No.'] ?? '—'}
              </strong>

              <small>
                {leader?.Horse || '—'}
              </small>
            </div>

            <div className="stat">
              <span>WITHIN 4 LENGTHS</span>

              <strong>
                {contenders.length}
              </strong>

              <small>
                Of scenario leader
              </small>
            </div>

            <div className="stat">
              <span>FIELD SIZE</span>

              <strong>
                {data.prediction_runners.length}
              </strong>

              <small>
                Carded runners
              </small>
            </div>
          </div>

          <nav
            className="mobile-tabs"
            aria-label="Workspace sections"
          >
            <button
              className={
                mobileTab === 'rankings'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setMobileTab('rankings')
              }
            >
              <Trophy size={16} />
              Rankings
            </button>

            <button
              className={
                mobileTab === 'form'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setMobileTab('form')
              }
            >
              <History size={16} />
              Horse form
            </button>

          </nav>

          <div className="workspace race-study-workspace">
            <section
              className={`panel leaderboard ${
                mobileTab === 'rankings'
                  ? 'mobile-active'
                  : ''
              }`}
            >
              <div className="panel-header">
                <div>
                  <div className="eyebrow">
                    01 / PREDICTION ENGINE
                  </div>
                  <h2>Race rankings</h2>
                </div>

                <span className="count">
                  {scenario.length} RATED
                </span>
              </div>

              <div className="mode-switch">
                <button
                  className={
                    mode === 'Recent Best'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setMode('Recent Best')
                  }
                >
                  Recent Best
                </button>

                <button
                  className={
                    mode === 'Latest Form'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setMode('Latest Form')
                  }
                >
                  Latest Form
                </button>
              </div>

              <label className="search">
                <Search size={15} />

                <input
                  placeholder="Find a runner"
                  value={filter}
                  onChange={e =>
                    setFilter(e.target.value)
                  }
                />
              </label>

              <div className="ranking-head">
                <span>POS / RUNNER</span>
                <span>PROJ.</span>
                <span>BEHIND</span>
              </div>

              <div className="ranking-list">
                {visible.map(row => {
                  const isSelected =
                    selected === row['No.'];

                  const margin =
                    marginMap.get(row['No.']);

                  return (
                    <div
                      key={row['No.']}
                      className={`ranking-row ${
                        isSelected
                          ? 'selected'
                          : ''
                      }`}
                    >
                      <button
                        className="ranking-main"
                        onClick={() => {
                          setSelected(row['No.']);
                          setMobileTab('form');
                        }}
                      >
                        <span className="rank">
                          {row.Rank
                            .toString()
                            .padStart(2, '0')}
                        </span>

                        <span className="saddle">
                          {row['No.']}
                        </span>

                        <span className="horse-name">
                          {row.Horse}
                          {apprenticeClaim(data, row['No.']) > 0 && (
                            <span title={`Apprentice claim: ${number(apprenticeClaim(data, row['No.']))} kg`} style={{ color: '#d7ae65', fontWeight: 800 }}> #</span>
                          )}

                          <small>
                            {data.prediction.rows.find(
                              x =>
                                x['No.'] ===
                                row['No.']
                            )?.Evidence || '—'}
                          </small>
                        </span>

                        <strong>
                          {fmt(
                            row[
                              mode === 'Recent Best'
                                ? 'Recent Best Projection'
                                : 'Latest Projection'
                            ]
                          )}
                        </strong>

                        <span className="behind">
                          {margin === 0
                            ? 'LEADER'
                            : `${number(margin)} L`}
                        </span>

                        <ChevronRight
                          size={14}
                          className="row-arrow"
                        />
                      </button>

                    </div>
                  );
                })}
              </div>

              <div className="panel-foot">
                <span>
                  <i className="gold-dot" />
                  1 MR point = 0.5 lengths
                </span>
                <span style={{ color: '#98a7bb', fontSize: 11 }}>
                  # Apprentice allowance (shown, not applied)
                </span>

                <button
                  className="text-btn"
                  onClick={() => {
                    setPeak(!peak);
                    loadPrediction(
                      date,
                      club,
                      race,
                      !peak
                    );
                  }}
                >
                  {peak ? 'Hide' : 'Include'}
                  {' '}Peak Ability
                  <ChevronDown size={14} />
                </button>
              </div>

              {peak && (
                <div className="peak-list">
                  <strong>Peak Ability</strong>

                  {(
                    data.prediction.scenarios[
                      'Peak Ability'
                    ] || []
                  )
                    .slice(0, 6)
                    .map(row => (
                      <div key={row['No.']}>
                        <span>
                          {row.Rank}. {row.Horse}
                        </span>

                        <b>
                          {fmt(
                            row['Peak Projection']
                          )}
                        </b>
                      </div>
                    ))}
                </div>
              )}
            </section>

            <section
              className={`panel form-panel ${
                mobileTab === 'form'
                  ? 'mobile-active'
                  : ''
              }`}
            >
              <div className="panel-header">
                <div>
                  <div className="eyebrow">
                    02 / HORSE TELEMETRY
                  </div>
                  <h2>Performance history</h2>
                </div>

                <History
                  size={19}
                  className="muted"
                />
              </div>

              {currentRunner ? (
                <>
                  <div className="selected-horse">
                    <div className="horse-identity">
                      <div className="large-saddle">
                        {currentRunner['No.']}
                      </div>

                      <div>
                        <div className="eyebrow">
                          SELECTED RUNNER
                        </div>

                        <h3>
                          {currentRunner.Horse}
                          {data && apprenticeClaim(data, currentRunner['No.']) > 0 && (
                            <span style={{ color: '#d7ae65' }}> #</span>
                          )}
                        </h3>

                        <p>
                          Draw {fmt(currentRunner.Draw)}
                          {' '}<span>·</span>{' '}
                          {fmt(currentRunner.Weight)} kg
                          {' '}<span>·</span>{' '}
                          MR {fmt(
                            currentRunner['Official MR']
                          )}
                          {' '}<span>·</span>{' '}
                          Jockey: {fmt(currentRunner.Jockey)}
                          {data && apprenticeClaim(data, currentRunner['No.']) > 0 && (
                            <> {' '}<span>·</span>{' '}Claim {number(apprenticeClaim(data, currentRunner['No.']))} kg (not applied)</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="projection-grid">
                      <div>
                        <span>RECENT BEST</span>

                        <strong>
                          {fmt(
                            currentRow?.[
                              'Recent Best Projection'
                            ]
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>LATEST FORM</span>

                        <strong>
                          {fmt(
                            currentRow?.[
                              'Latest Projection'
                            ]
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>EVIDENCE</span>

                        <strong className="evidence">
                          {fmt(currentRow?.Evidence)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="race-telemetry-wrap">
                    {raceTelemetryLoading && <p className="saved-search-hint">Loading historical telemetry…</p>}
                    {raceTelemetryError && <p className="saved-search-error">{raceTelemetryError} <button type="button" onClick={() => setTelemetryRetry(n => n + 1)} style={{ marginLeft: 8, color: '#d7ae65', background: 'transparent', border: '1px solid #d7ae65', borderRadius: 6, padding: '5px 9px', cursor: 'pointer' }}>Retry telemetry</button></p>}
                    {raceTelemetry && <TelemetryPanel key={`${currentRunner.Horse}-${date}`} result={raceTelemetry} />}
                  </div>

                  <div className="section-label">
                    HISTORICAL RUNS
                    <span>
                      {horseRuns.length} available
                    </span>
                  </div>

                  {raceHistoryLoading && <p className="saved-search-hint" style={{ padding: '0 16px' }}>Loading previous runs…</p>}
                  {raceHistoryError && <p className="saved-search-error" style={{ padding: '0 16px' }}>{raceHistoryError}</p>}
                  {horseRuns.length > 0 && (
                    <div className="form-insights">
                      <div><small>BEST MR ACHIEVED</small><strong>{fmt(bestAchieved)}</strong></div>
                      <div><small>LATEST MR ACHIEVED</small><strong>{fmt(lastRated?.mr_achieved)}</strong></div>
                      <div><small>RECORDED CHANGE</small><strong className={ratingChange == null ? '' : ratingChange > 0 ? 'form-positive' : ratingChange < 0 ? 'form-negative' : ''}>{ratingChange == null ? '—' : `${ratingChange > 0 ? '+' : ''}${number(ratingChange)} pts`}</strong></div>
                    </div>
                  )}
                  <div className="history-scroll form-history-scroll">
                    {horseRuns.length ? (
                      <>
                        <div className="form-table-head"><span>DATE / COURSE</span><span>FINISH</span><span>OFF. MR</span><span>MR ACH.</span><span>RPSS</span></div>
                        {horseRuns.map((run, i) => {
                          const previous = chronologicalRuns.findIndex(x => x === run);
                          const priorRun = previous > 0 ? chronologicalRuns[previous - 1] : null;
                          const delta = run.mr_achieved != null && priorRun?.mr_achieved != null ? Number(run.mr_achieved) - Number(priorRun.mr_achieved) : null;
                          return (
                        <article className="history-row form-history-row" key={`${run.race_date}-${run.race_number}-${i}`}>
                          <div className="form-table-row">
                            <div className="form-race-location"><strong>{dateLabel(run.race_date)}</strong><small>{fmt(run.track)} / {fmt(run.course)} · {fmt(run.distance)}m · R{fmt(run.race_number)}</small></div>
                            <strong>{fmt(run.finish_position)}</strong>
                            <span>{fmt(run.official_mr)}</span>
                            <div className="form-achieved"><strong>{fmt(run.mr_achieved)}</strong>{delta != null && <small className={delta > 0 ? 'form-positive' : delta < 0 ? 'form-negative' : ''}>{delta > 0 ? '+' : ''}{number(delta)} vs prior</small>}</div>
                            <span>{fmt(run.rpss)}</span>
                          </div>
                          <details className="form-sectionals"><summary>Sectional intelligence <ChevronDown size={13} /></summary><div className="form-sectionals-body"><span>Sustain residual: <b>{fmt(run.sustain_residual)}</b></span>{run.analyst_note && <p>{run.analyst_note}</p>}</div></details>
                          {run.race_date && run.track && run.course && Number(run.race_number) > 0 && (
                            <button type="button" onClick={() => void openHistoricalRace(run)}
                              style={{ marginTop: 10, padding: '9px 12px', borderRadius: 7, border: '1px solid #d7ae65', color: '#d7ae65', background: '#172338', fontWeight: 700, cursor: 'pointer' }}>
                              {explorerKey === JSON.stringify([run.race_date, run.track, run.course, run.race_number]) ? 'Close Full Race ▲' : 'View Full Race →'}
                            </button>
                          )}
                          {explorerKey === JSON.stringify([run.race_date, run.track, run.course, run.race_number]) && (
                            <div style={{ marginTop: 14, border: '1px solid #39465a', borderRadius: 10, background: '#0c192a', padding: 12 }}>
                              <div style={{ color: '#d7ae65', fontWeight: 800, marginBottom: 8 }}>HISTORICAL RACE EXPLORER · R{run.race_number}</div>
                              {explorerLoading && <p style={{ color: '#a9b8ca' }}>Loading full race and subsequent form…</p>}
                              {explorerError && <p style={{ color: '#f4a7a7' }}>{explorerError}</p>}
                              {explorerData && (
                                <>
                                  {renderValidation(run)}
                                  <p style={{ color: '#a9b8ca', fontSize: 12, marginBottom: 10 }}>
                                    {dateLabel(explorerData.race.race_date)} · {explorerData.race.track} / {explorerData.race.course} · {fmt(explorerData.race.distance)}m · {explorerData.saved_runner_count} saved runners
                                  </p>
                                  {explorerData.runners.map((entry, index) => {
                                    const runner = entry.race_run;
                                    const runnerKey = `${index}-${runner.horse ?? ''}`;
                                    const expanded = expandedRunner === runnerKey;
                                    const baseline = runner.mr_achieved;
                                    const laterRated = entry.subsequent_runs.filter(x => x.mr_achieved != null);
                                    const better = baseline == null ? null : laterRated.filter(x => Number(x.mr_achieved) > Number(baseline)).length;
                                    return (
                                      <div key={runnerKey} style={{ borderTop: '1px solid #2c3b4e', padding: '10px 0' }}>
                                        <button type="button" onClick={() => setExpandedRunner(expanded ? '' : runnerKey)}
                                          style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', background: 'transparent', color: '#e7edf5', border: 0, cursor: 'pointer', padding: 0 }}>
                                          <span style={{ flex: 1, minWidth: 0 }}><strong style={{ color: runner.horse === currentRunner?.Horse ? '#d7ae65' : '#e7edf5' }}>{fmt(runner.finish_position)} · {fmt(runner.horse)}</strong><small style={{ display: 'block', color: '#9faec0', marginTop: 4 }}>Official MR {fmt(runner.official_mr)} · MR Achieved {fmt(runner.mr_achieved)} · {entry.subsequent_runs_recorded} later recorded</small></span>
                                          <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : undefined, flexShrink: 0 }} />
                                        </button>
                                        {expanded && (
                                          <div style={{ marginTop: 10, padding: 10, background: '#172338', borderRadius: 8 }}>
                                            {entry.subsequent_runs.length ? (
                                              <>
                                                <p style={{ color: '#d7ae65', fontSize: 12, marginBottom: 8 }}>SUBSEQUENT RUNS IN RACE EDGE (EARLIEST FIRST)</p>
                                                {entry.subsequent_runs.map((later, j) => (
                                                  <div key={`${later.race_date}-${later.race_number}-${j}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid #344357', padding: '8px 0', color: '#d5dfeb', fontSize: 12 }}>
                                                    <span>{j === 0 ? 'NEXT · ' : ''}{dateLabel(later.race_date)} · {fmt(later.track)} · {fmt(later.distance)}m</span>
                                                    <span style={{ whiteSpace: 'nowrap' }}>{fmt(later.finish_position)} · MR {fmt(later.mr_achieved)}</span>
                                                  </div>
                                                ))}
                                                {better !== null && <p style={{ color: '#b6c6d7', fontSize: 12, marginTop: 8 }}>{better} of {laterRated.length} subsequent rated runs exceeded this race's MR Achieved.</p>}
                                                {entry.subsequent_runs_recorded > entry.subsequent_runs.length && <p style={{ color: '#9faec0', fontSize: 11 }}>Showing first {entry.subsequent_runs.length} of {entry.subsequent_runs_recorded} recorded later runs.</p>}
                                              </>
                                            ) : <p style={{ color: '#9faec0', fontSize: 12 }}>No subsequent run recorded in Race Edge.</p>}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {!explorerData.runners.length && <p style={{ color: '#a9b8ca' }}>No saved runners found for this race identity.</p>}
                                  <p style={{ color: '#91a2b8', fontSize: 11, marginTop: 10 }}>{explorerData.coverage_note} Comparisons describe recorded runs only, not an independent race-strength rating.</p>
                                </>
                              )}
                            </div>
                          )}
                        </article>
                          );
                        })}
                      </>
                    ) : (
                      !raceHistoryLoading && !raceHistoryError && <p className="no-data">No prior runs saved in Race Edge for this runner before the selected race date.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="no-data">
                  Select a runner to inspect
                  its history.
                </p>
              )}
            </section>


          </div>
        </>
      )}

      </div>

      <style>{`
        .primary-workspace-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 20px 8px}
        .primary-workspace-tabs button{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;min-width:0;padding:15px 12px;border:1px solid #34465c;border-radius:10px;background:#142238;color:#b5c3d5;font-size:14px;font-weight:800;cursor:pointer}
        .primary-workspace-tabs button.active{border-color:#d7ae65;background:#263448;color:#e3ba69;box-shadow:inset 0 -3px #d7ae65}
        .primary-workspace-tabs small{flex-basis:100%;font-size:10px;font-weight:500;color:#9dadc0}
        @media(max-width:700px){.primary-workspace-tabs{margin:12px 10px 6px;gap:7px}.primary-workspace-tabs button{padding:12px 6px;font-size:12px}.primary-workspace-tabs small{font-size:9px}}


        .telemetry-launch{margin:15px 0}.telemetry-action{padding:10px 13px;background:#d7ae65;color:#0c192a;border:1px solid #d7ae65;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer}.telemetry-action:disabled{opacity:.45;cursor:not-allowed}
        .telemetry-panel{background:#0c192a;border:1px solid #34475f;border-radius:10px;padding:14px;margin:12px 0;color:#dce7f2;min-width:0}
        .telemetry-topline{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}.telemetry-topline h4{color:#e3ba69;font-size:17px;margin:5px 0}.telemetry-topline small{color:#9fb1c6;font-size:11px}.telemetry-topline label{font-size:10px;font-weight:800;color:#9fb1c6;display:flex;align-items:center;gap:8px}.telemetry-topline select{background:#17283d;color:#e8edf4;border:1px solid #42556b;border-radius:7px;padding:8px;max-width:170px}
        .telemetry-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.telemetry-metric{background:#17283d;border:1px solid #34475f;border-radius:9px;padding:12px;min-width:0}.telemetry-metric-name{color:#d7ae65;font-size:11px;font-weight:900;letter-spacing:.03em}.telemetry-metric-name small{display:block;color:#9eafc3;font-size:10px;font-weight:500;margin-top:4px}.telemetry-primary{display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin:15px 0}.telemetry-primary span{font-size:9px;color:#aebfd0}.telemetry-primary strong{font-size:24px;color:#e9edf4}.telemetry-values{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#aebfd0}.telemetry-values b{color:#e8edf4}.telemetry-frequency{border-top:1px solid #34475f;padding-top:9px;margin-top:11px;font-size:10px;color:#aebfd0}.telemetry-frequency strong{color:#d7ae65;font-size:14px}.telemetry-frequency small{display:block;margin-top:5px;color:#9fb1c6}.telemetry-mr{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;padding:10px;background:#17283d;border-radius:7px;font-size:10px;font-weight:800;color:#d7ae65}.telemetry-mr span{color:#aebfd0}.telemetry-mr b{color:#e8edf4}.telemetry-caveat{font-size:10px;color:#9fb1c6;line-height:1.6;margin:12px 0 0}.race-telemetry-wrap{padding:0 15px}
        .comparison-selector{margin:16px 0;padding:13px;border:1px solid #34475f;background:#0c192a;border-radius:10px}.comparison-selector>p{font-size:11px;color:#9fb1c6}.comparison-pick-list,.comparison-picked{display:flex;flex-wrap:wrap;gap:7px;margin:9px 0}.comparison-pick-list button,.comparison-picked button{background:#17283d;color:#dce7f2;border:1px solid #3b506a;border-radius:7px;padding:7px 9px;font-size:11px;cursor:pointer}.comparison-picked button{border-color:#d7ae65;color:#d7ae65}.comparison-pick-list button:disabled{opacity:.4;cursor:not-allowed}.comparison-scroll{overflow-x:auto}.comparison-table{width:100%;min-width:460px;border-collapse:collapse;text-align:left;font-size:11px}.comparison-table th,.comparison-table td{padding:10px;border-bottom:1px solid #304158;vertical-align:top}.comparison-table th{color:#d7ae65}.comparison-table th small{display:block;font-size:10px;color:#9fb1c6;margin-top:4px}.comparison-table td:first-child{color:#aebfd0;font-weight:700}.comparison-category td{background:#17283d;color:#d7ae65!important;font-weight:800!important;letter-spacing:.04em}
        @media(max-width:1150px){.telemetry-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.telemetry-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.telemetry-metric{padding:9px}.telemetry-primary strong{font-size:20px}.telemetry-panel{padding:10px}.race-telemetry-wrap{padding:0 10px}}
        .flv-wrap{margin:12px 0}.flv-button{padding:10px 13px;border:1px solid #d7ae65;background:#172338;color:#d7ae65;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer}
        .flv-button:disabled{opacity:.65;cursor:wait}.flv-panel{margin-top:12px;padding:14px;background:#101e30;border:1px solid #40516a;border-radius:10px;color:#dbe5f1;font-size:12px}
        .flv-title{color:#d7ae65;font-size:13px;font-weight:800;display:flex;gap:12px;flex-wrap:wrap;justify-content:space-between}
        .flv-title span{color:#a4e4c5;font-size:11px}.flv-panel p{line-height:1.55}
        .flv-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
        .flv-stats>div{background:#17283d;padding:10px;border-radius:7px;min-width:0}
        .flv-stats small{display:block;color:#9bacc2;font-size:10px;margin-bottom:5px}
        .flv-stats strong{font-size:20px;color:#e3ba69}.flv-note{color:#aab9cb;font-size:11px!important}
        .flv-runner-list details{border-top:1px solid #344357;padding:10px 0}
        .flv-runner-list summary{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;cursor:pointer}
        .flv-runner-list summary span{color:#b8c7d8;font-size:11px}
        .flv-followup{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #2a3b50;color:#c8d6e5;font-size:11px}
        @media(max-width:700px){.flv-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .saved-horse-search{margin:18px 20px;padding:20px;background:#101e30;border:1px solid #28384d;border-radius:12px;color:#e8edf4}
        .saved-horse-head,.saved-profile-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
        .saved-horse-head h2{font-size:21px;margin:5px 0 7px;color:#e8edf4}.saved-horse-head p{font-size:12px;color:#98a7bb;margin:0 0 16px}
        .saved-db-tag{display:inline-flex;align-items:center;gap:7px;font-size:10px;letter-spacing:.06em;color:#d7ae65;border:1px solid #4c443a;border-radius:7px;padding:8px}
        .saved-horse-input-wrap{display:flex;align-items:center;gap:11px;background:#091321;border:1px solid #43516a;border-radius:9px;padding:11px 13px}
        .saved-horse-input-wrap:focus-within{border-color:#d7ae65}.saved-horse-input-wrap input{background:transparent;color:#e8edf4;border:0;outline:0;flex:1;min-width:0;font-size:15px}
        .saved-horse-input-wrap button,.saved-profile-heading button{background:transparent;color:#aebfd1;border:0;cursor:pointer;padding:4px}
        .saved-match-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:7px;margin-top:12px;max-height:240px;overflow-y:auto}
        .saved-match{display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;background:#17283d;border:1px solid #30455b;border-radius:7px;color:#e8edf4;padding:11px 12px;cursor:pointer;font-size:12px;font-weight:700}
        .saved-match.selected{border-color:#d7ae65;color:#d7ae65}.saved-search-hint{color:#98a7bb;font-size:12px;margin:12px 0}.saved-search-error{color:#ffb8bf;font-size:12px;margin:12px 0}
        .saved-horse-profile{margin-top:17px;padding-top:17px;border-top:1px solid #344357}.saved-profile-heading h3{font-size:20px;color:#d7ae65;margin:5px 0 14px}
        .saved-profile-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:15px}
        .saved-profile-stats>div{background:#17283d;border:1px solid #30455b;border-radius:8px;padding:12px;min-width:0}.saved-profile-stats small{display:block;color:#98a7bb;font-size:10px;margin-bottom:8px}.saved-profile-stats strong{color:#d7ae65;font-size:21px}
        .saved-history{overflow-x:auto}.saved-history-head,.saved-history-row{display:grid;grid-template-columns:minmax(155px,2fr) minmax(46px,.5fr) minmax(52px,.65fr) minmax(68px,.8fr) minmax(50px,.6fr);gap:9px;align-items:center;min-width:460px}
        .saved-history-head{color:#98a7bb;background:#0c192a;padding:11px;font-size:10px;font-weight:800}.saved-history-item{border-bottom:1px solid #2b3d52;padding:12px 11px}.saved-history-row{font-size:12px}.saved-history-row small{display:block;color:#98a7bb;margin-top:5px;line-height:1.4}.saved-gold{color:#d7ae65}
        .saved-run-details{font-size:12px;color:#aebfd1;margin-top:12px}.saved-run-details summary{display:inline-flex;align-items:center;gap:5px;cursor:pointer}.saved-run-details>div{background:#17283d;border-radius:7px;padding:11px;margin-top:8px}.saved-run-details p{margin:8px 0 0;overflow-wrap:anywhere}
        .saved-race-link{margin-top:10px;padding:8px 11px;border-radius:7px;border:1px solid #d7ae65;color:#d7ae65;background:#172338;font-size:12px;font-weight:700;cursor:pointer}
        .saved-race-explorer{margin-top:12px;padding:12px;background:#0c192a;border:1px solid #344357;border-radius:8px;font-size:12px;color:#b5c4d4}.saved-race-explorer>strong{color:#d7ae65}.saved-race-explorer details{border-top:1px solid #344357;padding:10px 0}.saved-race-explorer summary{cursor:pointer;color:#e8edf4}.saved-race-explorer p{font-size:11px}
        @media(max-width:700px){.saved-horse-search{margin:12px 10px;padding:14px}.saved-profile-stats{gap:6px}.saved-profile-stats>div{padding:9px}.saved-profile-stats small{font-size:9px}.saved-profile-stats strong{font-size:16px}.saved-history-head,.saved-history-row{gap:5px;font-size:10px}}
        .race-study-workspace{grid-template-columns:minmax(330px,2fr) minmax(0,3fr)}
        .race-study-workspace .form-panel{min-width:0}
        .form-insights{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:0 16px 16px}
        .form-insights>div{background:#1b2a3b;border:1px solid #33465c;border-radius:8px;padding:12px;min-width:0}
        .form-insights small{display:block;color:#98aabf;font-size:10px;letter-spacing:.06em;margin-bottom:8px}
        .form-insights strong{display:block;color:#e3ba69;font-size:21px}
        .form-positive{color:#55d2ad!important}.form-negative{color:#f2a7a7!important}
        .form-history-scroll{max-height:none}
        .form-table-head,.form-table-row{display:grid;grid-template-columns:minmax(155px,2fr) minmax(48px,.55fr) minmax(55px,.65fr) minmax(70px,.85fr) minmax(55px,.65fr);gap:10px;align-items:center}
        .form-table-head{padding:10px 17px;background:#101c2b;color:#9aaec3;font-size:10px;font-weight:800;letter-spacing:.04em}
        .form-history-row{padding:14px 17px}
        .form-table-row{font-size:13px;color:#dbe5f1}
        .form-race-location strong{display:block;font-size:13px}
        .form-race-location small{display:block;color:#9aadc1;font-size:11px;margin-top:4px;line-height:1.5}
        .form-achieved strong{font-size:18px;color:#e3ba69}
        .form-achieved small{display:block;font-size:10px;color:#96a9bd;margin-top:4px}
        .form-sectionals{margin-top:10px;font-size:11px;color:#aebfd1}
        .form-sectionals summary{display:inline-flex;align-items:center;gap:5px;cursor:pointer;list-style:none;color:#aebfd1}
        .form-sectionals summary::-webkit-details-marker{display:none}
        .form-sectionals[open] summary svg{transform:rotate(180deg)}
        .form-sectionals-body{margin-top:8px;padding:10px 12px;background:#1b2a3b;border-radius:7px;line-height:1.6}
        .form-sectionals-body p{margin:6px 0 0;overflow-wrap:anywhere}
        @media(max-width:1180px){.race-study-workspace{grid-template-columns:minmax(300px,2fr) minmax(0,3fr)}}
        @media(max-width:700px){.race-study-workspace{display:block}.mobile-tabs{grid-template-columns:repeat(2,1fr)}.form-insights{gap:6px;padding:0 10px 12px}.form-insights>div{padding:9px}.form-insights small{font-size:9px}.form-insights strong{font-size:16px}.form-table-head,.form-table-row{grid-template-columns:minmax(110px,1.65fr) minmax(37px,.55fr) minmax(40px,.6fr) minmax(55px,.75fr) minmax(39px,.55fr);gap:5px}.form-table-head{padding:9px 10px;font-size:8px}.form-history-row{padding:12px 10px}.form-table-row{font-size:11px}.form-race-location strong{font-size:11px}.form-race-location small{font-size:9px}.form-achieved strong{font-size:15px}.form-achieved small{font-size:9px}}
      `}</style>
      <footer>
        <span>
          RACE EDGE 2.0
          <i />
          PRIVATE PERFORMANCE INTELLIGENCE
        </span>

        <span>
          Prediction analysis is a starting point,
          not a substitute for form study.
        </span>
      </footer>
    </div>
  );
}

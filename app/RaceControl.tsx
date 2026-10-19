
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
  const [explorerKey, setExplorerKey] = useState('');
  const [explorerData, setExplorerData] = useState<ExplorerResponse | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState('');
  const [expandedRunner, setExpandedRunner] = useState('');
  const explorerRequest = useRef(0);
  const explorerCache = useRef<Map<string, ExplorerResponse>>(new Map());
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const [mobileTab, setMobileTab] = useState<
    'rankings' | 'form'
  >('rankings');

  const [filter, setFilter] = useState('');
  const [signingOut, setSigningOut] = useState(false);

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

  useEffect(() => {
    if (!data || selected == null) {
      setHorseRuns([]);
      return;
    }

    const horse = data.prediction_runners.find(
      r => r['No.'] === selected
    )?.Horse;

    if (!horse) return;

    let alive = true;

    api<{ runs: HorseRun[] }>('horse', { horse })
      .then(r => {
        if (alive) {
          setHorseRuns(
            (r.runs || []).filter(
              run =>
                !run.race_date ||
                run.race_date < date
            )
          );
        }
      })
      .catch(() => {
        if (alive) setHorseRuns([]);
      });

    return () => {
      alive = false;
    };
  }, [selected, data, date]);

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
        <div className="brand">
          <span>RACE</span>{' '}
          <b>EDGE</b>
          <sup>2.0</sup>
        </div>

        <div className="header-tag">
          <Activity size={15} />
          PERFORMANCE INTELLIGENCE
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

                  <div className="section-label">
                    HISTORICAL RUNS
                    <span>
                      {horseRuns.length} available
                    </span>
                  </div>

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
                      <p className="no-data">No prior runs saved in Race Edge for this runner before the selected race date.</p>
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

      <style>{`
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

'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, ChevronDown, ChevronRight, CircleAlert, Flag, Gauge, History, RefreshCw, Search, SlidersHorizontal, Trophy, X } from 'lucide-react';

type Meeting = { date: string; club: number; name: string };
type RaceOption = { key: string | number; label: string };
type Runner = { 'No.': number; Horse: string; Draw: number | null; Age: number | null; Weight: number | null; Claim: number; 'Official MR': number | null; Status: string; Jockey?: string };
type PredictionRow = { 'No.': number; Horse: string; 'Current MR': number | null; 'Latest Projection': number | null; 'Recent Best Projection': number | null; 'Peak Projection': number | null; 'Latest Form Rank': number | null; 'Recent Best Rank': number | null; 'Peak Ability Rank': number | null; Evidence?: string; 'Apprentice Claim'?: number };
type ScenarioRow = { Rank: number; 'No.': number; Horse: string; 'Margin Behind Previous (L)': number; [key: string]: unknown };
type CardResponse = { card: { name: string; distance: number; surfaceDescr: string; clubName: string; time: string; runners: Array<{ saddleNo: number; horseName: string }> }; prediction_runners: Runner[]; prediction: { rows: PredictionRow[]; scenarios: Record<string, ScenarioRow[]> }; visible_scenarios: string[] };
type HorseRun = { race_date?: string; track?: string; course?: string; distance?: number; finish_position?: string; official_mr?: number; mr_achieved?: number; rpss?: number; sustain_residual?: number; analyst_note?: string };

const fmt = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v);
const number = (v: number | null | undefined) => v == null ? '—' : v.toFixed(1).replace(/\.0$/, '');
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
async function api<T>(action: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const q = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(params).map(([k,v]) => [k,String(v)])) });
  const response = await fetch(`/api/proxy?${q}`, { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.detail || json.error || `Request failed (${response.status})`);
  return json as T;
}
function behind(rows: ScenarioRow[]): Map<number,number> {
  let total = 0; const map = new Map<number,number>();
  for (const row of rows) { total += Number(row['Margin Behind Previous (L)'] || 0); map.set(row['No.'], total); }
  return map;
}
export default function RaceControl() {
  const [date, setDate] = useState('2026-10-18');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [club, setClub] = useState('');
  const [races, setRaces] = useState<RaceOption[]>([]);
  const [race, setRace] = useState('');
  const [data, setData] = useState<CardResponse | null>(null);
  const [peak, setPeak] = useState(false);
  const [mode, setMode] = useState<'Recent Best' | 'Latest Form'>('Recent Best');
  const [selected, setSelected] = useState<number | null>(null);
  const [horseRuns, setHorseRuns] = useState<HorseRun[]>([]);
  const [compare, setCompare] = useState<number[]>([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [mobileTab, setMobileTab] = useState<'rankings'|'form'|'compare'>('rankings');
  const [filter, setFilter] = useState('');

  const loadMeetings = useCallback(async (day: string) => {
    setLoading('Loading meetings'); setError(''); setData(null); setRaces([]); setRace(''); setClub(''); setSelected(null);
    try {
      const result = await api<{ meetings: Meeting[] }>('meetings', { race_date: day });
      setMeetings(result.meetings || []);
      if (!result.meetings?.length) setError('No meetings found for this date.');
    } catch (e) { setError((e as Error).message); setMeetings([]); }
    finally { setLoading(''); }
  }, []);
  const loadRaces = useCallback(async (day: string, clubId: string) => {
    setClub(clubId); setRace(''); setData(null); setRaces([]); setSelected(null);
    if (!clubId) return;
    setLoading('Loading races'); setError('');
    try { const r = await api<{ races: RaceOption[] }>('races', { race_date: day, club: clubId }); setRaces(r.races || []); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(''); }
  }, []);
  const loadPrediction = useCallback(async (day: string, clubId: string, raceId: string, includePeak: boolean) => {
    if (!clubId || !raceId) return;
    setLoading('Calculating predictions'); setError('');
    try {
      const r = await api<CardResponse>('predictions', { race_date: day, club: clubId, race: raceId, include_peak: includePeak });
      setData(r); setSelected(prev => prev !== null && r.prediction.rows.some(row => row['No.'] === prev) ? prev : r.prediction.rows[0]?.['No.'] ?? null);
    } catch (e) { setError((e as Error).message); setData(null); }
    finally { setLoading(''); }
  }, []);
  useEffect(() => {
    void loadMeetings(date);
    // Initial meeting load only; date changes are handled by the date selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!data || selected == null) { setHorseRuns([]); return; }
    const horse = data.prediction_runners.find(r => r['No.'] === selected)?.Horse;
    if (!horse) return;
    let alive = true;
    api<{ runs: HorseRun[] }>('horse', { horse }).then(r => { if (alive) setHorseRuns((r.runs || []).filter(run => !run.race_date || run.race_date < date)); }).catch(() => { if (alive) setHorseRuns([]); });
    return () => { alive = false; };
  }, [selected, data, date]);
  const currentRunner = data?.prediction_runners.find(r => r['No.'] === selected);
  const currentRow = data?.prediction.rows.find(r => r['No.'] === selected);
  const scenario = data?.prediction.scenarios[mode] || [];
  const marginMap = useMemo(() => behind(scenario), [scenario]);
  const contenders = useMemo(() => scenario.filter(row => (marginMap.get(row['No.']) ?? Infinity) <= 4), [scenario, marginMap]);
  const visible = useMemo(() => scenario.filter(r => `${r.Horse} ${r['No.']}`.toLowerCase().includes(filter.toLowerCase())), [scenario, filter]);
  const leader = scenario[0];
  const selectedMeeting = meetings.find(m => String(m.club) === club);
  return <div className="shell">
    <header className="topbar"><div className="brand"><span>RACE</span> <b>EDGE</b><sup>2.0</sup></div><div className="header-tag"><Activity size={15}/> PERFORMANCE INTELLIGENCE</div><div className="header-actions"><span className="status"><i/> SYSTEM ONLINE</span></div></header>
    <div className="toolbar"><div className="toolbar-heading"><div className="eyebrow">RACE CONTROL <span className="slash">/</span> MEETING SELECTOR</div><h1>{data?.card.name || 'Performance workspace'}</h1></div><div className="selectors"><label className="field"><span><CalendarDays size={13}/> DATE</span><input type="date" value={date} onChange={e=>{setDate(e.target.value); loadMeetings(e.target.value);}}/></label><label className="field"><span><Flag size={13}/> MEETING</span><select value={club} onChange={e=>loadRaces(date,e.target.value)}><option value="">Select meeting</option>{meetings.map(m=><option key={m.club} value={m.club}>{m.name}</option>)}</select></label><label className="field race-select"><span><Gauge size={13}/> RACE</span><select value={race} onChange={e=>{setRace(e.target.value);loadPrediction(date,club,e.target.value,peak);}}><option value="">Select race</option>{races.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label><button className="refresh" disabled={!club || !race || !!loading} onClick={()=>loadPrediction(date,club,race,peak)} title="Refresh race"><RefreshCw size={18}/></button></div></div>
    {error && <div className="notice error"><CircleAlert size={17}/>{error}<button onClick={()=>setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
    {loading && <div className="notice loading"><RefreshCw className="spin" size={17}/>{loading}…</div>}
    {!data ? <div className="empty-state"><div className="empty-mark"><Flag size={42}/></div><div className="eyebrow">AWAITING RACE DATA</div><h2>Select a meeting and race</h2><p>Race Edge will retrieve the race card, load historical performances and calculate predictions automatically.</p>{!meetings.length && <button className="primary" onClick={()=>loadMeetings(date)}>Find meetings <ArrowRight size={16}/></button>}</div> : <>
      <div className="race-meta"><span className="race-pill">R{race}</span><strong>{selectedMeeting?.name || data.card.clubName}</strong><span className="dot">·</span><span>{data.card.distance}M</span><span className="dot">·</span><span>{data.card.surfaceDescr}</span><span className="dot">·</span><span>{data.card.time}</span><span className="spacer"/><span className="subtle">CLAIMS SHOWN, NOT APPLIED</span></div>
      <div className="stat-grid"><div className="stat"><span>TOP PROJECTION</span><strong>{leader ? fmt(leader[mode === 'Recent Best' ? 'Recent Best Projection' : 'Latest Projection']) : '—'}</strong><small>{leader?.Horse || 'No predictions'}</small></div><div className="stat"><span>LEADING RUNNER</span><strong>#{leader?.['No.'] ?? '—'}</strong><small>{leader?.Horse || '—'}</small></div><div className="stat"><span>WITHIN 4 LENGTHS</span><strong>{contenders.length}</strong><small>Of scenario leader</small></div><div className="stat"><span>FIELD SIZE</span><strong>{data.prediction_runners.length}</strong><small>Carded runners</small></div></div>
      <nav className="mobile-tabs" aria-label="Workspace sections"><button className={mobileTab==='rankings'?'active':''} onClick={()=>setMobileTab('rankings')}><Trophy size={16}/> Rankings</button><button className={mobileTab==='form'?'active':''} onClick={()=>setMobileTab('form')}><History size={16}/> Horse form</button><button className={mobileTab==='compare'?'active':''} onClick={()=>setMobileTab('compare')}><SlidersHorizontal size={16}/> Compare</button></nav>
      <div className="workspace"><section className={`panel leaderboard ${mobileTab==='rankings'?'mobile-active':''}`}><div className="panel-header"><div><div className="eyebrow">01 / PREDICTION ENGINE</div><h2>Race rankings</h2></div><span className="count">{scenario.length} RATED</span></div><div className="mode-switch"><button className={mode==='Recent Best'?'active':''} onClick={()=>setMode('Recent Best')}>Recent Best</button><button className={mode==='Latest Form'?'active':''} onClick={()=>setMode('Latest Form')}>Latest Form</button></div><label className="search"><Search size={15}/><input placeholder="Find a runner" value={filter} onChange={e=>setFilter(e.target.value)}/></label><div className="ranking-head"><span>POS / RUNNER</span><span>PROJ.</span><span>BEHIND</span></div><div className="ranking-list">{visible.map(row => { const isSelected = selected===row['No.']; const margin=marginMap.get(row['No.']); const isCompare=compare.includes(row['No.']);return <div key={row['No.']} className={`ranking-row ${isSelected?'selected':''}`}><button className="ranking-main" onClick={()=>{setSelected(row['No.']);setMobileTab('form');}}><span className="rank">{row.Rank.toString().padStart(2,'0')}</span><span className="saddle">{row['No.']}</span><span className="horse-name">{row.Horse}<small>{data.prediction.rows.find(x=>x['No.']===row['No.'])?.Evidence || '—'}</small></span><strong>{fmt(row[mode==='Recent Best'?'Recent Best Projection':'Latest Projection'])}</strong><span className="behind">{margin===0?'LEADER':`${number(margin)} L`}</span><ChevronRight size={14} className="row-arrow"/></button><button className={`compare-toggle ${isCompare?'on':''}`} title={isCompare?'Remove comparison':'Add to comparison'} aria-label={`Compare ${row.Horse}`} onClick={()=>setCompare(prev=>prev.includes(row['No.'])?prev.filter(n=>n!==row['No.']):prev.length<4?[...prev,row['No.']]:prev)}>{isCompare?'✓':'+'}</button></div>;})}</div><div className="panel-foot"><span><i className="gold-dot"/> 1 MR point = 0.5 lengths</span><button className="text-btn" onClick={()=>{setPeak(!peak);loadPrediction(date,club,race,!peak);}}>{peak?'Hide':'Include'} Peak Ability <ChevronDown size={14}/></button></div>{peak && <div className="peak-list"><strong>Peak Ability</strong>{(data.prediction.scenarios['Peak Ability']||[]).slice(0,6).map(row=><div key={row['No.']}><span>{row.Rank}. {row.Horse}</span><b>{fmt(row['Peak Projection'])}</b></div>)}</div>}</section>
      <section className={`panel form-panel ${mobileTab==='form'?'mobile-active':''}`}><div className="panel-header"><div><div className="eyebrow">02 / HORSE TELEMETRY</div><h2>Performance history</h2></div><History size={19} className="muted"/></div>{currentRunner ? <><div className="selected-horse"><div className="horse-identity"><div className="large-saddle">{currentRunner['No.']}</div><div><div className="eyebrow">SELECTED RUNNER</div><h3>{currentRunner.Horse}</h3><p>Draw {fmt(currentRunner.Draw)} <span>·</span> {fmt(currentRunner.Weight)} kg <span>·</span> MR {fmt(currentRunner['Official MR'])}</p></div></div><div className="projection-grid"><div><span>RECENT BEST</span><strong>{fmt(currentRow?.['Recent Best Projection'])}</strong></div><div><span>LATEST FORM</span><strong>{fmt(currentRow?.['Latest Projection'])}</strong></div><div><span>EVIDENCE</span><strong className="evidence">{fmt(currentRow?.Evidence)}</strong></div></div></div><div className="section-label">HISTORICAL RUNS <span>{horseRuns.length} available</span></div><div className="history-scroll">{horseRuns.length ? horseRuns.map((run,i)=><article className="history-row" key={`${run.race_date}-${i}`}><div className="history-date"><strong>{fmt(run.race_date)}</strong><small>{fmt(run.track)} / {fmt(run.course)} · {fmt(run.distance)}m</small></div><div className="history-metrics"><div><small>FINISH</small><strong>{fmt(run.finish_position)}</strong></div><div><small>MR ACH.</small><strong>{fmt(run.mr_achieved)}</strong></div><div><small>RPSS</small><strong>{fmt(run.rpss)}</strong></div><div><small>SUSTAIN</small><strong>{fmt(run.sustain_residual)}</strong></div></div>{run.analyst_note && <p className="analyst-note">{run.analyst_note}</p>}</article>):<p className="no-data">No prior race history found for this runner.</p>}</div></>:<p className="no-data">Select a runner to inspect its history.</p>}</section>
      <section className={`panel compare-panel ${mobileTab==='compare'?'mobile-active':''}`}><div className="panel-header"><div><div className="eyebrow">03 / PERFORMANCE COMPARISON</div><h2>Head-to-head</h2></div><span className="count">{compare.length}/4</span></div><p className="compare-intro">Tap + next to a runner to add it to your comparison.</p>{compare.length ? <div className="compare-content">{compare.map(n=>{const r=data.prediction.rows.find(x=>x['No.']===n);if(!r)return null;return <div className="compare-card" key={n}><div><span className="mini-saddle">{n}</span><strong>{r.Horse}</strong></div><button onClick={()=>setCompare(prev=>prev.filter(x=>x!==n))} aria-label={`Remove ${r.Horse}`}><X size={15}/></button><div className="compare-metrics"><span>BEST <b>{fmt(r['Recent Best Projection'])}</b></span><span>LATEST <b>{fmt(r['Latest Projection'])}</b></span></div></div>})}</div>:<div className="compare-empty"><SlidersHorizontal size={30}/><strong>Build your comparison</strong><p>Select up to four runners from the rankings to compare their projections.</p></div>}<div className="panel-foot">Additional Pace Curve and Race Plane charts will be integrated after the historical sectional endpoints are available.</div></section></div>
    </>}
    <footer><span>RACE EDGE 2.0 <i/> PRIVATE PERFORMANCE INTELLIGENCE</span><span>Prediction analysis is a starting point, not a substitute for form study.</span></footer>
  </div>;
}

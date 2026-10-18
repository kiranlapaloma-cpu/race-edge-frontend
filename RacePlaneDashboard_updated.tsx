'use client';

import { useMemo, useState, type CSSProperties } from 'react';

type Row = Record<string, unknown>;
type Analysis = { distance_m: number; rows: Row[]; race_diagnostics: Record<string, unknown> };
type PlaneRow = Row & { Horse: string; tsSPI: number; Accel: number; Grind: number; Expected_Grind: number; Sustain_Residual: number; PPS: number; PPS_Rank: number; Sustain_Profile: string; Performance_Architecture: string };
type PlaneResult = { experimental: boolean; saved: boolean; grind_target: string; centred: boolean; runners_used: number; r2: number | null; formula: { intercept: number; tsSPI_coefficient: number; Accel_coefficient: number; offset: number }; race_test_profile: { label: string; confidence: string; summary: string; r2: number | null; travel_reward_share: number | null; accel_reward_share: number | null }; rows: PlaneRow[] };
const C = { bg: '#091321', panel: '#101e30', border: '#28384d', gold: '#d7ae65', text: '#e8edf4', muted: '#98a7bb' };
const panel: CSSProperties = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 20 };
const select: CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: '10px 12px', maxWidth: '100%' };
const num = (value: unknown): number | null => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const fmt = (value: unknown, digits = 2) => { const n = num(value); return n === null ? '—' : n.toFixed(digits); };
const errorText = (value: unknown): string => typeof value === 'string' ? value : Array.isArray(value) ? value.map(v => typeof v === 'object' && v && 'msg' in v ? String(v.msg) : String(v)).join('; ') : 'Race Plane calculation failed.';

export default function RacePlaneDashboard({ result, onPlaneChange }: { result: Analysis; onPlaneChange?: (plane: PlaneResult | null) => void }) {
  const [plane, setPlane] = useState<PlaneResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [centred, setCentred] = useState(true);
  const [selected, setSelected] = useState('');
  const [angle, setAngle] = useState(38);
  const [elevation, setElevation] = useState(26);
  const [showPlane, setShowPlane] = useState(true);
  const [showNames, setShowNames] = useState(false);
  const [view, setView] = useState<'3d' | 'top'>('3d');

  async function calculate() {
    setLoading(true); setError(''); setPlane(null); onPlaneChange?.(null);
    try {
      const rpss = num(result.race_diagnostics?.RPSS ?? result.race_diagnostics?.rpss ?? result.rows[0]?.RPSS);
      const response = await fetch('/api/proxy?action=race-plane', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics_rows: result.rows, distance_m: result.distance_m, centred, rpss }), cache: 'no-store',
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.replace('/login'); return; }
      if (!response.ok) throw new Error(errorText(json.detail ?? json.error));
      if (!Array.isArray(json.rows) || !json.formula || !json.race_test_profile || json.grind_target !== 'Grind') throw new Error('Unexpected Race Plane response. Normal Grind is required.');
      const data = json as PlaneResult;
      setPlane(data); onPlaneChange?.(data); setSelected(data.rows[0]?.Horse ?? '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to calculate Race Plane.'); }
    finally { setLoading(false); }
  }

  const plot = useMemo(() => {
    if (!plane?.rows.length) return null;
    const rs = plane.rows;
    const range = (key: 'tsSPI' | 'Accel' | 'Grind') => {
      const vals = rs.map(r => num(r[key])).filter((v): v is number => v !== null);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      return { lo: lo - Math.max((hi - lo) * .13, .4), hi: hi + Math.max((hi - lo) * .13, .4) };
    };
    const xr = range('tsSPI'), yr = range('Accel'), zr = range('Grind');
    const normal = (v: number, r: { lo: number; hi: number }) => (v - r.lo) / (r.hi - r.lo) * 2 - 1;
    const a = angle * Math.PI / 180, e = (view === 'top' ? 89 : elevation) * Math.PI / 180;
    const project = (tx: number, ay: number, gz: number) => {
      const x = tx * Math.cos(a) - ay * Math.sin(a);
      const depth = tx * Math.sin(a) + ay * Math.cos(a);
      const y = gz * Math.cos(e) - depth * Math.sin(e);
      return { x: 460 + x * 175, y: 258 - y * 155, depth };
    };
    const p = (r: PlaneRow) => project(normal(r.tsSPI, xr), normal(r.Accel, yr), normal(r.Grind, zr));
    const predicted = (t: number, aValue: number) => {
      const f = plane.formula;
      return f.offset + f.intercept + f.tsSPI_coefficient * (t - f.offset) + f.Accel_coefficient * (aValue - f.offset);
    };
    const grid: { d: string; key: string }[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = xr.lo + (xr.hi - xr.lo) * i / 8;
      const a0 = project(normal(t, xr), -1, normal(predicted(t, yr.lo), zr));
      const a1 = project(normal(t, xr), 1, normal(predicted(t, yr.hi), zr));
      grid.push({ key: `t${i}`, d: `M${a0.x},${a0.y} L${a1.x},${a1.y}` });
      const acc = yr.lo + (yr.hi - yr.lo) * i / 8;
      const b0 = project(-1, normal(acc, yr), normal(predicted(xr.lo, acc), zr));
      const b1 = project(1, normal(acc, yr), normal(predicted(xr.hi, acc), zr));
      grid.push({ key: `a${i}`, d: `M${b0.x},${b0.y} L${b1.x},${b1.y}` });
    }
    const corners = [
      project(-1, -1, normal(predicted(xr.lo, yr.lo), zr)),
      project(1, -1, normal(predicted(xr.hi, yr.lo), zr)),
      project(1, 1, normal(predicted(xr.hi, yr.hi), zr)),
      project(-1, 1, normal(predicted(xr.lo, yr.hi), zr)),
    ];
    const planePath = corners.map((c, i) => `${i ? 'L' : 'M'}${c.x},${c.y}`).join(' ') + ' Z';
    const origin = project(-1, -1, -1);
    const axes = [
      { to: project(1, -1, -1), label: 'tsSPI' },
      { to: project(-1, 1, -1), label: 'Accel' },
      { to: project(-1, -1, 1), label: 'Normal Grind' },
    ];
    const dots = rs.map(r => ({ row: r, point: p(r) })).sort((a, b) => a.point.depth - b.point.depth);
    return { grid, planePath, origin, axes, dots, p, project, normal, zr };
  }, [plane, angle, elevation, view]);

  const active = plane?.rows.find(r => r.Horse === selected);
  return <section style={panel}>
    <div style={{ fontSize: 12, fontWeight: 800, color: C.gold, letterSpacing: 1.2, marginBottom: 8 }}>08 / RACE PLANE · EXPERIMENTAL</div>
    <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>Independent regression analysis using tsSPI, Accel and <strong style={{ color: C.text }}>Normal Grind only</strong>. Experimental results do not alter PI, MR Achieved or saved records.</p>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <label style={{ color: C.muted, fontSize: 12 }}><input type="checkbox" checked={centred} onChange={e => { setCentred(e.target.checked); setPlane(null); onPlaneChange?.(null); }} /> Centre axes around 100</label>
      <button type="button" disabled={loading || result.rows.length < 4} onClick={calculate} style={{ ...select, background: C.gold, color: C.bg, fontWeight: 800, cursor: loading ? 'wait' : 'pointer' }}>{loading ? 'CALCULATING...' : plane ? 'RECALCULATE RACE PLANE' : 'CALCULATE RACE PLANE'}</button>
    </div>
    {error && <p role="alert" style={{ color: '#ffb8bf', fontSize: 13 }}>{error}</p>}
    {plane && plot && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,180px),1fr))', gap: 10, marginBottom: 17 }}>
        {[['RUNNERS FITTED', plane.runners_used], ['PLANE R²', fmt(plane.r2, 3)], ['RACE TEST', plane.race_test_profile.label], ['CONFIDENCE', plane.race_test_profile.confidence]].map(([k, v]) => <div key={String(k)} style={{ background: C.bg, borderRadius: 8, padding: 12 }}><div style={{ color: C.muted, fontSize: 10 }}>{k}</div><div style={{ color: C.gold, fontSize: 15, fontWeight: 800, marginTop: 7 }}>{v}</div></div>)}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ color: C.muted, fontSize: 11 }}>HIGHLIGHT HORSE <select style={select} value={selected} onChange={e => setSelected(e.target.value)}>{plane.rows.map(r => <option key={r.Horse} value={r.Horse}>{r.Horse}</option>)}</select></label>
        <label style={{ color: C.muted, fontSize: 11 }}>VIEW <select style={select} value={view} onChange={e => setView(e.target.value as '3d' | 'top')}><option value="3d">3D Plane</option><option value="top">Top View</option></select></label>
        <label style={{ fontSize: 12, color: C.muted }}><input type="checkbox" checked={showPlane} onChange={e => setShowPlane(e.target.checked)} /> Plane surface</label>
        <label style={{ fontSize: 12, color: C.muted }}><input type="checkbox" checked={showNames} onChange={e => setShowNames(e.target.checked)} /> Horse labels</label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: C.muted }}>ROTATION {angle}° <input type="range" min="0" max="360" value={angle} onChange={e => setAngle(Number(e.target.value))} style={{ display: 'block', width: 155 }} /></label>
        {view === '3d' && <label style={{ fontSize: 11, color: C.muted }}>ELEVATION {elevation}° <input type="range" min="5" max="85" value={elevation} onChange={e => setElevation(Number(e.target.value))} style={{ display: 'block', width: 155 }} /></label>}
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><svg viewBox="0 0 920 520" style={{ width: '100%', minWidth: 600, display: 'block', background: '#0b1829', borderRadius: 9 }} role="img" aria-label="Interactive projected Race Plane with selectable horse points">
        {showPlane && <><path d={plot.planePath} fill="#d7ae65" fillOpacity=".10" stroke={C.gold} strokeOpacity=".55" strokeWidth="1.4" />{plot.grid.map(g => <path key={g.key} d={g.d} fill="none" stroke={C.gold} strokeOpacity=".22" strokeWidth=".8" />)}</>}
        {plot.axes.map(a => <g key={a.label}><line x1={plot.origin.x} y1={plot.origin.y} x2={a.to.x} y2={a.to.y} stroke="#8496b1" strokeWidth="1.5" /><text x={a.to.x + 9} y={a.to.y - 8} fill={C.muted} fontSize="13">{a.label}</text></g>)}
        {plot.dots.map(({ row, point }) => { const chosen = row.Horse === selected; return <g key={row.Horse} onClick={() => setSelected(row.Horse)} style={{ cursor: 'pointer' }}><circle cx={point.x} cy={point.y} r={chosen ? 9 : 5.5} fill={chosen ? C.gold : '#63c5ff'} fillOpacity={chosen ? 1 : .67} stroke={chosen ? '#ffffff' : '#14263d'} strokeWidth={chosen ? 2.5 : 1.5}><title>{`${row.Horse} · PPS ${fmt(row.PPS)} · Residual ${fmt(row.Sustain_Residual)}`}</title></circle>{(showNames || chosen) && <text x={point.x + 11} y={point.y - 8} fontSize={chosen ? 13 : 10} fontWeight={chosen ? 800 : 400} fill={chosen ? C.gold : C.muted}>{row.Horse}</text>}</g>; })}
        <text x="460" y="502" textAnchor="middle" fill={C.muted} fontSize="12">Drag the rotation/elevation sliders to inspect the regression plane · Tap a point to highlight a horse</text>
      </svg></div>
      {active && <div style={{ background: C.bg, padding: 15, borderRadius: 8, marginTop: 15 }}><div style={{ color: C.gold, fontWeight: 800, marginBottom: 10 }}>{active.Horse}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 10 }}>{[['tsSPI', active.tsSPI], ['Accel', active.Accel], ['Normal Grind', active.Grind], ['Expected Grind', active.Expected_Grind], ['Sustain Residual', active.Sustain_Residual], ['PPS', active.PPS], ['PPS Rank', active.PPS_Rank]].map(([label, value]) => <div key={String(label)}><div style={{ fontSize: 10, color: C.muted }}>{label}</div><strong style={{ color: C.text, fontSize: 15 }}>{fmt(value)}</strong></div>)}</div><p style={{ color: C.muted, fontSize: 12, marginBottom: 0 }}>{active.Performance_Architecture} · {active.Sustain_Profile}</p></div>}
      <div style={{ marginTop: 18, color: C.gold, fontSize: 12, fontWeight: 800 }}>RACE TEST PROFILE</div><p style={{ fontSize: 13, color: C.text, lineHeight: 1.65 }}>{plane.race_test_profile.summary}</p>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><table style={{ borderCollapse: 'collapse', width: '100%', whiteSpace: 'nowrap', fontSize: 12 }}><thead><tr>{['RANK', 'HORSE', 'PPS', 'NORMAL GRIND', 'EXPECTED GRIND', 'SUSTAIN RESIDUAL', 'ARCHITECTURE'].map(t => <th key={t} style={{ color: C.gold, padding: 10, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{t}</th>)}</tr></thead><tbody>{plane.rows.map(r => <tr key={r.Horse} onClick={() => setSelected(r.Horse)} style={{ background: selected === r.Horse ? '#273349' : 'transparent', cursor: 'pointer' }}>{[r.PPS_Rank, r.Horse, fmt(r.PPS), fmt(r.Grind), fmt(r.Expected_Grind), fmt(r.Sustain_Residual), r.Performance_Architecture].map((v, i) => <td key={i} style={{ padding: 10, borderBottom: `1px solid ${C.border}`, color: selected === r.Horse ? C.gold : C.text }}>{v}</td>)}</tr>)}</tbody></table></div>
      <p style={{ color: C.muted, fontSize: 11, marginBottom: 0 }}>Experimental model · Normal Grind only · Not saved · No impact on handicap ratings.</p>
    </>}
  </section>;
}

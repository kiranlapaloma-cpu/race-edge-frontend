'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Row = Record<string, unknown>;
type Draft = {
  race_date: string;
  track: string;
  course: string;
  race_number: number;
  distance: number;
  rpss: number | null;
  race_test: string;
  runners: Row[];
};

const DRAFT_KEY = 'race-edge-database-draft-v1';
const gold = '#d7ae65';
const muted = '#98a7bb';
const panel: React.CSSProperties = {
  background: '#101e30', border: '1px solid #28384d',
  borderRadius: 12, padding: 18, marginBottom: 18,
};
const field: React.CSSProperties = {
  width: '100%', minWidth: 0, background: '#091321', color: '#e8edf4',
  border: '1px solid #35455a', borderRadius: 7, padding: '10px 11px',
  fontSize: 14, boxSizing: 'border-box',
};
function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}
function numberOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function parseDraft(raw: string): Draft {
  const obj: unknown = JSON.parse(raw);
  if (!obj || typeof obj !== 'object') throw new Error('Draft must be an object.');
  const data = obj as Record<string, unknown>;
  if (!Array.isArray(data.runners) || !data.runners.length) {
    throw new Error('Draft does not contain any runners.');
  }
  const runners = data.runners.map((runner, i) => {
    if (!runner || typeof runner !== 'object' || Array.isArray(runner)) {
      throw new Error(`Invalid runner at position ${i + 1}.`);
    }
    return { ...(runner as Row) };
  });
  return {
    race_date: str(data.race_date),
    track: str(data.track),
    course: str(data.course),
    race_number: Number(data.race_number) || 0,
    distance: Number(data.distance) || 0,
    rpss: numberOrNull(data.rpss),
    race_test: str(data.race_test),
    runners,
  };
}

export default function DatabasePage() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState('');
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveResult, setSaveResult] = useState<{ inserted: number; matched_existing: number; runners_processed: number } | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) setDraft(parseDraft(saved));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Unable to load the draft.');
    }
  }, []);

  function changeDraft(next: Draft) {
    setDraft(next);
    setVerified(false);
    setSaveResult(null);
    setSaveError('');
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      setLoadError('');
    } catch {
      setLoadError('Browser could not store the updated draft.');
    }
  }

  function changeRunner(index: number, key: string, value: unknown) {
    if (!draft) return;
    const runners = draft.runners.map((row, i) => i === index ? { ...row, [key]: value } : row);
    changeDraft({ ...draft, runners });
  }

  async function saveRace() {
    if (!draft || !verified || issues.length || saving || saveResult) return;
    const accepted = window.confirm(
      `Save or update ${draft.runners.length} runners for ${draft.track} Race ${draft.race_number} on ${draft.race_date}?\n\nExisting performances in this race may be updated. Other races will remain unchanged.`
    );
    if (!accepted) return;
    setSaving(true);
    setSaveError('');
    try {
      const runners = draft.runners.map(row => ({
        horse: str(row.horse).trim(),
        finish_position: str(row.finish_position).trim(),
        race_date: draft.race_date,
        track: draft.track.trim(),
        course: draft.course.trim(),
        race_number: draft.race_number,
        distance: draft.distance,
        rpss: draft.rpss,
        race_test: draft.race_test.trim() || null,
        official_mr: numberOrNull(row.official_mr),
        mr_achieved: numberOrNull(row.mr_achieved),
        sustain_residual: numberOrNull(row.sustain_residual),
        sustain_verdict: str(row.sustain_verdict).trim() || null,
        analyst_note: str(row.analyst_note).trim() || null,
      }));
      const response = await fetch('/api/save-race', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ confirm: true, runners }),
      });
      const data: unknown = await response.json();
      const result = data as Record<string, unknown>;
      if (!response.ok || result.success !== true) {
        const detail = result.detail ?? result.error;
        throw new Error(typeof detail === 'string' ? detail : `Save failed (HTTP ${response.status}).`);
      }
      setSaveResult({
        inserted: Number(result.inserted ?? 0),
        matched_existing: Number(result.matched_existing ?? 0),
        runners_processed: Number(result.runners_processed ?? 0),
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not confirm the database save.');
    } finally {
      setSaving(false);
    }
  }

  const issues = useMemo(() => {
    if (!draft) return [];
    const problems: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.race_date) ||
        Number.isNaN(new Date(`${draft.race_date}T12:00:00`).getTime())) {
      problems.push('Enter a valid race date (YYYY-MM-DD).');
    }
    if (!draft.track.trim()) problems.push('Track is missing.');
    if (!draft.course.trim()) problems.push('Course is missing.');
    if (!Number.isInteger(draft.race_number) || draft.race_number < 1) problems.push('Race number must be a positive whole number.');
    if (!Number.isInteger(draft.distance) || draft.distance < 1) problems.push('Distance must be a positive whole number.');
    const names = new Set<string>();
    const positions = new Set<number>();
    draft.runners.forEach((row, i) => {
      const name = str(row.horse).trim();
      if (!name) problems.push(`Runner ${i + 1}: horse name is missing.`);
      if (name && names.has(name.toUpperCase())) problems.push(`Duplicate horse: ${name}.`);
      names.add(name.toUpperCase());
      const position = str(row.finish_position).trim();
      const match = /^(\d+)\/(\d+)$/.exec(position);
      if (!match || Number(match[1]) < 1 || Number(match[1]) > draft.runners.length || Number(match[2]) !== draft.runners.length) {
        problems.push(`${name || `Runner ${i + 1}`}: finishing position must be X/${draft.runners.length}.`);
      } else if (positions.has(Number(match[1]))) {
        problems.push(`Duplicate finishing position: ${match[1]}.`);
      } else positions.add(Number(match[1]));
      if (numberOrNull(row.mr_achieved) === null) problems.push(`${name || `Runner ${i + 1}`}: MR Achieved is missing.`);
      if (!str(row.analyst_note).trim()) problems.push(`${name || `Runner ${i + 1}`}: Analyst Note is missing.`);
    });
    return problems;
  }, [draft]);

  return (
    <div style={{ minHeight: '100vh', background: '#091321', color: '#e8edf4', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <header style={{ borderBottom: '1px solid #28384d', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, letterSpacing: 1.1, fontSize: 21 }}>RACE <span style={{ color: gold }}>EDGE</span> <small style={{ fontSize: 11, color: muted }}>2.0</small></div>
        <Link href="/analysis" style={{ color: gold, textDecoration: 'none', fontSize: 13 }}>← Race Analysis</Link>
      </header>
      <main style={{ maxWidth: 1400, margin: 'auto', padding: '25px 16px 60px' }}>
        <div style={{ color: gold, letterSpacing: 2, fontWeight: 700, fontSize: 11 }}>03 / DATABASE MANAGEMENT</div>
        <h1 style={{ fontSize: 'clamp(25px, 5vw, 36px)', margin: '10px 0' }}>Verify Race Data</h1>
        <p style={{ color: muted, fontSize: 14, lineHeight: 1.6 }}>Review the entire race before it is saved. Saving is available after all runners have been verified. Previously saved performances may be updated.</p>
        {loadError && <div role="alert" style={{ ...panel, borderColor: '#a64d56', color: '#ffb8bf' }}>{loadError}</div>}
        {!draft ? (
          <section style={panel}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>No race draft loaded</h2>
            <p style={{ color: muted, lineHeight: 1.6, fontSize: 14 }}>No race is currently staged. Open Race Analysis and choose Verify Entire Race to bring its runners here.</p>
            <Link href="/analysis" style={{ color: gold }}>Return to Race Analysis →</Link>
          </section>
        ) : (
          <>
            <section style={panel}>
              <h2 style={{ color: gold, fontSize: 14, letterSpacing: 1, marginTop: 0 }}>01 / RACE DETAILS</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 14 }}>
                {([
                  ['race_date', 'RACE DATE', 'date'], ['track', 'TRACK', 'text'],
                  ['course', 'COURSE', 'text'], ['race_number', 'RACE NUMBER', 'number'],
                ] as const).map(([key, label, type]) => (
                  <label key={key} style={{ fontSize: 11, color: muted }}>{label}
                    <input type={type} value={draft[key]} onChange={e => changeDraft({ ...draft, [key]: type === 'number' ? Number(e.target.value) : e.target.value })} style={{ ...field, marginTop: 7 }} />
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 13, color: muted, marginBottom: 0 }}>Distance: <strong style={{ color: '#e8edf4' }}>{draft.distance}m</strong> · Runners: <strong style={{ color: '#e8edf4' }}>{draft.runners.length}</strong> · RPSS: <strong style={{ color: '#e8edf4' }}>{draft.rpss == null ? '—' : Number(draft.rpss).toFixed(2)}</strong> · Race Test: <strong style={{ color: '#e8edf4' }}>{draft.race_test || '—'}</strong></p>
            </section>
            <section style={panel}>
              <h2 style={{ color: gold, fontSize: 14, letterSpacing: 1, marginTop: 0 }}>02 / VERIFY ALL RUNNERS</h2>
              <p style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>Official MR may be blank. MR Achieved and Sustain values come from the existing calculations. Analyst Notes contain F, T, A and <strong>CG only</strong>; Normal Grind is not stored.</p>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, minWidth: 1000 }}>
                  <thead><tr>{['HORSE', 'FINISH', 'OFFICIAL MR', 'MR ACHIEVED', 'SUSTAIN', 'VERDICT', 'ANALYST NOTE'].map(label => <th key={label} style={{ padding: '10px 8px', textAlign: 'left', color: gold, borderBottom: '1px solid #35455a' }}>{label}</th>)}</tr></thead>
                  <tbody>{draft.runners.map((row, i) => (
                    <tr key={`${str(row.horse)}-${i}`}>
                      <td style={{ padding: '9px 8px', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid #28384d' }}>{str(row.horse) || '—'}</td>
                      <td style={{ padding: 6 }}><input aria-label={`Finish position ${str(row.horse)}`} style={{ ...field, width: 75 }} value={str(row.finish_position)} onChange={e => changeRunner(i, 'finish_position', e.target.value)} /></td>
                      <td style={{ padding: 6 }}><input aria-label={`Official MR ${str(row.horse)}`} type="number" step="1" style={{ ...field, width: 95 }} value={row.official_mr == null ? '' : str(row.official_mr)} onChange={e => changeRunner(i, 'official_mr', e.target.value === '' ? null : Number(e.target.value))} /></td>
                      <td style={{ padding: '9px 8px', color: gold }}>{str(row.mr_achieved) || '—'}</td>
                      <td style={{ padding: '9px 8px' }}>{row.sustain_residual == null ? '—' : str(row.sustain_residual)}</td>
                      <td style={{ padding: '9px 8px' }}>{str(row.sustain_verdict) || 'Unavailable'}</td>
                      <td style={{ padding: 6 }}><textarea aria-label={`Analyst Note ${str(row.horse)}`} rows={3} style={{ ...field, minWidth: 260, resize: 'vertical' }} value={str(row.analyst_note)} onChange={e => changeRunner(i, 'analyst_note', e.target.value)} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
            <section style={panel}>
              <h2 style={{ color: gold, fontSize: 14, letterSpacing: 1, marginTop: 0 }}>03 / FINAL VERIFICATION</h2>
              {issues.length ? <div role="alert" style={{ color: '#ffcb88', fontSize: 13 }}><strong>Resolve {issues.length} issue(s):</strong><ul>{issues.map((issue, i) => <li key={i} style={{ marginTop: 6 }}>{issue}</li>)}</ul></div> : <p style={{ color: '#a2dfc7', fontSize: 13 }}>All required verification fields are complete.</p>}
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, marginTop: 15 }}>
                <input type="checkbox" checked={verified} disabled={issues.length > 0 || saving || !!saveResult} onChange={e => setVerified(e.target.checked)} style={{ accentColor: gold }} />
                I have checked the race details and all {draft.runners.length} runners.
              </label>
              <button type="button" onClick={saveRace} disabled={!verified || issues.length > 0 || saving || !!saveResult} style={{ width: '100%', marginTop: 18, padding: 15, border: 0, borderRadius: 8, fontWeight: 800, background: !verified || issues.length || saving || saveResult ? '#596273' : gold, color: '#091321', cursor: !verified || issues.length || saving || saveResult ? 'not-allowed' : 'pointer' }}>{saving ? 'SAVING RACE…' : saveResult ? 'RACE SAVED' : 'SAVE / UPDATE ENTIRE RACE'}</button>
              {saveError && <p role="alert" style={{ color: '#ffb8bf', fontSize: 13 }}>{saveError}</p>}
              {saveResult && <div role="status" style={{ marginTop: 14, padding: 14, borderRadius: 8, border: '1px solid #43816c', color: '#a2dfc7', fontSize: 13 }}><strong>Race saved successfully.</strong><p style={{ marginBottom: 0 }}>Processed: {saveResult.runners_processed} · New: {saveResult.inserted} · Matched existing: {saveResult.matched_existing}</p></div>}
              <p style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>New runners will be inserted; matching performances may be updated. Missing runners are not deleted. Other races remain unchanged.</p>
            </section>
          </>
        )}
        <footer style={{ textAlign: 'center', fontSize: 11, color: muted, marginTop: 30 }}>RACE EDGE 2.0 · DATABASE VERIFICATION</footer>
      </main>
    </div>
  );
}


'use client';

import { useMemo, useState, type CSSProperties } from 'react';

type Row = Record<string, unknown>;

type Analysis = {
  distance_m: number;
  step: number;
  markers: number[];
  rows: Row[];
  race_diagnostics: Record<string, unknown>;
  saved: boolean;
};

type Ratings = { rows: Row[]; ready: boolean } | null;

const C = {
  panel: '#101e30',
  border: '#28384d',
  gold: '#d7ae65',
  text: '#e8edf4',
  muted: '#98a7bb',
  bg: '#091321',
};

const palette = [
  '#e66c76',
  '#63c5ff',
  '#6ed6a2',
  '#f5bb6d',
  '#bd94ff',
  '#f48fc5',
  '#56d6d3',
  '#c7d879',
  '#ff946b',
  '#8eacff',
  '#e7dc8a',
  '#bdacfa',
];

const number = (v: unknown): number | null =>
  v !== null &&
  v !== undefined &&
  v !== '' &&
  Number.isFinite(Number(v))
    ? Number(v)
    : null;

const fmt = (v: unknown, digits = 2) => {
  const n = number(v);
  return n === null ? '—' : n.toFixed(digits);
};

const horse = (r: Row) => String(r.Horse ?? '').trim();

const box: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 18,
  marginBottom: 20,
};

const select: CSSProperties = {
  color: C.text,
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  padding: '10px 12px',
  maxWidth: '100%',
  fontSize: 13,
};

export default function CoreMetricsDashboard({
  result,
  sourceRows,
  ratings,
}: {
  result: Analysis;
  sourceRows: Row[];
  ratings: Ratings;
}) {
  const [selected, setSelected] = useState('');
  const [paceMode, setPaceMode] = useState<'raw' | 'relative'>('raw');
  const [runnerSet, setRunnerSet] = useState<
    'all' | 'top8' | 'selected'
  >('all');
  const [labels, setLabels] = useState(true);
  const [phases, setPhases] = useState(true);

  const ranked = useMemo(
    () =>
      [...result.rows].sort(
        (a, b) =>
          (number(b.PI) ?? -Infinity) -
            (number(a.PI) ?? -Infinity) ||
          (number(a.Finish_Pos) ?? Infinity) -
            (number(b.Finish_Pos) ?? Infinity)
      ),
    [result.rows]
  );

  const active =
    selected && ranked.some((r) => horse(r) === selected)
      ? selected
      : horse(ranked[0] ?? {});

  const sourceByHorse = useMemo(
    () => new Map(sourceRows.map((r) => [horse(r), r])),
    [sourceRows]
  );

  const segments = useMemo(() => {
    const markers = Object.keys(sourceRows[0] ?? {})
      .filter((k) => /^\d+_Time$/.test(k))
      .map((k) => Number(k.split('_')[0]))
      .sort((a, b) => b - a);

    const seg: {
      remaining: number;
      distance: number;
      key: string;
    }[] = [];

    if (markers.length) {
      const first = markers[0];

      if (result.distance_m > first) {
        seg.push({
          remaining: first,
          distance: result.distance_m - first,
          key: `${first}_Time`,
        });
      }

      for (let i = 1; i < markers.length; i++) {
        seg.push({
          remaining: markers[i],
          distance: markers[i - 1] - markers[i],
          key: `${markers[i]}_Time`,
        });
      }

      // Match original Streamlit pace curve.
      seg.push({
        remaining: 0,
        distance: result.step,
        key: 'Finish_Time',
      });
    }

    return seg;
  }, [sourceRows, result.distance_m, result.step]);

  const speeds = useMemo(
    () =>
      new Map(
        ranked.map((r) => {
          const src = sourceByHorse.get(horse(r));

          return [
            horse(r),
            segments.map((s) => {
              const t = number(src?.[s.key]);
              return t && t > 0 ? s.distance / t : null;
            }),
          ] as const;
        })
      ),
    [ranked, sourceByHorse, segments]
  );

  const fieldAverage = useMemo(
    () =>
      segments.map((_, i) => {
        const valid = Array.from(speeds.values())
          .map((v) => v[i])
          .filter((v): v is number => v !== null);

        return valid.length
          ? valid.reduce((a, b) => a + b, 0) / valid.length
          : null;
      }),
    [segments, speeds]
  );

  const shown =
    runnerSet === 'top8'
      ? ranked.slice(0, 8)
      : runnerSet === 'selected'
        ? ranked.filter((r) => horse(r) === active)
        : ranked;

  const chartSeries = shown.map((r) => ({
    name: horse(r),
    values: (speeds.get(horse(r)) ?? []).map((v, i) =>
      v === null || fieldAverage[i] === null
        ? null
        : paceMode === 'relative'
          ? v - fieldAverage[i]!
          : v
    ),
  }));

  const reference = fieldAverage.map((v) =>
    v === null ? null : paceMode === 'relative' ? 0 : v
  );

  const allValues = [
    ...chartSeries.flatMap((s) => s.values),
    ...reference,
  ].filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );

  const low = allValues.length ? Math.min(...allValues) : 0;
  const high = allValues.length ? Math.max(...allValues) : 1;
  const pad = Math.max((high - low) * 0.12, 0.1);
  const minY = low - pad;
  const maxY = high + pad;

  const W = 1120;
  const H = Math.max(
    470,
    labels ? shown.length * 19 + 120 : 470
  );

  const left = 65;
  const right = labels ? 260 : 25;
  const top = 42;
  const bottom = 66;

  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const x = (i: number) =>
    left +
    (segments.length > 1
      ? i / (segments.length - 1)
      : 0.5) *
      plotW;

  const y = (v: number) =>
    top + ((maxY - v) / (maxY - minY)) * plotH;

  const path = (v: (number | null)[]) =>
    v
      .map((n, i) =>
        n === null
          ? ''
          : `${i === 0 || v[i - 1] === null ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(n).toFixed(2)}`
      )
      .join(' ');

  const endLabels = (() => {
    if (!labels) return new Map<string, number>();

    const entries = chartSeries
      .flatMap((s) => {
        const last = s.values.reduce<number>(
          (index, value, j) =>
            value !== null ? j : index,
          -1
        );

        const value = last >= 0 ? s.values[last] : null;

        return value === null
          ? []
          : [{ name: s.name, desired: y(value) }];
      })
      .sort((a, b) => a.desired - b.desired);

    const spacing = 18;
    const min = top + 8;
    const max = top + plotH - 8;

    const positions = entries.map((entry, i) =>
      Math.max(entry.desired, min + i * spacing)
    );

    for (let i = positions.length - 1; i >= 0; i--) {
      const limit =
        i === positions.length - 1
          ? max
          : positions[i + 1] - spacing;

      positions[i] = Math.min(positions[i], limit);
    }

    return new Map(
      entries.map((entry, i) => [
        entry.name,
        positions[i],
      ])
    );
  })();

  const rated =
    ratings?.rows
      .map((r) => number(r['Official MR']))
      .filter((n): n is number => n !== null) ?? [];

  const achieved =
    ratings?.rows
      .map((r) => number(r['MR Achieved']))
      .filter((n): n is number => n !== null) ?? [];

  const officialAvg = rated.length
    ? Math.round(
        rated.reduce((a, b) => a + b, 0) / rated.length
      )
    : null;

  const achievedAvg = achieved.length
    ? Math.round(
        achieved.reduce((a, b) => a + b, 0) /
          achieved.length
      )
    : null;

  const rpss =
    result.race_diagnostics?.RPSS ??
    result.race_diagnostics?.rpss ??
    ranked[0]?.RPSS;

  return (
    <>
      <section style={box}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1.2,
            color: C.gold,
            marginBottom: 15,
          }}
        >
          05 / CORE METRICS
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'end',
            marginBottom: 18,
          }}
        >
          <label
            style={{
              flex: '1 1 220px',
              fontSize: 11,
              color: C.muted,
            }}
          >
            HIGHLIGHT HORSE
            <br />
            <select
              style={{
                ...select,
                width: '100%',
                marginTop: 6,
              }}
              value={active}
              onChange={(e) =>
                setSelected(e.target.value)
              }
            >
              {ranked.map((r) => (
                <option
                  key={horse(r)}
                  value={horse(r)}
                >
                  {horse(r)}
                </option>
              ))}
            </select>
          </label>


          <div
            style={{
              fontSize: 12,
              color: C.muted,
              paddingBottom: 10,
            }}
          >
            RPSS:{' '}
            <strong style={{ color: C.gold }}>
              {fmt(rpss)}
            </strong>
          </div>
        </div>

        <div
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              whiteSpace: 'nowrap',
              fontSize: 12,
            }}
          >
            <thead>
              <tr>
                {[
                  '#',
                  'HORSE',
                  'FIN',
                  'PI',
                  'F200',
                  'tsSPI',
                  'ACCEL',
                  'GRIND',
                  'CORRECTED GRIND',
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '11px 10px',
                      color: C.gold,
                      background: C.bg,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ranked.map((r, i) => {
                const isActive =
                  horse(r) === active;

                const values = [
                  i + 1,
                  horse(r),
                  r.Finish_Pos,
                  fmt(r.PI),
                  fmt(r.F200_idx),
                  fmt(r.tsSPI),
                  fmt(r.Accel),
                  fmt(r.Grind),
                  fmt(r.Grind_CG ?? r['Corrected Grind']),
                ];

                return (
                  <tr
                    key={`${horse(r)}-${i}`}
                    onClick={() =>
                      setSelected(horse(r))
                    }
                    style={{
                      cursor: 'pointer',
                      background: isActive
                        ? '#273349'
                        : 'transparent',
                    }}
                  >
                    {values.map((v, j) => (
                      <td
                        key={j}
                        style={{
                          padding: '11px 10px',
                          borderBottom: `1px solid ${C.border}`,
                          fontWeight: isActive
                            ? 800
                            : 400,
                          color: isActive
                            ? C.gold
                            : C.text,
                        }}
                      >
                        {v == null
                          ? '—'
                          : String(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            fontSize: 11,
            color: C.muted,
            marginTop: 12,
          }}
        >
          Sorted by PI. Select any runner to highlight
          its complete pace curve. Normal Grind and Corrected Grind
          are displayed side by side; only Corrected Grind is saved.
        </div>
      </section>

      <section style={box}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1.2,
            color: C.gold,
            marginBottom: 16,
          }}
        >
          06 / PACE CURVE
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <select
            aria-label="Pace curve mode"
            style={select}
            value={paceMode}
            onChange={(e) =>
              setPaceMode(
                e.target.value as 'raw' | 'relative'
              )
            }
          >
            <option value="raw">
              Raw Pace (m/s)
            </option>
            <option value="relative">
              Vs Field Average (m/s)
            </option>
          </select>

          <select
            aria-label="Runners shown"
            style={select}
            value={runnerSet}
            onChange={(e) =>
              setRunnerSet(
                e.target.value as
                  | 'all'
                  | 'top8'
                  | 'selected'
              )
            }
          >
            <option value="all">
              Whole field
            </option>
            <option value="top8">
              Top 8 by PI
            </option>
            <option value="selected">
              Selected horse + field average
            </option>
          </select>

          <label
            style={{
              fontSize: 12,
              color: C.muted,
            }}
          >
            <input
              type="checkbox"
              checked={phases}
              onChange={(e) =>
                setPhases(e.target.checked)
              }
            />{' '}
            Phase shading
          </label>

          <label
            style={{
              fontSize: 12,
              color: C.muted,
            }}
          >
            <input
              type="checkbox"
              checked={labels}
              onChange={(e) =>
                setLabels(e.target.checked)
              }
            />{' '}
            Line-end labels
          </label>
        </div>

        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.text,
            marginBottom: 8,
          }}
        >
          Pace Curve —{' '}
          {paceMode === 'raw'
            ? 'raw pace by segment'
            : 'relative to field average'}
        </div>

        {segments.length < 2 ? (
          <p style={{ color: C.muted }}>
            Insufficient sectional markers for pace curve.
          </p>
        ) : (
          <div
            style={{
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`Pace curve showing ${paceMode} speeds in metres per second`}
              style={{
                display: 'block',
                width: '100%',
                minWidth: 650,
                height: 'auto',
                background: '#0b1829',
                borderRadius: 9,
              }}
            >
              {phases &&
                (() => {
                  const i600 = segments.findIndex(
                    (s) => s.remaining === 600
                  );
                  const i200 = segments.findIndex(
                    (s) => s.remaining === 200
                  );
                  const fin = segments.length - 1;

                  const bands: {
                    a: number;
                    b: number;
                    label: string;
                  }[] = [];

                  if (i600 > 0) {
                    const mid = Math.max(
                      1,
                      Math.round(i600 * 0.55)
                    );

                    bands.push({
                      a: 0,
                      b: mid - 0.5,
                      label: 'Early',
                    });

                    bands.push({
                      a: mid - 0.5,
                      b: i600 - 0.5,
                      label: 'Sustain',
                    });
                  }

                  if (i600 >= 0 && i200 >= i600) {
                    bands.push({
                      a: i600 - 0.5,
                      b: i200 + 0.5,
                      label: 'Acceleration',
                    });
                  }

                  bands.push({
                    a: fin - 0.5,
                    b: fin + 0.5,
                    label: 'Grind',
                  });

                  return bands.map((b, i) => {
                    const xa = Math.max(
                      left,
                      x(Math.max(0, b.a))
                    );

                    const xb = Math.min(
                      left + plotW,
                      x(Math.min(fin, b.b))
                    );

                    return (
                      <g key={i}>
                        <rect
                          x={xa}
                          y={top}
                          width={Math.max(0, xb - xa)}
                          height={plotH}
                          fill={
                            i % 2
                              ? '#8392ac'
                              : '#a8b6cc'
                          }
                          opacity={i % 2 ? 0.11 : 0.06}
                        />
                        <text
                          x={(xa + xb) / 2}
                          y={top + 13}
                          textAnchor="middle"
                          fontSize="10"
                          fill={C.muted}
                        >
                          {b.label}
                        </text>
                      </g>
                    );
                  });
                })()}

              {Array.from(
                { length: 5 },
                (_, i) => {
                  const v =
                    minY +
                    ((maxY - minY) * i) / 4;

                  return (
                    <g key={i}>
                      <line
                        x1={left}
                        x2={left + plotW}
                        y1={y(v)}
                        y2={y(v)}
                        stroke="#334359"
                        strokeDasharray="3 5"
                      />
                      <text
                        x={left - 9}
                        y={y(v) + 4}
                        textAnchor="end"
                        fill={C.muted}
                        fontSize="11"
                      >
                        {v.toFixed(2)}
                      </text>
                    </g>
                  );
                }
              )}

              {segments.map((s, i) => (
                <g key={i}>
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={top}
                    y2={top + plotH}
                    stroke="#253448"
                    opacity=".5"
                  />
                  <text
                    x={x(i)}
                    y={top + plotH + 19}
                    fill={C.muted}
                    textAnchor="middle"
                    fontSize="10"
                  >
                    {s.remaining === 0
                      ? 'FIN'
                      : `${s.remaining}m`}
                  </text>
                </g>
              ))}

              <path
                d={path(reference)}
                fill="none"
                stroke="#b5becb"
                strokeWidth="2.5"
                strokeDasharray="7 5"
              />

              {chartSeries.map((s, i) => {
                const chosen =
                  s.name === active;

                const color =
                  palette[
                    ranked.findIndex(
                      (r) =>
                        horse(r) === s.name
                    ) % palette.length
                  ];

                const last =
                  s.values.reduce<number>(
                    (last, v, j) =>
                      v !== null ? j : last,
                    -1
                  );

                return (
                  <g
                    key={s.name}
                    opacity={chosen ? 1 : 0.43}
                  >
                    <path
                      d={path(s.values)}
                      fill="none"
                      stroke={
                        chosen ? C.gold : color
                      }
                      strokeWidth={
                        chosen ? 3.8 : 1.7
                      }
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />

                    {s.values.map((v, j) =>
                      v === null ? null : (
                        <circle
                          key={j}
                          cx={x(j)}
                          cy={y(v)}
                          r={
                            chosen ? 3.6 : 2.2
                          }
                          fill={
                            chosen ? C.gold : color
                          }
                        >
                          <title>
                            {`${s.name} · ${
                              segments[j].remaining ||
                              'FIN'
                            } · ${v.toFixed(3)} m/s`}
                          </title>
                        </circle>
                      )
                    )}

                    {labels &&
                      last >= 0 &&
                      s.values[last] !== null &&
                      endLabels.has(s.name) && (
                        <>
                          <path
                            d={`M ${x(last) + 5} ${y(s.values[last]!)} L ${left + plotW + 18} ${endLabels.get(s.name)!} L ${left + plotW + 25} ${endLabels.get(s.name)!}`}
                            fill="none"
                            stroke={
                              chosen
                                ? C.gold
                                : color
                            }
                            strokeWidth={
                              chosen ? 1.7 : 1
                            }
                            opacity={
                              chosen ? 1 : 0.8
                            }
                          />
                          <text
                            x={
                              left +
                              plotW +
                              31
                            }
                            y={
                              endLabels.get(
                                s.name
                              )! + 4
                            }
                            fontSize={
                              chosen ? 12 : 11
                            }
                            fontWeight={
                              chosen ? 800 : 500
                            }
                            fill={
                              chosen
                                ? C.gold
                                : color
                            }
                          >
                            {s.name}
                          </text>
                        </>
                      )}
                  </g>
                );
              })}

              <text
                x={W / 2}
                y={H - 12}
                textAnchor="middle"
                fill={C.muted}
                fontSize="12"
              >
                Distance remaining
              </text>

              <text
                transform={`translate(17 ${H / 2}) rotate(-90)`}
                textAnchor="middle"
                fill={C.muted}
                fontSize="12"
              >
                {paceMode === 'raw'
                  ? 'Speed (m/s)'
                  : 'Speed vs field average (m/s)'}
              </text>
            </svg>
          </div>
        )}

        <div
          style={{
            fontSize: 11,
            color: C.muted,
            marginTop: 12,
          }}
        >
          Dashed line:{' '}
          {paceMode === 'raw'
            ? 'whole-field average'
            : 'zero (field average)'}
          . Field average always includes every runner.
          Gold: selected horse.
        </div>
      </section>

      <section style={box}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1.2,
            color: C.gold,
            marginBottom: 14,
          }}
        >
          07 / RACE STRENGTH
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%,180px),1fr))',
            gap: 12,
          }}
        >
          {[
            ['AVERAGE OFFICIAL MR', officialAvg],
            ['AVERAGE MR ACHIEVED', achievedAvg],
            [
              'RATING DIFFERENCE',
              officialAvg !== null &&
              achievedAvg !== null
                ? achievedAvg - officialAvg
                : null,
            ],
            [
              'OFFICIALLY RATED RUNNERS',
              ratings ? rated.length : null,
            ],
          ].map(([title, value]) => (
            <div
              key={String(title)}
              style={{
                background: C.bg,
                borderRadius: 8,
                padding: 15,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: C.muted,
                  letterSpacing: 0.8,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontSize: 25,
                  fontWeight: 800,
                  color: C.gold,
                  marginTop: 8,
                }}
              >
                {value === null ? '—' : value}
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: 12,
            color: C.muted,
            lineHeight: 1.6,
            marginBottom: 0,
          }}
        >
          {ratings
            ? 'Whole-number averages calculated from available Official MR and valid MR Achieved values. Absolute MR Achieved depends on the selected line horse and assigned MR. Not saved.'
            : 'Load and complete Ahead of the Handicap ratings to calculate race strength. No values are inferred.'}
        </p>
      </section>
    </>
  );
}

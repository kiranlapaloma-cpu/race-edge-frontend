
'use client';

import {
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';

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

export default function AnalysisWorkspace() {
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
    setRows([]);
    setMetadata(null);
    setFileName('');

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

  const resultColumns = useMemo(() => {
    if (!result?.rows?.length) return [];

    const keys = new Set<string>();

    result.rows.forEach(row => {
      Object.keys(row).forEach(key => keys.add(key));
    });

    const all = Array.from(keys);

    const priority = [
      'Horse',
      'Finish_Pos',
      'PI',
      'PPS',
      'PPI',
      'RPSS',
      'F200_idx',
      'tsSPI',
      'Accel',
      'Grind',
      'Corrected Grind',
      'Sustain Residual',
    ];

    return [
      ...priority.filter(key => keys.has(key)),
      ...all.filter(key => !priority.includes(key)),
    ];
  }, [result]);

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

        {result && (
          <>
            <section
              style={{
                ...panelStyle,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  color: COLORS.gold,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  marginBottom: 15,
                }}
              >
                <Activity size={17} />
                04 / ANALYSIS RESULTS
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                {[
                  `${result.rows.length} runners`,
                  `${result.distance_m}m`,
                  `${result.step}m splits`,
                  result.saved
                    ? 'Saved'
                    : 'Not saved',
                ].map(item => (
                  <span
                    key={item}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 6,
                      padding: '8px 10px',
                      color: COLORS.muted,
                      fontSize: 12,
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div
                style={{
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <table
                  style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <thead>
                    <tr>
                      {resultColumns.map(column => (
                        <th
                          key={column}
                          style={{
                            textAlign: 'left',
                            padding: '12px 10px',
                            color: COLORS.gold,
                            background: '#0b1829',
                            borderBottom:
                              `1px solid ${COLORS.border}`,
                          }}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {result.rows.map((row, index) => (
                      <tr key={index}>
                        {resultColumns.map(column => (
                          <td
                            key={column}
                            style={{
                              padding: '11px 10px',
                              borderBottom:
                                `1px solid ${COLORS.border}`,
                              color:
                                column === 'Horse'
                                  ? COLORS.text
                                  : COLORS.muted,
                              fontWeight:
                                column === 'Horse'
                                  ? 700
                                  : 400,
                            }}
                          >
                            {formatValue(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {Object.keys(
              result.race_diagnostics || {}
            ).length > 0 && (
              <section style={panelStyle}>
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.gold,
                    fontWeight: 700,
                    letterSpacing: 1,
                    marginBottom: 14,
                  }}
                >
                  05 / RACE DIAGNOSTICS
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
                    gap: 12,
                  }}
                >
                  {Object.entries(
                    result.race_diagnostics
                  ).map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        background: '#0b1829',
                        padding: 12,
                        borderRadius: 7,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: COLORS.muted,
                          marginBottom: 7,
                        }}
                      >
                        {key}
                      </div>

                      <strong
                        style={{
                          fontSize: 13,
                        }}
                      >
                        {formatValue(value)}
                      </strong>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
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


'use client';

import { useState } from 'react';

export default function LoginTestPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [success, setSuccess] = useState(false);

  async function testLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult('');
    setSuccess(false);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.ok === true) {
        setSuccess(true);
        setResult(
          'Login successful. The server accepted your password and returned a session cookie.'
        );
      } else {
        setResult(
          `HTTP ${response.status}: ${
            data.error || 'Unknown login error'
          }`
        );
      }
    } catch {
      setResult(
        'Network or response error. Unable to complete login test.'
      );
    } finally {
      setPassword('');
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#080f1c',
      color: '#f5f5f5',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#111d30',
        border: '1px solid #334155',
        borderRadius: 16,
        padding: 28,
      }}>
        <div style={{
          fontSize: 13,
          color: '#d6ad60',
          letterSpacing: 3,
          marginBottom: 12,
        }}>
          RACE EDGE 2.0
        </div>

        <h1 style={{
          fontSize: 25,
          marginBottom: 8,
        }}>
          Login Test
        </h1>

        <p style={{
          fontSize: 14,
          color: '#94a3b8',
          marginBottom: 28,
        }}>
          Verify your password authentication
          before enabling login protection.
        </p>

        <form onSubmit={testLogin}>
          <label htmlFor="password" style={{
            display: 'block',
            fontSize: 12,
            marginBottom: 8,
          }}>
            LOGIN PASSWORD
          </label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{
              width: '100%',
              padding: 14,
              boxSizing: 'border-box',
              background: '#080f1c',
              color: '#ffffff',
              border: '1px solid #475569',
              borderRadius: 8,
              fontSize: 16,
              marginBottom: 18,
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 15,
              background: '#d6ad60',
              color: '#080f1c',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Testing...' : 'Test Login'}
          </button>
        </form>

        {result && (
          <div role="status" style={{
            marginTop: 22,
            padding: 14,
            borderRadius: 8,
            background: success ? '#123326' : '#3a2025',
            color: success ? '#86efac' : '#fca5a5',
            fontSize: 14,
            lineHeight: 1.6,
          }}>
            {result}
          </div>
        )}

        <p style={{
          fontSize: 12,
          color: '#64748b',
          marginTop: 24,
        }}>
          Diagnostic page only. Race Control
          remains unchanged.
        </p>
      </div>
    </main>
  );
}

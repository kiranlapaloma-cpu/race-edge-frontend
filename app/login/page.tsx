
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

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

      if (!response.ok || data.ok !== true) {
        throw new Error(
          data.error || 'Unable to sign in'
        );
      }

      setPassword('');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#080f1c',
      color: '#f5f5f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'Arial, sans-serif',
    }}>
      <section style={{
        width: '100%',
        maxWidth: 430,
        background: '#111d30',
        border: '1px solid #334155',
        borderRadius: 18,
        padding: 30,
        boxShadow: '0 24px 70px #0006',
      }}>
        <div style={{
          color: '#d6ad60',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: 4,
          marginBottom: 10,
        }}>
          RACE <span style={{ color: '#fff' }}>
            EDGE
          </span> 2.0
        </div>

        <div style={{
          color: '#94a3b8',
          fontSize: 11,
          letterSpacing: 2,
          marginBottom: 34,
        }}>
          PERFORMANCE INTELLIGENCE
        </div>

        <div style={{
          width: 52,
          height: 52,
          background: '#1d2b40',
          border: '1px solid #34455d',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#d6ad60',
          marginBottom: 24,
        }}>
          <LockKeyhole size={24} />
        </div>

        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          margin: '0 0 10px',
        }}>
          Welcome back
        </h1>

        <p style={{
          color: '#94a3b8',
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 32,
        }}>
          Sign in to access your private
          racing intelligence workspace.
        </p>

        <form onSubmit={login}>
          <label
            htmlFor="password"
            style={{
              display: 'block',
              fontSize: 11,
              letterSpacing: 1.5,
              color: '#cbd5e1',
              marginBottom: 10,
            }}
          >
            ACCESS PASSWORD
          </label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: '#080f1c',
              color: '#fff',
              border: '1px solid #475569',
              borderRadius: 9,
              padding: 15,
              fontSize: 16,
              marginBottom: 18,
            }}
          />

          {error && (
            <p role="alert" style={{
              color: '#fca5a5',
              fontSize: 13,
              marginBottom: 18,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: '#d6ad60',
              color: '#080f1c',
              border: 'none',
              borderRadius: 9,
              padding: 15,
              fontSize: 15,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              opacity: loading ? 0.7 : 1,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Access Race Edge'}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>

        <div style={{
          borderTop: '1px solid #334155',
          marginTop: 35,
          paddingTop: 20,
          textAlign: 'center',
          fontSize: 11,
          letterSpacing: 1,
          color: '#64748b',
        }}>
          RACE EDGE 2.0 · PRIVATE ACCESS
        </div>
      </section>
    </main>
  );
}

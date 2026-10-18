
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';
import RaceControl from './RaceControl';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect('/login');
  }

  return (
    <>
      <nav
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '12px 20px',
          background: '#091321',
          borderBottom: '1px solid #28384d',
        }}
      >
        <Link
          href="/analysis"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 20px',
            background: '#d7ae65',
            color: '#091321',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 800,
            textDecoration: 'none',
            letterSpacing: 0.5,
          }}
        >
          RACE ANALYSIS →
        </Link>
      </nav>

      <RaceControl />
    </>
  );
}

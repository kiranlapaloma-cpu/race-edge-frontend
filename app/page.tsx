
import { redirect } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';
import RaceControl from './RaceControl';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect('/login');
  }

  return <RaceControl />;
}

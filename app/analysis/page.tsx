
import { redirect } from 'next/navigation';
import { isAuthenticated } from '../../lib/auth';
import AnalysisWorkspace from './AnalysisWorkspace';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect('/login');
  }

  return <AnalysisWorkspace />;
}

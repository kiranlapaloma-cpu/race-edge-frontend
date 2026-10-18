
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const baseUrl = process.env.RACE_EDGE_API_URL;
    const apiKey = process.env.RACE_EDGE_API_KEY;

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: 'Backend configuration missing' },
        { status: 500 }
      );
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const url = new URL(
      '/api/db/save-race',
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    );

    const upstream = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    });

    if (
      !(upstream.headers.get('content-type') || '')
        .includes('application/json')
    ) {
      return NextResponse.json(
        { error: 'Unexpected backend response' },
        { status: 502 }
      );
    }

    const result: unknown = await upstream.json();

    return NextResponse.json(result, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to contact Race Edge backend' },
      { status: 502 }
    );
  }
}

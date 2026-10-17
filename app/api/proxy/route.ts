
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.RACE_EDGE_API_URL;
    const apiKey = process.env.RACE_EDGE_API_KEY;

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: 'Backend configuration missing' },
        { status: 500 }
      );
    }

    const params = request.nextUrl.searchParams;
    const action = params.get('action');

    const routes: Record<string, string> = {
      meetings: '/api/cards/meetings',
      races: '/api/cards/races',
      predictions: '/api/cards/predictions',
    };

    let path: string;

    if (action === 'horse') {
      const horse = params.get('horse');

      if (!horse || !horse.trim()) {
        return NextResponse.json(
          { error: 'Horse name required' },
          { status: 400 }
        );
      }

      path = `/api/db/horse/${encodeURIComponent(horse)}`;
    } else if (action && routes[action]) {
      path = routes[action];
    } else {
      return NextResponse.json(
        { error: 'Unsupported action' },
        { status: 400 }
      );
    }

    const url = new URL(
      path,
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    );

    for (const [key, value] of params.entries()) {
      if (key !== 'action' && !(action === 'horse' && key === 'horse')) {
        url.searchParams.append(key, value);
      }
    }

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    });

    const contentType =
      upstream.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Unexpected backend response' },
        { status: 502 }
      );
    }

    const data = await upstream.json();

    return NextResponse.json(data, {
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

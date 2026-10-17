
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyPassword,
  createSession,
  sessionCookieName,
  sessionMaxAge,
} from '../../../lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = body?.password;

    if (typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password required' },
        { status: 400 }
      );
    }

    if (!verifyPassword(password)) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set(
      sessionCookieName,
      createSession(),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: sessionMaxAge,
      }
    );

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Login failed or configuration invalid' },
      { status: 500 }
    );
  }
}

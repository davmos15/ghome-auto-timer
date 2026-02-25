import type { Request, Response, NextFunction } from 'express';
import { getAuthAdmin } from '../services/firebase.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
      };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  console.log('[Auth] Request to:', req.path);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[Auth] Missing authorization header');
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const auth = getAuthAdmin();
    console.log('[Auth] Verifying token...');
    const decodedToken = await auth.verifyIdToken(token);
    console.log('[Auth] Token verified for user:', decodedToken.uid);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email
    };

    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);

    // In development, allow bypassing auth with a test user
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
      console.log('[Auth] Bypassing auth in development mode');
      req.user = { uid: 'test-user', email: 'test@example.com' };
      next();
      return;
    }

    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

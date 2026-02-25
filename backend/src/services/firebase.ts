import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let app: App;
let db: Database;
let auth: Auth;

export function initializeFirebase(): void {
  if (getApps().length > 0) {
    console.log('Firebase already initialized');
    return;
  }

  try {
    let serviceAccount: any;

    // Priority 1: JSON string from env var (for Railway / cloud deploys)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log('Using FIREBASE_SERVICE_ACCOUNT env var');
    } else {
      // Priority 2: File on disk (local development)
      const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './config/service-account.json';
      const absolutePath = resolve(serviceAccountPath);
      serviceAccount = JSON.parse(readFileSync(absolutePath, 'utf-8'));
      console.log('Using service account file:', absolutePath);
    }

    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
      databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
    });

    db = getDatabase(app);
    auth = getAuth(app);

    console.log('Firebase Admin initialized successfully (Realtime Database)');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    throw error;
  }
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return db;
}

export function getAuthAdmin(): Auth {
  if (!auth) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return auth;
}

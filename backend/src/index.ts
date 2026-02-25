import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initializeFirebase } from './services/firebase.js';
import { authMiddleware } from './middleware/auth.js';
import deviceRoutes from './routes/devices.js';
import scheduleRoutes from './routes/schedules.js';
import tuyaRoutes from './routes/tuya.js';
import groupRoutes from './routes/groups.js';
import { startScheduler } from './services/scheduler.js';
import { initializeTuya } from './services/tuya.js';

const app = express();
const PORT = process.env.PORT || 3005;

// Initialize Firebase Admin
initializeFirebase();

// Middleware - CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : true,
  credentials: true
}));
app.use(express.json());

// Request logging (concise)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected API routes
app.use('/api/devices', authMiddleware, deviceRoutes);
app.use('/api/schedules', authMiddleware, scheduleRoutes);
app.use('/api/tuya', authMiddleware, tuyaRoutes);
app.use('/api/groups', authMiddleware, groupRoutes);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Initialize Tuya
  const tuyaResult = await initializeTuya();
  if (tuyaResult.success) {
    console.log('[Tuya] Initialized successfully');
  } else {
    console.log('[Tuya] Not initialized:', tuyaResult.error);
  }

  // Start the schedule executor
  startScheduler();
});

export default app;

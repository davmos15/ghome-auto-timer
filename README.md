# Smart Home Timer

A web app for scheduling and controlling Tuya/SmartLife smart home devices. Features a visual 24-hour timeline schedule builder, device groups, conditional actions based on sensor readings, and full device control (lights, AC, fans).

## Architecture

```
frontend/          React 19 + Vite + Tailwind CSS 4
  ├── Firebase Auth (Google sign-in)
  ├── 24h timeline schedule builder
  ├── Device control panels (lights, AC, sensors)
  └── Device groups

backend/           Express 5 + TypeScript
  ├── Firebase Admin (auth verification, RTDB)
  ├── Tuya IoT Platform API (device control)
  ├── Schedule executor (runs every 60s)
  └── Conditional actions (sensor-based)
```

**Data**: Firebase Realtime Database (schedules, groups, Tuya link)
**Devices**: Tuya IoT Platform API (lights, AC, IR hub, sensors)

## Setup

### Prerequisites

- Node.js 18+
- A [Tuya IoT Platform](https://iot.tuya.com/) project with linked SmartLife devices
- A [Firebase](https://console.firebase.google.com/) project with Authentication (Google provider) and Realtime Database enabled

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in your Tuya credentials and Firebase config
# Place your Firebase service account key at config/service-account.json
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Fill in your Firebase web config and API URL
npm run dev
```

## Deployment

### Backend (Railway)

1. Connect your GitHub repo to [Railway](https://railway.app/)
2. Set the root directory to `backend`
3. Set environment variables:
   - `NODE_ENV=production`
   - `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_BASE_URL`
   - `FIREBASE_SERVICE_ACCOUNT` — paste the full JSON of your service account key
   - `FRONTEND_URL` — your Vercel frontend URL
4. Railway auto-detects `npm start` → `node dist/index.js`

### Frontend (Vercel)

1. Connect your GitHub repo to [Vercel](https://vercel.com/)
2. Set the root directory to `frontend`
3. Set environment variables:
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc.
   - `VITE_API_URL` — your Railway backend URL (e.g., `https://your-app.up.railway.app/api`)
4. Vercel auto-detects Vite and builds with `npm run build`

## Key Features

- **24h Timeline Builder**: Drag-free visual schedule editor with ON/OFF events per device
- **Full Device Control**: Lights (brightness, color temp, RGB), AC (mode, temp, fan speed), sensors
- **Conditional Actions**: "Turn on AC only if temperature > 28°C" using IR sensor readings
- **Device Groups**: Group devices for batch control and quick schedule setup
- **Persistent Schedules**: Firebase RTDB — survives server restarts
- **Scheduler**: Checks every 60 seconds, executes matching time slots with dedup protection

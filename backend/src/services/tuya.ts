/**
 * Tuya/SmartLife API Service
 * Direct integration for controlling devices through the Tuya IoT Platform
 */

import crypto from 'crypto';

const TUYA_ACCESS_ID = process.env.TUYA_ACCESS_ID!;
const TUYA_ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET!;
const TUYA_BASE_URL = process.env.TUYA_BASE_URL || 'https://openapi.tuyaus.com';

// Token cache
let tokenCache: { accessToken: string; refreshToken: string; expiresAt: number } | null = null;

// Discovered user UID cache
let discoveredUid: string | null = null;

// Known device IDs (seed devices for UID discovery)
const SEED_DEVICE_IDS = [
  'bf470cc95c81660770q3b2',  // Split System AC
  '0000178484cca88ad107',     // Smart Bulb
  'bf7cb4780d1483522125dd',   // Smart IR
  'bf583b4a47a6574ca2avzg',   // TV
];

function generateSign(
  method: string,
  path: string,
  timestamp: string,
  accessToken?: string,
  body?: string
): string {
  const contentHash = crypto.createHash('sha256').update(body || '').digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const signStr = accessToken
    ? TUYA_ACCESS_ID + accessToken + timestamp + stringToSign
    : TUYA_ACCESS_ID + timestamp + stringToSign;

  return crypto
    .createHmac('sha256', TUYA_ACCESS_SECRET)
    .update(signStr)
    .digest('hex')
    .toUpperCase();
}

async function tuyaRequest<T>(
  method: string,
  path: string,
  body?: Record<string, any>
): Promise<{ success: boolean; result?: T; code?: number; msg?: string }> {
  if (!tokenCache || Date.now() > tokenCache.expiresAt) {
    const tokenResult = await getToken();
    if (!tokenResult.success) {
      return { success: false, msg: 'Failed to get access token' };
    }
  }

  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = generateSign(method, path, timestamp, tokenCache!.accessToken, bodyStr);

  const response = await fetch(`${TUYA_BASE_URL}${path}`, {
    method,
    headers: {
      'client_id': TUYA_ACCESS_ID,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      't': timestamp,
      'access_token': tokenCache!.accessToken,
      'Content-Type': 'application/json',
    },
    body: body ? bodyStr : undefined,
  });

  const data = await response.json() as { success: boolean; result?: T; code?: number; msg?: string };

  if (!data.success && data.code === 1010) {
    tokenCache = null;
    return tuyaRequest(method, path, body);
  }

  return data;
}

async function getToken(): Promise<{ success: boolean; error?: string }> {
  const timestamp = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const sign = generateSign('GET', path, timestamp);

  try {
    const response = await fetch(`${TUYA_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        'client_id': TUYA_ACCESS_ID,
        'sign': sign,
        'sign_method': 'HMAC-SHA256',
        't': timestamp,
      },
    });

    const data = await response.json() as {
      success: boolean;
      msg?: string;
      result: { access_token: string; refresh_token: string; expire_time: number };
    };

    if (!data.success) {
      return { success: false, error: data.msg || 'Failed to get token' };
    }

    tokenCache = {
      accessToken: data.result.access_token,
      refreshToken: data.result.refresh_token,
      expiresAt: Date.now() + (data.result.expire_time * 1000) - 60000,
    };

    console.log('[Tuya] Token obtained');
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Discover the Tuya user UID by querying a known device
 */
async function discoverUid(): Promise<string | null> {
  if (discoveredUid) return discoveredUid;

  for (const deviceId of SEED_DEVICE_IDS) {
    const resp = await tuyaRequest<any>('GET', `/v1.0/devices/${deviceId}`);
    if (resp.success && resp.result?.uid) {
      discoveredUid = resp.result.uid;
      console.log('[Tuya] Discovered user UID:', discoveredUid);
      return discoveredUid;
    }
  }
  return null;
}

/**
 * Get linked user IDs
 */
export async function getLinkedUsers(): Promise<{
  success: boolean;
  users?: Array<{ uid: string; nick_name: string }>;
  error?: string;
}> {
  const uid = await discoverUid();
  if (uid) {
    return { success: true, users: [{ uid, nick_name: 'SmartLife User' }] };
  }
  return { success: false, error: 'No linked users found' };
}

/**
 * List all devices - uses UID-based discovery, then falls back to direct IDs
 */
export async function listDevices(tuyaUserId?: string): Promise<{
  success: boolean;
  devices?: any[];
  error?: string;
}> {
  const allRawDevices: any[] = [];
  const seenIds = new Set<string>();

  // Strategy 1: Use UID to get all user devices (finds everything linked to the SmartLife account)
  const uid = tuyaUserId || await discoverUid();
  if (uid && uid !== 'direct-access') {
    const resp = await tuyaRequest<any[]>('GET', `/v1.0/users/${uid}/devices`);
    if (resp.success && Array.isArray(resp.result)) {
      for (const d of resp.result) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          allRawDevices.push(d);
        }
      }
      console.log(`[Tuya] Found ${resp.result.length} devices via UID`);
    }
  }

  // Strategy 2: Check seed device IDs directly (in case UID method missed any)
  for (const deviceId of SEED_DEVICE_IDS) {
    if (seenIds.has(deviceId)) continue;
    const resp = await tuyaRequest<any>('GET', `/v1.0/devices/${deviceId}`);
    if (resp.success && resp.result) {
      seenIds.add(deviceId);
      allRawDevices.push(resp.result);
    }
  }

  if (allRawDevices.length === 0) {
    return { success: false, error: 'No devices found. Make sure devices are linked in SmartLife and the Tuya IoT project.' };
  }

  const devices = allRawDevices.map(transformTuyaDevice);
  console.log(`[Tuya] Total devices: ${devices.length}`);
  return { success: true, devices };
}

/**
 * Get device status/state
 */
export async function getDeviceStatus(deviceId: string): Promise<{
  success: boolean;
  status?: Record<string, any>;
  error?: string;
}> {
  const response = await tuyaRequest<any[]>('GET', `/v1.0/devices/${deviceId}/status`);
  if (!response.success) {
    return { success: false, error: response.msg };
  }

  const status: Record<string, any> = {};
  (response.result || []).forEach((item: { code: string; value: any }) => {
    status[item.code] = item.value;
  });

  return { success: true, status };
}

/**
 * Send command to a device
 */
export async function sendCommand(
  deviceId: string,
  commands: Array<{ code: string; value: any }>
): Promise<{ success: boolean; error?: string }> {
  const response = await tuyaRequest<boolean>(
    'POST',
    `/v1.0/devices/${deviceId}/commands`,
    { commands }
  );

  if (!response.success) {
    return { success: false, error: response.msg };
  }

  console.log('[Tuya] Command sent to:', deviceId);
  return { success: true };
}

/**
 * Get device info by ID
 */
export async function getDeviceInfo(deviceId: string): Promise<{
  success: boolean;
  device?: any;
  error?: string;
}> {
  const response = await tuyaRequest<any>('GET', `/v1.0/devices/${deviceId}`);
  if (!response.success) {
    return { success: false, error: response.msg };
  }
  return { success: true, device: response.result };
}

/**
 * Get device function specifications (what commands it supports)
 */
export async function getDeviceFunctions(deviceId: string): Promise<{
  success: boolean;
  functions?: any;
  error?: string;
}> {
  const resp = await tuyaRequest<any>('GET', `/v1.0/devices/${deviceId}/functions`);
  if (!resp.success) return { success: false, error: resp.msg };
  return { success: true, functions: resp.result };
}

/**
 * Discover all devices (debug endpoint)
 */
export async function discoverAllDevices(): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  const uid = await discoverUid();
  results['uid'] = uid;

  if (uid) {
    const uidDevices = await tuyaRequest<any[]>('GET', `/v1.0/users/${uid}/devices`);
    results['uid-devices'] = {
      success: uidDevices.success,
      count: Array.isArray(uidDevices.result) ? uidDevices.result.length : 0,
      devices: Array.isArray(uidDevices.result) ? uidDevices.result.map((d: any) => ({
        id: d.id, name: d.name, category: d.category, online: d.online
      })) : null
    };
  }

  // Also check for sub-devices on IR hubs
  for (const deviceId of SEED_DEVICE_IDS) {
    const sub = await tuyaRequest<any[]>('GET', `/v1.0/devices/${deviceId}/sub-devices`);
    if (sub.success && Array.isArray(sub.result) && sub.result.length > 0) {
      results[`sub-devices-${deviceId}`] = sub.result.map((d: any) => ({
        id: d.id, name: d.name, category: d.category
      }));
    }
  }

  return results;
}

/**
 * Transform Tuya device to our app format
 */
function transformTuyaDevice(device: any): any {
  const categoryMap: Record<string, string> = {
    'dj': 'action.devices.types.LIGHT',
    'dd': 'action.devices.types.LIGHT',
    'fwd': 'action.devices.types.LIGHT',
    'dc': 'action.devices.types.LIGHT',
    'xdd': 'action.devices.types.LIGHT',
    'cz': 'action.devices.types.OUTLET',
    'pc': 'action.devices.types.OUTLET',
    'kg': 'action.devices.types.SWITCH',
    'kt': 'action.devices.types.AC_UNIT',
    'qt': 'action.devices.types.THERMOSTAT',
    'wnykq': 'action.devices.types.AC_UNIT',
    'wk': 'action.devices.types.THERMOSTAT',
    'fs': 'action.devices.types.FAN',
    'infrared_ac': 'action.devices.types.AC_UNIT',
    'infrared_tv': 'action.devices.types.OUTLET',
  };

  const traitsMap: Record<string, string[]> = {
    'dj': ['action.devices.traits.OnOff', 'action.devices.traits.Brightness', 'action.devices.traits.ColorSetting'],
    'dd': ['action.devices.traits.OnOff', 'action.devices.traits.Brightness', 'action.devices.traits.ColorSetting'],
    'xdd': ['action.devices.traits.OnOff', 'action.devices.traits.Brightness'],
    'cz': ['action.devices.traits.OnOff'],
    'pc': ['action.devices.traits.OnOff'],
    'kg': ['action.devices.traits.OnOff'],
    'kt': ['action.devices.traits.OnOff', 'action.devices.traits.TemperatureSetting', 'action.devices.traits.FanSpeed'],
    'qt': ['action.devices.traits.OnOff', 'action.devices.traits.TemperatureSetting', 'action.devices.traits.FanSpeed'],
    'wnykq': ['action.devices.traits.OnOff', 'action.devices.traits.TemperatureSetting', 'action.devices.traits.FanSpeed'],
    'wk': ['action.devices.traits.OnOff', 'action.devices.traits.TemperatureSetting'],
    'fs': ['action.devices.traits.OnOff', 'action.devices.traits.FanSpeed'],
    'infrared_ac': ['action.devices.traits.OnOff', 'action.devices.traits.TemperatureSetting', 'action.devices.traits.FanSpeed'],
    'infrared_tv': ['action.devices.traits.OnOff'],
  };

  const category = device.category || '';
  const type = categoryMap[category] || 'action.devices.types.OUTLET';
  const traits = traitsMap[category] || ['action.devices.traits.OnOff'];

  return {
    id: device.id,
    type,
    traits,
    name: { name: device.name || 'Unknown Device' },
    willReportState: device.online || false,
    roomHint: device.room_name || undefined,
    attributes: {
      category: device.category,
      productName: device.product_name,
      model: device.model,
      online: device.online,
      icon: device.icon,
    },
    tuyaCategory: category,
  };
}

export function isTuyaConfigured(): boolean {
  return !!(TUYA_ACCESS_ID && TUYA_ACCESS_SECRET);
}

export async function initializeTuya(): Promise<{ success: boolean; error?: string }> {
  if (!isTuyaConfigured()) {
    return { success: false, error: 'Tuya credentials not configured' };
  }
  const tokenResult = await getToken();
  if (tokenResult.success) {
    // Pre-discover UID on startup
    await discoverUid();
  }
  return tokenResult;
}

import { Router } from 'express';
import {
  isTuyaConfigured,
  initializeTuya,
  getLinkedUsers,
  listDevices,
  getDeviceStatus,
  sendCommand,
} from '../services/tuya.js';
import { getTuyaLink, saveTuyaLink, deleteTuyaLink } from '../services/db.js';

const router = Router();

/**
 * GET /api/tuya/status
 * Check if Tuya is configured and has linked users
 */
router.get('/status', async (req, res) => {
  if (!isTuyaConfigured()) {
    return res.json({
      success: true,
      data: { configured: false, linked: false }
    });
  }

  const userId = req.user!.uid;
  let tuyaUserId = await getTuyaLink(userId);

  // If we don't have a stored Tuya user, try to get one
  if (!tuyaUserId) {
    const usersResult = await getLinkedUsers();
    if (usersResult.success && usersResult.users && usersResult.users.length > 0) {
      // Auto-link to first user found
      await saveTuyaLink(userId, usersResult.users[0].uid);
      tuyaUserId = usersResult.users[0].uid;
    }
  }

  res.json({
    success: true,
    data: {
      configured: true,
      linked: !!tuyaUserId
    }
  });
});

/**
 * GET /api/tuya/users
 * Get linked SmartLife users
 */
router.get('/users', async (req, res) => {
  const result = await getLinkedUsers();

  if (result.success) {
    res.json({
      success: true,
      data: result.users
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
});

/**
 * POST /api/tuya/link
 * Link to a specific Tuya user ID or verify device access
 */
router.post('/link', async (req, res) => {
  const userId = req.user!.uid;
  const { tuyaUserId } = req.body;

  if (tuyaUserId) {
    await saveTuyaLink(userId, tuyaUserId);
    return res.json({
      success: true,
      message: 'Linked to SmartLife account'
    });
  }

  // Try to auto-link by finding a user
  const usersResult = await getLinkedUsers();
  if (usersResult.success && usersResult.users && usersResult.users.length > 0) {
    await saveTuyaLink(userId, usersResult.users[0].uid);
    return res.json({
      success: true,
      message: 'Linked to SmartLife account'
    });
  }

  // Try to verify we can access devices directly
  const devicesResult = await listDevices();
  if (devicesResult.success && devicesResult.devices && devicesResult.devices.length > 0) {
    await saveTuyaLink(userId, 'direct-access');
    return res.json({
      success: true,
      message: `Found ${devicesResult.devices.length} devices`
    });
  }

  return res.status(400).json({
    success: false,
    error: 'No SmartLife accounts or devices found. Please make sure you have linked your SmartLife app in the Tuya IoT Platform and devices are visible there.'
  });
});

/**
 * POST /api/tuya/unlink
 * Unlink Tuya account
 */
router.post('/unlink', async (req, res) => {
  const userId = req.user!.uid;
  await deleteTuyaLink(userId);

  res.json({
    success: true,
    message: 'Unlinked SmartLife account'
  });
});

/**
 * GET /api/tuya/devices/:deviceId/functions
 * Get device function specs
 */
router.get('/devices/:deviceId/functions', async (req, res) => {
  const { getDeviceFunctions } = await import('../services/tuya.js');
  const result = await getDeviceFunctions(req.params.deviceId);
  res.json(result);
});

/**
 * GET /api/tuya/discover
 * Debug endpoint - try all discovery methods to find all devices
 */
router.get('/discover', async (req, res) => {
  const { discoverAllDevices } = await import('../services/tuya.js');
  const result = await discoverAllDevices();
  res.json(result);
});

/**
 * GET /api/tuya/devices
 * List all devices from SmartLife
 */
router.get('/devices', async (req, res) => {
  const userId = req.user!.uid;
  let tuyaUserId = await getTuyaLink(userId);

  // Try to get Tuya user ID if we don't have one
  if (!tuyaUserId) {
    const usersResult = await getLinkedUsers();
    if (usersResult.success && usersResult.users && usersResult.users.length > 0) {
      tuyaUserId = usersResult.users[0].uid;
      await saveTuyaLink(userId, tuyaUserId);
      console.log('[Tuya] Auto-linked to user:', tuyaUserId);
    }
  }

  // Try to list devices (will use fallback endpoints if no user ID)
  const result = await listDevices(tuyaUserId || undefined);

  if (result.success) {
    // Mark as linked if we got devices
    if (!tuyaUserId) {
      await saveTuyaLink(userId, 'direct-access');
    }
    res.json({
      success: true,
      data: result.devices
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error || 'Failed to fetch devices. Make sure your SmartLife app is linked in Tuya IoT Platform.'
    });
  }
});

/**
 * GET /api/tuya/devices/:deviceId/status
 * Get device status
 */
router.get('/devices/:deviceId/status', async (req, res) => {
  const { deviceId } = req.params;

  const result = await getDeviceStatus(deviceId);

  if (result.success) {
    res.json({
      success: true,
      data: result.status
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
});

/**
 * POST /api/tuya/devices/:deviceId/command
 * Send command to device
 */
router.post('/devices/:deviceId/command', async (req, res) => {
  const { deviceId } = req.params;
  const { commands } = req.body;

  if (!commands || !Array.isArray(commands)) {
    return res.status(400).json({
      success: false,
      error: 'Commands array is required'
    });
  }

  const result = await sendCommand(deviceId, commands);

  if (result.success) {
    res.json({
      success: true,
      message: 'Command sent'
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
});

export default router;

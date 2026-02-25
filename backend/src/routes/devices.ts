import { Router } from 'express';
import { listDevices, getDeviceStatus, sendCommand } from '../services/tuya.js';
import type { DeviceCommand } from '../types/index.js';

const router = Router();

/**
 * GET /api/devices
 * List all devices from Tuya/SmartLife
 */
router.get('/', async (req, res) => {
  try {
    const result = await listDevices();

    if (result.success) {
      res.json({
        success: true,
        data: result.devices || []
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to fetch devices'
      });
    }
  } catch (error) {
    console.error('Error listing devices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch devices'
    });
  }
});

/**
 * GET /api/devices/:deviceId/state
 * Get the current state of a Tuya device
 */
router.get('/:deviceId/state', async (req, res) => {
  try {
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
        error: result.error || 'Failed to get device state'
      });
    }
  } catch (error) {
    console.error('Error getting device state:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device state'
    });
  }
});

/**
 * POST /api/devices/:deviceId/execute
 * Execute a command on a Tuya device
 */
router.post('/:deviceId/execute', async (req, res) => {
  try {
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
        message: 'Command executed'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to execute command'
      });
    }
  } catch (error) {
    console.error('Error executing command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute command'
    });
  }
});

export default router;

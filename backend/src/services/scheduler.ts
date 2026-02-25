import { sendCommand, getDeviceStatus } from './tuya.js';
import { getAllEnabledSchedules, getSchedule as dbGetSchedule } from './db.js';
import type { Schedule, TimeSlot, DayOfWeek, DeviceCommand, ActionCondition } from '../types/index.js';

// Track last execution to prevent duplicate runs
const lastExecutionTimes: Map<string, number> = new Map();

// Day mapping
const DAY_MAP: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday'
};

/**
 * Get current time in HH:MM format
 */
function getCurrentTime(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Get current day of week
 */
function getCurrentDay(): DayOfWeek {
  return DAY_MAP[new Date().getDay()];
}

/**
 * Check if a time slot should be executed now
 */
function shouldExecuteSlot(slot: TimeSlot, schedule: Schedule): boolean {
  const currentTime = getCurrentTime();
  const currentDay = getCurrentDay();

  // Check if today is an active day
  if (!schedule.daysOfWeek.includes(currentDay)) {
    return false;
  }

  // Check if current time matches slot time
  if (slot.startTime !== currentTime) {
    return false;
  }

  // Check if we already executed this slot recently (within last 2 minutes)
  const executionKey = `${schedule.id}-${slot.id}`;
  const lastExecution = lastExecutionTimes.get(executionKey);
  if (lastExecution && Date.now() - lastExecution < 2 * 60 * 1000) {
    return false;
  }

  return true;
}

/**
 * Convert our command format to Tuya command format
 */
function convertToTuyaCommands(command: DeviceCommand, deviceCategory?: string): Array<{ code: string; value: any }> {
  switch (command.type) {
    case 'OnOff':
      // Category-aware switch codes
      if (deviceCategory === 'infrared_ac' || deviceCategory === 'kt') {
        return [{ code: 'switch', value: command.on }];
      }
      if (deviceCategory === 'dj' || deviceCategory === 'dd' || deviceCategory === 'xdd') {
        return [{ code: 'switch_led', value: command.on }];
      }
      return [{ code: 'switch_led', value: command.on }, { code: 'switch_1', value: command.on }, { code: 'switch', value: command.on }];

    case 'TuyaAC':
      // Tuya-native AC — send values directly
      return [
        { code: 'mode', value: command.mode },
        { code: 'temp', value: command.temperature },
        { code: 'fan', value: command.fan },
      ];

    case 'TuyaLight': {
      const cmds: Array<{ code: string; value: any }> = [];
      if (command.workMode) {
        cmds.push({ code: 'work_mode', value: command.workMode });
      }
      if (command.brightness != null) {
        const tuyaBright = Math.max(10, Math.round(command.brightness * 10));
        cmds.push({ code: 'bright_value_v2', value: tuyaBright });
      }
      if (command.colorTemp != null) {
        cmds.push({ code: 'temp_value_v2', value: command.colorTemp });
      }
      if (command.colorHSV) {
        cmds.push({ code: 'work_mode', value: 'colour' });
        cmds.push({ code: 'colour_data_v2', value: JSON.stringify(command.colorHSV) });
      }
      return cmds;
    }

    case 'Brightness': {
      const brightness = Math.max(10, Math.round((command.brightness / 100) * 1000));
      return [{ code: 'bright_value_v2', value: brightness }];
    }
    case 'ColorTemperature': {
      const temp = Math.round(((command.temperatureK - 2700) / (6500 - 2700)) * 1000);
      return [{ code: 'temp_value_v2', value: temp }];
    }
    case 'ColorRGB': {
      const { r, g, b } = command;
      const hsv = rgbToHsv(r, g, b);
      return [{ code: 'work_mode', value: 'colour' }, { code: 'colour_data_v2', value: JSON.stringify(hsv) }];
    }
    case 'Thermostat': {
      const cmds: Array<{ code: string; value: any }> = [];
      if (command.mode && command.mode !== 'off') {
        cmds.push({ code: 'mode', value: command.mode });
      }
      if (command.temperature) {
        cmds.push({ code: 'temp', value: command.temperature });
      }
      return cmds;
    }
    case 'FanSpeed': {
      let speed = 'low';
      if (command.speedPercent > 66) speed = 'high';
      else if (command.speedPercent > 33) speed = 'mid';
      return [{ code: 'fan', value: speed }];
    }
    default:
      console.warn('[Scheduler] Unknown command type:', (command as any).type);
      return [];
  }
}

/**
 * Convert RGB to HSV for Tuya color format
 */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  const s = max === 0 ? 0 : diff / max;
  const v = max;

  if (diff !== 0) {
    if (max === r) {
      h = ((g - b) / diff) % 6;
    } else if (max === g) {
      h = (b - r) / diff + 2;
    } else {
      h = (r - g) / diff + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 1000),
    v: Math.round(v * 1000)
  };
}

/**
 * Check if a sensor condition is met
 */
async function checkCondition(condition: ActionCondition): Promise<boolean> {
  try {
    const result = await getDeviceStatus(condition.sensorDeviceId);
    if (!result.success || !result.status) {
      console.log(`[Scheduler]   Could not read sensor ${condition.sensorDeviceId}, executing anyway`);
      return true; // Fail open
    }

    let sensorValue: number | null = null;
    if (condition.metric === 'temperature') {
      const raw = result.status.va_temperature;
      sensorValue = raw != null ? Number(raw) / 10 : null;
    } else if (condition.metric === 'humidity') {
      const raw = result.status.va_humidity;
      sensorValue = raw != null ? Number(raw) : null;
    }

    if (sensorValue === null) {
      console.log(`[Scheduler]   Sensor value not available, executing anyway`);
      return true;
    }

    console.log(`[Scheduler]   Sensor ${condition.metric}: ${sensorValue} ${condition.operator} ${condition.value}`);

    switch (condition.operator) {
      case '>':  return sensorValue > condition.value;
      case '<':  return sensorValue < condition.value;
      case '>=': return sensorValue >= condition.value;
      case '<=': return sensorValue <= condition.value;
      default:   return true;
    }
  } catch (error) {
    console.error(`[Scheduler]   Error checking condition:`, error);
    return true; // Fail open
  }
}

/**
 * Execute actions for a time slot
 */
async function executeTimeSlot(
  schedule: Schedule,
  slot: TimeSlot
): Promise<void> {
  console.log(`[Scheduler] Executing time slot ${slot.id} for schedule "${schedule.name}"`);

  const executionKey = `${schedule.id}-${slot.id}`;
  lastExecutionTimes.set(executionKey, Date.now());

  for (const action of slot.actions) {
    try {
      // Check condition before executing
      if (action.condition) {
        const conditionMet = await checkCondition(action.condition);
        if (!conditionMet) {
          console.log(`[Scheduler]   - Skipping ${action.deviceName}: condition not met (${action.condition.metric} ${action.condition.operator} ${action.condition.value})`);
          continue;
        }
        console.log(`[Scheduler]   - Condition met for ${action.deviceName}`);
      }

      console.log(`[Scheduler]   - Executing action on ${action.deviceName}:`, action.command);

      // Convert our command to Tuya format
      const tuyaCommands = convertToTuyaCommands(action.command, action.deviceCategory);

      if (tuyaCommands.length === 0) {
        console.log(`[Scheduler]     ✗ No Tuya commands for this action type`);
        continue;
      }

      console.log(`[Scheduler]     Tuya commands:`, tuyaCommands);

      // Send command to Tuya
      const result = await sendCommand(action.deviceId, tuyaCommands);

      if (result.success) {
        console.log(`[Scheduler]     ✓ Success`);
      } else {
        console.log(`[Scheduler]     ✗ Failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`[Scheduler]     ✗ Error executing action:`, error);
    }
  }
}

/**
 * Check all schedules and execute any that should run now
 */
async function checkSchedules(): Promise<void> {
  try {
    // Get all enabled schedules from Firebase RTDB
    const schedules = await getAllEnabledSchedules();

    if (schedules.length === 0) {
      return;
    }

    const currentTime = getCurrentTime();
    const currentDay = getCurrentDay();

    // Only log every 5 minutes to reduce noise
    const minute = new Date().getMinutes();
    if (minute % 5 === 0) {
      console.log(`[Scheduler] Checking ${schedules.length} schedules at ${currentTime} (${currentDay})`);
    }

    for (const schedule of schedules) {
      // Check each time slot
      for (const slot of schedule.timeSlots || []) {
        if (shouldExecuteSlot(slot, schedule)) {
          await executeTimeSlot(schedule, slot);
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking schedules:', error);
  }
}

/**
 * Start the scheduler
 * Runs every minute to check for schedules that need to be executed
 */
export function startScheduler(): void {
  console.log('[Scheduler] Starting schedule checker...');

  // Run immediately
  checkSchedules();

  // Then run every minute
  setInterval(() => {
    checkSchedules();
  }, 60 * 1000);

  console.log('[Scheduler] Schedule checker started - checking every minute');
}

/**
 * Manually trigger a schedule's time slot (for testing)
 */
export async function triggerTimeSlot(
  scheduleId: string,
  slotId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the schedule across all users
    const allSchedules = await getAllEnabledSchedules();
    const schedule = allSchedules.find(s => s.id === scheduleId);

    if (!schedule) {
      return { success: false, error: 'Schedule not found' };
    }

    const slot = schedule.timeSlots?.find(s => s.id === slotId);

    if (!slot) {
      return { success: false, error: 'Time slot not found' };
    }

    await executeTimeSlot(schedule, slot);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

import { Router } from 'express';
import type { Schedule, TimeSlot, DayOfWeek } from '../types/index.js';
import { getSchedules, getSchedule, saveSchedule, deleteSchedule } from '../services/db.js';

const router = Router();

/**
 * GET /api/schedules
 * List all schedules for the authenticated user
 */
router.get('/', async (req, res) => {
  const userId = req.user!.uid;
  const userSchedules = await getSchedules(userId);

  console.log('[Schedules] Returning', userSchedules.length, 'schedules');
  res.json({
    success: true,
    data: userSchedules
  });
});

/**
 * GET /api/schedules/:id
 * Get a specific schedule
 */
router.get('/:id', async (req, res) => {
  const userId = req.user!.uid;
  const { id } = req.params;

  const schedule = await getSchedule(userId, id);

  if (!schedule) {
    return res.status(404).json({
      success: false,
      error: 'Schedule not found'
    });
  }

  res.json({
    success: true,
    data: schedule
  });
});

/**
 * POST /api/schedules
 * Create a new schedule
 */
router.post('/', async (req, res) => {
  const userId = req.user!.uid;

  const {
    name,
    enabled = true,
    daysOfWeek,
    timeSlots,
    triggers
  } = req.body as {
    name: string;
    enabled?: boolean;
    daysOfWeek: DayOfWeek[];
    timeSlots: TimeSlot[];
    triggers?: Schedule['triggers'];
  };

  // Validate required fields
  if (!name || !daysOfWeek || !timeSlots) {
    return res.status(400).json({
      success: false,
      error: 'Name, daysOfWeek, and timeSlots are required'
    });
  }

  const now = Date.now();
  const id = `schedule-${now}`;
  const schedule: Schedule = {
    id,
    name,
    enabled,
    userId,
    daysOfWeek,
    timeSlots,
    triggers: triggers || [],
    createdAt: now,
    updatedAt: now
  };

  await saveSchedule(userId, schedule);
  console.log('[Schedules] Created schedule:', id, name);

  res.status(201).json({
    success: true,
    data: schedule
  });
});

/**
 * PUT /api/schedules/:id
 * Update a schedule
 */
router.put('/:id', async (req, res) => {
  const userId = req.user!.uid;
  const { id } = req.params;

  const existing = await getSchedule(userId, id);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Schedule not found'
    });
  }

  const { name, enabled, daysOfWeek, timeSlots, triggers } = req.body;

  const updated: Schedule = {
    ...existing,
    name: name ?? existing.name,
    enabled: enabled ?? existing.enabled,
    daysOfWeek: daysOfWeek ?? existing.daysOfWeek,
    timeSlots: timeSlots ?? existing.timeSlots,
    triggers: triggers ?? existing.triggers,
    updatedAt: Date.now()
  };

  await saveSchedule(userId, updated);
  console.log('[Schedules] Updated schedule:', id);

  res.json({
    success: true,
    data: updated
  });
});

/**
 * DELETE /api/schedules/:id
 * Delete a schedule
 */
router.delete('/:id', async (req, res) => {
  const userId = req.user!.uid;
  const { id } = req.params;

  const existing = await getSchedule(userId, id);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Schedule not found'
    });
  }

  await deleteSchedule(userId, id);
  console.log('[Schedules] Deleted schedule:', id);

  res.json({
    success: true,
    message: 'Schedule deleted'
  });
});

/**
 * POST /api/schedules/:id/toggle
 * Toggle a schedule's enabled status
 */
router.post('/:id/toggle', async (req, res) => {
  const userId = req.user!.uid;
  const { id } = req.params;

  const existing = await getSchedule(userId, id);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Schedule not found'
    });
  }

  const updated: Schedule = {
    ...existing,
    enabled: !existing.enabled,
    updatedAt: Date.now()
  };
  await saveSchedule(userId, updated);

  console.log('[Schedules] Toggled schedule:', id, 'enabled:', updated.enabled);

  res.json({
    success: true,
    data: {
      id,
      enabled: updated.enabled
    }
  });
});

/**
 * POST /api/schedules/:id/test
 * Manually trigger a schedule for testing
 */
router.post('/:id/test', async (req, res) => {
  const userId = req.user!.uid;
  const { id } = req.params;
  const { slotId } = req.body;

  const schedule = await getSchedule(userId, id);

  if (!schedule) {
    return res.status(404).json({
      success: false,
      error: 'Schedule not found'
    });
  }

  // Import triggerTimeSlot dynamically to avoid circular dependency
  const { triggerTimeSlot } = await import('../services/scheduler.js');

  // If slotId provided, trigger that specific slot, otherwise trigger the first one
  const targetSlotId = slotId || schedule.timeSlots?.[0]?.id;

  if (!targetSlotId) {
    return res.status(400).json({
      success: false,
      error: 'No time slots in schedule'
    });
  }

  const result = await triggerTimeSlot(id, targetSlotId);

  if (result.success) {
    res.json({
      success: true,
      message: 'Schedule triggered successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
});

export default router;

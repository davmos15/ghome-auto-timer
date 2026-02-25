import { Router } from 'express';
import { getGroups, saveGroup, deleteGroup, type DeviceGroup } from '../services/db.js';

const router = Router();

/** GET /api/groups - List groups for user */
router.get('/', async (req, res) => {
  const userId = req.user!.uid;
  const groups = await getGroups(userId);
  res.json({ success: true, data: groups });
});

/** POST /api/groups - Create group */
router.post('/', async (req, res) => {
  const userId = req.user!.uid;
  const { name, deviceIds } = req.body as { name: string; deviceIds: string[] };

  if (!name || !deviceIds || deviceIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Name and deviceIds are required' });
  }

  const id = `group-${Date.now()}`;
  const group: DeviceGroup = { id, name, deviceIds, userId };
  await saveGroup(userId, group);
  console.log('[Groups] Created:', id, name, `(${deviceIds.length} devices)`);

  res.status(201).json({ success: true, data: group });
});

/** PUT /api/groups/:id - Update group */
router.put('/:id', async (req, res) => {
  const userId = req.user!.uid;
  const { id } = req.params;
  const groups = await getGroups(userId);
  const existing = groups.find(g => g.id === id);

  if (!existing) return res.status(404).json({ success: false, error: 'Group not found' });

  const { name, deviceIds } = req.body;
  const updated: DeviceGroup = {
    ...existing,
    name: name ?? existing.name,
    deviceIds: deviceIds ?? existing.deviceIds,
  };
  await saveGroup(userId, updated);
  console.log('[Groups] Updated:', id);

  res.json({ success: true, data: updated });
});

/** DELETE /api/groups/:id - Delete group */
router.delete('/:id', async (req, res) => {
  const userId = req.user!.uid;
  const { id } = req.params;
  const groups = await getGroups(userId);
  const existing = groups.find(g => g.id === id);

  if (!existing) return res.status(404).json({ success: false, error: 'Group not found' });

  await deleteGroup(userId, id);
  console.log('[Groups] Deleted:', id);

  res.json({ success: true, message: 'Group deleted' });
});

export default router;

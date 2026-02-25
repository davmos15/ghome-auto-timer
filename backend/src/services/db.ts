import { getDb } from './firebase.js';
import type { Schedule } from '../types/index.js';

export interface DeviceGroup {
  id: string;
  name: string;
  deviceIds: string[];
  userId: string;
}

// ── Schedules ──

export async function getSchedules(userId: string): Promise<Schedule[]> {
  const snap = await getDb().ref(`users/${userId}/schedules`).once('value');
  if (!snap.exists()) return [];
  const data = snap.val() as Record<string, Schedule>;
  return Object.values(data).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getSchedule(userId: string, id: string): Promise<Schedule | null> {
  const snap = await getDb().ref(`users/${userId}/schedules/${id}`).once('value');
  return snap.exists() ? (snap.val() as Schedule) : null;
}

export async function saveSchedule(userId: string, schedule: Schedule): Promise<void> {
  await getDb().ref(`users/${userId}/schedules/${schedule.id}`).set(schedule);
}

export async function deleteSchedule(userId: string, id: string): Promise<void> {
  await getDb().ref(`users/${userId}/schedules/${id}`).remove();
}

// ── Groups ──

export async function getGroups(userId: string): Promise<DeviceGroup[]> {
  const snap = await getDb().ref(`users/${userId}/groups`).once('value');
  if (!snap.exists()) return [];
  const data = snap.val() as Record<string, DeviceGroup>;
  return Object.values(data);
}

export async function saveGroup(userId: string, group: DeviceGroup): Promise<void> {
  await getDb().ref(`users/${userId}/groups/${group.id}`).set(group);
}

export async function deleteGroup(userId: string, id: string): Promise<void> {
  await getDb().ref(`users/${userId}/groups/${id}`).remove();
}

// ── Tuya Link ──

export async function getTuyaLink(userId: string): Promise<string | null> {
  const snap = await getDb().ref(`users/${userId}/tuyaLink`).once('value');
  return snap.exists() ? (snap.val() as string) : null;
}

export async function saveTuyaLink(userId: string, tuyaUserId: string): Promise<void> {
  await getDb().ref(`users/${userId}/tuyaLink`).set(tuyaUserId);
}

export async function deleteTuyaLink(userId: string): Promise<void> {
  await getDb().ref(`users/${userId}/tuyaLink`).remove();
}

// ── Scheduler helper ──

export async function getAllEnabledSchedules(): Promise<Schedule[]> {
  const snap = await getDb().ref('users').once('value');
  if (!snap.exists()) return [];

  const allSchedules: Schedule[] = [];
  const users = snap.val() as Record<string, any>;

  for (const userData of Object.values(users)) {
    if (!userData.schedules) continue;
    for (const schedule of Object.values(userData.schedules) as Schedule[]) {
      if (schedule.enabled) {
        allSchedules.push(schedule);
      }
    }
  }

  return allSchedules;
}

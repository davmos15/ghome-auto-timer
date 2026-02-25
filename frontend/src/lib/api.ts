import { auth } from './firebase';
import type { Schedule, Device, DeviceGroup } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005/api';

async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// Device API (backed by Tuya)
export const deviceApi = {
  list: async (): Promise<Device[]> => {
    const response = await apiRequest<{ success: boolean; data: Device[] }>('/devices');
    return response.data;
  },

  getState: async (deviceId: string) => {
    const response = await apiRequest<{ success: boolean; data: Record<string, unknown> }>(
      `/devices/${deviceId}/state`
    );
    return response.data;
  },

  execute: async (deviceId: string, commands: Array<{ code: string; value: unknown }>) => {
    return apiRequest<{ success: boolean; message: string }>(`/devices/${deviceId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ commands })
    });
  },
};

// Tuya connection API
export const tuyaApi = {
  getStatus: async (): Promise<{ configured: boolean; linked: boolean }> => {
    const response = await apiRequest<{ success: boolean; data: { configured: boolean; linked: boolean } }>('/tuya/status');
    return response.data;
  },

  link: async (tuyaUserId?: string): Promise<void> => {
    await apiRequest<{ success: boolean }>('/tuya/link', {
      method: 'POST',
      body: JSON.stringify({ tuyaUserId })
    });
  },

  unlink: async (): Promise<void> => {
    await apiRequest<{ success: boolean }>('/tuya/unlink', {
      method: 'POST'
    });
  },

  getDevices: async (): Promise<Device[]> => {
    const response = await apiRequest<{ success: boolean; data: Device[] }>('/tuya/devices');
    return response.data;
  },

  getDeviceStatus: async (deviceId: string): Promise<Record<string, unknown>> => {
    const response = await apiRequest<{ success: boolean; data: Record<string, unknown> }>(`/tuya/devices/${deviceId}/status`);
    return response.data;
  },

  sendCommand: async (deviceId: string, commands: Array<{ code: string; value: unknown }>): Promise<void> => {
    await apiRequest<{ success: boolean }>(`/tuya/devices/${deviceId}/command`, {
      method: 'POST',
      body: JSON.stringify({ commands })
    });
  }
};

// Group API
export const groupApi = {
  list: async (): Promise<DeviceGroup[]> => {
    const response = await apiRequest<{ success: boolean; data: DeviceGroup[] }>('/groups');
    return response.data;
  },

  create: async (name: string, deviceIds: string[]): Promise<DeviceGroup> => {
    const response = await apiRequest<{ success: boolean; data: DeviceGroup }>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, deviceIds }),
    });
    return response.data;
  },

  update: async (id: string, data: { name?: string; deviceIds?: string[] }): Promise<DeviceGroup> => {
    const response = await apiRequest<{ success: boolean; data: DeviceGroup }>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiRequest<{ success: boolean }>(`/groups/${id}`, { method: 'DELETE' });
  },
};

// Schedule API
export const scheduleApi = {
  list: async (): Promise<Schedule[]> => {
    const response = await apiRequest<{ success: boolean; data: Schedule[] }>('/schedules');
    return response.data;
  },

  get: async (id: string): Promise<Schedule> => {
    const response = await apiRequest<{ success: boolean; data: Schedule }>(`/schedules/${id}`);
    return response.data;
  },

  create: async (schedule: Omit<Schedule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Schedule> => {
    const response = await apiRequest<{ success: boolean; data: Schedule }>('/schedules', {
      method: 'POST',
      body: JSON.stringify(schedule)
    });
    return response.data;
  },

  update: async (id: string, schedule: Partial<Schedule>): Promise<Schedule> => {
    const response = await apiRequest<{ success: boolean; data: Schedule }>(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(schedule)
    });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiRequest<{ success: boolean }>(`/schedules/${id}`, {
      method: 'DELETE'
    });
  },

  toggle: async (id: string): Promise<{ enabled: boolean }> => {
    const response = await apiRequest<{ success: boolean; data: { id: string; enabled: boolean } }>(
      `/schedules/${id}/toggle`,
      { method: 'POST' }
    );
    return response.data;
  },

  test: async (id: string, slotId?: string): Promise<void> => {
    await apiRequest<{ success: boolean }>(`/schedules/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ slotId })
    });
  }
};

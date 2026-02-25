// Device types
export interface Device {
  id: string;
  type: string;
  traits: string[];
  name: { name: string };
  willReportState: boolean;
  roomHint?: string;
  attributes?: Record<string, unknown>;
  tuyaCategory?: string;
}

// Schedule types
export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  userId: string;
  createdAt: number;
  updatedAt: number;
  daysOfWeek: DayOfWeek[];
  timeSlots: TimeSlot[];
  triggers?: DeviceTrigger[];
}

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface TimeSlot {
  id: string;
  startTime: string; // HH:MM format
  endTime?: string;
  actions: DeviceAction[];
}

export interface DeviceAction {
  deviceId: string;
  deviceName: string;
  command: DeviceCommand;
  deviceCategory?: string;
  condition?: ActionCondition;
}

export type TuyaACMode = 'cold' | 'heat' | 'auto' | 'wind_dry' | 'dehumidification';
export type TuyaACFan = 'auto' | 'low' | 'mid' | 'high';

export type DeviceCommand =
  | { type: 'OnOff'; on: boolean }
  | { type: 'Brightness'; brightness: number }
  | { type: 'ColorTemperature'; temperatureK: number }
  | { type: 'ColorRGB'; r: number; g: number; b: number }
  | { type: 'Thermostat'; mode: string; temperature?: number }
  | { type: 'FanSpeed'; speedPercent: number }
  | { type: 'TuyaAC'; mode: TuyaACMode; temperature: number; fan: TuyaACFan }
  | { type: 'TuyaLight'; brightness?: number; colorTemp?: number; colorHSV?: { h: number; s: number; v: number }; workMode?: 'white' | 'colour' };

export interface ActionCondition {
  sensorDeviceId: string;
  sensorDeviceName: string;
  metric: 'temperature' | 'humidity';
  operator: '>' | '<' | '>=' | '<=';
  value: number;
}

export interface DeviceTrigger {
  id: string;
  sourceDeviceId: string;
  sourceDeviceName: string;
  condition: TriggerCondition;
  actions: DeviceAction[];
}

export type TriggerCondition =
  | { type: 'state_change'; trait: string; value: unknown }
  | { type: 'threshold'; trait: string; operator: '>' | '<' | '=' | '>=' | '<='; value: number };

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

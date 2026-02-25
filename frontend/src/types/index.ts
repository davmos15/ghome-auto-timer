// Device types based on Google Home Graph API
export interface Device {
  id: string;
  name: DeviceName;
  type: string; // e.g., 'action.devices.types.LIGHT'
  traits: string[]; // e.g., ['action.devices.traits.OnOff', 'action.devices.traits.Brightness']
  roomHint?: string;
  willReportState: boolean;
  attributes?: Record<string, unknown>;
  customData?: Record<string, unknown>;
  state?: DeviceState;
}

export interface DeviceName {
  name: string;
  nicknames?: string[];
  defaultNames?: string[];
}

// Helper function to get display name from device
export function getDeviceDisplayName(device: Device): string {
  return device.name.name;
}

// Helper to get short device type (e.g., 'LIGHT' from 'action.devices.types.LIGHT')
export function getDeviceTypeShort(device: Device): string {
  return device.type.replace('action.devices.types.', '');
}

// Helper to check if device has a trait
export function deviceHasTrait(device: Device, trait: string): boolean {
  const fullTrait = trait.startsWith('action.devices.traits.')
    ? trait
    : `action.devices.traits.${trait}`;
  return device.traits.includes(fullTrait);
}

// Short type aliases for convenience
export type DeviceType =
  | 'LIGHT'
  | 'SWITCH'
  | 'OUTLET'
  | 'THERMOSTAT'
  | 'FAN'
  | 'AC_UNIT'
  | 'BLINDS'
  | 'SENSOR';

export type DeviceTrait =
  | 'OnOff'
  | 'Brightness'
  | 'ColorSetting'
  | 'TemperatureSetting'
  | 'FanSpeed'
  | 'OpenClose'
  | 'SensorState';

export interface DeviceState {
  online: boolean;
  on?: boolean;
  brightness?: number;
  color?: {
    temperatureK?: number;
    spectrumRgb?: number;
  };
  thermostatMode?: string;
  thermostatTemperatureSetpoint?: number;
  thermostatTemperatureAmbient?: number;
  currentFanSpeedPercent?: number;
  openPercent?: number;
}

// Schedule types
export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  // Weekly schedule - which days it applies to
  daysOfWeek: DayOfWeek[];
  // Time slots within the schedule
  timeSlots: TimeSlot[];
  // Device-triggered conditions (optional)
  triggers?: DeviceTrigger[];
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface TimeSlot {
  id: string;
  startTime: string; // HH:MM format
  endTime?: string;  // Optional end time
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

// Shared AC constants
export const AC_MODES: { value: TuyaACMode; label: string; icon: string }[] = [
  { value: 'cold', label: 'Cool', icon: '❄️' },
  { value: 'heat', label: 'Heat', icon: '🔥' },
  { value: 'auto', label: 'Auto', icon: '🔄' },
  { value: 'wind_dry', label: 'Fan', icon: '💨' },
  { value: 'dehumidification', label: 'Dry', icon: '💧' },
];

export const AC_FAN_SPEEDS: { value: TuyaACFan; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'mid', label: 'Mid' },
  { value: 'high', label: 'High' },
];

// Preset colors for RGB lights
export const PRESET_COLORS = [
  { name: 'Red', r: 255, g: 0, b: 0 },
  { name: 'Orange', r: 255, g: 165, b: 0 },
  { name: 'Yellow', r: 255, g: 255, b: 0 },
  { name: 'Green', r: 0, g: 255, b: 0 },
  { name: 'Cyan', r: 0, g: 255, b: 255 },
  { name: 'Blue', r: 0, g: 0, b: 255 },
  { name: 'Purple', r: 128, g: 0, b: 128 },
  { name: 'Pink', r: 255, g: 192, b: 203 },
  { name: 'White', r: 255, g: 255, b: 255 },
];

// Device-triggered automation
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

// Device groups
export interface DeviceGroup {
  id: string;
  name: string;
  deviceIds: string[];
  userId: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

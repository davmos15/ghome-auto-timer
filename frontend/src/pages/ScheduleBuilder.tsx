import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Lightbulb,
  Thermometer,
  Power,
  Play,
  Fan,
  Loader2,
  X,
  ChevronUp,
  ChevronDown,
  Palette,
  Layers,
} from 'lucide-react';
import { scheduleApi, tuyaApi, groupApi } from '../lib/api';
import type { Schedule, TimeSlot, DeviceAction, DayOfWeek, Device, DeviceCommand, DeviceGroup, ActionCondition } from '../types';
import { PRESET_COLORS, getDeviceTypeShort, getDeviceDisplayName, AC_MODES, AC_FAN_SPEEDS } from '../types';

// ─── Constants ───────────────────────────────────────────────────────
const SNAP_MINUTES = 5;
const MINUTES_IN_DAY = 1440;

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

// ─── Timeline types (UI only) ───────────────────────────────────────
interface TimelineEvent {
  id: string;
  time: string;          // "HH:MM"
  on: boolean;
  command: DeviceCommand;
  condition?: ActionCondition;
}

interface DeviceTimeline {
  deviceId: string;
  deviceName: string;
  device?: Device;
  events: TimelineEvent[];
}

interface Segment {
  id: string;
  startPct: number;
  widthPct: number;
  on: boolean;
}

// ─── Utility functions ───────────────────────────────────────────────
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number): string {
  const clamped = ((m % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const h = Math.floor(clamped / 60);
  const min = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function snapToGrid(m: number): number {
  return Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── Segment computation (with cross-midnight) ──────────────────────
function computeSegments(events: TimelineEvent[]): Segment[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  // Single event: fills entire bar with that state
  if (sorted.length === 1) {
    return [{ id: sorted[0].id + '-full', startPct: 0, widthPct: 100, on: sorted[0].on }];
  }

  const segments: Segment[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    const startMin = timeToMinutes(curr.time);
    const endMin = timeToMinutes(next.time);

    if (i < sorted.length - 1) {
      // Normal forward segment
      segments.push({
        id: curr.id + '-seg',
        startPct: (startMin / MINUTES_IN_DAY) * 100,
        widthPct: ((endMin - startMin) / MINUTES_IN_DAY) * 100,
        on: curr.on,
      });
    } else {
      // Last event → wraps to first event (cross-midnight)
      const firstMin = timeToMinutes(sorted[0].time);
      // Tail: from this event to end of day
      const tailWidth = ((MINUTES_IN_DAY - startMin) / MINUTES_IN_DAY) * 100;
      if (tailWidth > 0) {
        segments.push({
          id: curr.id + '-tail',
          startPct: (startMin / MINUTES_IN_DAY) * 100,
          widthPct: tailWidth,
          on: curr.on,
        });
      }
      // Head: from start of day to first event
      const headWidth = (firstMin / MINUTES_IN_DAY) * 100;
      if (headWidth > 0) {
        segments.push({
          id: curr.id + '-head',
          startPct: 0,
          widthPct: headWidth,
          on: curr.on,
        });
      }
    }
  }

  return segments;
}

// ─── Conversion: TimeSlot[] ↔ DeviceTimeline[] ──────────────────────
function timeSlotsToTimelines(slots: TimeSlot[], devices: Device[]): DeviceTimeline[] {
  const map = new Map<string, DeviceTimeline>();

  for (const slot of slots) {
    for (const action of slot.actions) {
      if (!map.has(action.deviceId)) {
        map.set(action.deviceId, {
          deviceId: action.deviceId,
          deviceName: action.deviceName,
          device: devices.find(d => d.id === action.deviceId),
          events: [],
        });
      }
      const timeline = map.get(action.deviceId)!;
      const isOn = action.command.type === 'OnOff' ? action.command.on : true;
      timeline.events.push({
        id: uid(),
        time: slot.startTime,
        on: isOn,
        command: action.command,
        condition: action.condition,
      });
    }
  }

  // Sort each timeline's events
  for (const tl of map.values()) {
    tl.events.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }

  return Array.from(map.values());
}

function timelinesToTimeSlots(timelines: DeviceTimeline[]): TimeSlot[] {
  const slotMap = new Map<string, TimeSlot>();

  for (const tl of timelines) {
    for (const ev of tl.events) {
      if (!slotMap.has(ev.time)) {
        slotMap.set(ev.time, {
          id: uid(),
          startTime: ev.time,
          actions: [],
        });
      }
      const slot = slotMap.get(ev.time)!;
      slot.actions.push({
        deviceId: tl.deviceId,
        deviceName: tl.deviceName,
        command: ev.command,
        deviceCategory: tl.device?.attributes?.category as string | undefined,
        condition: ev.condition,
      });
    }
  }

  return Array.from(slotMap.values()).sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────
function getDeviceIcon(device: Device) {
  const type = getDeviceTypeShort(device);
  if (type === 'LIGHT') return <Lightbulb className="h-4 w-4" />;
  if (type === 'THERMOSTAT' || type === 'AC_UNIT') return <Thermometer className="h-4 w-4" />;
  if (type === 'FAN') return <Fan className="h-4 w-4" />;
  return <Power className="h-4 w-4" />;
}

// ─── Timeline Header ─────────────────────────────────────────────────
function TimelineHeader() {
  const hours = [0, 3, 6, 9, 12, 15, 18, 21];
  return (
    <div className="relative h-5 mb-1">
      {hours.map(h => (
        <span
          key={h}
          className="absolute text-[10px] text-gray-600 -translate-x-1/2 font-mono"
          style={{ left: `${(h / 24) * 100}%` }}
        >
          {h}
        </span>
      ))}
      <span
        className="absolute text-[10px] text-gray-600 font-mono"
        style={{ right: 0 }}
      >
        24
      </span>
    </div>
  );
}

// ─── Event Popover ───────────────────────────────────────────────────
function EventPopover({ event, device, allDevices, onUpdate, onDelete, onClose }: {
  event: TimelineEvent;
  device?: Device;
  allDevices: Device[];
  onUpdate: (updates: Partial<TimelineEvent>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const nudge = (delta: number) => {
    const m = timeToMinutes(event.time) + delta;
    onUpdate({ time: minutesToTime(m) });
  };

  const toggleOnOff = () => {
    const newOn = !event.on;
    onUpdate({
      on: newOn,
      command: { type: 'OnOff', on: newOn },
      condition: undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            {device && <span className="text-gray-400">{getDeviceIcon(device)}</span>}
            <span className="text-sm font-medium text-gray-200">{device?.name?.name || 'Device'}</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Time adjustment */}
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => nudge(-30)} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 hover:text-white">-30m</button>
            <button onClick={() => nudge(-5)} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 hover:text-white">-5m</button>
            <span className="text-2xl font-mono text-white px-3">{event.time}</span>
            <button onClick={() => nudge(5)} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 hover:text-white">+5m</button>
            <button onClick={() => nudge(30)} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 hover:text-white">+30m</button>
          </div>

          {/* On/Off toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { if (!event.on) toggleOnOff(); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                event.on
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-800 text-gray-500 border border-gray-700'
              }`}
            >Turn ON</button>
            <button
              onClick={() => { if (event.on) toggleOnOff(); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                !event.on
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-500 border border-gray-700'
              }`}
            >Turn OFF</button>
          </div>

          {/* Extra command (for ON events on devices with traits) */}
          {event.on && device && (
            <ExtraCommandEditor
              command={event.command}
              condition={event.condition}
              device={device}
              allDevices={allDevices}
              onUpdate={(cmd) => onUpdate({ command: cmd })}
              onConditionUpdate={(cond) => onUpdate({ condition: cond })}
            />
          )}

          {/* Delete */}
          <button
            onClick={onDelete}
            className="w-full py-2 text-sm text-red-400 hover:text-red-300 border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors"
          >
            Delete event
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RGB to HSV helper ──────────────────────────────────────────────
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), diff = max - min;
  let h = 0;
  if (diff !== 0) {
    if (max === rn) h = ((gn - bn) / diff) % 6;
    else if (max === gn) h = (bn - rn) / diff + 2;
    else h = (rn - gn) / diff + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : Math.round((diff / max) * 1000);
  const v = Math.round(max * 1000);
  return { h, s, v };
}

// ─── Extra Command Editor (category-aware) ───────────────────────────
function ExtraCommandEditor({ command, condition, device, allDevices, onUpdate, onConditionUpdate }: {
  command: DeviceCommand;
  condition?: ActionCondition;
  device: Device;
  allDevices: Device[];
  onUpdate: (cmd: DeviceCommand) => void;
  onConditionUpdate: (cond: ActionCondition | undefined) => void;
}) {
  const tuyaCat = device.attributes?.category as string | undefined;
  const devType = getDeviceTypeShort(device);

  const isLight = tuyaCat === 'dj' || tuyaCat === 'dd' || tuyaCat === 'xdd' || devType === 'LIGHT';
  const isAC = (tuyaCat === 'infrared_ac' || tuyaCat === 'kt' || tuyaCat === 'qt' ||
                devType === 'AC_UNIT' || devType === 'THERMOSTAT') && tuyaCat !== 'wnykq';
  const isIRHub = tuyaCat === 'wnykq';

  // Sensor devices for conditions
  const sensorDevices = allDevices.filter(d => d.attributes?.category === 'wnykq');

  if (isIRHub) return null; // Sensor only, no extra controls

  // ─── AC Controls ─────────────────────────────
  if (isAC) {
    const acCmd = command.type === 'TuyaAC' ? command : { type: 'TuyaAC' as const, mode: 'cold' as const, temperature: 24, fan: 'auto' as const };
    // Auto-switch to TuyaAC if not already
    if (command.type !== 'TuyaAC') {
      onUpdate(acCmd);
    }

    return (
      <div className="space-y-3">
        {/* Mode */}
        <div className="space-y-1.5">
          <span className="text-xs text-gray-500">Mode</span>
          <div className="grid grid-cols-5 gap-1.5">
            {AC_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onUpdate({ ...acCmd, mode: m.value })}
                className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                  acCmd.mode === m.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 border border-gray-700'
                }`}
              >
                <span className="text-sm">{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Temperature */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Temperature</span><span className="font-mono">{acCmd.temperature}°C</span>
          </div>
          <input type="range" min="16" max="30" value={acCmd.temperature}
            onChange={e => onUpdate({ ...acCmd, temperature: parseInt(e.target.value) })}
            className="w-full" />
          <div className="flex justify-between text-[10px] text-gray-600"><span>16°C</span><span>30°C</span></div>
        </div>

        {/* Fan Speed */}
        <div className="space-y-1.5">
          <span className="text-xs text-gray-500">Fan Speed</span>
          <div className="grid grid-cols-4 gap-1.5">
            {AC_FAN_SPEEDS.map((f) => (
              <button
                key={f.value}
                onClick={() => onUpdate({ ...acCmd, fan: f.value })}
                className={`py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                  acCmd.fan === f.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 border border-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Condition */}
        {sensorDevices.length > 0 && (
          <ConditionEditor
            condition={condition}
            sensorDevices={sensorDevices}
            onUpdate={onConditionUpdate}
          />
        )}
      </div>
    );
  }

  // ─── Light Controls ──────────────────────────
  if (isLight) {
    const hasColor = device.traits.some(t => t.includes('ColorSetting'));

    // Build command type options
    const options: { value: string; label: string }[] = [
      { value: 'OnOff', label: 'Just On/Off' },
      { value: 'TuyaLight-brightness', label: 'Set Brightness' },
      { value: 'TuyaLight-colorTemp', label: 'Color Temperature' },
    ];
    if (hasColor) {
      options.push({ value: 'TuyaLight-color', label: 'Color' });
    }

    // Determine current selection
    let currentOption = 'OnOff';
    if (command.type === 'TuyaLight') {
      if (command.colorHSV) currentOption = 'TuyaLight-color';
      else if (command.colorTemp != null) currentOption = 'TuyaLight-colorTemp';
      else if (command.brightness != null) currentOption = 'TuyaLight-brightness';
    } else if (command.type === 'Brightness') currentOption = 'TuyaLight-brightness';
    else if (command.type === 'ColorTemperature') currentOption = 'TuyaLight-colorTemp';
    else if (command.type === 'ColorRGB') currentOption = 'TuyaLight-color';

    return (
      <div className="space-y-3">
        <select
          value={currentOption}
          onChange={(e) => {
            const t = e.target.value;
            switch (t) {
              case 'OnOff': onUpdate({ type: 'OnOff', on: true }); break;
              case 'TuyaLight-brightness': onUpdate({ type: 'TuyaLight', brightness: 80, workMode: 'white' }); break;
              case 'TuyaLight-colorTemp': onUpdate({ type: 'TuyaLight', colorTemp: 500, workMode: 'white' }); break;
              case 'TuyaLight-color': onUpdate({ type: 'TuyaLight', colorHSV: { h: 0, s: 1000, v: 1000 }, workMode: 'colour' }); break;
            }
          }}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Brightness slider */}
        {command.type === 'TuyaLight' && command.brightness != null && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Brightness</span><span>{command.brightness}%</span>
            </div>
            <input type="range" min="1" max="100" value={command.brightness}
              onChange={e => onUpdate({ type: 'TuyaLight', brightness: parseInt(e.target.value), workMode: 'white' })}
              className="w-full" />
          </div>
        )}

        {/* Color temperature slider */}
        {command.type === 'TuyaLight' && command.colorTemp != null && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Color Temp</span><span>{command.colorTemp}</span>
            </div>
            <input type="range" min="0" max="1000" step="10" value={command.colorTemp}
              onChange={e => onUpdate({ type: 'TuyaLight', colorTemp: parseInt(e.target.value), workMode: 'white' })}
              className="w-full" />
            <div className="flex justify-between text-[10px] text-gray-600"><span>Warm</span><span>Cool</span></div>
          </div>
        )}

        {/* Color presets */}
        {command.type === 'TuyaLight' && command.colorHSV && (
          <div className="grid grid-cols-3 gap-1.5">
            {PRESET_COLORS.map(color => {
              const hsv = rgbToHsv(color.r, color.g, color.b);
              const selected = command.colorHSV && command.colorHSV.h === hsv.h && command.colorHSV.s === hsv.s;
              return (
                <button key={color.name}
                  onClick={() => onUpdate({ type: 'TuyaLight', colorHSV: hsv, workMode: 'colour' })}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                    selected ? 'border-blue-500 bg-blue-900/30' : 'border-gray-700'
                  }`}>
                  <span className="w-3 h-3 rounded-full border border-gray-600"
                    style={{ backgroundColor: `rgb(${color.r},${color.g},${color.b})` }} />
                  <span className="text-[11px] text-gray-400">{color.name}</span>
                </button>
              );
            })}
            <button
              onClick={() => onUpdate({ type: 'TuyaLight', workMode: 'white' as const, brightness: 80 })}
              className="flex items-center gap-1.5 p-2 rounded-lg border border-gray-700 col-span-3 hover:border-gray-500"
            >
              <span className="w-3 h-3 rounded-full bg-white border border-gray-300" />
              <span className="text-[11px] text-gray-400">White Mode</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Fallback: trait-based (for other device types) ──────
  const hasBrightness = device.traits.some(t => t.includes('Brightness'));
  const hasColor = device.traits.some(t => t.includes('ColorSetting'));
  const hasTemp = device.traits.some(t => t.includes('TemperatureSetting'));
  const hasFan = device.traits.some(t => t.includes('FanSpeed'));
  if (!hasBrightness && !hasColor && !hasTemp && !hasFan) return null;

  const options: { value: string; label: string }[] = [{ value: 'OnOff', label: 'Just On/Off' }];
  if (hasBrightness) options.push({ value: 'Brightness', label: 'Set Brightness' });
  if (hasTemp) options.push({ value: 'Thermostat', label: 'Set Temperature' });
  if (hasFan) options.push({ value: 'FanSpeed', label: 'Fan Speed' });

  return (
    <div className="space-y-3">
      <select
        value={command.type}
        onChange={(e) => {
          const t = e.target.value;
          switch (t) {
            case 'OnOff': onUpdate({ type: 'OnOff', on: true }); break;
            case 'Brightness': onUpdate({ type: 'Brightness', brightness: 100 }); break;
            case 'Thermostat': onUpdate({ type: 'Thermostat', mode: 'auto', temperature: 22 }); break;
            case 'FanSpeed': onUpdate({ type: 'FanSpeed', speedPercent: 50 }); break;
          }
        }}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {command.type === 'Brightness' && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Brightness</span><span>{command.brightness}%</span>
          </div>
          <input type="range" min="0" max="100" value={command.brightness}
            onChange={e => onUpdate({ type: 'Brightness', brightness: parseInt(e.target.value) })}
            className="w-full" />
        </div>
      )}
      {command.type === 'Thermostat' && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Temperature</span><span>{command.temperature}°C</span>
          </div>
          <input type="range" min="16" max="30" value={command.temperature || 22}
            onChange={e => onUpdate({ type: 'Thermostat', mode: command.mode, temperature: parseInt(e.target.value) })}
            className="w-full" />
        </div>
      )}
      {command.type === 'FanSpeed' && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Fan Speed</span><span>{command.speedPercent}%</span>
          </div>
          <input type="range" min="0" max="100" step="10" value={command.speedPercent}
            onChange={e => onUpdate({ type: 'FanSpeed', speedPercent: parseInt(e.target.value) })}
            className="w-full" />
        </div>
      )}
    </div>
  );
}

// ─── Condition Editor ────────────────────────────────────────────────
function ConditionEditor({ condition, sensorDevices, onUpdate }: {
  condition?: ActionCondition;
  sensorDevices: Device[];
  onUpdate: (cond: ActionCondition | undefined) => void;
}) {
  const [enabled, setEnabled] = useState(!!condition);

  const defaultSensor = sensorDevices[0];
  const current: ActionCondition = condition || {
    sensorDeviceId: defaultSensor?.id || '',
    sensorDeviceName: defaultSensor ? getDeviceDisplayName(defaultSensor) : '',
    metric: 'temperature',
    operator: '>',
    value: 28,
  };

  return (
    <div className="p-3 bg-gray-800/40 border border-gray-700 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Only run if...</span>
        <button
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            onUpdate(next ? current : undefined);
          }}
          className={`w-9 h-5 rounded-full transition-colors relative ${enabled ? 'bg-blue-600' : 'bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {enabled && (
        <div className="space-y-2">
          {/* Sensor picker (if multiple) */}
          {sensorDevices.length > 1 && (
            <select
              value={current.sensorDeviceId}
              onChange={(e) => {
                const sensor = sensorDevices.find(d => d.id === e.target.value);
                if (sensor) onUpdate({ ...current, sensorDeviceId: sensor.id, sensorDeviceName: getDeviceDisplayName(sensor) });
              }}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300"
            >
              {sensorDevices.map(d => (
                <option key={d.id} value={d.id}>{getDeviceDisplayName(d)}</option>
              ))}
            </select>
          )}

          {/* Metric + Operator + Value */}
          <div className="flex items-center gap-2">
            <select
              value={current.metric}
              onChange={(e) => onUpdate({ ...current, metric: e.target.value as 'temperature' | 'humidity', value: e.target.value === 'temperature' ? 28 : 60 })}
              className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300"
            >
              <option value="temperature">Temp</option>
              <option value="humidity">Humidity</option>
            </select>

            <div className="flex gap-0.5">
              {(['>' , '<', '>=', '<='] as const).map(op => (
                <button
                  key={op}
                  onClick={() => onUpdate({ ...current, operator: op })}
                  className={`px-2 py-1.5 rounded text-xs font-mono ${
                    current.operator === op ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 border border-gray-700'
                  }`}
                >{op}</button>
              ))}
            </div>

            <input
              type="number"
              value={current.value}
              onChange={(e) => onUpdate({ ...current, value: parseFloat(e.target.value) || 0 })}
              className="w-16 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 text-center"
            />
            <span className="text-xs text-gray-500">{current.metric === 'temperature' ? '°C' : '%'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Device Timeline Row ─────────────────────────────────────────────
function DeviceTimelineRow({ timeline, allDevices, onUpdate, onDelete }: {
  timeline: DeviceTimeline;
  allDevices: Device[];
  onUpdate: (updated: DeviceTimeline) => void;
  onDelete: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [popoverEvent, setPopoverEvent] = useState<TimelineEvent | null>(null);
  const dragStartX = useRef(0);
  const wasDragged = useRef(false);

  const segments = computeSegments(timeline.events);

  const posFromPointer = useCallback((clientX: number): number => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return snapToGrid(Math.round(pct * MINUTES_IN_DAY));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, eventId: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingId(eventId);
    dragStartX.current = e.clientX;
    wasDragged.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId) return;
    if (Math.abs(e.clientX - dragStartX.current) > 5) {
      wasDragged.current = true;
    }
    const minutes = posFromPointer(e.clientX);
    const newTime = minutesToTime(minutes);
    const updatedEvents = timeline.events.map(ev =>
      ev.id === draggingId ? { ...ev, time: newTime } : ev
    );
    onUpdate({ ...timeline, events: updatedEvents });
  }, [draggingId, timeline, onUpdate, posFromPointer]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (draggingId) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      // If it wasn't a drag, open the popover
      if (!wasDragged.current) {
        const ev = timeline.events.find(ev => ev.id === draggingId);
        if (ev) setPopoverEvent(ev);
      }
      setDraggingId(null);
    }
  }, [draggingId, timeline.events]);

  const handleBarClick = useCallback((e: React.PointerEvent) => {
    if (draggingId) return;
    // Make sure we clicked the bar, not a marker
    if ((e.target as HTMLElement).closest('[data-marker]')) return;
    const minutes = posFromPointer(e.clientX);
    const time = minutesToTime(minutes);
    // Determine on/off: opposite of whatever state is at this time
    const sorted = [...timeline.events].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    let currentState = sorted.length > 0 ? sorted[sorted.length - 1].on : false;
    for (const ev of sorted) {
      if (timeToMinutes(ev.time) > minutes) break;
      currentState = ev.on;
    }
    const newOn = !currentState;
    const newEvent: TimelineEvent = {
      id: uid(),
      time,
      on: newOn,
      command: { type: 'OnOff', on: newOn },
    };
    onUpdate({ ...timeline, events: [...timeline.events, newEvent] });
  }, [draggingId, timeline, onUpdate, posFromPointer]);

  const updateEvent = (eventId: string, updates: Partial<TimelineEvent>) => {
    const updatedEvents = timeline.events.map(ev =>
      ev.id === eventId ? { ...ev, ...updates } : ev
    );
    onUpdate({ ...timeline, events: updatedEvents });
    if (popoverEvent?.id === eventId) {
      setPopoverEvent({ ...popoverEvent, ...updates });
    }
  };

  const deleteEvent = (eventId: string) => {
    onUpdate({ ...timeline, events: timeline.events.filter(ev => ev.id !== eventId) });
    setPopoverEvent(null);
  };

  // Current time indicator
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowPct = (nowMin / MINUTES_IN_DAY) * 100;

  return (
    <div className="space-y-1">
      {/* Device label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {timeline.device && (
            <span className="text-gray-500">{getDeviceIcon(timeline.device)}</span>
          )}
          <span className="text-xs font-medium text-gray-300 truncate max-w-[200px]">
            {timeline.deviceName}
          </span>
          <span className="text-[10px] text-gray-600">
            {timeline.events.length} event{timeline.events.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={onDelete} className="p-1 text-gray-700 hover:text-red-500 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        className="timeline-bar relative h-12 bg-gray-900/80 rounded-lg border border-gray-800 cursor-crosshair overflow-hidden"
        onPointerDown={handleBarClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Hour grid lines */}
        {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
          <div
            key={h}
            className="absolute top-0 bottom-0 w-px bg-gray-800"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}

        {/* Colored segments */}
        {segments.map(seg => seg.on && (
          <div
            key={seg.id}
            className="absolute top-0 bottom-0 bg-emerald-600/30 border-y border-emerald-600/20"
            style={{ left: `${seg.startPct}%`, width: `${Math.max(seg.widthPct, 0.3)}%` }}
          />
        ))}

        {/* Current time indicator */}
        <div
          className="absolute top-0 bottom-0 w-px bg-yellow-500/40 pointer-events-none"
          style={{ left: `${nowPct}%` }}
        />

        {/* Event markers */}
        {timeline.events.map(ev => {
          const leftPct = (timeToMinutes(ev.time) / MINUTES_IN_DAY) * 100;
          return (
            <div
              key={ev.id}
              data-marker
              className="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize"
              style={{ left: `${leftPct}%`, transform: 'translateX(-50%)', width: '28px' }}
              onPointerDown={(e) => handlePointerDown(e, ev.id)}
            >
              {/* Visual line */}
              <div className={`absolute top-0 bottom-0 w-0.5 ${
                ev.on ? 'bg-emerald-400' : 'bg-red-400'
              }`} />
              {/* Knob */}
              <div className={`relative z-10 w-4 h-4 rounded-full border-2 shadow-lg ${
                ev.on
                  ? 'bg-emerald-500 border-emerald-300'
                  : 'bg-red-500 border-red-300'
              } ${draggingId === ev.id ? 'scale-125' : ''} transition-transform`} />
              {/* Time label */}
              <span className={`absolute -bottom-0.5 text-[8px] font-mono whitespace-nowrap pointer-events-none ${
                ev.on ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {ev.time}
              </span>
            </div>
          );
        })}
      </div>

      {/* Event list (compact) */}
      {timeline.events.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {[...timeline.events]
            .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
            .map(ev => (
              <button
                key={ev.id}
                onClick={() => setPopoverEvent(ev)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono border transition-colors ${
                  ev.on
                    ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-400 hover:bg-emerald-900/40'
                    : 'bg-red-950/40 border-red-800/50 text-red-400 hover:bg-red-900/40'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${ev.on ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {ev.time} {ev.on ? 'ON' : 'OFF'}
              </button>
            ))}
        </div>
      )}

      {/* Event popover */}
      {popoverEvent && (
        <EventPopover
          event={popoverEvent}
          device={timeline.device}
          allDevices={allDevices}
          onUpdate={(updates) => updateEvent(popoverEvent.id, updates)}
          onDelete={() => deleteEvent(popoverEvent.id)}
          onClose={() => setPopoverEvent(null)}
        />
      )}
    </div>
  );
}

// ─── Add Device Panel ────────────────────────────────────────────────
function AddDevicePanel({ devices, groups, existingDeviceIds, onAdd, onAddGroup, onClose }: {
  devices: Device[];
  groups: DeviceGroup[];
  existingDeviceIds: Set<string>;
  onAdd: (device: Device) => void;
  onAddGroup: (group: DeviceGroup) => void;
  onClose: () => void;
}) {
  const available = devices.filter(d => !existingDeviceIds.has(d.id));
  // A group is "available" if at least one of its devices isn't in the timeline yet
  const availableGroups = groups.filter(g => g.deviceIds.some(id => !existingDeviceIds.has(id)));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[60vh] overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-800">
          <span className="text-sm font-medium text-gray-200">Add Device</span>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 overflow-y-auto max-h-[50vh]">
          {/* Groups */}
          {availableGroups.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 px-1">Groups</p>
              <div className="space-y-1">
                {availableGroups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => { onAddGroup(group); onClose(); }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-purple-900/20 rounded-lg transition-colors text-left border border-gray-800 hover:border-purple-800"
                  >
                    <span className="text-purple-400"><Layers className="h-5 w-5" /></span>
                    <div>
                      <span className="text-sm text-gray-200">{group.name}</span>
                      <span className="text-xs text-gray-600 ml-2">{group.deviceIds.length} devices</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Individual Devices */}
          {available.length === 0 && availableGroups.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">All devices have been added</p>
          ) : (
            <>
              {availableGroups.length > 0 && available.length > 0 && (
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 px-1">Individual Devices</p>
              )}
              <div className="space-y-1">
                {available.map(device => (
                  <button
                    key={device.id}
                    onClick={() => { onAdd(device); onClose(); }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/50 rounded-lg transition-colors text-left"
                  >
                    <span className="text-gray-400">{getDeviceIcon(device)}</span>
                    <div>
                      <span className="text-sm text-gray-200">{device.name.name}</span>
                      <span className="text-xs text-gray-600 ml-2">{getDeviceTypeShort(device)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Schedule Builder ───────────────────────────────────────────
export default function ScheduleBuilder() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = id && id !== 'new';

  const [schedule, setSchedule] = useState<Partial<Schedule>>({
    name: '',
    enabled: true,
    daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    timeSlots: [],
  });

  const [timelines, setTimelines] = useState<DeviceTimeline[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [timelinesLoaded, setTimelinesLoaded] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        let deviceList: Device[] = [];
        try {
          deviceList = await tuyaApi.getDevices();
          setDevices(deviceList);
        } catch {
          setDevices([]);
        }

        try {
          const groupList = await groupApi.list();
          setGroups(groupList);
        } catch { /* groups not critical */ }

        if (isEditing && id) {
          const existing = await scheduleApi.get(id);
          setSchedule(existing);
          if (existing.timeSlots && existing.timeSlots.length > 0) {
            setTimelines(timeSlotsToTimelines(existing.timeSlots, deviceList));
          }
        }
        setTimelinesLoaded(true);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, isEditing]);

  const toggleDay = (day: DayOfWeek) => {
    const currentDays = schedule.daysOfWeek || [];
    setSchedule({
      ...schedule,
      daysOfWeek: currentDays.includes(day)
        ? currentDays.filter(d => d !== day)
        : [...currentDays, day],
    });
  };

  const selectPreset = (preset: 'weekdays' | 'weekends' | 'everyday') => {
    const presets: Record<string, DayOfWeek[]> = {
      weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      weekends: ['saturday', 'sunday'],
      everyday: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    };
    setSchedule({ ...schedule, daysOfWeek: presets[preset] });
  };

  const addDevice = (device: Device) => {
    const h = new Date().getHours();
    const startTime = `${String(h).padStart(2, '0')}:00`;
    const endTime = `${String((h + 1) % 24).padStart(2, '0')}:00`;

    setTimelines(prev => [...prev, {
      deviceId: device.id,
      deviceName: device.name.name,
      device,
      events: [
        { id: uid(), time: startTime, on: true, command: { type: 'OnOff', on: true } },
        { id: uid(), time: endTime, on: false, command: { type: 'OnOff', on: false } },
      ],
    }]);
  };

  const addGroup = (group: DeviceGroup) => {
    const h = new Date().getHours();
    const startTime = `${String(h).padStart(2, '0')}:00`;
    const endTime = `${String((h + 1) % 24).padStart(2, '0')}:00`;

    // Add a timeline for each device in the group that isn't already added
    const newTimelines: DeviceTimeline[] = [];
    for (const deviceId of group.deviceIds) {
      if (timelines.some(t => t.deviceId === deviceId)) continue;
      const device = devices.find(d => d.id === deviceId);
      if (!device) continue;
      newTimelines.push({
        deviceId: device.id,
        deviceName: device.name.name,
        device,
        events: [
          { id: uid(), time: startTime, on: true, command: { type: 'OnOff', on: true } },
          { id: uid(), time: endTime, on: false, command: { type: 'OnOff', on: false } },
        ],
      });
    }
    if (newTimelines.length > 0) {
      setTimelines(prev => [...prev, ...newTimelines]);
    }
  };

  const handleSave = async () => {
    if (!schedule.name) { setError('Enter a schedule name'); return; }
    const hasEvents = timelines.some(t => t.events.length > 0);
    if (!hasEvents) { setError('Add at least one event'); return; }

    setSaving(true);
    setError(null);
    try {
      const timeSlots = timelinesToTimeSlots(timelines);
      const toSave = { ...schedule, timeSlots };

      if (isEditing && id) {
        await scheduleApi.update(id, toSave);
      } else {
        await scheduleApi.create(toSave as Omit<Schedule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>);
      }
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!isEditing || !id) { setError('Save the schedule first'); return; }
    setTesting(true);
    setError(null);
    try {
      await scheduleApi.test(id);
      alert('Schedule triggered! Check your devices.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const existingDeviceIds = new Set(timelines.map(t => t.deviceId));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-md border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex justify-between items-center h-14">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm hidden sm:inline">Back</span>
            </button>
            <h1 className="text-sm font-semibold text-gray-300">
              {isEditing ? 'Edit Schedule' : 'New Schedule'}
            </h1>
            <div className="flex items-center gap-2">
              {isEditing && (
                <button
                  onClick={handleTest}
                  disabled={testing || saving}
                  className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 active:scale-95 transition-all"
                >
                  <Play className="h-3.5 w-3.5" />
                  {testing ? '...' : 'Test'}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? '...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-12">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-400 text-sm">{error}</div>
        )}

        {/* Schedule name */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
          <input
            type="text"
            value={schedule.name || ''}
            onChange={e => setSchedule({ ...schedule, name: e.target.value })}
            placeholder="e.g., Evening Routine"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-gray-200 placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Days of week */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Active Days</label>
          <div className="flex gap-1.5 mb-3">
            {DAYS_OF_WEEK.map((day, i) => (
              <button
                key={day.value}
                onClick={() => toggleDay(day.value)}
                className={`flex-1 h-11 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  schedule.daysOfWeek?.includes(day.value)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-900 border border-gray-800 text-gray-600 hover:border-gray-700'
                }`}
                title={day.label}
              >
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['weekdays', 'weekends', 'everyday'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => selectPreset(preset)}
                className="text-[11px] px-3 py-1 bg-gray-900 border border-gray-800 rounded-full text-gray-500 hover:text-gray-300 hover:border-gray-700 transition-colors capitalize"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* 24-Hour Timeline */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            24-Hour Timeline
          </label>

          {timelines.length > 0 && <TimelineHeader />}

          <div className="space-y-4">
            {timelines.map((tl, idx) => (
              <DeviceTimelineRow
                key={tl.deviceId}
                timeline={tl}
                allDevices={devices}
                onUpdate={(updated) => {
                  setTimelines(prev => prev.map((t, i) => i === idx ? updated : t));
                }}
                onDelete={() => {
                  setTimelines(prev => prev.filter((_, i) => i !== idx));
                }}
              />
            ))}
          </div>

          {/* Add device button */}
          <button
            onClick={() => setShowAddDevice(true)}
            className="w-full flex items-center justify-center gap-2 p-4 mt-3 border border-dashed border-gray-800 rounded-xl text-gray-600 hover:border-blue-600 hover:text-blue-500 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add device
          </button>

          {timelines.length === 0 && (
            <p className="text-xs text-gray-700 text-center mt-2">
              Add a device to start building your schedule timeline
            </p>
          )}

          {timelines.length > 0 && (
            <p className="text-[10px] text-gray-700 text-center mt-2">
              Tap the bar to add events &middot; Drag markers to adjust time &middot; Tap a marker or chip to edit
            </p>
          )}
        </div>

        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-900/60 rounded-xl border border-gray-800">
          <div>
            <h3 className="font-medium text-gray-200 text-sm">Schedule Status</h3>
            <p className="text-xs text-gray-600">{schedule.enabled ? 'Active - runs automatically' : 'Paused'}</p>
          </div>
          <button
            onClick={() => setSchedule({ ...schedule, enabled: !schedule.enabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              schedule.enabled ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              schedule.enabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </main>

      {/* Add Device Panel */}
      {showAddDevice && (
        <AddDevicePanel
          devices={devices}
          groups={groups}
          existingDeviceIds={existingDeviceIds}
          onAdd={addDevice}
          onAddGroup={addGroup}
          onClose={() => setShowAddDevice(false)}
        />
      )}
    </div>
  );
}

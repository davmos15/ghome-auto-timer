import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Timer,
  Plus,
  Calendar,
  Lightbulb,
  Thermometer,
  Power,
  LogOut,
  ChevronRight,
  RefreshCw,
  Loader2,
  Link,
  Unlink,
  Wifi,
  WifiOff,
  Fan,
  Trash2,
  Palette,
  X,
  Layers,
  Edit3,
  Check,
} from 'lucide-react';
import type { Schedule, Device, DeviceGroup } from '../types';
import { getDeviceDisplayName, getDeviceTypeShort, PRESET_COLORS, AC_MODES, AC_FAN_SPEEDS } from '../types';
import { scheduleApi, tuyaApi, groupApi } from '../lib/api';

function getDeviceIcon(device: Device) {
  const type = getDeviceTypeShort(device);
  switch (type) {
    case 'LIGHT': return <Lightbulb className="h-5 w-5" />;
    case 'AC_UNIT':
    case 'THERMOSTAT': return <Thermometer className="h-5 w-5" />;
    case 'FAN': return <Fan className="h-5 w-5" />;
    default: return <Power className="h-5 w-5" />;
  }
}

function formatDays(days: string[]): string {
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && !days.includes('saturday') && !days.includes('sunday')) return 'Weekdays';
  if (days.length === 2 && days.includes('saturday') && days.includes('sunday')) return 'Weekends';
  return days.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ');
}

// ─── Device Control Panel ────────────────────────────────────────────
function DeviceControl({ device, allDevices, schedules, onClose }: { device: Device; allDevices: Device[]; schedules: Schedule[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Record<string, any> | null>(null);
  const [sensorData, setSensorData] = useState<{ temp: number | null; humidity: number | null }>({ temp: null, humidity: null });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = getDeviceTypeShort(device);
  const tuyaCat = device.attributes?.category as string | undefined;
  const isIRHub = tuyaCat === 'wnykq';
  const isAC = (type === 'AC_UNIT' || type === 'THERMOSTAT') && !isIRHub;

  useEffect(() => {
    async function fetchStatus() {
      try {
        setLoading(true);
        const s = await tuyaApi.getDeviceStatus(device.id);
        setStatus(s);

        // For IR hub, sensor data is in its own status
        if (isIRHub) {
          const rawTemp = s.va_temperature as number;
          const rawHumidity = s.va_humidity as number;
          setSensorData({
            temp: rawTemp != null ? rawTemp / 10 : null,
            humidity: rawHumidity != null ? rawHumidity : null,
          });
        }

        // For AC devices, fetch IR sensor data from the IR hub
        if (isAC) {
          const irSensor = allDevices.find(d => d.attributes?.category === 'wnykq');
          if (irSensor && irSensor.id !== device.id) {
            try {
              const sensorStatus = await tuyaApi.getDeviceStatus(irSensor.id);
              const rawTemp = sensorStatus.va_temperature as number;
              const rawHumidity = sensorStatus.va_humidity as number;
              setSensorData({
                temp: rawTemp != null ? rawTemp / 10 : null,
                humidity: rawHumidity != null ? rawHumidity : null,
              });
            } catch { /* ignore sensor errors */ }
          }
        }
      } catch {
        setError('Could not fetch device status');
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, [device.id, isAC, isIRHub, allDevices]);

  const sendCmd = async (commands: Array<{ code: string; value: unknown }>) => {
    try {
      setSending(true);
      setError(null);
      await tuyaApi.sendCommand(device.id, commands);
      // Refresh status
      const s = await tuyaApi.getDeviceStatus(device.id);
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setSending(false);
    }
  };

  const isOn = isAC
    ? (status?.switch === true || status?.power === '1' || status?.power === true)
    : (status?.switch_led === true || status?.switch_1 === true || status?.switch === true);

  // Parse AC values from status
  const acTemp = status?.temp != null ? parseInt(String(status.temp)) : 24;
  const acMode = status?.mode ?? 'cold';
  const acFan = status?.wind ?? status?.fan ?? 'auto';
  // Map Tuya mode numbers to names if needed
  const acModeStr = typeof acMode === 'number' || /^\d+$/.test(String(acMode))
    ? ['cold', 'heat', 'auto', 'wind_dry', 'dehumidification'][parseInt(String(acMode))] || 'cold'
    : String(acMode);
  const acFanStr = typeof acFan === 'number' || /^\d+$/.test(String(acFan))
    ? ['low', 'mid', 'high', 'auto'][parseInt(String(acFan))] || 'auto'
    : String(acFan);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg text-blue-400">
              {getDeviceIcon(device)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-200">{getDeviceDisplayName(device)}</h3>
              <p className="text-xs text-gray-500">{type} {device.attributes?.online ? '' : '(offline)'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-300 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {error && (
                <div className="p-2 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-xs">{error}</div>
              )}

              {/* ─── IR Hub Sensor Display ─────────────────── */}
              {isIRHub && (sensorData.temp != null || sensorData.humidity != null) && (
                <div className="flex items-center gap-4 p-5 bg-gradient-to-r from-blue-950/40 to-cyan-950/40 border border-blue-900/40 rounded-xl">
                  {sensorData.temp != null && (
                    <div className="flex-1 text-center">
                      <p className="text-4xl font-light text-blue-300">{sensorData.temp.toFixed(1)}°</p>
                      <p className="text-xs text-gray-500 mt-1">Temperature</p>
                    </div>
                  )}
                  {sensorData.humidity != null && (
                    <div className="flex-1 text-center">
                      <p className="text-4xl font-light text-cyan-300">{sensorData.humidity}%</p>
                      <p className="text-xs text-gray-500 mt-1">Humidity</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─── AC Controls ─────────────────────────── */}
              {isAC && status && (
                <>
                  {/* Room temperature & humidity from IR sensor */}
                  {(sensorData.temp != null || sensorData.humidity != null) && (
                    <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-950/40 to-cyan-950/40 border border-blue-900/40 rounded-xl">
                      {sensorData.temp != null && (
                        <div className="flex-1 text-center">
                          <p className="text-3xl font-light text-blue-300">{sensorData.temp.toFixed(1)}°</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">Room Temp</p>
                        </div>
                      )}
                      {sensorData.humidity != null && (
                        <div className="flex-1 text-center">
                          <p className="text-3xl font-light text-cyan-300">{sensorData.humidity}%</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">Humidity</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Power toggle */}
                  <div className="flex items-center justify-between p-3 bg-gray-800/60 rounded-xl">
                    <span className="text-sm text-gray-300">Power</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendCmd([{ code: 'switch', value: true }])}
                        disabled={sending}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                          isOn ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >On</button>
                      <button
                        onClick={() => sendCmd([{ code: 'switch', value: false }])}
                        disabled={sending}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                          !isOn ? 'bg-red-600/80 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >Off</button>
                    </div>
                  </div>

                  {/* Mode selector */}
                  <div className="p-3 bg-gray-800/60 rounded-xl space-y-2">
                    <span className="text-sm text-gray-400">Mode</span>
                    <div className="grid grid-cols-5 gap-1.5">
                      {AC_MODES.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => sendCmd([{ code: 'mode', value: m.value }])}
                          disabled={sending}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                            acModeStr === m.value
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700/60 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          <span className="text-base">{m.icon}</span>
                          <span>{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Temperature setpoint */}
                  <div className="p-3 bg-gray-800/60 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Set Temperature</span>
                      <span className="text-2xl font-semibold text-gray-200">{acTemp}°C</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => sendCmd([{ code: 'temp', value: Math.max(16, acTemp - 1) }])}
                        disabled={sending || acTemp <= 16}
                        className="w-10 h-10 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 flex items-center justify-center text-xl font-medium active:scale-95 transition-all"
                      >−</button>
                      <input
                        type="range" min="16" max="30" step="1"
                        value={acTemp}
                        onChange={(e) => setStatus({ ...status, temp: e.target.value })}
                        onMouseUp={(e) => sendCmd([{ code: 'temp', value: parseInt((e.target as HTMLInputElement).value) }])}
                        onTouchEnd={(e) => sendCmd([{ code: 'temp', value: parseInt((e.target as HTMLInputElement).value) }])}
                        className="flex-1"
                      />
                      <button
                        onClick={() => sendCmd([{ code: 'temp', value: Math.min(30, acTemp + 1) }])}
                        disabled={sending || acTemp >= 30}
                        className="w-10 h-10 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 flex items-center justify-center text-xl font-medium active:scale-95 transition-all"
                      >+</button>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-600 px-12">
                      <span>16°C</span>
                      <span>30°C</span>
                    </div>
                  </div>

                  {/* Fan speed */}
                  <div className="p-3 bg-gray-800/60 rounded-xl space-y-2">
                    <div className="flex items-center gap-1.5 text-sm text-gray-400">
                      <Fan className="h-3.5 w-3.5" /> Fan Speed
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {AC_FAN_SPEEDS.map((f) => (
                        <button
                          key={f.value}
                          onClick={() => sendCmd([{ code: 'fan', value: f.value }])}
                          disabled={sending}
                          className={`py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                            acFanStr === f.value
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700/60 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ─── Light/Generic Controls ──────────────── */}
              {!isAC && (
                <>
                  {/* Power toggle - works for all non-AC devices */}
                  <div className="flex items-center justify-between p-3 bg-gray-800/60 rounded-xl">
                    <span className="text-sm text-gray-300">Power</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendCmd([{ code: 'switch_led', value: true }, { code: 'switch_1', value: true }])}
                        disabled={sending}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                          isOn ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >On</button>
                      <button
                        onClick={() => sendCmd([{ code: 'switch_led', value: false }, { code: 'switch_1', value: false }])}
                        disabled={sending}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                          !isOn ? 'bg-red-600/80 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >Off</button>
                    </div>
                  </div>

                  {/* Brightness - for lights */}
                  {type === 'LIGHT' && status && (
                    <div className="p-3 bg-gray-800/60 rounded-xl space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Brightness</span>
                        <span className="text-gray-300 font-mono">
                          {Math.round(((status.bright_value_v2 ?? status.bright_value ?? 500) / 1000) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range" min="10" max="1000" step="10"
                        value={status.bright_value_v2 ?? status.bright_value ?? 500}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setStatus({ ...status, bright_value_v2: val });
                        }}
                        onMouseUp={(e) => sendCmd([{ code: 'bright_value_v2', value: parseInt((e.target as HTMLInputElement).value) }])}
                        onTouchEnd={(e) => sendCmd([{ code: 'bright_value_v2', value: parseInt((e.target as HTMLInputElement).value) }])}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Color Temperature - for lights */}
                  {type === 'LIGHT' && status && (status.temp_value_v2 !== undefined || status.temp_value !== undefined) && (
                    <div className="p-3 bg-gray-800/60 rounded-xl space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Color Temperature</span>
                        <span className="text-gray-300 font-mono">
                          {status.temp_value_v2 ?? status.temp_value ?? 500}
                        </span>
                      </div>
                      <input
                        type="range" min="0" max="1000" step="10"
                        value={status.temp_value_v2 ?? status.temp_value ?? 500}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setStatus({ ...status, temp_value_v2: val });
                        }}
                        onMouseUp={(e) => sendCmd([{ code: 'temp_value_v2', value: parseInt((e.target as HTMLInputElement).value) }])}
                        onTouchEnd={(e) => sendCmd([{ code: 'temp_value_v2', value: parseInt((e.target as HTMLInputElement).value) }])}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-gray-600">
                        <span>Warm</span>
                        <span>Cool</span>
                      </div>
                    </div>
                  )}

                  {/* Preset Colors - for color lights */}
                  {type === 'LIGHT' && device.traits.some(t => t.includes('ColorSetting')) && (
                    <div className="p-3 bg-gray-800/60 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
                        <Palette className="h-3.5 w-3.5" /> Colors
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {PRESET_COLORS.map((color) => {
                          // Convert RGB to Tuya HSV
                          const r = color.r / 255, g = color.g / 255, b = color.b / 255;
                          const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
                          let h = 0;
                          if (diff !== 0) {
                            if (max === r) h = ((g - b) / diff) % 6;
                            else if (max === g) h = (b - r) / diff + 2;
                            else h = (r - g) / diff + 4;
                            h = Math.round(h * 60);
                            if (h < 0) h += 360;
                          }
                          const s = max === 0 ? 0 : Math.round((diff / max) * 1000);
                          const v = Math.round(max * 1000);
                          const hsvStr = JSON.stringify({ h, s, v });

                          return (
                            <button
                              key={color.name}
                              onClick={() => sendCmd([
                                { code: 'work_mode', value: 'colour' },
                                { code: 'colour_data_v2', value: hsvStr },
                              ])}
                              disabled={sending}
                              className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-gray-500 active:scale-95 transition-all"
                            >
                              <span
                                className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0"
                                style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
                              />
                              <span className="text-xs text-gray-400">{color.name}</span>
                            </button>
                          );
                        })}
                        {/* White mode button */}
                        <button
                          onClick={() => sendCmd([{ code: 'work_mode', value: 'white' }])}
                          disabled={sending}
                          className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-gray-500 active:scale-95 transition-all col-span-3"
                        >
                          <span className="w-4 h-4 rounded-full bg-white border border-gray-300 flex-shrink-0" />
                          <span className="text-xs text-gray-400">White Mode</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Linked Schedules */}
              {(() => {
                const linked = schedules.filter(s =>
                  s.timeSlots.some(slot => slot.actions.some(a => a.deviceId === device.id))
                );
                if (linked.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-sm text-gray-400">
                      <Calendar className="h-3.5 w-3.5" /> Schedules
                    </div>
                    {linked.map(schedule => {
                      const relevantSlots = schedule.timeSlots.filter(slot =>
                        slot.actions.some(a => a.deviceId === device.id)
                      );
                      return (
                        <button
                          key={schedule.id}
                          onClick={() => { onClose(); navigate(`/schedule/${schedule.id}`); }}
                          className="w-full p-3 bg-gray-800/40 border border-gray-700 rounded-lg text-left hover:border-blue-700 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-200">{schedule.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              schedule.enabled
                                ? 'bg-emerald-900/50 text-emerald-400'
                                : 'bg-gray-800 text-gray-500'
                            }`}>
                              {schedule.enabled ? 'Active' : 'Off'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {relevantSlots.slice(0, 6).map(slot => (
                              <span key={slot.id} className="text-[10px] font-mono text-gray-500">
                                {slot.startTime}
                              </span>
                            ))}
                            {relevantSlots.length > 6 && (
                              <span className="text-[10px] text-gray-600">+{relevantSlots.length - 6}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Raw status (collapsed) */}
              {status && (
                <details className="text-xs">
                  <summary className="text-gray-600 cursor-pointer hover:text-gray-400">Raw status</summary>
                  <pre className="mt-2 p-2 bg-gray-800 rounded-lg text-gray-500 overflow-x-auto">
                    {JSON.stringify(status, null, 2)}
                  </pre>
                </details>
              )}
            </>
          )}

          {sending && (
            <div className="flex items-center justify-center gap-2 text-blue-400 text-sm py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Group Management Modal ──────────────────────────────────────────
function GroupModal({
  devices,
  existing,
  onSave,
  onClose,
}: {
  devices: Device[];
  existing: DeviceGroup | null;
  onSave: (name: string, deviceIds: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(existing?.deviceIds ?? []));

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="font-semibold text-gray-200">{existing ? 'Edit Group' : 'New Group'}</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-300 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Group Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Living Room Lights"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-2 block">Select Devices</label>
            <div className="space-y-1.5">
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => toggle(device.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                    selectedIds.has(device.id)
                      ? 'bg-blue-600/10 border-blue-700 text-blue-300'
                      : 'bg-gray-800/40 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                    selectedIds.has(device.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-600'
                  }`}>
                    {selectedIds.has(device.id) && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`p-1 rounded ${selectedIds.has(device.id) ? 'text-blue-400' : 'text-gray-600'}`}>
                      {getDeviceIcon(device)}
                    </div>
                    <span className="text-sm truncate">{getDeviceDisplayName(device)}</span>
                  </div>
                  <span className="text-[10px] text-gray-600">{getDeviceTypeShort(device)}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => {
              if (name.trim() && selectedIds.size > 0) {
                onSave(name.trim(), Array.from(selectedIds));
              }
            }}
            disabled={!name.trim() || selectedIds.size === 0}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
          >
            {existing ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Control Panel ─────────────────────────────────────────────
function GroupControl({
  group,
  devices,
  onClose,
}: {
  group: DeviceGroup;
  devices: Device[];
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupDevices = devices.filter(d => group.deviceIds.includes(d.id));

  const sendToAll = async (commands: Array<{ code: string; value: unknown }>) => {
    try {
      setSending(true);
      setError(null);
      await Promise.allSettled(
        groupDevices.map(d => tuyaApi.sendCommand(d.id, commands))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setSending(false);
    }
  };

  const hasLights = groupDevices.some(d => getDeviceTypeShort(d) === 'LIGHT');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg text-purple-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-200">{group.name}</h3>
              <p className="text-xs text-gray-500">{groupDevices.length} device{groupDevices.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-300 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-2 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-xs">{error}</div>
          )}

          {/* Power toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-800/60 rounded-xl">
            <span className="text-sm text-gray-300">All Power</span>
            <div className="flex gap-2">
              <button
                onClick={() => sendToAll([{ code: 'switch_led', value: true }, { code: 'switch_1', value: true }, { code: 'switch', value: true }])}
                disabled={sending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-50"
              >On</button>
              <button
                onClick={() => sendToAll([{ code: 'switch_led', value: false }, { code: 'switch_1', value: false }, { code: 'switch', value: false }])}
                disabled={sending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600/80 text-white hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50"
              >Off</button>
            </div>
          </div>

          {/* Brightness (for groups with lights) */}
          {hasLights && (
            <div className="p-3 bg-gray-800/60 rounded-xl space-y-2">
              <span className="text-sm text-gray-400">Brightness (All Lights)</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map(pct => (
                  <button
                    key={pct}
                    onClick={() => sendToAll([{ code: 'bright_value_v2', value: Math.round(pct * 10) }])}
                    disabled={sending}
                    className="py-2 rounded-lg text-xs font-medium bg-gray-700/60 text-gray-400 hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50"
                  >{pct}%</button>
                ))}
              </div>
            </div>
          )}

          {/* Preset Colors (for groups with color lights) */}
          {groupDevices.some(d => d.traits.some(t => t.includes('ColorSetting'))) && (
            <div className="p-3 bg-gray-800/60 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
                <Palette className="h-3.5 w-3.5" /> Colors (All)
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESET_COLORS.map((color) => {
                  const r = color.r / 255, g = color.g / 255, b = color.b / 255;
                  const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
                  let h = 0;
                  if (diff !== 0) {
                    if (max === r) h = ((g - b) / diff) % 6;
                    else if (max === g) h = (b - r) / diff + 2;
                    else h = (r - g) / diff + 4;
                    h = Math.round(h * 60);
                    if (h < 0) h += 360;
                  }
                  const s = max === 0 ? 0 : Math.round((diff / max) * 1000);
                  const v = Math.round(max * 1000);
                  const hsvStr = JSON.stringify({ h, s, v });
                  return (
                    <button
                      key={color.name}
                      onClick={() => sendToAll([
                        { code: 'work_mode', value: 'colour' },
                        { code: 'colour_data_v2', value: hsvStr },
                      ])}
                      disabled={sending}
                      className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-gray-500 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <span className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }} />
                      <span className="text-xs text-gray-400">{color.name}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => sendToAll([{ code: 'work_mode', value: 'white' }])}
                  disabled={sending}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-gray-500 active:scale-95 transition-all col-span-3 disabled:opacity-50"
                >
                  <span className="w-4 h-4 rounded-full bg-white border border-gray-300 flex-shrink-0" />
                  <span className="text-xs text-gray-400">White Mode</span>
                </button>
              </div>
            </div>
          )}

          {/* Devices in group */}
          <div className="space-y-1">
            <span className="text-xs text-gray-600">Devices in this group</span>
            {groupDevices.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-xs text-gray-500 py-1">
                <div className="text-gray-600">{getDeviceIcon(d)}</div>
                <span>{getDeviceDisplayName(d)}</span>
              </div>
            ))}
          </div>

          {sending && (
            <div className="flex items-center justify-center gap-2 text-blue-400 text-sm py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending to all...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────
export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tuyaLinked, setTuyaLinked] = useState(false);
  const [linking, setLinking] = useState(false);
  const [controlDevice, setControlDevice] = useState<Device | null>(null);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DeviceGroup | null>(null);
  const [controlGroup, setControlGroup] = useState<DeviceGroup | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const status = await tuyaApi.getStatus();
      setTuyaLinked(status.linked);

      if (status.linked || status.configured) {
        try {
          const devicesData = await tuyaApi.getDevices();
          setDevices(devicesData);
          if (devicesData.length > 0) setTuyaLinked(true);
        } catch {
          setDevices([]);
        }
      }

      const schedulesData = await scheduleApi.list();
      setSchedules(schedulesData);

      try {
        const groupsData = await groupApi.list();
        setGroups(groupsData);
      } catch { /* groups not critical */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLinkTuya = async () => {
    try {
      setLinking(true);
      setError(null);
      await tuyaApi.link();
      setTuyaLinked(true);
      const devicesData = await tuyaApi.getDevices();
      setDevices(devicesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect.');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkTuya = async () => {
    if (!confirm('Disconnect SmartLife?')) return;
    await tuyaApi.unlink();
    setTuyaLinked(false);
    setDevices([]);
  };

  const handleRefreshDevices = async () => {
    setRefreshing(true);
    try {
      const devicesData = await tuyaApi.getDevices();
      setDevices(devicesData);
    } catch {} finally {
      setRefreshing(false);
    }
  };

  const handleSaveGroup = async (name: string, deviceIds: string[]) => {
    try {
      if (editingGroup) {
        const updated = await groupApi.update(editingGroup.id, { name, deviceIds });
        setGroups(prev => prev.map(g => g.id === editingGroup.id ? updated : g));
      } else {
        const created = await groupApi.create(name, deviceIds);
        setGroups(prev => [...prev, created]);
      }
      setShowGroupModal(false);
      setEditingGroup(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group');
    }
  };

  const handleDeleteGroup = async (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this group?')) return;
    try {
      await groupApi.delete(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
    }
  };

  const handleToggleSchedule = async (scheduleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await scheduleApi.toggle(scheduleId);
    setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, enabled: result.enabled } : s));
  };

  const handleDeleteSchedule = async (scheduleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this schedule?')) return;
    await scheduleApi.delete(scheduleId);
    setSchedules(prev => prev.filter(s => s.id !== scheduleId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-md border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-2">
              <Timer className="h-6 w-6 text-blue-500" />
              <span className="text-lg font-bold">AutoTimer</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 hidden sm:block">{user?.email}</span>
              <button
                onClick={async () => { await signOut(); navigate('/'); }}
                className="p-2 text-gray-500 hover:text-gray-300 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-24">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-400 text-sm">{error}</div>
        )}

        {/* Connection status */}
        <div className={`p-4 rounded-xl border ${tuyaLinked ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-amber-950/30 border-amber-800/50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {tuyaLinked ? <Wifi className="h-5 w-5 text-emerald-500" /> : <WifiOff className="h-5 w-5 text-amber-500" />}
              <div>
                <p className={`text-sm font-medium ${tuyaLinked ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {tuyaLinked ? 'SmartLife Connected' : 'SmartLife Not Connected'}
                </p>
                <p className="text-xs text-gray-500">
                  {tuyaLinked ? `${devices.length} device${devices.length !== 1 ? 's' : ''} found` : 'Connect to control your devices'}
                </p>
              </div>
            </div>
            {tuyaLinked ? (
              <button onClick={handleUnlinkTuya} className="text-xs text-gray-500 hover:text-red-400 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-red-800 transition-colors">
                <Unlink className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button onClick={handleLinkTuya} disabled={linking} className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all">
                {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
                Connect
              </button>
            )}
          </div>
        </div>

        {/* Device Groups */}
        {devices.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Groups</h2>
              <button
                onClick={() => { setEditingGroup(null); setShowGroupModal(true); }}
                className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> New Group
              </button>
            </div>
            {groups.length === 0 ? (
              <div className="rounded-xl border border-gray-800 border-dashed p-4 text-center">
                <p className="text-xs text-gray-600">No groups yet. Create one to control multiple devices at once.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {groups.map((group) => {
                  const deviceCount = group.deviceIds.filter(id => devices.some(d => d.id === id)).length;
                  return (
                    <button
                      key={group.id}
                      onClick={() => setControlGroup(group)}
                      className="p-3 rounded-xl border bg-gray-900/60 border-gray-800 hover:border-purple-700 hover:bg-gray-800/60 text-left transition-all active:scale-[0.97] cursor-pointer relative group/card"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-purple-600/20 text-purple-400">
                          <Layers className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-200 truncate">{group.name}</h4>
                          <p className="text-xs text-gray-600 mt-0.5">{deviceCount} device{deviceCount !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      {/* Edit/Delete on hover */}
                      <div className="absolute top-1 right-1 hidden group-hover/card:flex gap-0.5">
                        <span
                          onClick={(e) => { e.stopPropagation(); setEditingGroup(group); setShowGroupModal(true); }}
                          className="p-1 text-gray-600 hover:text-blue-400 rounded cursor-pointer"
                        >
                          <Edit3 className="h-3 w-3" />
                        </span>
                        <span
                          onClick={(e) => handleDeleteGroup(group.id, e)}
                          className="p-1 text-gray-600 hover:text-red-400 rounded cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Devices - tappable for control */}
        {devices.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Devices</h2>
              <button onClick={handleRefreshDevices} disabled={refreshing} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {devices.map((device) => {
                const online = device.attributes?.online !== false;
                return (
                  <button
                    key={device.id}
                    onClick={() => online && setControlDevice(device)}
                    className={`p-3 rounded-xl border text-left transition-all active:scale-[0.97] ${
                      online
                        ? 'bg-gray-900/60 border-gray-800 hover:border-blue-700 hover:bg-gray-800/60 cursor-pointer'
                        : 'bg-gray-900/30 border-gray-800/50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`p-1.5 rounded-lg ${online ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-800 text-gray-600'}`}>
                        {getDeviceIcon(device)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-200 truncate">{getDeviceDisplayName(device)}</h4>
                        <p className="text-xs text-gray-600 mt-0.5">{getDeviceTypeShort(device)}</p>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${online ? 'bg-emerald-500' : 'bg-gray-700'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-700 mt-2 text-center">Tap a device to control it</p>
          </section>
        )}

        {/* Schedules */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Schedules</h2>
            <span className="text-xs text-gray-600">{schedules.filter(s => s.enabled).length} active</span>
          </div>

          {schedules.length === 0 ? (
            <div className="rounded-xl border border-gray-800 border-dashed p-8 text-center">
              <Calendar className="h-10 w-10 text-gray-700 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-gray-400 mb-1">No schedules yet</h3>
              <p className="text-xs text-gray-600 mb-4">Create a schedule to automate your devices</p>
              <button onClick={() => navigate('/schedule/new')} className="inline-flex items-center gap-1.5 text-blue-500 text-sm font-medium hover:text-blue-400">
                <Plus className="h-4 w-4" /> Create schedule
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  onClick={() => navigate(`/schedule/${schedule.id}`)}
                  className="bg-gray-900/60 rounded-xl border border-gray-800 p-4 hover:border-gray-700 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-medium text-gray-200 truncate">{schedule.name}</h3>
                        <button
                          onClick={(e) => handleToggleSchedule(schedule.id, e)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors flex-shrink-0 ${
                            schedule.enabled
                              ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800/50'
                              : 'bg-gray-800 text-gray-500 border border-gray-700'
                          }`}
                        >
                          {schedule.enabled ? 'On' : 'Off'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{formatDays(schedule.daysOfWeek)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {schedule.timeSlots.slice(0, 4).map((slot) => (
                          <span key={slot.id} className="inline-flex items-center px-2 py-0.5 bg-gray-800 rounded text-[11px] text-gray-400 font-mono">
                            {slot.startTime}
                          </span>
                        ))}
                        {schedule.timeSlots.length > 4 && <span className="text-[11px] text-gray-600">+{schedule.timeSlots.length - 4}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => handleDeleteSchedule(schedule.id, e)} className="p-1.5 text-gray-700 hover:text-red-500 rounded-lg transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-gray-700" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-20">
        <button
          onClick={() => navigate('/schedule/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-full font-medium hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-600/30"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">New Schedule</span>
        </button>
      </div>

      {/* Device Control Modal */}
      {controlDevice && (
        <DeviceControl
          device={controlDevice}
          allDevices={devices}
          schedules={schedules}
          onClose={() => setControlDevice(null)}
        />
      )}

      {/* Group Control Modal */}
      {controlGroup && (
        <GroupControl
          group={controlGroup}
          devices={devices}
          onClose={() => setControlGroup(null)}
        />
      )}

      {/* Group Create/Edit Modal */}
      {showGroupModal && (
        <GroupModal
          devices={devices}
          existing={editingGroup}
          onSave={handleSaveGroup}
          onClose={() => { setShowGroupModal(false); setEditingGroup(null); }}
        />
      )}
    </div>
  );
}

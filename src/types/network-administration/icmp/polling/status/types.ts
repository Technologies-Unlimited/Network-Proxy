export type DeviceStatus = 'online' | 'offline' | 'unknown'

export interface ICMPPollingStatusFields {
  uptime?: number
  downtime?: number
  deviceStatus: DeviceStatus
}

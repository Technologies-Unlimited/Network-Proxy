export type DeviceStatus = 'online' | 'offline' | 'unknown'

export interface SNMPPollingStatusFields {
  uptime: number
  downtime: number
  deviceStatus: DeviceStatus
}

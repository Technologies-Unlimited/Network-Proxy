export interface TimeInterval {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export interface ICMPPollingTemplateFields {
  name: string
  description: string
  frequency: number
  timeout: number
  retries: number
  pollingFrequency: TimeInterval
  downtimeTrigger: TimeInterval
}

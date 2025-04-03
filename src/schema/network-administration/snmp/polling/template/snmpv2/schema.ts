/**
 * SNMPv2 Polling Template Schema
 * Defines the structure for SNMPv2 polling template data with SQLite
 */

import {
  SNMPPollingTemplateFields,
  TimeInterval,
} from '../../../../../../types/network-administration/snmp/polling/template/types'

/**
 * Extended interface for SNMPv2 polling template that includes all fields needed for storage
 */
export interface ExtendedSNMPv2PollingTemplateFields
  extends SNMPPollingTemplateFields {
  _id: string
  companyId: string
  createdAt: number
}

/**
 * SQLite table schema for SNMPv2 polling templates
 * This is implemented in the database/index.ts file
 */
export const snmpv2PollingTemplateTableSchema = `
  CREATE TABLE IF NOT EXISTS snmpv2_polling_templates (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    frequency INTEGER NOT NULL,
    timeout INTEGER NOT NULL,
    retries INTEGER NOT NULL,
    polling_frequency_days INTEGER NOT NULL,
    polling_frequency_hours INTEGER NOT NULL,
    polling_frequency_minutes INTEGER NOT NULL,
    polling_frequency_seconds INTEGER NOT NULL,
    downtime_trigger_days INTEGER NOT NULL,
    downtime_trigger_hours INTEGER NOT NULL,
    downtime_trigger_minutes INTEGER NOT NULL,
    downtime_trigger_seconds INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE
  );
`

/**
 * Helper function to convert a time interval to individual columns
 */
export function timeIntervalToColumns(interval: TimeInterval): {
  days: number
  hours: number
  minutes: number
  seconds: number
} {
  return {
    days: interval.days,
    hours: interval.hours,
    minutes: interval.minutes,
    seconds: interval.seconds,
  }
}

/**
 * Helper function to convert columns back to a TimeInterval object
 */
export function columnsToTimeInterval(
  days: number,
  hours: number,
  minutes: number,
  seconds: number
): TimeInterval {
  return { days, hours, minutes, seconds }
}

/**
 * SNMP Polling Status Schema
 * Defines the structure for SNMP polling status data with SQLite
 */

import {
  SNMPPollingStatusFields,
  DeviceStatus,
} from '../../../../../types/network-administration/snmp/polling/status/types'

/**
 * Extended interface for SNMP polling status that includes all fields needed for storage
 */
export interface ExtendedSNMPPollingStatusFields
  extends SNMPPollingStatusFields {
  _id: string
  companyId: string
  snmpPollingTemplateId: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  stockIds?: string[]
  networkInventoryIds?: string[]
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for SNMP polling status
 * This is implemented in the database/index.ts file
 */
export const snmpPollingStatusTableSchema = `
  CREATE TABLE IF NOT EXISTS snmp_polling_status (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    snmp_polling_template_id TEXT NOT NULL,
    manufacturer_id TEXT,
    model_name_id TEXT,
    product_id TEXT,
    uptime INTEGER,
    downtime INTEGER,
    device_status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE,
    FOREIGN KEY (snmp_polling_template_id) REFERENCES snmp_polling_templates(_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS snmp_polling_status_stock (
    snmp_polling_status_id TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    PRIMARY KEY (snmp_polling_status_id, stock_id),
    FOREIGN KEY (snmp_polling_status_id) REFERENCES snmp_polling_status(_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS snmp_polling_status_network_inventory (
    snmp_polling_status_id TEXT NOT NULL,
    network_inventory_id TEXT NOT NULL,
    PRIMARY KEY (snmp_polling_status_id, network_inventory_id),
    FOREIGN KEY (snmp_polling_status_id) REFERENCES snmp_polling_status(_id) ON DELETE CASCADE
  );
`

// Export constant for valid device status values
export const DEVICE_STATUS_VALUES: DeviceStatus[] = [
  'online',
  'offline',
  'unknown',
]

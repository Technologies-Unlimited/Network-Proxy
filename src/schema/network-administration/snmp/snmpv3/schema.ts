/**
 * SNMPv3 Schema
 * Defines the structure for SNMPv3 data with SQLite
 */

import { SNMPv3Fields } from '../../../../types/network-administration/snmp/snmpv3/types'

/**
 * Extended interface for SNMPv3 that includes all fields needed for storage
 */
export interface ExtendedSNMPv3Fields extends SNMPv3Fields {
  _id: string
  companyId: string
  manufacturerId?: string
  modelId?: string
  productId?: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for SNMPv3 settings
 * This is implemented in the database/index.ts file
 */
export const snmpv3TableSchema = `
  CREATE TABLE IF NOT EXISTS snmpv3_settings (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    manufacturer_id TEXT,
    model_id TEXT,
    product_id TEXT,
    community_name TEXT NOT NULL,
    user_name TEXT NOT NULL,
    auth_method TEXT NOT NULL,
    auth_password TEXT NOT NULL,
    encryption_method TEXT NOT NULL,
    encryption_password TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const snmpv3Indexes = `
  CREATE INDEX IF NOT EXISTS idx_snmpv3_company ON snmpv3_settings(company_id);
  CREATE INDEX IF NOT EXISTS idx_snmpv3_user_name ON snmpv3_settings(user_name);
`

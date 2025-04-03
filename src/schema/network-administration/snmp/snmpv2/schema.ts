/**
 * SNMPv2 Schema
 * Defines the structure for SNMPv2 data with SQLite
 */

import { SNMPv2Fields } from '../../../../types/network-administration/snmp/snmpv2/types'

/**
 * Extended interface for SNMPv2 that includes all fields needed for storage
 */
export interface ExtendedSNMPv2Fields extends SNMPv2Fields {
  _id: string
  companyId: string
  manufacturerId?: string
  modelId?: string
  productId?: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for SNMPv2 settings
 * This is implemented in the database/index.ts file
 */
export const snmpv2TableSchema = `
  CREATE TABLE IF NOT EXISTS snmpv2_settings (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    manufacturer_id TEXT,
    model_id TEXT,
    product_id TEXT,
    community_name TEXT NOT NULL,
    read_community TEXT NOT NULL,
    write_community TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const snmpv2Indexes = `
  CREATE INDEX IF NOT EXISTS idx_snmpv2_company ON snmpv2_settings(company_id);
  CREATE INDEX IF NOT EXISTS idx_snmpv2_community_name ON snmpv2_settings(community_name);
`

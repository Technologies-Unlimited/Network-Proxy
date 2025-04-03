/**
 * SNMP OID Schema
 * Defines the structure for SNMP OID data with SQLite
 */

import { OIDFields } from '../../../../types/network-administration/snmp/oid/types'

/**
 * Extended interface for SNMP OID that includes all fields needed for storage
 */
export interface ExtendedOIDFields extends OIDFields {
  _id: string
  companyId: string
  manufacturerId?: string
  modelId?: string
  productId?: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for SNMP OIDs
 * This is implemented in the database/index.ts file
 */
export const oidTableSchema = `
  CREATE TABLE IF NOT EXISTS snmp_oids (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    manufacturer_id TEXT,
    model_id TEXT,
    product_id TEXT,
    oid_name TEXT NOT NULL,
    oid TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const oidIndexes = `
  CREATE INDEX IF NOT EXISTS idx_snmp_oid_company ON snmp_oids(company_id);
  CREATE INDEX IF NOT EXISTS idx_snmp_oid_name ON snmp_oids(oid_name);
`

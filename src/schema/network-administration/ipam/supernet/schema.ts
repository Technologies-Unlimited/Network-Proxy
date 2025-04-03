/**
 * IP Supernet Schema
 * Defines the structure for IP supernet data with SQLite
 */

import { SupernetFields } from '../../../../types/network-administration/ipam/supernet/types'

/**
 * Extended interface for IP supernet that includes all fields needed for storage
 */
export interface ExtendedSupernetFields extends SupernetFields {
  _id: string
  companyId: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for IP supernets
 * This is implemented in the database/index.ts file
 */
export const supernetTableSchema = `
  CREATE TABLE IF NOT EXISTS ip_supernets (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    cidr TEXT NOT NULL,
    supernet_address TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const supernetIndexes = `
  CREATE INDEX IF NOT EXISTS idx_ip_supernet_company ON ip_supernets(company_id);
  CREATE INDEX IF NOT EXISTS idx_ip_supernet_cidr ON ip_supernets(cidr);
`

/**
 * IP Subnet Schema
 * Defines the structure for IP subnet data with SQLite
 */

import { SubnetFields } from '../../../../types/network-administration/ipam/subnet/types'

/**
 * Extended interface for IP subnet that includes all fields needed for storage
 */
export interface ExtendedSubnetFields extends SubnetFields {
  _id: string
  companyId: string
  supernetId: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for IP subnets
 * This is implemented in the database/index.ts file
 */
export const subnetTableSchema = `
  CREATE TABLE IF NOT EXISTS ip_subnets (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cidr TEXT NOT NULL,
    subnet_address TEXT NOT NULL,
    gateway TEXT NOT NULL,
    description TEXT NOT NULL,
    supernet_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE,
    FOREIGN KEY (supernet_id) REFERENCES ip_supernets(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const subnetIndexes = `
  CREATE INDEX IF NOT EXISTS idx_ip_subnet_company ON ip_subnets(company_id);
  CREATE INDEX IF NOT EXISTS idx_ip_subnet_supernet ON ip_subnets(supernet_id);
  CREATE INDEX IF NOT EXISTS idx_ip_subnet_cidr ON ip_subnets(cidr);
`

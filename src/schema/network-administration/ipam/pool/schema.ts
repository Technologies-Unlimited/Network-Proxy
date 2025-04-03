/**
 * IP Pool Schema
 * Defines the structure for IP pool data with SQLite
 */

import { PoolFields } from '../../../../types/network-administration/ipam/pool/types'

/**
 * Extended interface for IP pool that includes all fields needed for storage
 */
export interface ExtendedPoolFields extends PoolFields {
  _id: string
  companyId: string
  subnetId: string
  supernetId: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for IP pools
 * This is implemented in the database/index.ts file
 */
export const poolTableSchema = `
  CREATE TABLE IF NOT EXISTS ip_pools (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_ip TEXT NOT NULL,
    end_ip TEXT NOT NULL,
    description TEXT NOT NULL,
    subnet_id TEXT NOT NULL,
    supernet_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE,
    FOREIGN KEY (subnet_id) REFERENCES ip_subnets(_id) ON DELETE CASCADE,
    FOREIGN KEY (supernet_id) REFERENCES ip_supernets(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const poolIndexes = `
  CREATE INDEX IF NOT EXISTS idx_ip_pool_company ON ip_pools(company_id);
  CREATE INDEX IF NOT EXISTS idx_ip_pool_subnet ON ip_pools(subnet_id);
  CREATE INDEX IF NOT EXISTS idx_ip_pool_supernet ON ip_pools(supernet_id);
`

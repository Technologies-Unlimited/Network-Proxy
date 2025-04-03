/**
 * VLAN Schema
 * Defines the structure for VLAN data with SQLite
 */

import { VLANFields } from '../../../../types/network-administration/ipam/vlan/types'

/**
 * Extended interface for VLAN that includes all fields needed for storage
 */
export interface ExtendedVLANFields extends VLANFields {
  _id: string
  companyId: string
  subnetId?: string
  supernetId?: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for VLANs
 * This is implemented in the database/index.ts file
 */
export const vlanTableSchema = `
  CREATE TABLE IF NOT EXISTS vlans (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subnet_id TEXT,
    supernet_id TEXT,
    tagged INTEGER NOT NULL DEFAULT 0,
    untagged INTEGER NOT NULL DEFAULT 0,
    vlan_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE,
    FOREIGN KEY (subnet_id) REFERENCES ip_subnets(_id) ON DELETE SET NULL,
    FOREIGN KEY (supernet_id) REFERENCES ip_supernets(_id) ON DELETE SET NULL
  );
`

/**
 * Create indexes for faster lookups
 */
export const vlanIndexes = `
  CREATE INDEX IF NOT EXISTS idx_vlan_company ON vlans(company_id);
  CREATE INDEX IF NOT EXISTS idx_vlan_number ON vlans(vlan_number);
`

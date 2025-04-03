/**
 * IP Address Schema
 * Defines the structure for IP address data with SQLite
 */

import { IPAddressFields } from '../../../../types/network-administration/ipam/ipaddress/types'

/**
 * Extended interface for IP address that includes all fields needed for storage
 */
export interface ExtendedIPAddressFields extends IPAddressFields {
  _id: string
  companyId: string
  networkInventoryId?: string
  poolId: string
  subnetId: string
  supernetId: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for IP addresses
 * This is implemented in the database/index.ts file
 */
export const ipAddressTableSchema = `
  CREATE TABLE IF NOT EXISTS ip_addresses (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    address TEXT NOT NULL,
    description TEXT,
    is_used INTEGER NOT NULL DEFAULT 0,
    network_inventory_id TEXT,
    pool_id TEXT NOT NULL,
    subnet_id TEXT NOT NULL,
    supernet_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE,
    FOREIGN KEY (network_inventory_id) REFERENCES company_network_inventory(_id) ON DELETE SET NULL,
    FOREIGN KEY (pool_id) REFERENCES ip_pools(_id) ON DELETE CASCADE,
    FOREIGN KEY (subnet_id) REFERENCES ip_subnets(_id) ON DELETE CASCADE,
    FOREIGN KEY (supernet_id) REFERENCES ip_supernets(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const ipAddressIndexes = `
  CREATE INDEX IF NOT EXISTS idx_ip_address_company ON ip_addresses(company_id);
  CREATE INDEX IF NOT EXISTS idx_ip_address_address ON ip_addresses(address);
  CREATE INDEX IF NOT EXISTS idx_ip_address_is_used ON ip_addresses(is_used);
`

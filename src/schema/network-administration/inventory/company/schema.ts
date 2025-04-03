/**
 * Company Network Inventory Schema
 * Defines the structure for company network inventory data with SQLite
 */

import { CompanyNetworkInventoryFields } from '../../../../types/network-administration/inventory/company/types'

/**
 * Extended interface for company network inventory that includes all fields needed for storage
 */
export interface ExtendedCompanyNetworkInventoryFields
  extends CompanyNetworkInventoryFields {
  _id: string
  companyId: string
  productId: string
  stockId: string
  manufacturerId: string
  modelId: string
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for company network inventory
 * This is implemented in the database/index.ts file
 */
export const companyNetworkInventoryTableSchema = `
  CREATE TABLE IF NOT EXISTS company_network_inventory (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    mac_address TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    manufacturer_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const companyNetworkInventoryIndexes = `
  CREATE INDEX IF NOT EXISTS idx_company_network_inventory_company ON company_network_inventory(company_id);
  CREATE INDEX IF NOT EXISTS idx_company_network_inventory_mac ON company_network_inventory(mac_address);
`

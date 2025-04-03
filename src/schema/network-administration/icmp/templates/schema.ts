/**
 * ICMP Monitoring Template Schema
 * Defines the structure for ICMP monitoring template data with SQLite
 */

import { ICMPMonitoringTemplateFields } from '../../../../types/network-administration/icmp/templates/types'

/**
 * Extended interface for ICMP monitoring template that includes all fields needed for storage
 */
export interface ExtendedICMPMonitoringTemplateFields
  extends ICMPMonitoringTemplateFields {
  _id: string
  companyId: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  stockIds?: string[]
  networkInventoryIds?: string[]
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for ICMP monitoring templates
 * This is implemented in the database/index.ts file
 */
export const icmpMonitoringTemplateTableSchema = `
  CREATE TABLE IF NOT EXISTS icmp_monitoring_templates (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    template_description TEXT NOT NULL,
    icmp_loss_threshold REAL NOT NULL,
    icmp_latency_threshold REAL NOT NULL,
    manufacturer_id TEXT,
    model_name_id TEXT,
    product_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS icmp_monitoring_template_stock (
    icmp_monitoring_template_id TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    PRIMARY KEY (icmp_monitoring_template_id, stock_id),
    FOREIGN KEY (icmp_monitoring_template_id) REFERENCES icmp_monitoring_templates(_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS icmp_monitoring_template_network_inventory (
    icmp_monitoring_template_id TEXT NOT NULL,
    network_inventory_id TEXT NOT NULL,
    PRIMARY KEY (icmp_monitoring_template_id, network_inventory_id),
    FOREIGN KEY (icmp_monitoring_template_id) REFERENCES icmp_monitoring_templates(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const icmpMonitoringTemplateIndexes = `
  CREATE INDEX IF NOT EXISTS idx_icmp_monitoring_template_company ON icmp_monitoring_templates(company_id);
`

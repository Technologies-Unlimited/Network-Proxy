/**
 * SNMPv2 Template Schema
 * Defines the structure for SNMPv2 template data with SQLite
 */

import { SNMPMonitoringFields } from '../../../../../types/network-administration/snmp/templates/types'

/**
 * Extended interface for SNMPv2 template that includes all fields needed for storage
 */
export interface SNMPv2TemplateFields extends SNMPMonitoringFields {
  _id: string
  companyId: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  snmpv2SettingId: string
  oidIds?: string[]
  stockIds?: string[]
  networkInventoryIds?: string[]
  createdAt: number
  updatedAt: number
}

/**
 * SQLite table schema for SNMPv2 templates
 * This is implemented in the database/index.ts file
 */
export const snmpv2TemplateTableSchema = `
  CREATE TABLE IF NOT EXISTS snmpv2_templates (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    manufacturer_id TEXT,
    model_name_id TEXT,
    product_id TEXT,
    snmpv2_setting_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(_id) ON DELETE CASCADE,
    FOREIGN KEY (snmpv2_setting_id) REFERENCES snmpv2_settings(_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS snmpv2_template_oids (
    snmpv2_template_id TEXT NOT NULL,
    oid_id TEXT NOT NULL,
    PRIMARY KEY (snmpv2_template_id, oid_id),
    FOREIGN KEY (snmpv2_template_id) REFERENCES snmpv2_templates(_id) ON DELETE CASCADE,
    FOREIGN KEY (oid_id) REFERENCES snmp_oids(_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS snmpv2_template_stock (
    snmpv2_template_id TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    PRIMARY KEY (snmpv2_template_id, stock_id),
    FOREIGN KEY (snmpv2_template_id) REFERENCES snmpv2_templates(_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS snmpv2_template_network_inventory (
    snmpv2_template_id TEXT NOT NULL,
    network_inventory_id TEXT NOT NULL,
    PRIMARY KEY (snmpv2_template_id, network_inventory_id),
    FOREIGN KEY (snmpv2_template_id) REFERENCES snmpv2_templates(_id) ON DELETE CASCADE
  );
`

/**
 * Create indexes for faster lookups
 */
export const snmpv2TemplateIndexes = `
  CREATE INDEX IF NOT EXISTS idx_snmpv2_template_company ON snmpv2_templates(company_id);
  CREATE INDEX IF NOT EXISTS idx_snmpv2_template_setting ON snmpv2_templates(snmpv2_setting_id);
`

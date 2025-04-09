'use server'

/**
 * SQLite database implementation for Network-Proxy
 * Provides persistent storage for ICMP and SNMP polling data
 */

import { Database } from 'bun:sqlite'
import { join } from 'path'

// Import all schema definitions
import { icmpPollingStatusTableSchema } from '../schema/network-administration/icmp/polling/status/schema'
import { snmpPollingStatusTableSchema } from '../schema/network-administration/snmp/polling/status/schema'
import { icmpPollingTemplateTableSchema } from '../schema/network-administration/icmp/polling/template/schema'
import {
  icmpMonitoringTemplateTableSchema,
  icmpMonitoringTemplateIndexes,
} from '../schema/network-administration/icmp/templates/schema'
import { snmpv2PollingTemplateTableSchema } from '../schema/network-administration/snmp/polling/template/snmpv2/schema'
import { snmpv3PollingTemplateTableSchema } from '../schema/network-administration/snmp/polling/template/snmpv3/schema'
import {
  snmpv2TemplateTableSchema,
  snmpv2TemplateIndexes,
} from '../schema/network-administration/snmp/templates/snmpv2/schema'
import {
  snmpv3TemplateTableSchema,
  snmpv3TemplateIndexes,
} from '../schema/network-administration/snmp/templates/snmpv3/schema'
import {
  companyNetworkInventoryTableSchema,
  companyNetworkInventoryIndexes,
} from '../schema/network-administration/inventory/company/schema'
import {
  ipAddressTableSchema,
  ipAddressIndexes,
} from '../schema/network-administration/ipam/ipaddress/schema'
import {
  poolTableSchema,
  poolIndexes,
} from '../schema/network-administration/ipam/pool/schema'
import {
  subnetTableSchema,
  subnetIndexes,
} from '../schema/network-administration/ipam/subnet/schema'
import {
  supernetTableSchema,
  supernetIndexes,
} from '../schema/network-administration/ipam/supernet/schema'
import {
  vlanTableSchema,
  vlanIndexes,
} from '../schema/network-administration/ipam/vlan/schema'
import {
  oidTableSchema,
  oidIndexes,
} from '../schema/network-administration/snmp/oid/schema'
import {
  snmpv2TableSchema,
  snmpv2Indexes,
} from '../schema/network-administration/snmp/snmpv2/schema'
import {
  snmpv3TableSchema,
  snmpv3Indexes,
} from '../schema/network-administration/snmp/snmpv3/schema'

// Define the path to the SQLite database file
const DB_PATH =
  process.env.SQLITE_DB_PATH || join(process.cwd(), 'network-proxy.db')

// Define database schema version for migrations
const SCHEMA_VERSION = 4 // Increment version to trigger migration with all new tables

// Create and initialize the database
export function initDatabase() {
  console.log(`Initializing SQLite database at: ${DB_PATH}`)

  // Create a new database connection
  const db = new Database(DB_PATH, { create: true })

  // Enable WAL mode for better performance
  db.run('PRAGMA journal_mode = WAL;')

  // Enable foreign key constraints
  db.run('PRAGMA foreign_keys = ON;')

  // Create a version table to track schema versions
  db.run(`
    CREATE TABLE IF NOT EXISTS version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );
  `)

  // Get current schema version
  const versionRow = db
    .query('SELECT version FROM version WHERE id = 1')
    .get() as { version: number } | undefined
  const currentVersion = versionRow ? versionRow.version : 0

  // Apply migrations if needed
  if (currentVersion < SCHEMA_VERSION) {
    console.log(
      `Upgrading database schema from version ${currentVersion} to ${SCHEMA_VERSION}`
    )

    // Apply migrations within a transaction
    const migration = db.transaction(() => {
      // Create tables if they don't exist

      // Companies table
      db.run(`
        CREATE TABLE IF NOT EXISTS companies (
          _id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `)

      // Execute ICMP schema creation statements
      db.run(icmpPollingTemplateTableSchema)
      db.run(icmpPollingStatusTableSchema)
      db.run(icmpMonitoringTemplateTableSchema)

      // Execute SNMP schema creation statements
      db.run(snmpv2PollingTemplateTableSchema)
      db.run(snmpv3PollingTemplateTableSchema)
      db.run(snmpPollingStatusTableSchema)
      db.run(snmpv2TemplateTableSchema)
      db.run(snmpv3TemplateTableSchema)
      db.run(oidTableSchema)
      db.run(snmpv2TableSchema)
      db.run(snmpv3TableSchema)

      // Execute Network Inventory schema creation statements
      db.run(companyNetworkInventoryTableSchema)

      // Execute IPAM schema creation statements
      db.run(ipAddressTableSchema)
      db.run(supernetTableSchema)
      db.run(subnetTableSchema)
      db.run(poolTableSchema)
      db.run(vlanTableSchema)

      // Create indexes for performance
      db.run(
        'CREATE INDEX IF NOT EXISTS idx_icmp_polling_status_company ON icmp_polling_status(company_id);'
      )
      db.run(
        'CREATE INDEX IF NOT EXISTS idx_snmp_polling_status_company ON snmp_polling_status(company_id);'
      )
      db.run(icmpMonitoringTemplateIndexes)
      db.run(snmpv2TemplateIndexes)
      db.run(snmpv3TemplateIndexes)
      db.run(companyNetworkInventoryIndexes)
      db.run(ipAddressIndexes)
      db.run(supernetIndexes)
      db.run(subnetIndexes)
      db.run(poolIndexes)
      db.run(vlanIndexes)
      db.run(oidIndexes)
      db.run(snmpv2Indexes)
      db.run(snmpv3Indexes)

      // Update schema version
      if (currentVersion === 0) {
        db.run('INSERT INTO version (id, version) VALUES (1, ?)', [
          SCHEMA_VERSION,
        ])
      } else {
        db.run('UPDATE version SET version = ? WHERE id = 1', [SCHEMA_VERSION])
      }
    })

    // Execute the migration
    migration()

    console.log('Database schema updated successfully')
  } else {
    console.log('Database schema is up to date')
  }

  return db
}

// Create a singleton database instance
let _db: Database | null = null

export function getDatabase(): Database {
  if (!_db) {
    _db = initDatabase()
  }
  return _db
}

// Clean up database connection when the application exits
process.on('exit', () => {
  if (_db) {
    console.log('Closing database connection')
    _db.close()
    _db = null
  }
})

// Generate a UUID for use as primary keys
export function generateId(): string {
  return crypto.randomUUID()
}

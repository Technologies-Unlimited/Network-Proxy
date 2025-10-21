/**
 * ICMP Monitor Schema
 * Defines the structure for continuous ICMP monitoring
 */

import { z } from 'zod'
import { Database } from 'bun:sqlite'
import crypto from 'crypto'
import fs from 'node:fs'
import path from 'node:path'

let db: Database | null = null

/**
 * Get or create the database instance
 */
export function getDatabase(): Database {
  if (!db) {
    // Create database in the data directory
    const dbPath = './data/network-proxy.db'

    // Ensure data directory exists
    const dataDir = path.dirname(dbPath)

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    db = new Database(dbPath)

    // Enable foreign keys
    db.exec('PRAGMA foreign_keys = ON')

    console.log('Database initialized:', dbPath)
  }

  return db
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('Database closed')
  }
}

// Monitor status enum
export const MONITOR_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DISABLED: 'disabled',
} as const

export type MonitorStatus = (typeof MONITOR_STATUS)[keyof typeof MONITOR_STATUS]

// Alert severity enum
export const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const

export type AlertSeverity = (typeof ALERT_SEVERITY)[keyof typeof ALERT_SEVERITY]

// Zod schema for ICMP monitor
export const icmpMonitorSchema = z.object({
  _id: z.string(),
  companyId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  ipAddress: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/),
  networkInventoryId: z.string().optional(),

  // Monitoring parameters
  interval: z.number().min(10).max(3600), // seconds between pings
  timeout: z.number().min(1).max(60), // seconds to wait for response
  packetSize: z.number().min(8).max(65507).default(32),
  packetCount: z.number().min(1).max(10).default(3),

  // Thresholds
  lossThreshold: z.number().min(0).max(100), // percentage
  latencyWarningThreshold: z.number().min(0), // milliseconds
  latencyCriticalThreshold: z.number().min(0), // milliseconds

  // State
  status: z.enum(['active', 'paused', 'disabled']),
  lastCheck: z.number().optional(), // timestamp
  lastStatus: z.enum(['up', 'down', 'unknown']).optional(),

  // Timestamps
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type ICMPMonitorFields = z.infer<typeof icmpMonitorSchema>

// Monitor history schema
export const icmpMonitorHistorySchema = z.object({
  _id: z.string(),
  monitorId: z.string(),
  timestamp: z.number(),

  // Results
  status: z.enum(['up', 'down']),
  responseTime: z.number().nullable(), // milliseconds, null if down
  packetLoss: z.number(), // percentage

  // Details
  packetsTransmitted: z.number(),
  packetsReceived: z.number(),
  minLatency: z.number().nullable(),
  maxLatency: z.number().nullable(),
  avgLatency: z.number().nullable(),
  standardDeviation: z.number().nullable(),
})

export type ICMPMonitorHistoryFields = z.infer<typeof icmpMonitorHistorySchema>

// Alert rule schema
export const icmpAlertRuleSchema = z.object({
  _id: z.string(),
  companyId: z.string(),
  monitorId: z.string(),
  name: z.string(),
  description: z.string().optional(),

  // Conditions
  condition: z.enum(['down', 'high_latency', 'packet_loss']),
  threshold: z.number(), // depends on condition
  duration: z.number(), // how long condition must persist (seconds)

  // Actions
  severity: z.enum(['info', 'warning', 'critical']),
  enabled: z.boolean(),

  // Notification settings
  notificationChannels: z.array(z.string()).optional(), // email, slack, webhook IDs

  // Timestamps
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type ICMPAlertRuleFields = z.infer<typeof icmpAlertRuleSchema>

// Alert history schema
export const icmpAlertHistorySchema = z.object({
  _id: z.string(),
  alertRuleId: z.string(),
  monitorId: z.string(),

  // Alert details
  triggeredAt: z.number(),
  resolvedAt: z.number().nullable(),
  severity: z.enum(['info', 'warning', 'critical']),

  // Condition that triggered
  condition: z.string(),
  value: z.number(),
  threshold: z.number(),

  // Notification status
  notificationsSent: z.array(
    z.object({
      channel: z.string(),
      sentAt: z.number(),
      status: z.enum(['success', 'failed']),
      error: z.string().optional(),
    })
  ),
})

export type ICMPAlertHistoryFields = z.infer<typeof icmpAlertHistorySchema>

// SQL table schemas
export const icmpMonitorTableSchema = `
  CREATE TABLE IF NOT EXISTS icmp_monitors (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    ip_address TEXT NOT NULL,
    network_inventory_id TEXT,
    
    -- Monitoring parameters
    interval INTEGER NOT NULL,
    timeout INTEGER NOT NULL,
    packet_size INTEGER NOT NULL DEFAULT 32,
    packet_count INTEGER NOT NULL DEFAULT 3,
    
    -- Thresholds
    loss_threshold REAL NOT NULL,
    latency_warning_threshold REAL NOT NULL,
    latency_critical_threshold REAL NOT NULL,
    
    -- State
    status TEXT NOT NULL DEFAULT 'active',
    last_check INTEGER,
    last_status TEXT,
    
    -- Timestamps
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY (company_id) REFERENCES companies(_id),
    FOREIGN KEY (network_inventory_id) REFERENCES company_network_inventory(_id)
  );
`

export const icmpMonitorHistoryTableSchema = `
  CREATE TABLE IF NOT EXISTS icmp_monitor_history (
    _id TEXT PRIMARY KEY,
    monitor_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    
    -- Results
    status TEXT NOT NULL,
    response_time REAL,
    packet_loss REAL NOT NULL,
    
    -- Details
    packets_transmitted INTEGER NOT NULL,
    packets_received INTEGER NOT NULL,
    min_latency REAL,
    max_latency REAL,
    avg_latency REAL,
    standard_deviation REAL,
    
    FOREIGN KEY (monitor_id) REFERENCES icmp_monitors(_id) ON DELETE CASCADE
  );
`

export const icmpAlertRuleTableSchema = `
  CREATE TABLE IF NOT EXISTS icmp_alert_rules (
    _id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    monitor_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Conditions
    condition TEXT NOT NULL,
    threshold REAL NOT NULL,
    duration INTEGER NOT NULL,
    
    -- Actions
    severity TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    
    -- Timestamps
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY (company_id) REFERENCES companies(_id),
    FOREIGN KEY (monitor_id) REFERENCES icmp_monitors(_id) ON DELETE CASCADE
  );
`

export const icmpAlertHistoryTableSchema = `
  CREATE TABLE IF NOT EXISTS icmp_alert_history (
    _id TEXT PRIMARY KEY,
    alert_rule_id TEXT NOT NULL,
    monitor_id TEXT NOT NULL,
    
    -- Alert details
    triggered_at INTEGER NOT NULL,
    resolved_at INTEGER,
    severity TEXT NOT NULL,
    
    -- Condition that triggered
    condition TEXT NOT NULL,
    value REAL NOT NULL,
    threshold REAL NOT NULL,
    
    -- Notification status (stored as JSON)
    notifications_sent TEXT,
    
    FOREIGN KEY (alert_rule_id) REFERENCES icmp_alert_rules(_id),
    FOREIGN KEY (monitor_id) REFERENCES icmp_monitors(_id)
  );
`

// Indexes for performance
export const icmpMonitorIndexes = `
  CREATE INDEX IF NOT EXISTS idx_icmp_monitors_company ON icmp_monitors(company_id);
  CREATE INDEX IF NOT EXISTS idx_icmp_monitors_status ON icmp_monitors(status);
  CREATE INDEX IF NOT EXISTS idx_icmp_monitor_history_monitor ON icmp_monitor_history(monitor_id);
  CREATE INDEX IF NOT EXISTS idx_icmp_monitor_history_timestamp ON icmp_monitor_history(monitor_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_icmp_alert_rules_monitor ON icmp_alert_rules(monitor_id);
  CREATE INDEX IF NOT EXISTS idx_icmp_alert_history_monitor ON icmp_alert_history(monitor_id);
  CREATE INDEX IF NOT EXISTS idx_icmp_alert_history_triggered ON icmp_alert_history(triggered_at);
`

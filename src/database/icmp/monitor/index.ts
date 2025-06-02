/**
 * ICMP Monitor Repository
 * Provides data access methods for continuous ICMP monitoring
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  icmpMonitorTableSchema,
  icmpMonitorHistoryTableSchema,
  icmpAlertRuleTableSchema,
  icmpAlertHistoryTableSchema,
  icmpMonitorIndexes,
  ICMPMonitorFields,
  ICMPMonitorHistoryFields,
  ICMPAlertRuleFields,
  ICMPAlertHistoryFields,
  MonitorStatus,
} from '../../../schema/network-administration/icmp/monitor/schema'

// Database row interfaces (snake_case from database)
interface ICMPMonitorRow {
  _id: string
  company_id: string
  name: string
  description: string | null
  ip_address: string
  network_inventory_id: string | null
  interval: number
  timeout: number
  packet_size: number
  packet_count: number
  loss_threshold: number
  latency_warning_threshold: number
  latency_critical_threshold: number
  status: string
  last_check: number | null
  last_status: string | null
  created_at: number
  updated_at: number
}

interface ICMPMonitorHistoryRow {
  _id: string
  monitor_id: string
  timestamp: number
  status: string
  response_time: number | null
  packet_loss: number
  packets_transmitted: number
  packets_received: number
  min_latency: number | null
  max_latency: number | null
  avg_latency: number | null
  standard_deviation: number | null
}

interface ICMPAlertRuleRow {
  _id: string
  company_id: string
  monitor_id: string
  name: string
  description: string | null
  condition: string
  threshold: number
  duration: number
  severity: string
  enabled: number
  created_at: number
  updated_at: number
}

interface ICMPAlertHistoryRow {
  _id: string
  alert_rule_id: string
  monitor_id: string
  triggered_at: number
  resolved_at: number | null
  severity: string
  condition: string
  value: number
  threshold: number
  notifications_sent: string
}

interface DatabaseResult {
  changes: number
  lastInsertRowid?: number
}

export class ICMPMonitorRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initialize database tables
   */
  initTables(): void {
    // Create dependency tables first
    this.createDependencyTables()
    
    // Execute the schema creation SQL
    this.db.run(icmpMonitorTableSchema)
    this.db.run(icmpMonitorHistoryTableSchema)
    this.db.run(icmpAlertRuleTableSchema)
    this.db.run(icmpAlertHistoryTableSchema)

    // Create indexes
    this.db.run(icmpMonitorIndexes)
  }

  /**
   * Create dependency tables required by ICMP monitors
   */
  private createDependencyTables(): void {
    // Create companies table if it doesn't exist
    this.db.run(`
      CREATE TABLE IF NOT EXISTS companies (
        _id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)

    // Create company_network_inventory table if it doesn't exist
    this.db.run(`
      CREATE TABLE IF NOT EXISTS company_network_inventory (
        _id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        ip_address TEXT,
        device_type TEXT,
        location TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(_id)
      );
    `)

    // Insert default company if it doesn't exist
    const defaultCompanyExists = this.db.query(`
      SELECT COUNT(*) as count FROM companies WHERE _id = ?
    `).get('default-company-id') as { count: number }

    if (defaultCompanyExists.count === 0) {
      const now = Date.now()
      this.db.query(`
        INSERT INTO companies (_id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'default-company-id',
        'Default Company',
        'Default company for ICMP monitoring',
        now,
        now
      )
    }
  }

  // ===== Monitor CRUD Operations =====

  /**
   * Get all monitors for a company
   */
  getMonitorsForCompany(companyId: string): ICMPMonitorFields[] {
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, ip_address, network_inventory_id,
        interval, timeout, packet_size, packet_count,
        loss_threshold, latency_warning_threshold, latency_critical_threshold,
        status, last_check, last_status,
        created_at, updated_at
      FROM icmp_monitors
      WHERE company_id = ?
    `)

    const monitors = stmt.all(companyId) as ICMPMonitorRow[]

    return monitors.map(monitor => ({
      _id: monitor._id,
      companyId: monitor.company_id,
      name: monitor.name,
      description: monitor.description || undefined,
      ipAddress: monitor.ip_address,
      networkInventoryId: monitor.network_inventory_id || undefined,
      interval: monitor.interval,
      timeout: monitor.timeout,
      packetSize: monitor.packet_size,
      packetCount: monitor.packet_count,
      lossThreshold: monitor.loss_threshold,
      latencyWarningThreshold: monitor.latency_warning_threshold,
      latencyCriticalThreshold: monitor.latency_critical_threshold,
      status: monitor.status as MonitorStatus,
      lastCheck: monitor.last_check || undefined,
      lastStatus: monitor.last_status as 'up' | 'down' | 'unknown' | undefined,
      createdAt: monitor.created_at,
      updatedAt: monitor.updated_at,
    }))
  }

  /**
   * Get active monitors that need to be checked
   */
  getActiveMonitors(): ICMPMonitorFields[] {
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, ip_address, network_inventory_id,
        interval, timeout, packet_size, packet_count,
        loss_threshold, latency_warning_threshold, latency_critical_threshold,
        status, last_check, last_status,
        created_at, updated_at
      FROM icmp_monitors
      WHERE status = 'active'
    `)

    const monitors = stmt.all() as ICMPMonitorRow[]

    return monitors.map(monitor => ({
      _id: monitor._id,
      companyId: monitor.company_id,
      name: monitor.name,
      description: monitor.description || undefined,
      ipAddress: monitor.ip_address,
      networkInventoryId: monitor.network_inventory_id || undefined,
      interval: monitor.interval,
      timeout: monitor.timeout,
      packetSize: monitor.packet_size,
      packetCount: monitor.packet_count,
      lossThreshold: monitor.loss_threshold,
      latencyWarningThreshold: monitor.latency_warning_threshold,
      latencyCriticalThreshold: monitor.latency_critical_threshold,
      status: monitor.status as MonitorStatus,
      lastCheck: monitor.last_check || undefined,
      lastStatus: monitor.last_status as 'up' | 'down' | 'unknown' | undefined,
      createdAt: monitor.created_at,
      updatedAt: monitor.updated_at,
    }))
  }

  /**
   * Get a single monitor by ID
   */
  getMonitorById(_id: string, companyId: string): ICMPMonitorFields | null {
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, ip_address, network_inventory_id,
        interval, timeout, packet_size, packet_count,
        loss_threshold, latency_warning_threshold, latency_critical_threshold,
        status, last_check, last_status,
        created_at, updated_at
      FROM icmp_monitors
      WHERE _id = ? AND company_id = ?
    `)

    const monitor = stmt.get(_id, companyId) as ICMPMonitorRow | null

    if (!monitor) return null

    return {
      _id: monitor._id,
      companyId: monitor.company_id,
      name: monitor.name,
      description: monitor.description || undefined,
      ipAddress: monitor.ip_address,
      networkInventoryId: monitor.network_inventory_id || undefined,
      interval: monitor.interval,
      timeout: monitor.timeout,
      packetSize: monitor.packet_size,
      packetCount: monitor.packet_count,
      lossThreshold: monitor.loss_threshold,
      latencyWarningThreshold: monitor.latency_warning_threshold,
      latencyCriticalThreshold: monitor.latency_critical_threshold,
      status: monitor.status as MonitorStatus,
      lastCheck: monitor.last_check || undefined,
      lastStatus: monitor.last_status as 'up' | 'down' | 'unknown' | undefined,
      createdAt: monitor.created_at,
      updatedAt: monitor.updated_at,
    }
  }

  /**
   * Create a new monitor
   */
  createMonitor(
    companyId: string,
    input: Partial<ICMPMonitorFields>
  ): ICMPMonitorFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.name) throw new Error('Monitor name is required')
    if (!input.ipAddress) throw new Error('IP address is required')
    if (input.interval === undefined) throw new Error('Interval is required')
    if (input.timeout === undefined) throw new Error('Timeout is required')
    if (input.lossThreshold === undefined)
      throw new Error('Loss threshold is required')
    if (input.latencyWarningThreshold === undefined)
      throw new Error('Latency warning threshold is required')
    if (input.latencyCriticalThreshold === undefined)
      throw new Error('Latency critical threshold is required')

    this.db
      .query(
        `
      INSERT INTO icmp_monitors (
        _id, company_id, name, description, ip_address, network_inventory_id,
        interval, timeout, packet_size, packet_count,
        loss_threshold, latency_warning_threshold, latency_critical_threshold,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        input.name,
        input.description || null,
        input.ipAddress,
        input.networkInventoryId || null,
        input.interval,
        input.timeout,
        input.packetSize || 32,
        input.packetCount || 3,
        input.lossThreshold,
        input.latencyWarningThreshold,
        input.latencyCriticalThreshold,
        input.status || 'active',
        now,
        now
      )

    return this.getMonitorById(_id, companyId)!
  }

  /**
   * Update a monitor
   */
  updateMonitor(
    _id: string,
    companyId: string,
    input: Partial<ICMPMonitorFields>
  ): ICMPMonitorFields | null {
    const existingMonitor = this.getMonitorById(_id, companyId)
    if (!existingMonitor) return null

    const now = Date.now()
    const updateFields: string[] = ['updated_at = ?']
    const params: (string | number | null)[] = [now]

    if (input.name !== undefined) {
      updateFields.push('name = ?')
      params.push(input.name)
    }
    if (input.description !== undefined) {
      updateFields.push('description = ?')
      params.push(input.description)
    }
    if (input.ipAddress !== undefined) {
      updateFields.push('ip_address = ?')
      params.push(input.ipAddress)
    }
    if (input.networkInventoryId !== undefined) {
      updateFields.push('network_inventory_id = ?')
      params.push(input.networkInventoryId)
    }
    if (input.interval !== undefined) {
      updateFields.push('interval = ?')
      params.push(input.interval)
    }
    if (input.timeout !== undefined) {
      updateFields.push('timeout = ?')
      params.push(input.timeout)
    }
    if (input.packetSize !== undefined) {
      updateFields.push('packet_size = ?')
      params.push(input.packetSize)
    }
    if (input.packetCount !== undefined) {
      updateFields.push('packet_count = ?')
      params.push(input.packetCount)
    }
    if (input.lossThreshold !== undefined) {
      updateFields.push('loss_threshold = ?')
      params.push(input.lossThreshold)
    }
    if (input.latencyWarningThreshold !== undefined) {
      updateFields.push('latency_warning_threshold = ?')
      params.push(input.latencyWarningThreshold)
    }
    if (input.latencyCriticalThreshold !== undefined) {
      updateFields.push('latency_critical_threshold = ?')
      params.push(input.latencyCriticalThreshold)
    }
    if (input.status !== undefined) {
      updateFields.push('status = ?')
      params.push(input.status)
    }
    if (input.lastCheck !== undefined) {
      updateFields.push('last_check = ?')
      params.push(input.lastCheck)
    }
    if (input.lastStatus !== undefined) {
      updateFields.push('last_status = ?')
      params.push(input.lastStatus)
    }

    params.push(_id, companyId)

    this.db
      .query(
        `
      UPDATE icmp_monitors
      SET ${updateFields.join(', ')}
      WHERE _id = ? AND company_id = ?
    `
      )
      .run(...params)

    return this.getMonitorById(_id, companyId)
  }

  /**
   * Delete a monitor
   */
  deleteMonitor(_id: string, companyId: string): boolean {
    const result = this.db
      .query(
        `
      DELETE FROM icmp_monitors
      WHERE _id = ? AND company_id = ?
    `
      )
      .run(_id, companyId) as DatabaseResult

    return result.changes > 0
  }

  // ===== Monitor History Operations =====

  /**
   * Add monitoring result to history
   */
  addMonitorHistory(
    data: Omit<ICMPMonitorHistoryFields, '_id'>
  ): ICMPMonitorHistoryFields {
    const _id = generateId()

    this.db
      .query(
        `
      INSERT INTO icmp_monitor_history (
        _id, monitor_id, timestamp,
        status, response_time, packet_loss,
        packets_transmitted, packets_received,
        min_latency, max_latency, avg_latency, standard_deviation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        data.monitorId,
        data.timestamp,
        data.status,
        data.responseTime,
        data.packetLoss,
        data.packetsTransmitted,
        data.packetsReceived,
        data.minLatency,
        data.maxLatency,
        data.avgLatency,
        data.standardDeviation
      )

    return { _id, ...data }
  }

  /**
   * Get monitor history
   */
  getMonitorHistory(
    monitorId: string,
    startTime?: number,
    endTime?: number,
    limit?: number
  ): ICMPMonitorHistoryFields[] {
    let query = `
      SELECT * FROM icmp_monitor_history
      WHERE monitor_id = ?
    `
    const params: (string | number)[] = [monitorId]

    if (startTime) {
      query += ' AND timestamp >= ?'
      params.push(startTime)
    }
    if (endTime) {
      query += ' AND timestamp <= ?'
      params.push(endTime)
    }

    query += ' ORDER BY timestamp DESC'

    if (limit) {
      query += ' LIMIT ?'
      params.push(limit)
    }

    const results = this.db
      .query(query)
      .all(...params) as ICMPMonitorHistoryRow[]

    return results.map(row => ({
      _id: row._id,
      monitorId: row.monitor_id,
      timestamp: row.timestamp,
      status: row.status as 'up' | 'down',
      responseTime: row.response_time,
      packetLoss: row.packet_loss,
      packetsTransmitted: row.packets_transmitted,
      packetsReceived: row.packets_received,
      minLatency: row.min_latency,
      maxLatency: row.max_latency,
      avgLatency: row.avg_latency,
      standardDeviation: row.standard_deviation,
    }))
  }

  /**
   * Clean up old history entries
   */
  cleanupHistory(olderThan: number): number {
    const result = this.db
      .query(
        `
      DELETE FROM icmp_monitor_history
      WHERE timestamp < ?
    `
      )
      .run(olderThan) as DatabaseResult

    return result.changes
  }

  // ===== Alert Rule Operations =====

  /**
   * Get alert rules for a monitor
   */
  getAlertRules(monitorId: string): ICMPAlertRuleFields[] {
    const stmt = this.db.query(`
      SELECT * FROM icmp_alert_rules
      WHERE monitor_id = ?
    `)

    const rules = stmt.all(monitorId) as ICMPAlertRuleRow[]

    return rules.map(rule => ({
      _id: rule._id,
      companyId: rule.company_id,
      monitorId: rule.monitor_id,
      name: rule.name,
      description: rule.description || undefined,
      condition: rule.condition as 'down' | 'high_latency' | 'packet_loss',
      threshold: rule.threshold,
      duration: rule.duration,
      severity: rule.severity as 'info' | 'warning' | 'critical',
      enabled: rule.enabled === 1,
      createdAt: rule.created_at,
      updatedAt: rule.updated_at,
    }))
  }

  /**
   * Create an alert rule
   */
  createAlertRule(
    companyId: string,
    input: Partial<ICMPAlertRuleFields>
  ): ICMPAlertRuleFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.monitorId) throw new Error('Monitor ID is required')
    if (!input.name) throw new Error('Alert rule name is required')
    if (!input.condition) throw new Error('Condition is required')
    if (input.threshold === undefined) throw new Error('Threshold is required')
    if (input.duration === undefined) throw new Error('Duration is required')
    if (!input.severity) throw new Error('Severity is required')

    this.db
      .query(
        `
      INSERT INTO icmp_alert_rules (
        _id, company_id, monitor_id, name, description,
        condition, threshold, duration,
        severity, enabled,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        input.monitorId,
        input.name,
        input.description || null,
        input.condition,
        input.threshold,
        input.duration,
        input.severity,
        input.enabled !== false ? 1 : 0,
        now,
        now
      )

    return {
      _id,
      companyId,
      monitorId: input.monitorId,
      name: input.name,
      description: input.description,
      condition: input.condition,
      threshold: input.threshold,
      duration: input.duration,
      severity: input.severity,
      enabled: input.enabled !== false,
      createdAt: now,
      updatedAt: now,
    }
  }

  // ===== Alert History Operations =====

  /**
   * Create alert history entry
   */
  createAlertHistory(
    data: Omit<ICMPAlertHistoryFields, '_id'>
  ): ICMPAlertHistoryFields {
    const _id = generateId()

    this.db
      .query(
        `
      INSERT INTO icmp_alert_history (
        _id, alert_rule_id, monitor_id,
        triggered_at, resolved_at, severity,
        condition, value, threshold,
        notifications_sent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        data.alertRuleId,
        data.monitorId,
        data.triggeredAt,
        data.resolvedAt,
        data.severity,
        data.condition,
        data.value,
        data.threshold,
        JSON.stringify(data.notificationsSent)
      )

    return { _id, ...data }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(monitorId?: string): ICMPAlertHistoryFields[] {
    let query = `
      SELECT * FROM icmp_alert_history
      WHERE resolved_at IS NULL
    `
    const params: string[] = []

    if (monitorId) {
      query += ' AND monitor_id = ?'
      params.push(monitorId)
    }

    query += ' ORDER BY triggered_at DESC'

    const results = this.db.query(query).all(...params) as ICMPAlertHistoryRow[]

    return results.map(row => ({
      _id: row._id,
      alertRuleId: row.alert_rule_id,
      monitorId: row.monitor_id,
      triggeredAt: row.triggered_at,
      resolvedAt: row.resolved_at,
      severity: row.severity as 'info' | 'warning' | 'critical',
      condition: row.condition,
      value: row.value,
      threshold: row.threshold,
      notificationsSent: JSON.parse(row.notifications_sent) as Array<{
        status: 'success' | 'failed'
        channel: string
        sentAt: number
        error?: string
      }>,
    }))
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const now = Date.now()
    const result = this.db
      .query(
        `
      UPDATE icmp_alert_history
      SET resolved_at = ?
      WHERE _id = ? AND resolved_at IS NULL
    `
      )
      .run(now, alertId) as DatabaseResult

    return result.changes > 0
  }
}

/**
 * SNMPv2 Polling Template Repository
 * Provides data access methods for SNMPv2 polling templates using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../../../index'
import {
  snmpv2PollingTemplateTableSchema,
  ExtendedSNMPv2PollingTemplateFields,
  timeIntervalToColumns,
  columnsToTimeInterval,
} from '@/schema/network-administration/snmp/polling/template/snmpv2/schema'

export class SNMPv2PollingTemplateRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for SNMPv2 polling templates
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(snmpv2PollingTemplateTableSchema)
  }

  /**
   * Get all SNMPv2 polling templates for a company
   */
  async getForCompany(
    companyId: string
  ): Promise<ExtendedSNMPv2PollingTemplateFields[]> {
    // Create a prepared statement to get all templates for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, frequency, timeout, retries,
        polling_frequency_days, polling_frequency_hours, 
        polling_frequency_minutes, polling_frequency_seconds,
        downtime_trigger_days, downtime_trigger_hours, 
        downtime_trigger_minutes, downtime_trigger_seconds,
        created_at
      FROM snmpv2_polling_templates
      WHERE company_id = ?
    `)

    // Execute the query
    const templates = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      name: string
      description: string
      frequency: number
      timeout: number
      retries: number
      polling_frequency_days: number
      polling_frequency_hours: number
      polling_frequency_minutes: number
      polling_frequency_seconds: number
      downtime_trigger_days: number
      downtime_trigger_hours: number
      downtime_trigger_minutes: number
      downtime_trigger_seconds: number
      created_at: number
    }>

    // Map the database results to the ExtendedSNMPv2PollingTemplateFields interface
    const results = templates.map(template => {
      return {
        _id: template._id,
        companyId: template.company_id,
        name: template.name,
        description: template.description,
        frequency: template.frequency,
        timeout: template.timeout,
        retries: template.retries,
        pollingFrequency: columnsToTimeInterval(
          template.polling_frequency_days,
          template.polling_frequency_hours,
          template.polling_frequency_minutes,
          template.polling_frequency_seconds
        ),
        downtimeTrigger: columnsToTimeInterval(
          template.downtime_trigger_days,
          template.downtime_trigger_hours,
          template.downtime_trigger_minutes,
          template.downtime_trigger_seconds
        ),
        createdAt: template.created_at,
      }
    })

    return results
  }

  /**
   * Get a single SNMPv2 polling template by ID
   */
  getById(
    _id: string,
    companyId: string
  ): ExtendedSNMPv2PollingTemplateFields | null {
    // Create a prepared statement to get a template by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, frequency, timeout, retries,
        polling_frequency_days, polling_frequency_hours, 
        polling_frequency_minutes, polling_frequency_seconds,
        downtime_trigger_days, downtime_trigger_hours, 
        downtime_trigger_minutes, downtime_trigger_seconds,
        created_at
      FROM snmpv2_polling_templates
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const template = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          description: string
          frequency: number
          timeout: number
          retries: number
          polling_frequency_days: number
          polling_frequency_hours: number
          polling_frequency_minutes: number
          polling_frequency_seconds: number
          downtime_trigger_days: number
          downtime_trigger_hours: number
          downtime_trigger_minutes: number
          downtime_trigger_seconds: number
          created_at: number
        }
      | undefined

    if (!template) {
      return null
    }

    return {
      _id: template._id,
      companyId: template.company_id,
      name: template.name,
      description: template.description,
      frequency: template.frequency,
      timeout: template.timeout,
      retries: template.retries,
      pollingFrequency: columnsToTimeInterval(
        template.polling_frequency_days,
        template.polling_frequency_hours,
        template.polling_frequency_minutes,
        template.polling_frequency_seconds
      ),
      downtimeTrigger: columnsToTimeInterval(
        template.downtime_trigger_days,
        template.downtime_trigger_hours,
        template.downtime_trigger_minutes,
        template.downtime_trigger_seconds
      ),
      createdAt: template.created_at,
    }
  }

  /**
   * Get a SNMPv2 polling template by name
   */
  getByName(
    name: string,
    companyId: string
  ): ExtendedSNMPv2PollingTemplateFields | null {
    // Create a prepared statement to get a template by name and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, frequency, timeout, retries,
        polling_frequency_days, polling_frequency_hours, 
        polling_frequency_minutes, polling_frequency_seconds,
        downtime_trigger_days, downtime_trigger_hours, 
        downtime_trigger_minutes, downtime_trigger_seconds,
        created_at
      FROM snmpv2_polling_templates
      WHERE name = ? AND company_id = ?
    `)

    // Execute the query
    const template = stmt.get(name, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          description: string
          frequency: number
          timeout: number
          retries: number
          polling_frequency_days: number
          polling_frequency_hours: number
          polling_frequency_minutes: number
          polling_frequency_seconds: number
          downtime_trigger_days: number
          downtime_trigger_hours: number
          downtime_trigger_minutes: number
          downtime_trigger_seconds: number
          created_at: number
        }
      | undefined

    if (!template) {
      return null
    }

    return {
      _id: template._id,
      companyId: template.company_id,
      name: template.name,
      description: template.description,
      frequency: template.frequency,
      timeout: template.timeout,
      retries: template.retries,
      pollingFrequency: columnsToTimeInterval(
        template.polling_frequency_days,
        template.polling_frequency_hours,
        template.polling_frequency_minutes,
        template.polling_frequency_seconds
      ),
      downtimeTrigger: columnsToTimeInterval(
        template.downtime_trigger_days,
        template.downtime_trigger_hours,
        template.downtime_trigger_minutes,
        template.downtime_trigger_seconds
      ),
      createdAt: template.created_at,
    }
  }

  /**
   * Create a new SNMPv2 polling template
   */
  create(
    companyId: string,
    input: Partial<ExtendedSNMPv2PollingTemplateFields>
  ): ExtendedSNMPv2PollingTemplateFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.name) {
      throw new Error('Name is required')
    }
    if (input.frequency === undefined) {
      throw new Error('Frequency is required')
    }
    if (input.timeout === undefined) {
      throw new Error('Timeout is required')
    }
    if (input.retries === undefined) {
      throw new Error('Retries is required')
    }
    if (!input.pollingFrequency) {
      throw new Error('Polling frequency is required')
    }
    if (!input.downtimeTrigger) {
      throw new Error('Downtime trigger is required')
    }

    // Check if a template with the same name already exists
    const existingTemplate = this.getByName(input.name, companyId)
    if (existingTemplate) {
      throw new Error(
        `A polling template with the name ${input.name} already exists`
      )
    }

    // Convert TimeInterval objects to individual columns
    const {
      days: pfDays,
      hours: pfHours,
      minutes: pfMinutes,
      seconds: pfSeconds,
    } = timeIntervalToColumns(input.pollingFrequency)

    const {
      days: dtDays,
      hours: dtHours,
      minutes: dtMinutes,
      seconds: dtSeconds,
    } = timeIntervalToColumns(input.downtimeTrigger)

    // Insert the SNMPv2 polling template
    this.db
      .query(
        `
      INSERT INTO snmpv2_polling_templates (
        _id, company_id, name, description, frequency, timeout, retries,
        polling_frequency_days, polling_frequency_hours, 
        polling_frequency_minutes, polling_frequency_seconds,
        downtime_trigger_days, downtime_trigger_hours, 
        downtime_trigger_minutes, downtime_trigger_seconds,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        input.name,
        input.description || '',
        input.frequency,
        input.timeout,
        input.retries,
        pfDays,
        pfHours,
        pfMinutes,
        pfSeconds,
        dtDays,
        dtHours,
        dtMinutes,
        dtSeconds,
        now
      )

    // Return the newly created template
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing SNMPv2 polling template
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedSNMPv2PollingTemplateFields>
  ): ExtendedSNMPv2PollingTemplateFields | null {
    // Check if the template exists
    const existingTemplate = this.getById(_id, companyId)
    if (!existingTemplate) {
      return null
    }

    // If updating the name, check for duplicates
    if (input.name && input.name !== existingTemplate.name) {
      const duplicateTemplate = this.getByName(input.name, companyId)
      if (duplicateTemplate && duplicateTemplate._id !== _id) {
        throw new Error(
          `A polling template with the name ${input.name} already exists`
        )
      }
    }

    // Initialize time interval variables
    let pfDays, pfHours, pfMinutes, pfSeconds
    let dtDays, dtHours, dtMinutes, dtSeconds

    // If polling frequency is provided, convert to columns
    if (input.pollingFrequency) {
      const pf = timeIntervalToColumns(input.pollingFrequency)
      pfDays = pf.days
      pfHours = pf.hours
      pfMinutes = pf.minutes
      pfSeconds = pf.seconds
    }

    // If downtime trigger is provided, convert to columns
    if (input.downtimeTrigger) {
      const dt = timeIntervalToColumns(input.downtimeTrigger)
      dtDays = dt.days
      dtHours = dt.hours
      dtMinutes = dt.minutes
      dtSeconds = dt.seconds
    }

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE snmpv2_polling_templates SET '
    const params: any[] = []
    const setClauses: string[] = []

    if (input.name !== undefined) {
      setClauses.push('name = ?')
      params.push(input.name)
    }

    if (input.description !== undefined) {
      setClauses.push('description = ?')
      params.push(input.description)
    }

    if (input.frequency !== undefined) {
      setClauses.push('frequency = ?')
      params.push(input.frequency)
    }

    if (input.timeout !== undefined) {
      setClauses.push('timeout = ?')
      params.push(input.timeout)
    }

    if (input.retries !== undefined) {
      setClauses.push('retries = ?')
      params.push(input.retries)
    }

    if (input.pollingFrequency) {
      setClauses.push('polling_frequency_days = ?')
      params.push(pfDays)

      setClauses.push('polling_frequency_hours = ?')
      params.push(pfHours)

      setClauses.push('polling_frequency_minutes = ?')
      params.push(pfMinutes)

      setClauses.push('polling_frequency_seconds = ?')
      params.push(pfSeconds)
    }

    if (input.downtimeTrigger) {
      setClauses.push('downtime_trigger_days = ?')
      params.push(dtDays)

      setClauses.push('downtime_trigger_hours = ?')
      params.push(dtHours)

      setClauses.push('downtime_trigger_minutes = ?')
      params.push(dtMinutes)

      setClauses.push('downtime_trigger_seconds = ?')
      params.push(dtSeconds)
    }

    // If there are no fields to update, return the existing template
    if (setClauses.length === 0) {
      return existingTemplate
    }

    // Complete the SQL statement
    updateSql += setClauses.join(', ')
    updateSql += ' WHERE _id = ? AND company_id = ?'
    params.push(_id, companyId)

    // Execute the update
    this.db.query(updateSql).run(...params)

    // Return the updated template
    return this.getById(_id, companyId)
  }

  /**
   * Delete a SNMPv2 polling template
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the template exists
    const existingTemplate = this.getById(_id, companyId)
    if (!existingTemplate) {
      return false
    }

    // Delete the template
    this.db
      .query(
        `
      DELETE FROM snmpv2_polling_templates
      WHERE _id = ? AND company_id = ?
    `
      )
      .run(_id, companyId)

    return true
  }
}

/**
 * SNMP Polling Status Repository
 * Provides data access methods for SNMP polling status data using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../../index'
import {
  snmpPollingStatusTableSchema,
  DEVICE_STATUS_VALUES,
  ExtendedSNMPPollingStatusFields,
} from '@/schema/network-administration/snmp/polling/status/schema'
import { DeviceStatus } from '@/types/network-administration/snmp/polling/status/types'

export class SNMPPollingStatusRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for SNMP polling status
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(snmpPollingStatusTableSchema)
  }

  /**
   * Validates that a device status value is valid
   */
  validateDeviceStatus(status: string): boolean {
    return DEVICE_STATUS_VALUES.includes(status as DeviceStatus)
  }

  /**
   * Get all SNMP polling statuses for a company
   */
  async getForCompany(
    companyId: string
  ): Promise<ExtendedSNMPPollingStatusFields[]> {
    // Create a prepared statement to get all statuses for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, snmp_polling_template_id, manufacturer_id, 
        model_name_id, product_id, uptime, downtime, 
        device_status, created_at, updated_at
      FROM snmp_polling_status
      WHERE company_id = ?
    `)

    // Execute the query
    const statuses = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      snmp_polling_template_id: string
      manufacturer_id: string | null
      model_name_id: string | null
      product_id: string | null
      uptime: number | null
      downtime: number | null
      device_status: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedSNMPPollingStatusFields interface
    const results = await Promise.all(
      statuses.map(async status => {
        // Get stock IDs for this status
        const stockIds = this.db
          .query(
            'SELECT stock_id FROM snmp_polling_status_stock WHERE snmp_polling_status_id = ?'
          )
          .all(status._id)
          .map((row: any) => row.stock_id)

        // Get network inventory IDs for this status
        const networkInventoryIds = this.db
          .query(
            'SELECT network_inventory_id FROM snmp_polling_status_network_inventory WHERE snmp_polling_status_id = ?'
          )
          .all(status._id)
          .map((row: any) => row.network_inventory_id)

        return {
          _id: status._id,
          companyId: status.company_id,
          snmpPollingTemplateId: status.snmp_polling_template_id,
          manufacturerId: status.manufacturer_id || undefined,
          modelNameId: status.model_name_id || undefined,
          productId: status.product_id || undefined,
          stockIds: stockIds.length > 0 ? stockIds : undefined,
          networkInventoryIds:
            networkInventoryIds.length > 0 ? networkInventoryIds : undefined,
          uptime: status.uptime ?? 0, // Default to 0 if null
          downtime: status.downtime ?? 0, // Default to 0 if null
          deviceStatus: status.device_status as DeviceStatus,
          createdAt: status.created_at,
          updatedAt: status.updated_at,
        }
      })
    )

    return results
  }

  /**
   * Get a single SNMP polling status by ID
   */
  getById(
    _id: string,
    companyId: string
  ): ExtendedSNMPPollingStatusFields | null {
    // Create a prepared statement to get a status by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, snmp_polling_template_id, manufacturer_id, 
        model_name_id, product_id, uptime, downtime, 
        device_status, created_at, updated_at
      FROM snmp_polling_status
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const status = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          snmp_polling_template_id: string
          manufacturer_id: string | null
          model_name_id: string | null
          product_id: string | null
          uptime: number | null
          downtime: number | null
          device_status: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!status) {
      return null
    }

    // Get stock IDs for this status
    const stockIds = this.db
      .query(
        'SELECT stock_id FROM snmp_polling_status_stock WHERE snmp_polling_status_id = ?'
      )
      .all(status._id)
      .map((row: any) => row.stock_id)

    // Get network inventory IDs for this status
    const networkInventoryIds = this.db
      .query(
        'SELECT network_inventory_id FROM snmp_polling_status_network_inventory WHERE snmp_polling_status_id = ?'
      )
      .all(status._id)
      .map((row: any) => row.network_inventory_id)

    return {
      _id: status._id,
      companyId: status.company_id,
      snmpPollingTemplateId: status.snmp_polling_template_id,
      manufacturerId: status.manufacturer_id || undefined,
      modelNameId: status.model_name_id || undefined,
      productId: status.product_id || undefined,
      stockIds: stockIds.length > 0 ? stockIds : undefined,
      networkInventoryIds:
        networkInventoryIds.length > 0 ? networkInventoryIds : undefined,
      uptime: status.uptime ?? 0, // Default to 0 if null
      downtime: status.downtime ?? 0, // Default to 0 if null
      deviceStatus: status.device_status as DeviceStatus,
      createdAt: status.created_at,
      updatedAt: status.updated_at,
    }
  }

  /**
   * Create a new SNMP polling status
   */
  create(
    companyId: string,
    input: Partial<ExtendedSNMPPollingStatusFields>
  ): ExtendedSNMPPollingStatusFields {
    const _id = generateId()
    const now = Date.now()

    // Validate device status if provided
    if (input.deviceStatus && !this.validateDeviceStatus(input.deviceStatus)) {
      throw new Error(
        `Invalid device status: ${input.deviceStatus}. Valid values are: ${DEVICE_STATUS_VALUES.join(', ')}`
      )
    }

    // Start a transaction to ensure all operations succeed or fail together
    const createStatus = this.db.transaction(() => {
      // Insert the main status record
      this.db
        .query(
          `
        INSERT INTO snmp_polling_status (
          _id, company_id, snmp_polling_template_id, manufacturer_id, 
          model_name_id, product_id, uptime, downtime, 
          device_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          _id,
          companyId,
          input.snmpPollingTemplateId || null, // Convert undefined to null for SQLite
          input.manufacturerId || null,
          input.modelNameId || null,
          input.productId || null,
          input.uptime ?? 0, // Default to 0 if undefined
          input.downtime ?? 0, // Default to 0 if undefined
          input.deviceStatus || 'unknown',
          now,
          now
        )

      // Insert stock IDs if provided
      if (input.stockIds && input.stockIds.length > 0) {
        const stockStmt = this.db.prepare(`
          INSERT INTO snmp_polling_status_stock (
            snmp_polling_status_id, stock_id
          ) VALUES (?, ?)
        `)

        for (const stockId of input.stockIds) {
          stockStmt.run(_id, stockId)
        }
      }

      // Insert network inventory IDs if provided
      if (input.networkInventoryIds && input.networkInventoryIds.length > 0) {
        const networkStmt = this.db.prepare(`
          INSERT INTO snmp_polling_status_network_inventory (
            snmp_polling_status_id, network_inventory_id
          ) VALUES (?, ?)
        `)

        for (const networkId of input.networkInventoryIds) {
          networkStmt.run(_id, networkId)
        }
      }
    })

    // Execute the transaction
    createStatus()

    // Return the newly created status
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing SNMP polling status
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedSNMPPollingStatusFields>
  ): ExtendedSNMPPollingStatusFields | null {
    // Check if the status exists
    const existingStatus = this.getById(_id, companyId)
    if (!existingStatus) {
      return null
    }

    // Validate device status if provided
    if (input.deviceStatus && !this.validateDeviceStatus(input.deviceStatus)) {
      throw new Error(
        `Invalid device status: ${input.deviceStatus}. Valid values are: ${DEVICE_STATUS_VALUES.join(', ')}`
      )
    }

    const now = Date.now()

    // Start a transaction to ensure all operations succeed or fail together
    const updateStatus = this.db.transaction(() => {
      // Construct the SQL update statement based on provided fields
      let updateSql = 'UPDATE snmp_polling_status SET updated_at = ?'
      const params: any[] = [now]

      if (input.snmpPollingTemplateId !== undefined) {
        updateSql += ', snmp_polling_template_id = ?'
        params.push(input.snmpPollingTemplateId)
      }

      if (input.manufacturerId !== undefined) {
        updateSql += ', manufacturer_id = ?'
        params.push(input.manufacturerId)
      }

      if (input.modelNameId !== undefined) {
        updateSql += ', model_name_id = ?'
        params.push(input.modelNameId)
      }

      if (input.productId !== undefined) {
        updateSql += ', product_id = ?'
        params.push(input.productId)
      }

      if (input.uptime !== undefined) {
        updateSql += ', uptime = ?'
        params.push(input.uptime)
      }

      if (input.downtime !== undefined) {
        updateSql += ', downtime = ?'
        params.push(input.downtime)
      }

      if (input.deviceStatus !== undefined) {
        updateSql += ', device_status = ?'
        params.push(input.deviceStatus)
      }

      updateSql += ' WHERE _id = ? AND company_id = ?'
      params.push(_id, companyId)

      this.db.query(updateSql).run(...params)

      // Update stock IDs if provided
      if (input.stockIds !== undefined) {
        // Delete existing stock IDs
        this.db
          .query(
            `
          DELETE FROM snmp_polling_status_stock
          WHERE snmp_polling_status_id = ?
        `
          )
          .run(_id)

        // Insert new stock IDs
        if (input.stockIds.length > 0) {
          const stockStmt = this.db.prepare(`
            INSERT INTO snmp_polling_status_stock (
              snmp_polling_status_id, stock_id
            ) VALUES (?, ?)
          `)

          for (const stockId of input.stockIds) {
            stockStmt.run(_id, stockId)
          }
        }
      }

      // Update network inventory IDs if provided
      if (input.networkInventoryIds !== undefined) {
        // Delete existing network inventory IDs
        this.db
          .query(
            `
          DELETE FROM snmp_polling_status_network_inventory
          WHERE snmp_polling_status_id = ?
        `
          )
          .run(_id)

        // Insert new network inventory IDs
        if (input.networkInventoryIds.length > 0) {
          const networkStmt = this.db.prepare(`
            INSERT INTO snmp_polling_status_network_inventory (
              snmp_polling_status_id, network_inventory_id
            ) VALUES (?, ?)
          `)

          for (const networkId of input.networkInventoryIds) {
            networkStmt.run(_id, networkId)
          }
        }
      }
    })

    // Execute the transaction
    updateStatus()

    // Return the updated status
    return this.getById(_id, companyId)
  }

  /**
   * Delete an SNMP polling status
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the status exists
    const existingStatus = this.getById(_id, companyId)
    if (!existingStatus) {
      return false
    }

    // Start a transaction to ensure all operations succeed or fail together
    const deleteStatus = this.db.transaction(() => {
      // Delete associated stock IDs
      this.db
        .query(
          `
        DELETE FROM snmp_polling_status_stock
        WHERE snmp_polling_status_id = ?
      `
        )
        .run(_id)

      // Delete associated network inventory IDs
      this.db
        .query(
          `
        DELETE FROM snmp_polling_status_network_inventory
        WHERE snmp_polling_status_id = ?
      `
        )
        .run(_id)

      // Delete the main status record
      this.db
        .query(
          `
        DELETE FROM snmp_polling_status
        WHERE _id = ? AND company_id = ?
      `
        )
        .run(_id, companyId)
    })

    // Execute the transaction
    deleteStatus()

    return true
  }
}

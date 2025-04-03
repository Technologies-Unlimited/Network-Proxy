/**
 * ICMP Monitoring Templates Repository
 * Provides data access methods for ICMP monitoring templates using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  icmpMonitoringTemplateTableSchema,
  icmpMonitoringTemplateIndexes,
  ExtendedICMPMonitoringTemplateFields,
} from '@/schema/network-administration/icmp/templates/schema'

export class ICMPMonitoringTemplateRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for ICMP monitoring templates
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(icmpMonitoringTemplateTableSchema)

    // Create indexes
    this.db.run(icmpMonitoringTemplateIndexes)
  }

  /**
   * Get all ICMP monitoring templates for a company
   */
  async getForCompany(
    companyId: string
  ): Promise<ExtendedICMPMonitoringTemplateFields[]> {
    // Create a prepared statement to get all templates for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, template_name, template_description, 
        icmp_loss_threshold, icmp_latency_threshold, manufacturer_id, 
        model_name_id, product_id, created_at, updated_at
      FROM icmp_monitoring_templates
      WHERE company_id = ?
    `)

    // Execute the query
    const templates = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      template_name: string
      template_description: string
      icmp_loss_threshold: number
      icmp_latency_threshold: number
      manufacturer_id: string | null
      model_name_id: string | null
      product_id: string | null
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedICMPMonitoringTemplateFields interface
    const results = await Promise.all(
      templates.map(async template => {
        // Get stock IDs for this template
        const stockIds = this.db
          .query(
            'SELECT stock_id FROM icmp_monitoring_template_stock WHERE icmp_monitoring_template_id = ?'
          )
          .all(template._id)
          .map((row: any) => row.stock_id)

        // Get network inventory IDs for this template
        const networkInventoryIds = this.db
          .query(
            'SELECT network_inventory_id FROM icmp_monitoring_template_network_inventory WHERE icmp_monitoring_template_id = ?'
          )
          .all(template._id)
          .map((row: any) => row.network_inventory_id)

        return {
          _id: template._id,
          companyId: template.company_id,
          templateName: template.template_name,
          templateDescription: template.template_description,
          icmpLossThreshold: template.icmp_loss_threshold,
          icmpLatencyThreshold: template.icmp_latency_threshold,
          manufacturerId: template.manufacturer_id || undefined,
          modelNameId: template.model_name_id || undefined,
          productId: template.product_id || undefined,
          stockIds: stockIds.length > 0 ? stockIds : undefined,
          networkInventoryIds:
            networkInventoryIds.length > 0 ? networkInventoryIds : undefined,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
        }
      })
    )

    return results
  }

  /**
   * Get a single ICMP monitoring template by ID
   */
  getById(
    _id: string,
    companyId: string
  ): ExtendedICMPMonitoringTemplateFields | null {
    // Create a prepared statement to get a template by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, template_name, template_description, 
        icmp_loss_threshold, icmp_latency_threshold, manufacturer_id, 
        model_name_id, product_id, created_at, updated_at
      FROM icmp_monitoring_templates
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const template = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          template_name: string
          template_description: string
          icmp_loss_threshold: number
          icmp_latency_threshold: number
          manufacturer_id: string | null
          model_name_id: string | null
          product_id: string | null
          created_at: number
          updated_at: number
        }
      | undefined

    if (!template) {
      return null
    }

    // Get stock IDs for this template
    const stockIds = this.db
      .query(
        'SELECT stock_id FROM icmp_monitoring_template_stock WHERE icmp_monitoring_template_id = ?'
      )
      .all(template._id)
      .map((row: any) => row.stock_id)

    // Get network inventory IDs for this template
    const networkInventoryIds = this.db
      .query(
        'SELECT network_inventory_id FROM icmp_monitoring_template_network_inventory WHERE icmp_monitoring_template_id = ?'
      )
      .all(template._id)
      .map((row: any) => row.network_inventory_id)

    return {
      _id: template._id,
      companyId: template.company_id,
      templateName: template.template_name,
      templateDescription: template.template_description,
      icmpLossThreshold: template.icmp_loss_threshold,
      icmpLatencyThreshold: template.icmp_latency_threshold,
      manufacturerId: template.manufacturer_id || undefined,
      modelNameId: template.model_name_id || undefined,
      productId: template.product_id || undefined,
      stockIds: stockIds.length > 0 ? stockIds : undefined,
      networkInventoryIds:
        networkInventoryIds.length > 0 ? networkInventoryIds : undefined,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    }
  }

  /**
   * Create a new ICMP monitoring template
   */
  create(
    companyId: string,
    input: Partial<ExtendedICMPMonitoringTemplateFields>
  ): ExtendedICMPMonitoringTemplateFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.templateName) {
      throw new Error('Template name is required')
    }
    if (!input.templateDescription) {
      throw new Error('Template description is required')
    }
    if (input.icmpLossThreshold === undefined) {
      throw new Error('ICMP loss threshold is required')
    }
    if (input.icmpLatencyThreshold === undefined) {
      throw new Error('ICMP latency threshold is required')
    }

    // Prepare parameters, ensuring undefined values are converted to null
    const templateName = input.templateName
    const templateDescription = input.templateDescription
    const icmpLossThreshold = input.icmpLossThreshold
    const icmpLatencyThreshold = input.icmpLatencyThreshold
    const manufacturerId = input.manufacturerId || null
    const modelNameId = input.modelNameId || null
    const productId = input.productId || null

    // Start a transaction to ensure all operations succeed or fail together
    const createTemplate = this.db.transaction(() => {
      // Insert the main template record
      this.db
        .query(
          `
        INSERT INTO icmp_monitoring_templates (
          _id, company_id, template_name, template_description,
          icmp_loss_threshold, icmp_latency_threshold, manufacturer_id,
          model_name_id, product_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          _id,
          companyId,
          templateName,
          templateDescription,
          icmpLossThreshold,
          icmpLatencyThreshold,
          manufacturerId,
          modelNameId,
          productId,
          now,
          now
        )

      // Insert stock IDs if provided
      if (input.stockIds && input.stockIds.length > 0) {
        const stockStmt = this.db.prepare(`
          INSERT INTO icmp_monitoring_template_stock (
            icmp_monitoring_template_id, stock_id
          ) VALUES (?, ?)
        `)

        for (const stockId of input.stockIds) {
          stockStmt.run(_id, stockId)
        }
      }

      // Insert network inventory IDs if provided
      if (input.networkInventoryIds && input.networkInventoryIds.length > 0) {
        const networkStmt = this.db.prepare(`
          INSERT INTO icmp_monitoring_template_network_inventory (
            icmp_monitoring_template_id, network_inventory_id
          ) VALUES (?, ?)
        `)

        for (const networkId of input.networkInventoryIds) {
          networkStmt.run(_id, networkId)
        }
      }
    })

    // Execute the transaction
    createTemplate()

    // Return the newly created template
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing ICMP monitoring template
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedICMPMonitoringTemplateFields>
  ): ExtendedICMPMonitoringTemplateFields | null {
    // Check if the template exists
    const existingTemplate = this.getById(_id, companyId)
    if (!existingTemplate) {
      return null
    }

    const now = Date.now()

    // Start a transaction to ensure all operations succeed or fail together
    const updateTemplate = this.db.transaction(() => {
      // Construct the SQL update statement based on provided fields
      let updateSql = 'UPDATE icmp_monitoring_templates SET updated_at = ?'
      const params: any[] = [now]

      if (input.templateName !== undefined) {
        updateSql += ', template_name = ?'
        params.push(input.templateName)
      }

      if (input.templateDescription !== undefined) {
        updateSql += ', template_description = ?'
        params.push(input.templateDescription)
      }

      if (input.icmpLossThreshold !== undefined) {
        updateSql += ', icmp_loss_threshold = ?'
        params.push(input.icmpLossThreshold)
      }

      if (input.icmpLatencyThreshold !== undefined) {
        updateSql += ', icmp_latency_threshold = ?'
        params.push(input.icmpLatencyThreshold)
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

      updateSql += ' WHERE _id = ? AND company_id = ?'
      params.push(_id, companyId)

      this.db.query(updateSql).run(...params)

      // Update stock IDs if provided
      if (input.stockIds !== undefined) {
        // Delete existing stock IDs
        this.db
          .query(
            `
          DELETE FROM icmp_monitoring_template_stock
          WHERE icmp_monitoring_template_id = ?
        `
          )
          .run(_id)

        // Insert new stock IDs
        if (input.stockIds.length > 0) {
          const stockStmt = this.db.prepare(`
            INSERT INTO icmp_monitoring_template_stock (
              icmp_monitoring_template_id, stock_id
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
          DELETE FROM icmp_monitoring_template_network_inventory
          WHERE icmp_monitoring_template_id = ?
        `
          )
          .run(_id)

        // Insert new network inventory IDs
        if (input.networkInventoryIds.length > 0) {
          const networkStmt = this.db.prepare(`
            INSERT INTO icmp_monitoring_template_network_inventory (
              icmp_monitoring_template_id, network_inventory_id
            ) VALUES (?, ?)
          `)

          for (const networkId of input.networkInventoryIds) {
            networkStmt.run(_id, networkId)
          }
        }
      }
    })

    // Execute the transaction
    updateTemplate()

    // Return the updated template
    return this.getById(_id, companyId)
  }

  /**
   * Delete an ICMP monitoring template
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the template exists
    const existingTemplate = this.getById(_id, companyId)
    if (!existingTemplate) {
      return false
    }

    // Start a transaction to ensure all operations succeed or fail together
    const deleteTemplate = this.db.transaction(() => {
      // Delete associated stock IDs
      this.db
        .query(
          `
        DELETE FROM icmp_monitoring_template_stock
        WHERE icmp_monitoring_template_id = ?
      `
        )
        .run(_id)

      // Delete associated network inventory IDs
      this.db
        .query(
          `
        DELETE FROM icmp_monitoring_template_network_inventory
        WHERE icmp_monitoring_template_id = ?
      `
        )
        .run(_id)

      // Delete the main template record
      this.db
        .query(
          `
        DELETE FROM icmp_monitoring_templates
        WHERE _id = ? AND company_id = ?
      `
        )
        .run(_id, companyId)
    })

    // Execute the transaction
    deleteTemplate()

    return true
  }
}

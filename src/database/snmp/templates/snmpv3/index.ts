/**
 * SNMPv3 Template Repository
 * Provides data access methods for SNMPv3 templates using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../../index'
import {
  snmpv3TemplateTableSchema,
  snmpv3TemplateIndexes,
  SNMPv3TemplateFields,
} from '@/schema/network-administration/snmp/templates/snmpv3/schema'

export class SNMPv3TemplateRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for SNMPv3 templates
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(snmpv3TemplateTableSchema)

    // Create indexes
    this.db.run(snmpv3TemplateIndexes)
  }

  /**
   * Get all SNMPv3 templates for a company
   */
  async getForCompany(companyId: string): Promise<SNMPv3TemplateFields[]> {
    // Create a prepared statement to get all templates for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_name_id, product_id,
        snmpv3_setting_id, template_name, description, 
        created_at, updated_at
      FROM snmpv3_templates
      WHERE company_id = ?
    `)

    // Execute the query
    const templates = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      manufacturer_id: string | null
      model_name_id: string | null
      product_id: string | null
      snmpv3_setting_id: string
      template_name: string
      description: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the SNMPv3TemplateFields interface
    const results = await Promise.all(
      templates.map(async template => {
        // Get OID IDs for this template
        const oidIds = this.db
          .query(
            'SELECT oid_id FROM snmpv3_template_oids WHERE snmpv3_template_id = ?'
          )
          .all(template._id)
          .map((row: any) => row.oid_id)

        // Get stock IDs for this template
        const stockIds = this.db
          .query(
            'SELECT stock_id FROM snmpv3_template_stock WHERE snmpv3_template_id = ?'
          )
          .all(template._id)
          .map((row: any) => row.stock_id)

        // Get network inventory IDs for this template
        const networkInventoryIds = this.db
          .query(
            'SELECT network_inventory_id FROM snmpv3_template_network_inventory WHERE snmpv3_template_id = ?'
          )
          .all(template._id)
          .map((row: any) => row.network_inventory_id)

        return {
          _id: template._id,
          companyId: template.company_id,
          manufacturerId: template.manufacturer_id || undefined,
          modelNameId: template.model_name_id || undefined,
          productId: template.product_id || undefined,
          snmpv3SettingId: template.snmpv3_setting_id,
          templateName: template.template_name,
          description: template.description,
          oidIds: oidIds.length > 0 ? oidIds : undefined,
          stockIds: stockIds.length > 0 ? stockIds : undefined,
          networkInventoryIds: networkInventoryIds.length > 0 ? networkInventoryIds : undefined,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
        }
      })
    )

    return results
  }

  /**
   * Get a single SNMPv3 template by ID
   */
  getById(_id: string, companyId: string): SNMPv3TemplateFields | null {
    // Create a prepared statement to get a template by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_name_id, product_id,
        snmpv3_setting_id, template_name, description, 
        created_at, updated_at
      FROM snmpv3_templates
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const template = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          manufacturer_id: string | null
          model_name_id: string | null
          product_id: string | null
          snmpv3_setting_id: string
          template_name: string
          description: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!template) {
      return null
    }

    // Get OID IDs for this template
    const oidIds = this.db
      .query(
        'SELECT oid_id FROM snmpv3_template_oids WHERE snmpv3_template_id = ?'
      )
      .all(template._id)
      .map((row: any) => row.oid_id)

    // Get stock IDs for this template
    const stockIds = this.db
      .query(
        'SELECT stock_id FROM snmpv3_template_stock WHERE snmpv3_template_id = ?'
      )
      .all(template._id)
      .map((row: any) => row.stock_id)

    // Get network inventory IDs for this template
    const networkInventoryIds = this.db
      .query(
        'SELECT network_inventory_id FROM snmpv3_template_network_inventory WHERE snmpv3_template_id = ?'
      )
      .all(template._id)
      .map((row: any) => row.network_inventory_id)

    return {
      _id: template._id,
      companyId: template.company_id,
      manufacturerId: template.manufacturer_id || undefined,
      modelNameId: template.model_name_id || undefined,
      productId: template.product_id || undefined,
      snmpv3SettingId: template.snmpv3_setting_id,
      templateName: template.template_name,
      description: template.description,
      oidIds: oidIds.length > 0 ? oidIds : undefined,
      stockIds: stockIds.length > 0 ? stockIds : undefined,
      networkInventoryIds: networkInventoryIds.length > 0 ? networkInventoryIds : undefined,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    }
  }

  /**
   * Get a SNMPv3 template by name
   */
  getByName(name: string, companyId: string): SNMPv3TemplateFields | null {
    // Create a prepared statement to get a template by name and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_name_id, product_id,
        snmpv3_setting_id, template_name, description, 
        created_at, updated_at
      FROM snmpv3_templates
      WHERE template_name = ? AND company_id = ?
    `)

    // Execute the query
    const template = stmt.get(name, companyId) as
      | {
          _id: string
          company_id: string
          manufacturer_id: string | null
          model_name_id: string | null
          product_id: string | null
          snmpv3_setting_id: string
          template_name: string
          description: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!template) {
      return null
    }

    // Get OID IDs for this template
    const oidIds = this.db
      .query(
        'SELECT oid_id FROM snmpv3_template_oids WHERE snmpv3_template_id = ?'
      )
      .all(template._id)
      .map((row: any) => row.oid_id)

    // Get stock IDs for this template
    const stockIds = this.db
      .query(
        'SELECT stock_id FROM snmpv3_template_stock WHERE snmpv3_template_id = ?'
      )
      .all(template._id)
      .map((row: any) => row.stock_id)

    // Get network inventory IDs for this template
    const networkInventoryIds = this.db
      .query(
        'SELECT network_inventory_id FROM snmpv3_template_network_inventory WHERE snmpv3_template_id = ?'
      )
      .all(template._id)
      .map((row: any) => row.network_inventory_id)

    return {
      _id: template._id,
      companyId: template.company_id,
      manufacturerId: template.manufacturer_id || undefined,
      modelNameId: template.model_name_id || undefined,
      productId: template.product_id || undefined,
      snmpv3SettingId: template.snmpv3_setting_id,
      templateName: template.template_name,
      description: template.description,
      oidIds: oidIds.length > 0 ? oidIds : undefined,
      stockIds: stockIds.length > 0 ? stockIds : undefined,
      networkInventoryIds: networkInventoryIds.length > 0 ? networkInventoryIds : undefined,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    }
  }

  /**
   * Create a new SNMPv3 template
   */
  create(companyId: string, input: Partial<SNMPv3TemplateFields>): SNMPv3TemplateFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.templateName) {
      throw new Error('Template name is required')
    }
    if (!input.description) {
      throw new Error('Description is required')
    }
    if (!input.snmpv3SettingId) {
      throw new Error('SNMPv3 settings ID is required')
    }

    // Check if a template with the same name already exists
    const existingTemplate = this.getByName(input.templateName, companyId)
    if (existingTemplate) {
      throw new Error(`A template with the name ${input.templateName} already exists`)
    }

    // Start a transaction to ensure all operations succeed or fail together
    const createTemplate = this.db.transaction(() => {
      // Prepare the values with no undefined values
      const manufacturerId = input.manufacturerId ?? null
      const modelNameId = input.modelNameId ?? null
      const productId = input.productId ?? null
      const templateName = input.templateName as string
      const description = input.description as string
      const settingId = input.snmpv3SettingId as string
      
      // Insert the main template record
      this.db.query(`
        INSERT INTO snmpv3_templates (
          _id, company_id, manufacturer_id, model_name_id, product_id,
          snmpv3_setting_id, template_name, description, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        _id,
        companyId,
        manufacturerId,
        modelNameId,
        productId,
        settingId,
        templateName,
        description,
        now,
        now
      )

      // Insert OID IDs if provided
      if (input.oidIds && input.oidIds.length > 0) {
        const oidStmt = this.db.prepare(`
          INSERT INTO snmpv3_template_oids (
            snmpv3_template_id, oid_id
          ) VALUES (?, ?)
        `)

        for (const oidId of input.oidIds) {
          oidStmt.run(_id, oidId)
        }
      }

      // Insert stock IDs if provided
      if (input.stockIds && input.stockIds.length > 0) {
        const stockStmt = this.db.prepare(`
          INSERT INTO snmpv3_template_stock (
            snmpv3_template_id, stock_id
          ) VALUES (?, ?)
        `)

        for (const stockId of input.stockIds) {
          stockStmt.run(_id, stockId)
        }
      }

      // Insert network inventory IDs if provided
      if (input.networkInventoryIds && input.networkInventoryIds.length > 0) {
        const networkStmt = this.db.prepare(`
          INSERT INTO snmpv3_template_network_inventory (
            snmpv3_template_id, network_inventory_id
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
   * Update an existing SNMPv3 template
   */
  update(_id: string, companyId: string, input: Partial<SNMPv3TemplateFields>): SNMPv3TemplateFields | null {
    // Check if the template exists
    const existingTemplate = this.getById(_id, companyId)
    if (!existingTemplate) {
      return null
    }

    // If updating the name, check for duplicates
    if (input.templateName && input.templateName !== existingTemplate.templateName) {
      const duplicateTemplate = this.getByName(input.templateName, companyId)
      if (duplicateTemplate && duplicateTemplate._id !== _id) {
        throw new Error(`A template with the name ${input.templateName} already exists`)
      }
    }

    const now = Date.now()

    // Start a transaction to ensure all operations succeed or fail together
    const updateTemplate = this.db.transaction(() => {
      // Construct the SQL update statement based on provided fields
      let updateSql = 'UPDATE snmpv3_templates SET updated_at = ?'
      const params: any[] = [now]

      if (input.templateName !== undefined) {
        updateSql += ', template_name = ?'
        params.push(input.templateName)
      }

      if (input.description !== undefined) {
        updateSql += ', description = ?'
        params.push(input.description)
      }

      if (input.snmpv3SettingId !== undefined) {
        updateSql += ', snmpv3_setting_id = ?'
        params.push(input.snmpv3SettingId)
      }

      if (input.manufacturerId !== undefined) {
        updateSql += ', manufacturer_id = ?'
        params.push(input.manufacturerId || null)
      }

      if (input.modelNameId !== undefined) {
        updateSql += ', model_name_id = ?'
        params.push(input.modelNameId || null)
      }

      if (input.productId !== undefined) {
        updateSql += ', product_id = ?'
        params.push(input.productId || null)
      }

      updateSql += ' WHERE _id = ? AND company_id = ?'
      params.push(_id, companyId)

      this.db.query(updateSql).run(...params)

      // Update OID IDs if provided
      if (input.oidIds !== undefined) {
        // Delete existing OID IDs
        this.db.query(`
          DELETE FROM snmpv3_template_oids
          WHERE snmpv3_template_id = ?
        `).run(_id)

        // Insert new OID IDs
        if (input.oidIds.length > 0) {
          const oidStmt = this.db.prepare(`
            INSERT INTO snmpv3_template_oids (
              snmpv3_template_id, oid_id
            ) VALUES (?, ?)
          `)

          for (const oidId of input.oidIds) {
            oidStmt.run(_id, oidId)
          }
        }
      }

      // Update stock IDs if provided
      if (input.stockIds !== undefined) {
        // Delete existing stock IDs
        this.db.query(`
          DELETE FROM snmpv3_template_stock
          WHERE snmpv3_template_id = ?
        `).run(_id)

        // Insert new stock IDs
        if (input.stockIds.length > 0) {
          const stockStmt = this.db.prepare(`
            INSERT INTO snmpv3_template_stock (
              snmpv3_template_id, stock_id
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
        this.db.query(`
          DELETE FROM snmpv3_template_network_inventory
          WHERE snmpv3_template_id = ?
        `).run(_id)

        // Insert new network inventory IDs
        if (input.networkInventoryIds.length > 0) {
          const networkStmt = this.db.prepare(`
            INSERT INTO snmpv3_template_network_inventory (
              snmpv3_template_id, network_inventory_id
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
   * Delete a SNMPv3 template
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the template exists
    const existingTemplate = this.getById(_id, companyId)
    if (!existingTemplate) {
      return false
    }

    // Start a transaction to delete the template and all related data
    const deleteTemplate = this.db.transaction(() => {
      // Delete OID associations
      this.db.query(`
        DELETE FROM snmpv3_template_oids
        WHERE snmpv3_template_id = ?
      `).run(_id)

      // Delete stock associations
      this.db.query(`
        DELETE FROM snmpv3_template_stock
        WHERE snmpv3_template_id = ?
      `).run(_id)

      // Delete network inventory associations
      this.db.query(`
        DELETE FROM snmpv3_template_network_inventory
        WHERE snmpv3_template_id = ?
      `).run(_id)

      // Delete the main template record
      this.db.query(`
        DELETE FROM snmpv3_templates
        WHERE _id = ? AND company_id = ?
      `).run(_id, companyId)
    })

    // Execute the transaction
    deleteTemplate()

    return true
  }
}

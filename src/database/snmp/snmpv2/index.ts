/**
 * SNMPv2 Repository
 * Provides data access methods for SNMPv2 settings using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  snmpv2TableSchema,
  snmpv2Indexes,
  ExtendedSNMPv2Fields,
} from '@/schema/network-administration/snmp/snmpv2/schema'

export class SNMPv2Repository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for SNMPv2 settings
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(snmpv2TableSchema)

    // Create indexes
    this.db.run(snmpv2Indexes)
  }

  /**
   * Get all SNMPv2 settings for a company
   */
  async getForCompany(companyId: string): Promise<ExtendedSNMPv2Fields[]> {
    // Create a prepared statement to get all SNMPv2 settings for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        community_name, read_community, write_community,
        created_at, updated_at
      FROM snmpv2_settings
      WHERE company_id = ?
    `)

    // Execute the query
    const settings = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      manufacturer_id: string | null
      model_id: string | null
      product_id: string | null
      community_name: string
      read_community: string
      write_community: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedSNMPv2Fields interface
    const results = settings.map(setting => {
      return {
        _id: setting._id,
        companyId: setting.company_id,
        manufacturerId: setting.manufacturer_id || undefined,
        modelId: setting.model_id || undefined,
        productId: setting.product_id || undefined,
        communityName: setting.community_name,
        readCommunity: setting.read_community,
        writeCommunity: setting.write_community,
        description: '', // Description not stored in database
        createdAt: setting.created_at,
        updatedAt: setting.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single SNMPv2 setting by ID
   */
  getById(_id: string, companyId: string): ExtendedSNMPv2Fields | null {
    // Create a prepared statement to get a SNMPv2 setting by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        community_name, read_community, write_community,
        created_at, updated_at
      FROM snmpv2_settings
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const setting = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          manufacturer_id: string | null
          model_id: string | null
          product_id: string | null
          community_name: string
          read_community: string
          write_community: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!setting) {
      return null
    }

    return {
      _id: setting._id,
      companyId: setting.company_id,
      manufacturerId: setting.manufacturer_id || undefined,
      modelId: setting.model_id || undefined,
      productId: setting.product_id || undefined,
      communityName: setting.community_name,
      readCommunity: setting.read_community,
      writeCommunity: setting.write_community,
      description: '', // Description not stored in database
      createdAt: setting.created_at,
      updatedAt: setting.updated_at,
    }
  }

  /**
   * Get a SNMPv2 setting by community name
   */
  getByCommunityName(
    name: string,
    companyId: string
  ): ExtendedSNMPv2Fields | null {
    // Create a prepared statement to get a SNMPv2 setting by community name and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        community_name, read_community, write_community,
        created_at, updated_at
      FROM snmpv2_settings
      WHERE community_name = ? AND company_id = ?
    `)

    // Execute the query
    const setting = stmt.get(name, companyId) as
      | {
          _id: string
          company_id: string
          manufacturer_id: string | null
          model_id: string | null
          product_id: string | null
          community_name: string
          read_community: string
          write_community: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!setting) {
      return null
    }

    return {
      _id: setting._id,
      companyId: setting.company_id,
      manufacturerId: setting.manufacturer_id || undefined,
      modelId: setting.model_id || undefined,
      productId: setting.product_id || undefined,
      communityName: setting.community_name,
      readCommunity: setting.read_community,
      writeCommunity: setting.write_community,
      description: '', // Description not stored in database
      createdAt: setting.created_at,
      updatedAt: setting.updated_at,
    }
  }

  /**
   * Create a new SNMPv2 setting
   */
  create(
    companyId: string,
    input: Partial<ExtendedSNMPv2Fields>
  ): ExtendedSNMPv2Fields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.communityName) {
      throw new Error('Community name is required')
    }
    if (!input.readCommunity) {
      throw new Error('Read community is required')
    }
    if (!input.writeCommunity) {
      throw new Error('Write community is required')
    }

    // Check if a setting with the same community name already exists
    const existingSetting = this.getByCommunityName(
      input.communityName,
      companyId
    )
    if (existingSetting) {
      throw new Error(
        `A SNMPv2 setting with the community name ${input.communityName} already exists`
      )
    }

    // Prepare parameters
    const communityName = input.communityName
    const readCommunity = input.readCommunity
    const writeCommunity = input.writeCommunity
    const manufacturerId = input.manufacturerId || null
    const modelId = input.modelId || null
    const productId = input.productId || null

    // Insert the SNMPv2 setting
    this.db
      .query(
        `
      INSERT INTO snmpv2_settings (
        _id, company_id, manufacturer_id, model_id, product_id,
        community_name, read_community, write_community,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        manufacturerId,
        modelId,
        productId,
        communityName,
        readCommunity,
        writeCommunity,
        now,
        now
      )

    // Return the newly created setting
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing SNMPv2 setting
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedSNMPv2Fields>
  ): ExtendedSNMPv2Fields | null {
    // Check if the setting exists
    const existingSetting = this.getById(_id, companyId)
    if (!existingSetting) {
      return null
    }

    // If updating the community name, check for duplicates
    if (
      input.communityName &&
      input.communityName !== existingSetting.communityName
    ) {
      const duplicateSetting = this.getByCommunityName(
        input.communityName,
        companyId
      )
      if (duplicateSetting && duplicateSetting._id !== _id) {
        throw new Error(
          `A SNMPv2 setting with the community name ${input.communityName} already exists`
        )
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE snmpv2_settings SET updated_at = ?'
    const params: any[] = [now]

    if (input.communityName !== undefined) {
      updateSql += ', community_name = ?'
      params.push(input.communityName)
    }

    if (input.readCommunity !== undefined) {
      updateSql += ', read_community = ?'
      params.push(input.readCommunity)
    }

    if (input.writeCommunity !== undefined) {
      updateSql += ', write_community = ?'
      params.push(input.writeCommunity)
    }

    if (input.manufacturerId !== undefined) {
      updateSql += ', manufacturer_id = ?'
      params.push(input.manufacturerId || null)
    }

    if (input.modelId !== undefined) {
      updateSql += ', model_id = ?'
      params.push(input.modelId || null)
    }

    if (input.productId !== undefined) {
      updateSql += ', product_id = ?'
      params.push(input.productId || null)
    }

    updateSql += ' WHERE _id = ? AND company_id = ?'
    params.push(_id, companyId)

    this.db.query(updateSql).run(...params)

    // Return the updated setting
    return this.getById(_id, companyId)
  }

  /**
   * Delete a SNMPv2 setting
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the setting exists
    const existingSetting = this.getById(_id, companyId)
    if (!existingSetting) {
      return false
    }

    // Start a transaction to delete the setting and check for dependencies
    const deleteSetting = this.db.transaction(() => {
      // Check if any SNMPv2 templates are using this setting
      const templateStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM snmpv2_templates
        WHERE snmpv2_setting_id = ?
      `)

      const templateResult = templateStmt.get(_id) as { count: number }

      if (templateResult.count > 0) {
        throw new Error(
          `Cannot delete SNMPv2 setting: ${templateResult.count} templates are using this setting.`
        )
      }

      // Delete the setting
      this.db
        .query(
          `
        DELETE FROM snmpv2_settings
        WHERE _id = ? AND company_id = ?
      `
        )
        .run(_id, companyId)
    })

    try {
      // Execute the transaction
      deleteSetting()
      return true
    } catch (error) {
      console.error('Failed to delete SNMPv2 setting:', error)
      return false
    }
  }
}

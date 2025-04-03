/**
 * SNMPv3 Repository
 * Provides data access methods for SNMPv3 settings using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  snmpv3TableSchema,
  snmpv3Indexes,
  ExtendedSNMPv3Fields,
} from '@/schema/network-administration/snmp/snmpv3/schema'

export class SNMPv3Repository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for SNMPv3 settings
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(snmpv3TableSchema)

    // Create indexes
    this.db.run(snmpv3Indexes)
  }

  /**
   * Get all SNMPv3 settings for a company
   */
  async getForCompany(companyId: string): Promise<ExtendedSNMPv3Fields[]> {
    // Create a prepared statement to get all SNMPv3 settings for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        community_name, user_name, auth_method, auth_password,
        encryption_method, encryption_password, 
        created_at, updated_at
      FROM snmpv3_settings
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
      user_name: string
      auth_method: string
      auth_password: string
      encryption_method: string
      encryption_password: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedSNMPv3Fields interface
    const results = settings.map(setting => {
      return {
        _id: setting._id,
        companyId: setting.company_id,
        manufacturerId: setting.manufacturer_id || undefined,
        modelId: setting.model_id || undefined,
        productId: setting.product_id || undefined,
        communityName: setting.community_name,
        userName: setting.user_name,
        authMethod: setting.auth_method,
        authPassword: setting.auth_password,
        encryptionMethod: setting.encryption_method,
        encryptionPassword: setting.encryption_password,
        description: '', // Description not stored in database
        createdAt: setting.created_at,
        updatedAt: setting.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single SNMPv3 setting by ID
   */
  getById(_id: string, companyId: string): ExtendedSNMPv3Fields | null {
    // Create a prepared statement to get a SNMPv3 setting by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        community_name, user_name, auth_method, auth_password,
        encryption_method, encryption_password, 
        created_at, updated_at
      FROM snmpv3_settings
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
          user_name: string
          auth_method: string
          auth_password: string
          encryption_method: string
          encryption_password: string
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
      userName: setting.user_name,
      authMethod: setting.auth_method,
      authPassword: setting.auth_password,
      encryptionMethod: setting.encryption_method,
      encryptionPassword: setting.encryption_password,
      description: '', // Description not stored in database
      createdAt: setting.created_at,
      updatedAt: setting.updated_at,
    }
  }

  /**
   * Get a SNMPv3 setting by username
   */
  getByUsername(
    userName: string,
    companyId: string
  ): ExtendedSNMPv3Fields | null {
    // Create a prepared statement to get a SNMPv3 setting by username and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        community_name, user_name, auth_method, auth_password,
        encryption_method, encryption_password, 
        created_at, updated_at
      FROM snmpv3_settings
      WHERE user_name = ? AND company_id = ?
    `)

    // Execute the query
    const setting = stmt.get(userName, companyId) as
      | {
          _id: string
          company_id: string
          manufacturer_id: string | null
          model_id: string | null
          product_id: string | null
          community_name: string
          user_name: string
          auth_method: string
          auth_password: string
          encryption_method: string
          encryption_password: string
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
      userName: setting.user_name,
      authMethod: setting.auth_method,
      authPassword: setting.auth_password,
      encryptionMethod: setting.encryption_method,
      encryptionPassword: setting.encryption_password,
      description: '', // Description not stored in database
      createdAt: setting.created_at,
      updatedAt: setting.updated_at,
    }
  }

  /**
   * Create a new SNMPv3 setting
   */
  create(
    companyId: string,
    input: Partial<ExtendedSNMPv3Fields>
  ): ExtendedSNMPv3Fields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.communityName) {
      throw new Error('Community name is required')
    }
    if (!input.userName) {
      throw new Error('Username is required')
    }
    if (!input.authMethod) {
      throw new Error('Authentication method is required')
    }
    if (!input.authPassword) {
      throw new Error('Authentication password is required')
    }
    if (!input.encryptionMethod) {
      throw new Error('Encryption method is required')
    }
    if (!input.encryptionPassword) {
      throw new Error('Encryption password is required')
    }

    // Check if a setting with the same username already exists
    const existingSetting = this.getByUsername(input.userName, companyId)
    if (existingSetting) {
      throw new Error(
        `A SNMPv3 setting with the username ${input.userName} already exists`
      )
    }

    // Prepare parameters
    const communityName = input.communityName
    const userName = input.userName
    const authMethod = input.authMethod
    const authPassword = input.authPassword
    const encryptionMethod = input.encryptionMethod
    const encryptionPassword = input.encryptionPassword
    const manufacturerId = input.manufacturerId || null
    const modelId = input.modelId || null
    const productId = input.productId || null

    // Insert the SNMPv3 setting
    this.db
      .query(
        `
      INSERT INTO snmpv3_settings (
        _id, company_id, manufacturer_id, model_id, product_id,
        community_name, user_name, auth_method, auth_password,
        encryption_method, encryption_password,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        manufacturerId,
        modelId,
        productId,
        communityName,
        userName,
        authMethod,
        authPassword,
        encryptionMethod,
        encryptionPassword,
        now,
        now
      )

    // Return the newly created setting
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing SNMPv3 setting
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedSNMPv3Fields>
  ): ExtendedSNMPv3Fields | null {
    // Check if the setting exists
    const existingSetting = this.getById(_id, companyId)
    if (!existingSetting) {
      return null
    }

    // If updating the username, check for duplicates
    if (input.userName && input.userName !== existingSetting.userName) {
      const duplicateSetting = this.getByUsername(input.userName, companyId)
      if (duplicateSetting && duplicateSetting._id !== _id) {
        throw new Error(
          `A SNMPv3 setting with the username ${input.userName} already exists`
        )
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE snmpv3_settings SET updated_at = ?'
    const params: any[] = [now]

    if (input.communityName !== undefined) {
      updateSql += ', community_name = ?'
      params.push(input.communityName)
    }

    if (input.userName !== undefined) {
      updateSql += ', user_name = ?'
      params.push(input.userName)
    }

    if (input.authMethod !== undefined) {
      updateSql += ', auth_method = ?'
      params.push(input.authMethod)
    }

    if (input.authPassword !== undefined) {
      updateSql += ', auth_password = ?'
      params.push(input.authPassword)
    }

    if (input.encryptionMethod !== undefined) {
      updateSql += ', encryption_method = ?'
      params.push(input.encryptionMethod)
    }

    if (input.encryptionPassword !== undefined) {
      updateSql += ', encryption_password = ?'
      params.push(input.encryptionPassword)
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
   * Delete a SNMPv3 setting
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the setting exists
    const existingSetting = this.getById(_id, companyId)
    if (!existingSetting) {
      return false
    }

    // Start a transaction to delete the setting and check for dependencies
    const deleteSetting = this.db.transaction(() => {
      // Check if any SNMPv3 templates are using this setting
      const templateStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM snmpv3_templates
        WHERE snmpv3_setting_id = ?
      `)

      const templateResult = templateStmt.get(_id) as { count: number }

      if (templateResult.count > 0) {
        throw new Error(
          `Cannot delete SNMPv3 setting: ${templateResult.count} templates are using this setting.`
        )
      }

      // Delete the setting
      this.db
        .query(
          `
        DELETE FROM snmpv3_settings
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
      console.error('Failed to delete SNMPv3 setting:', error)
      return false
    }
  }
}

/**
 * SNMP OID Repository
 * Provides data access methods for SNMP OIDs using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  oidTableSchema,
  oidIndexes,
  ExtendedOIDFields,
} from '@/schema/network-administration/snmp/oid/schema'

export class SNMPOIDRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for SNMP OIDs
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(oidTableSchema)

    // Create indexes
    this.db.run(oidIndexes)
  }

  /**
   * Get all SNMP OIDs for a company
   */
  async getForCompany(companyId: string): Promise<ExtendedOIDFields[]> {
    // Create a prepared statement to get all OIDs for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        oid_name, oid, description, created_at, updated_at
      FROM snmp_oids
      WHERE company_id = ?
    `)

    // Execute the query
    const oids = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      manufacturer_id: string | null
      model_id: string | null
      product_id: string | null
      oid_name: string
      oid: string
      description: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedOIDFields interface
    const results = oids.map(oid => {
      return {
        _id: oid._id,
        companyId: oid.company_id,
        manufacturerId: oid.manufacturer_id || undefined,
        modelId: oid.model_id || undefined,
        productId: oid.product_id || undefined,
        oidName: oid.oid_name,
        oid: oid.oid,
        description: oid.description,
        createdAt: oid.created_at,
        updatedAt: oid.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single SNMP OID by ID
   */
  getById(_id: string, companyId: string): ExtendedOIDFields | null {
    // Create a prepared statement to get an OID by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        oid_name, oid, description, created_at, updated_at
      FROM snmp_oids
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const oid = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          manufacturer_id: string | null
          model_id: string | null
          product_id: string | null
          oid_name: string
          oid: string
          description: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!oid) {
      return null
    }

    return {
      _id: oid._id,
      companyId: oid.company_id,
      manufacturerId: oid.manufacturer_id || undefined,
      modelId: oid.model_id || undefined,
      productId: oid.product_id || undefined,
      oidName: oid.oid_name,
      oid: oid.oid,
      description: oid.description,
      createdAt: oid.created_at,
      updatedAt: oid.updated_at,
    }
  }

  /**
   * Get an OID by name
   */
  getByName(name: string, companyId: string): ExtendedOIDFields | null {
    // Create a prepared statement to get an OID by name and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        oid_name, oid, description, created_at, updated_at
      FROM snmp_oids
      WHERE oid_name = ? AND company_id = ?
    `)

    // Execute the query
    const oid = stmt.get(name, companyId) as
      | {
          _id: string
          company_id: string
          manufacturer_id: string | null
          model_id: string | null
          product_id: string | null
          oid_name: string
          oid: string
          description: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!oid) {
      return null
    }

    return {
      _id: oid._id,
      companyId: oid.company_id,
      manufacturerId: oid.manufacturer_id || undefined,
      modelId: oid.model_id || undefined,
      productId: oid.product_id || undefined,
      oidName: oid.oid_name,
      oid: oid.oid,
      description: oid.description,
      createdAt: oid.created_at,
      updatedAt: oid.updated_at,
    }
  }

  /**
   * Get an OID by the actual OID string
   */
  getByOID(oidString: string, companyId: string): ExtendedOIDFields | null {
    // Create a prepared statement to get an OID by the OID string and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, manufacturer_id, model_id, product_id,
        oid_name, oid, description, created_at, updated_at
      FROM snmp_oids
      WHERE oid = ? AND company_id = ?
    `)

    // Execute the query
    const oid = stmt.get(oidString, companyId) as
      | {
          _id: string
          company_id: string
          manufacturer_id: string | null
          model_id: string | null
          product_id: string | null
          oid_name: string
          oid: string
          description: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!oid) {
      return null
    }

    return {
      _id: oid._id,
      companyId: oid.company_id,
      manufacturerId: oid.manufacturer_id || undefined,
      modelId: oid.model_id || undefined,
      productId: oid.product_id || undefined,
      oidName: oid.oid_name,
      oid: oid.oid,
      description: oid.description,
      createdAt: oid.created_at,
      updatedAt: oid.updated_at,
    }
  }

  /**
   * Create a new SNMP OID
   */
  create(
    companyId: string,
    input: Partial<ExtendedOIDFields>
  ): ExtendedOIDFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.oidName) {
      throw new Error('OID name is required')
    }
    if (!input.oid) {
      throw new Error('OID is required')
    }

    // Check if an OID with the same name already exists
    const existingOIDByName = this.getByName(input.oidName, companyId)
    if (existingOIDByName) {
      throw new Error(`An OID with the name ${input.oidName} already exists`)
    }

    // Check if an OID with the same OID string already exists
    const existingOIDByOID = this.getByOID(input.oid, companyId)
    if (existingOIDByOID) {
      throw new Error(`An OID with the OID ${input.oid} already exists`)
    }

    // Prepare parameters
    const oidName = input.oidName
    const oid = input.oid
    const description = input.description || ''
    const manufacturerId = input.manufacturerId || null
    const modelId = input.modelId || null
    const productId = input.productId || null

    // Insert the SNMP OID
    this.db
      .query(
        `
      INSERT INTO snmp_oids (
        _id, company_id, manufacturer_id, model_id, product_id,
        oid_name, oid, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        manufacturerId,
        modelId,
        productId,
        oidName,
        oid,
        description,
        now,
        now
      )

    // Return the newly created OID
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing SNMP OID
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedOIDFields>
  ): ExtendedOIDFields | null {
    // Check if the OID exists
    const existingOID = this.getById(_id, companyId)
    if (!existingOID) {
      return null
    }

    // If updating the name, check for duplicates
    if (input.oidName && input.oidName !== existingOID.oidName) {
      const duplicateOID = this.getByName(input.oidName, companyId)
      if (duplicateOID && duplicateOID._id !== _id) {
        throw new Error(`An OID with the name ${input.oidName} already exists`)
      }
    }

    // If updating the OID string, check for duplicates
    if (input.oid && input.oid !== existingOID.oid) {
      const duplicateOID = this.getByOID(input.oid, companyId)
      if (duplicateOID && duplicateOID._id !== _id) {
        throw new Error(`An OID with the OID ${input.oid} already exists`)
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE snmp_oids SET updated_at = ?'
    const params: any[] = [now]

    if (input.oidName !== undefined) {
      updateSql += ', oid_name = ?'
      params.push(input.oidName)
    }

    if (input.oid !== undefined) {
      updateSql += ', oid = ?'
      params.push(input.oid)
    }

    if (input.description !== undefined) {
      updateSql += ', description = ?'
      params.push(input.description)
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

    // Return the updated OID
    return this.getById(_id, companyId)
  }

  /**
   * Delete an SNMP OID
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the OID exists
    const existingOID = this.getById(_id, companyId)
    if (!existingOID) {
      return false
    }

    // Start a transaction to delete the OID and check for dependencies
    const deleteOID = this.db.transaction(() => {
      // Check if any SNMPv2 templates are using this OID
      const v2Stmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM snmpv2_template_oids
        WHERE oid_id = ?
      `)

      const v2Result = v2Stmt.get(_id) as { count: number }

      if (v2Result.count > 0) {
        throw new Error(
          `Cannot delete OID: ${v2Result.count} SNMPv2 templates are using this OID.`
        )
      }

      // Check if any SNMPv3 templates are using this OID
      const v3Stmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM snmpv3_template_oids
        WHERE oid_id = ?
      `)

      const v3Result = v3Stmt.get(_id) as { count: number }

      if (v3Result.count > 0) {
        throw new Error(
          `Cannot delete OID: ${v3Result.count} SNMPv3 templates are using this OID.`
        )
      }

      // Delete the OID
      this.db
        .query(
          `
        DELETE FROM snmp_oids
        WHERE _id = ? AND company_id = ?
      `
        )
        .run(_id, companyId)
    })

    try {
      // Execute the transaction
      deleteOID()
      return true
    } catch (error) {
      console.error('Failed to delete SNMP OID:', error)
      return false
    }
  }
}

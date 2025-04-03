/**
 * IP Supernet Repository
 * Provides data access methods for IP supernets using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  supernetTableSchema,
  supernetIndexes,
  ExtendedSupernetFields,
} from '@/schema/network-administration/ipam/supernet/schema'

export class IPSupernetRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for IP supernets
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(supernetTableSchema)

    // Create indexes
    this.db.run(supernetIndexes)
  }

  /**
   * Get all IP supernets for a company
   */
  async getForCompany(companyId: string): Promise<ExtendedSupernetFields[]> {
    // Create a prepared statement to get all IP supernets for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, cidr, supernet_address,
        created_at, updated_at
      FROM ip_supernets
      WHERE company_id = ?
    `)

    // Execute the query
    const supernets = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      name: string
      description: string
      cidr: string
      supernet_address: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedSupernetFields interface
    const results = supernets.map(supernet => {
      return {
        _id: supernet._id,
        companyId: supernet.company_id,
        name: supernet.name,
        description: supernet.description,
        cidr: supernet.cidr,
        supernetAddress: supernet.supernet_address,
        createdAt: supernet.created_at,
        updatedAt: supernet.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single IP supernet by ID
   */
  getById(_id: string, companyId: string): ExtendedSupernetFields | null {
    // Create a prepared statement to get a supernet by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, cidr, supernet_address,
        created_at, updated_at
      FROM ip_supernets
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const supernet = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          description: string
          cidr: string
          supernet_address: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!supernet) {
      return null
    }

    return {
      _id: supernet._id,
      companyId: supernet.company_id,
      name: supernet.name,
      description: supernet.description,
      cidr: supernet.cidr,
      supernetAddress: supernet.supernet_address,
      createdAt: supernet.created_at,
      updatedAt: supernet.updated_at,
    }
  }

  /**
   * Get a supernet by name
   */
  getByName(name: string, companyId: string): ExtendedSupernetFields | null {
    // Create a prepared statement to get a supernet by name and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, description, cidr, supernet_address,
        created_at, updated_at
      FROM ip_supernets
      WHERE name = ? AND company_id = ?
    `)

    // Execute the query
    const supernet = stmt.get(name, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          description: string
          cidr: string
          supernet_address: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!supernet) {
      return null
    }

    return {
      _id: supernet._id,
      companyId: supernet.company_id,
      name: supernet.name,
      description: supernet.description,
      cidr: supernet.cidr,
      supernetAddress: supernet.supernet_address,
      createdAt: supernet.created_at,
      updatedAt: supernet.updated_at,
    }
  }

  /**
   * Create a new IP supernet
   */
  create(
    companyId: string,
    input: Partial<ExtendedSupernetFields>
  ): ExtendedSupernetFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.name) {
      throw new Error('Supernet name is required')
    }
    if (!input.description) {
      throw new Error('Description is required')
    }
    if (!input.cidr) {
      throw new Error('CIDR is required')
    }
    if (!input.supernetAddress) {
      throw new Error('Supernet address is required')
    }

    // Check if a supernet with the same name already exists
    const existingSupernet = this.getByName(input.name, companyId)
    if (existingSupernet) {
      throw new Error(`A supernet with the name ${input.name} already exists`)
    }

    // Prepare parameters
    const name = input.name
    const description = input.description
    const cidr = input.cidr
    const supernetAddress = input.supernetAddress

    // Insert the IP supernet
    this.db
      .query(
        `
      INSERT INTO ip_supernets (
        _id, company_id, name, description, cidr, supernet_address,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(_id, companyId, name, description, cidr, supernetAddress, now, now)

    // Return the newly created supernet
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing IP supernet
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedSupernetFields>
  ): ExtendedSupernetFields | null {
    // Check if the supernet exists
    const existingSupernet = this.getById(_id, companyId)
    if (!existingSupernet) {
      return null
    }

    // If updating the name, check for duplicates
    if (input.name && input.name !== existingSupernet.name) {
      const duplicateSupernet = this.getByName(input.name, companyId)
      if (duplicateSupernet && duplicateSupernet._id !== _id) {
        throw new Error(`A supernet with the name ${input.name} already exists`)
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE ip_supernets SET updated_at = ?'
    const params: any[] = [now]

    if (input.name !== undefined) {
      updateSql += ', name = ?'
      params.push(input.name)
    }

    if (input.description !== undefined) {
      updateSql += ', description = ?'
      params.push(input.description)
    }

    if (input.cidr !== undefined) {
      updateSql += ', cidr = ?'
      params.push(input.cidr)
    }

    if (input.supernetAddress !== undefined) {
      updateSql += ', supernet_address = ?'
      params.push(input.supernetAddress)
    }

    updateSql += ' WHERE _id = ? AND company_id = ?'
    params.push(_id, companyId)

    this.db.query(updateSql).run(...params)

    // Return the updated supernet
    return this.getById(_id, companyId)
  }

  /**
   * Delete an IP supernet
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the supernet exists
    const existingSupernet = this.getById(_id, companyId)
    if (!existingSupernet) {
      return false
    }

    // Start a transaction to delete the supernet and check for dependencies
    const deleteSupernet = this.db.transaction(() => {
      // First, check if there are any subnets using this supernet
      const subnetStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM ip_subnets
        WHERE supernet_id = ?
      `)

      const subnetResult = subnetStmt.get(_id) as { count: number }

      if (subnetResult.count > 0) {
        throw new Error(
          `Cannot delete supernet: ${subnetResult.count} subnets are using this supernet.`
        )
      }

      // Next, check if there are any pools directly using this supernet
      const poolStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM ip_pools
        WHERE supernet_id = ?
      `)

      const poolResult = poolStmt.get(_id) as { count: number }

      if (poolResult.count > 0) {
        throw new Error(
          `Cannot delete supernet: ${poolResult.count} IP pools are using this supernet.`
        )
      }

      // Next, check if there are any IP addresses directly using this supernet
      const addrStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM ip_addresses
        WHERE supernet_id = ?
      `)

      const addrResult = addrStmt.get(_id) as { count: number }

      if (addrResult.count > 0) {
        throw new Error(
          `Cannot delete supernet: ${addrResult.count} IP addresses are using this supernet.`
        )
      }

      // Finally, check if there are any VLANs directly using this supernet
      const vlanStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM vlans
        WHERE supernet_id = ?
      `)

      const vlanResult = vlanStmt.get(_id) as { count: number }

      if (vlanResult.count > 0) {
        throw new Error(
          `Cannot delete supernet: ${vlanResult.count} VLANs are using this supernet.`
        )
      }

      // Delete the supernet
      this.db
        .query(
          `
        DELETE FROM ip_supernets
        WHERE _id = ? AND company_id = ?
      `
        )
        .run(_id, companyId)
    })

    try {
      // Execute the transaction
      deleteSupernet()
      return true
    } catch (error) {
      console.error('Failed to delete IP supernet:', error)
      return false
    }
  }
}

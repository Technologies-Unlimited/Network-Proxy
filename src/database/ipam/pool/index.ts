/**
 * IP Pool Repository
 * Provides data access methods for IP pools using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  poolTableSchema,
  poolIndexes,
  ExtendedPoolFields,
} from '@/schema/network-administration/ipam/pool/schema'

export class IPPoolRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for IP pools
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(poolTableSchema)

    // Create indexes
    this.db.run(poolIndexes)
  }

  /**
   * Get all IP pools for a company
   */
  async getForCompany(companyId: string): Promise<ExtendedPoolFields[]> {
    // Create a prepared statement to get all IP pools for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, start_ip, end_ip, description,
        subnet_id, supernet_id, created_at, updated_at
      FROM ip_pools
      WHERE company_id = ?
    `)

    // Execute the query
    const pools = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      name: string
      start_ip: string
      end_ip: string
      description: string
      subnet_id: string
      supernet_id: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedPoolFields interface
    const results = pools.map(pool => {
      return {
        _id: pool._id,
        companyId: pool.company_id,
        name: pool.name,
        startIp: pool.start_ip,
        endIp: pool.end_ip,
        description: pool.description,
        subnetId: pool.subnet_id,
        supernetId: pool.supernet_id,
        createdAt: pool.created_at,
        updatedAt: pool.updated_at,
      }
    })

    return results
  }

  /**
   * Get pools by subnet ID
   */
  async getBySubnetId(
    subnetId: string,
    companyId: string
  ): Promise<ExtendedPoolFields[]> {
    // Create a prepared statement to get pools by subnet ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, start_ip, end_ip, description,
        subnet_id, supernet_id, created_at, updated_at
      FROM ip_pools
      WHERE subnet_id = ? AND company_id = ?
    `)

    // Execute the query
    const pools = stmt.all(subnetId, companyId) as Array<{
      _id: string
      company_id: string
      name: string
      start_ip: string
      end_ip: string
      description: string
      subnet_id: string
      supernet_id: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedPoolFields interface
    const results = pools.map(pool => {
      return {
        _id: pool._id,
        companyId: pool.company_id,
        name: pool.name,
        startIp: pool.start_ip,
        endIp: pool.end_ip,
        description: pool.description,
        subnetId: pool.subnet_id,
        supernetId: pool.supernet_id,
        createdAt: pool.created_at,
        updatedAt: pool.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single IP pool by ID
   */
  getById(_id: string, companyId: string): ExtendedPoolFields | null {
    // Create a prepared statement to get a pool by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, start_ip, end_ip, description,
        subnet_id, supernet_id, created_at, updated_at
      FROM ip_pools
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const pool = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          start_ip: string
          end_ip: string
          description: string
          subnet_id: string
          supernet_id: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!pool) {
      return null
    }

    return {
      _id: pool._id,
      companyId: pool.company_id,
      name: pool.name,
      startIp: pool.start_ip,
      endIp: pool.end_ip,
      description: pool.description,
      subnetId: pool.subnet_id,
      supernetId: pool.supernet_id,
      createdAt: pool.created_at,
      updatedAt: pool.updated_at,
    }
  }

  /**
   * Get a pool by name
   */
  getByName(name: string, companyId: string): ExtendedPoolFields | null {
    // Create a prepared statement to get a pool by name and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, start_ip, end_ip, description,
        subnet_id, supernet_id, created_at, updated_at
      FROM ip_pools
      WHERE name = ? AND company_id = ?
    `)

    // Execute the query
    const pool = stmt.get(name, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          start_ip: string
          end_ip: string
          description: string
          subnet_id: string
          supernet_id: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!pool) {
      return null
    }

    return {
      _id: pool._id,
      companyId: pool.company_id,
      name: pool.name,
      startIp: pool.start_ip,
      endIp: pool.end_ip,
      description: pool.description,
      subnetId: pool.subnet_id,
      supernetId: pool.supernet_id,
      createdAt: pool.created_at,
      updatedAt: pool.updated_at,
    }
  }

  /**
   * Create a new IP pool
   */
  create(
    companyId: string,
    input: Partial<ExtendedPoolFields>
  ): ExtendedPoolFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.name) {
      throw new Error('Pool name is required')
    }
    if (!input.startIp) {
      throw new Error('Start IP is required')
    }
    if (!input.endIp) {
      throw new Error('End IP is required')
    }
    if (!input.subnetId) {
      throw new Error('Subnet ID is required')
    }
    if (!input.supernetId) {
      throw new Error('Supernet ID is required')
    }

    // Check if a pool with the same name already exists
    const existingPool = this.getByName(input.name, companyId)
    if (existingPool) {
      throw new Error(`A pool with the name ${input.name} already exists`)
    }

    // Prepare parameters
    const name = input.name
    const startIp = input.startIp
    const endIp = input.endIp
    const description = input.description || ''
    const subnetId = input.subnetId
    const supernetId = input.supernetId

    // Insert the IP pool
    this.db
      .query(
        `
      INSERT INTO ip_pools (
        _id, company_id, name, start_ip, end_ip, description,
        subnet_id, supernet_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        name,
        startIp,
        endIp,
        description,
        subnetId,
        supernetId,
        now,
        now
      )

    // Return the newly created pool
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing IP pool
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedPoolFields>
  ): ExtendedPoolFields | null {
    // Check if the pool exists
    const existingPool = this.getById(_id, companyId)
    if (!existingPool) {
      return null
    }

    // If updating the name, check for duplicates
    if (input.name && input.name !== existingPool.name) {
      const duplicatePool = this.getByName(input.name, companyId)
      if (duplicatePool && duplicatePool._id !== _id) {
        throw new Error(`A pool with the name ${input.name} already exists`)
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE ip_pools SET updated_at = ?'
    const params: any[] = [now]

    if (input.name !== undefined) {
      updateSql += ', name = ?'
      params.push(input.name)
    }

    if (input.startIp !== undefined) {
      updateSql += ', start_ip = ?'
      params.push(input.startIp)
    }

    if (input.endIp !== undefined) {
      updateSql += ', end_ip = ?'
      params.push(input.endIp)
    }

    if (input.description !== undefined) {
      updateSql += ', description = ?'
      params.push(input.description)
    }

    if (input.subnetId !== undefined) {
      updateSql += ', subnet_id = ?'
      params.push(input.subnetId)
    }

    if (input.supernetId !== undefined) {
      updateSql += ', supernet_id = ?'
      params.push(input.supernetId)
    }

    updateSql += ' WHERE _id = ? AND company_id = ?'
    params.push(_id, companyId)

    this.db.query(updateSql).run(...params)

    // Return the updated pool
    return this.getById(_id, companyId)
  }

  /**
   * Delete an IP pool
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the pool exists
    const existingPool = this.getById(_id, companyId)
    if (!existingPool) {
      return false
    }

    // Start a transaction to delete the pool and related resources
    const deletePool = this.db.transaction(() => {
      // First, check if there are any IP addresses using this pool
      const stmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM ip_addresses
        WHERE pool_id = ?
      `)

      const result = stmt.get(_id) as { count: number }

      if (result.count > 0) {
        throw new Error(
          `Cannot delete pool: ${result.count} IP addresses are using this pool.`
        )
      }

      // Delete the pool
      this.db
        .query(
          `
        DELETE FROM ip_pools
        WHERE _id = ? AND company_id = ?
      `
        )
        .run(_id, companyId)
    })

    try {
      // Execute the transaction
      deletePool()
      return true
    } catch (error) {
      console.error('Failed to delete IP pool:', error)
      return false
    }
  }
}

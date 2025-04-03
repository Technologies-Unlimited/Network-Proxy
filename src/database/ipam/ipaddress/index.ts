/**
 * IP Address Repository
 * Provides data access methods for IP addresses using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  ipAddressTableSchema,
  ipAddressIndexes,
  ExtendedIPAddressFields,
} from '@/schema/network-administration/ipam/ipaddress/schema'

export class IPAddressRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for IP addresses
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(ipAddressTableSchema)

    // Create indexes
    this.db.run(ipAddressIndexes)
  }

  /**
   * Get all IP addresses for a company
   */
  async getForCompany(companyId: string): Promise<ExtendedIPAddressFields[]> {
    // Create a prepared statement to get all IP addresses for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, address, description, is_used, 
        network_inventory_id, pool_id, subnet_id, supernet_id,
        created_at, updated_at
      FROM ip_addresses
      WHERE company_id = ?
    `)

    // Execute the query
    const addresses = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      address: string
      description: string
      is_used: number
      network_inventory_id: string | null
      pool_id: string
      subnet_id: string
      supernet_id: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedIPAddressFields interface
    const results = addresses.map(address => {
      return {
        _id: address._id,
        companyId: address.company_id,
        address: address.address,
        description: address.description,
        isUsed: Boolean(address.is_used),
        networkInventoryId: address.network_inventory_id || undefined,
        poolId: address.pool_id,
        subnetId: address.subnet_id,
        supernetId: address.supernet_id,
        createdAt: address.created_at,
        updatedAt: address.updated_at,
      }
    })

    return results
  }

  /**
   * Get IP addresses by pool ID
   */
  async getByPoolId(
    poolId: string,
    companyId: string
  ): Promise<ExtendedIPAddressFields[]> {
    // Create a prepared statement to get IP addresses by pool ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, address, description, is_used, 
        network_inventory_id, pool_id, subnet_id, supernet_id,
        created_at, updated_at
      FROM ip_addresses
      WHERE pool_id = ? AND company_id = ?
    `)

    // Execute the query
    const addresses = stmt.all(poolId, companyId) as Array<{
      _id: string
      company_id: string
      address: string
      description: string
      is_used: number
      network_inventory_id: string | null
      pool_id: string
      subnet_id: string
      supernet_id: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedIPAddressFields interface
    const results = addresses.map(address => {
      return {
        _id: address._id,
        companyId: address.company_id,
        address: address.address,
        description: address.description,
        isUsed: Boolean(address.is_used),
        networkInventoryId: address.network_inventory_id || undefined,
        poolId: address.pool_id,
        subnetId: address.subnet_id,
        supernetId: address.supernet_id,
        createdAt: address.created_at,
        updatedAt: address.updated_at,
      }
    })

    return results
  }

  /**
   * Get IP addresses by subnet ID
   */
  async getBySubnetId(
    subnetId: string,
    companyId: string
  ): Promise<ExtendedIPAddressFields[]> {
    // Create a prepared statement to get IP addresses by subnet ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, address, description, is_used, 
        network_inventory_id, pool_id, subnet_id, supernet_id,
        created_at, updated_at
      FROM ip_addresses
      WHERE subnet_id = ? AND company_id = ?
    `)

    // Execute the query
    const addresses = stmt.all(subnetId, companyId) as Array<{
      _id: string
      company_id: string
      address: string
      description: string
      is_used: number
      network_inventory_id: string | null
      pool_id: string
      subnet_id: string
      supernet_id: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedIPAddressFields interface
    const results = addresses.map(address => {
      return {
        _id: address._id,
        companyId: address.company_id,
        address: address.address,
        description: address.description,
        isUsed: Boolean(address.is_used),
        networkInventoryId: address.network_inventory_id || undefined,
        poolId: address.pool_id,
        subnetId: address.subnet_id,
        supernetId: address.supernet_id,
        createdAt: address.created_at,
        updatedAt: address.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single IP address by ID
   */
  getById(_id: string, companyId: string): ExtendedIPAddressFields | null {
    // Create a prepared statement to get an IP address by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, address, description, is_used, 
        network_inventory_id, pool_id, subnet_id, supernet_id,
        created_at, updated_at
      FROM ip_addresses
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const address = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          address: string
          description: string
          is_used: number
          network_inventory_id: string | null
          pool_id: string
          subnet_id: string
          supernet_id: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!address) {
      return null
    }

    return {
      _id: address._id,
      companyId: address.company_id,
      address: address.address,
      description: address.description,
      isUsed: Boolean(address.is_used),
      networkInventoryId: address.network_inventory_id || undefined,
      poolId: address.pool_id,
      subnetId: address.subnet_id,
      supernetId: address.supernet_id,
      createdAt: address.created_at,
      updatedAt: address.updated_at,
    }
  }

  /**
   * Get an IP address by address string
   */
  getByAddress(
    address: string,
    companyId: string
  ): ExtendedIPAddressFields | null {
    // Create a prepared statement to get an IP address by address string and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, address, description, is_used, 
        network_inventory_id, pool_id, subnet_id, supernet_id,
        created_at, updated_at
      FROM ip_addresses
      WHERE address = ? AND company_id = ?
    `)

    // Execute the query
    const result = stmt.get(address, companyId) as
      | {
          _id: string
          company_id: string
          address: string
          description: string
          is_used: number
          network_inventory_id: string | null
          pool_id: string
          subnet_id: string
          supernet_id: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!result) {
      return null
    }

    return {
      _id: result._id,
      companyId: result.company_id,
      address: result.address,
      description: result.description,
      isUsed: Boolean(result.is_used),
      networkInventoryId: result.network_inventory_id || undefined,
      poolId: result.pool_id,
      subnetId: result.subnet_id,
      supernetId: result.supernet_id,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    }
  }

  /**
   * Create a new IP address
   */
  create(
    companyId: string,
    input: Partial<ExtendedIPAddressFields>
  ): ExtendedIPAddressFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.address) {
      throw new Error('IP address is required')
    }
    if (!input.poolId) {
      throw new Error('Pool ID is required')
    }
    if (!input.subnetId) {
      throw new Error('Subnet ID is required')
    }
    if (!input.supernetId) {
      throw new Error('Supernet ID is required')
    }

    // Check if an address with the same value already exists
    const existingAddress = this.getByAddress(input.address, companyId)
    if (existingAddress) {
      throw new Error(`IP address ${input.address} already exists`)
    }

    // Prepare parameters
    const address = input.address
    const description = input.description || ''
    const isUsed = input.isUsed !== undefined ? (input.isUsed ? 1 : 0) : 0
    const networkInventoryId = input.networkInventoryId || null
    const poolId = input.poolId
    const subnetId = input.subnetId
    const supernetId = input.supernetId

    // Insert the IP address
    this.db
      .query(
        `
      INSERT INTO ip_addresses (
        _id, company_id, address, description, is_used,
        network_inventory_id, pool_id, subnet_id, supernet_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        address,
        description,
        isUsed,
        networkInventoryId,
        poolId,
        subnetId,
        supernetId,
        now,
        now
      )

    // Return the newly created IP address
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing IP address
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedIPAddressFields>
  ): ExtendedIPAddressFields | null {
    // Check if the IP address exists
    const existingAddress = this.getById(_id, companyId)
    if (!existingAddress) {
      return null
    }

    // If updating the address value, check for duplicates
    if (input.address && input.address !== existingAddress.address) {
      const duplicateAddress = this.getByAddress(input.address, companyId)
      if (duplicateAddress && duplicateAddress._id !== _id) {
        throw new Error(`IP address ${input.address} already exists`)
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE ip_addresses SET updated_at = ?'
    const params: any[] = [now]

    if (input.address !== undefined) {
      updateSql += ', address = ?'
      params.push(input.address)
    }

    if (input.description !== undefined) {
      updateSql += ', description = ?'
      params.push(input.description)
    }

    if (input.isUsed !== undefined) {
      updateSql += ', is_used = ?'
      params.push(input.isUsed ? 1 : 0)
    }

    if (input.networkInventoryId !== undefined) {
      updateSql += ', network_inventory_id = ?'
      params.push(input.networkInventoryId || null)
    }

    if (input.poolId !== undefined) {
      updateSql += ', pool_id = ?'
      params.push(input.poolId)
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

    // Return the updated IP address
    return this.getById(_id, companyId)
  }

  /**
   * Delete an IP address
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the IP address exists
    const existingAddress = this.getById(_id, companyId)
    if (!existingAddress) {
      return false
    }

    // Delete the IP address
    this.db
      .query(
        `
      DELETE FROM ip_addresses
      WHERE _id = ? AND company_id = ?
    `
      )
      .run(_id, companyId)

    return true
  }
}

/**
 * IP Subnet Repository
 * Provides data access methods for IP subnets using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  subnetTableSchema,
  subnetIndexes,
  ExtendedSubnetFields,
} from '@/schema/network-administration/ipam/subnet/schema'

export class IPSubnetRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for IP subnets
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(subnetTableSchema)

    // Create indexes
    this.db.run(subnetIndexes)
  }

  /**
   * Get all IP subnets for a company
   */
  async getForCompany(companyId: string): Promise<ExtendedSubnetFields[]> {
    // Create a prepared statement to get all IP subnets for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, cidr, subnet_address, gateway, 
        description, supernet_id, created_at, updated_at
      FROM ip_subnets
      WHERE company_id = ?
    `)

    // Execute the query
    const subnets = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      name: string
      cidr: string
      subnet_address: string
      gateway: string
      description: string
      supernet_id: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedSubnetFields interface
    const results = subnets.map(subnet => {
      return {
        _id: subnet._id,
        companyId: subnet.company_id,
        name: subnet.name,
        cidr: subnet.cidr,
        subnetAddress: subnet.subnet_address,
        gateway: subnet.gateway,
        description: subnet.description,
        supernetId: subnet.supernet_id,
        createdAt: subnet.created_at,
        updatedAt: subnet.updated_at,
      }
    })

    return results
  }

  /**
   * Get subnets by supernet ID
   */
  async getBySupernetId(
    supernetId: string,
    companyId: string
  ): Promise<ExtendedSubnetFields[]> {
    // Create a prepared statement to get subnets by supernet ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, cidr, subnet_address, gateway, 
        description, supernet_id, created_at, updated_at
      FROM ip_subnets
      WHERE supernet_id = ? AND company_id = ?
    `)

    // Execute the query
    const subnets = stmt.all(supernetId, companyId) as Array<{
      _id: string
      company_id: string
      name: string
      cidr: string
      subnet_address: string
      gateway: string
      description: string
      supernet_id: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedSubnetFields interface
    const results = subnets.map(subnet => {
      return {
        _id: subnet._id,
        companyId: subnet.company_id,
        name: subnet.name,
        cidr: subnet.cidr,
        subnetAddress: subnet.subnet_address,
        gateway: subnet.gateway,
        description: subnet.description,
        supernetId: subnet.supernet_id,
        createdAt: subnet.created_at,
        updatedAt: subnet.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single IP subnet by ID
   */
  getById(_id: string, companyId: string): ExtendedSubnetFields | null {
    // Create a prepared statement to get a subnet by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, cidr, subnet_address, gateway, 
        description, supernet_id, created_at, updated_at
      FROM ip_subnets
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const subnet = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          cidr: string
          subnet_address: string
          gateway: string
          description: string
          supernet_id: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!subnet) {
      return null
    }

    return {
      _id: subnet._id,
      companyId: subnet.company_id,
      name: subnet.name,
      cidr: subnet.cidr,
      subnetAddress: subnet.subnet_address,
      gateway: subnet.gateway,
      description: subnet.description,
      supernetId: subnet.supernet_id,
      createdAt: subnet.created_at,
      updatedAt: subnet.updated_at,
    }
  }

  /**
   * Get a subnet by name
   */
  getByName(name: string, companyId: string): ExtendedSubnetFields | null {
    // Create a prepared statement to get a subnet by name and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, cidr, subnet_address, gateway, 
        description, supernet_id, created_at, updated_at
      FROM ip_subnets
      WHERE name = ? AND company_id = ?
    `)

    // Execute the query
    const subnet = stmt.get(name, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          cidr: string
          subnet_address: string
          gateway: string
          description: string
          supernet_id: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!subnet) {
      return null
    }

    return {
      _id: subnet._id,
      companyId: subnet.company_id,
      name: subnet.name,
      cidr: subnet.cidr,
      subnetAddress: subnet.subnet_address,
      gateway: subnet.gateway,
      description: subnet.description,
      supernetId: subnet.supernet_id,
      createdAt: subnet.created_at,
      updatedAt: subnet.updated_at,
    }
  }

  /**
   * Create a new IP subnet
   */
  create(
    companyId: string,
    input: Partial<ExtendedSubnetFields>
  ): ExtendedSubnetFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.name) {
      throw new Error('Subnet name is required')
    }
    if (!input.cidr) {
      throw new Error('CIDR is required')
    }
    if (!input.subnetAddress) {
      throw new Error('Subnet address is required')
    }
    if (!input.gateway) {
      throw new Error('Gateway is required')
    }
    if (!input.supernetId) {
      throw new Error('Supernet ID is required')
    }

    // Check if a subnet with the same name already exists
    const existingSubnet = this.getByName(input.name, companyId)
    if (existingSubnet) {
      throw new Error(`A subnet with the name ${input.name} already exists`)
    }

    // Prepare parameters
    const name = input.name
    const cidr = input.cidr
    const subnetAddress = input.subnetAddress
    const gateway = input.gateway
    const description = input.description || ''
    const supernetId = input.supernetId

    // Insert the IP subnet
    this.db
      .query(
        `
      INSERT INTO ip_subnets (
        _id, company_id, name, cidr, subnet_address, gateway,
        description, supernet_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        name,
        cidr,
        subnetAddress,
        gateway,
        description,
        supernetId,
        now,
        now
      )

    // Return the newly created subnet
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing IP subnet
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedSubnetFields>
  ): ExtendedSubnetFields | null {
    // Check if the subnet exists
    const existingSubnet = this.getById(_id, companyId)
    if (!existingSubnet) {
      return null
    }

    // If updating the name, check for duplicates
    if (input.name && input.name !== existingSubnet.name) {
      const duplicateSubnet = this.getByName(input.name, companyId)
      if (duplicateSubnet && duplicateSubnet._id !== _id) {
        throw new Error(`A subnet with the name ${input.name} already exists`)
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE ip_subnets SET updated_at = ?'
    const params: any[] = [now]

    if (input.name !== undefined) {
      updateSql += ', name = ?'
      params.push(input.name)
    }

    if (input.cidr !== undefined) {
      updateSql += ', cidr = ?'
      params.push(input.cidr)
    }

    if (input.subnetAddress !== undefined) {
      updateSql += ', subnet_address = ?'
      params.push(input.subnetAddress)
    }

    if (input.gateway !== undefined) {
      updateSql += ', gateway = ?'
      params.push(input.gateway)
    }

    if (input.description !== undefined) {
      updateSql += ', description = ?'
      params.push(input.description)
    }

    if (input.supernetId !== undefined) {
      updateSql += ', supernet_id = ?'
      params.push(input.supernetId)
    }

    updateSql += ' WHERE _id = ? AND company_id = ?'
    params.push(_id, companyId)

    this.db.query(updateSql).run(...params)

    // Return the updated subnet
    return this.getById(_id, companyId)
  }

  /**
   * Delete an IP subnet
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the subnet exists
    const existingSubnet = this.getById(_id, companyId)
    if (!existingSubnet) {
      return false
    }

    // Start a transaction to delete the subnet and check for dependencies
    const deleteSubnet = this.db.transaction(() => {
      // First, check if there are any IP pools using this subnet
      const poolStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM ip_pools
        WHERE subnet_id = ?
      `)

      const poolResult = poolStmt.get(_id) as { count: number }

      if (poolResult.count > 0) {
        throw new Error(
          `Cannot delete subnet: ${poolResult.count} IP pools are using this subnet.`
        )
      }

      // Next, check if there are any IP addresses using this subnet
      const addrStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM ip_addresses
        WHERE subnet_id = ?
      `)

      const addrResult = addrStmt.get(_id) as { count: number }

      if (addrResult.count > 0) {
        throw new Error(
          `Cannot delete subnet: ${addrResult.count} IP addresses are using this subnet.`
        )
      }

      // Finally, check if there are any VLANs using this subnet
      const vlanStmt = this.db.query(`
        SELECT COUNT(*) AS count
        FROM vlans
        WHERE subnet_id = ?
      `)

      const vlanResult = vlanStmt.get(_id) as { count: number }

      if (vlanResult.count > 0) {
        throw new Error(
          `Cannot delete subnet: ${vlanResult.count} VLANs are using this subnet.`
        )
      }

      // Delete the subnet
      this.db
        .query(
          `
        DELETE FROM ip_subnets
        WHERE _id = ? AND company_id = ?
      `
        )
        .run(_id, companyId)
    })

    try {
      // Execute the transaction
      deleteSubnet()
      return true
    } catch (error) {
      console.error('Failed to delete IP subnet:', error)
      return false
    }
  }
}

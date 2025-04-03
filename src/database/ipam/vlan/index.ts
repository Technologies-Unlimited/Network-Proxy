/**
 * VLAN Repository
 * Provides data access methods for VLANs using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../../index'
import {
  vlanTableSchema,
  vlanIndexes,
  ExtendedVLANFields,
} from '@/schema/network-administration/ipam/vlan/schema'

export class VLANRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for VLANs
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(vlanTableSchema)

    // Create indexes
    this.db.run(vlanIndexes)
  }

  /**
   * Get all VLANs for a company
   */
  async getForCompany(companyId: string): Promise<ExtendedVLANFields[]> {
    // Create a prepared statement to get all VLANs for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, subnet_id, supernet_id, 
        tagged, untagged, vlan_number, description, 
        created_at, updated_at
      FROM vlans
      WHERE company_id = ?
    `)

    // Execute the query
    const vlans = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      name: string
      subnet_id: string | null
      supernet_id: string | null
      tagged: number
      untagged: number
      vlan_number: number
      description: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedVLANFields interface
    const results = vlans.map(vlan => {
      return {
        _id: vlan._id,
        companyId: vlan.company_id,
        name: vlan.name,
        subnetId: vlan.subnet_id || undefined,
        supernetId: vlan.supernet_id || undefined,
        tagged: Boolean(vlan.tagged),
        untagged: Boolean(vlan.untagged),
        vlanNumber: vlan.vlan_number,
        description: vlan.description,
        createdAt: vlan.created_at,
        updatedAt: vlan.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single VLAN by ID
   */
  getById(_id: string, companyId: string): ExtendedVLANFields | null {
    // Create a prepared statement to get a VLAN by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, subnet_id, supernet_id, 
        tagged, untagged, vlan_number, description, 
        created_at, updated_at
      FROM vlans
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const vlan = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          subnet_id: string | null
          supernet_id: string | null
          tagged: number
          untagged: number
          vlan_number: number
          description: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!vlan) {
      return null
    }

    return {
      _id: vlan._id,
      companyId: vlan.company_id,
      name: vlan.name,
      subnetId: vlan.subnet_id || undefined,
      supernetId: vlan.supernet_id || undefined,
      tagged: Boolean(vlan.tagged),
      untagged: Boolean(vlan.untagged),
      vlanNumber: vlan.vlan_number,
      description: vlan.description,
      createdAt: vlan.created_at,
      updatedAt: vlan.updated_at,
    }
  }

  /**
   * Get a VLAN by number
   */
  getByNumber(
    vlanNumber: number,
    companyId: string
  ): ExtendedVLANFields | null {
    // Create a prepared statement to get a VLAN by number and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, subnet_id, supernet_id, 
        tagged, untagged, vlan_number, description, 
        created_at, updated_at
      FROM vlans
      WHERE vlan_number = ? AND company_id = ?
    `)

    // Execute the query
    const vlan = stmt.get(vlanNumber, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          subnet_id: string | null
          supernet_id: string | null
          tagged: number
          untagged: number
          vlan_number: number
          description: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!vlan) {
      return null
    }

    return {
      _id: vlan._id,
      companyId: vlan.company_id,
      name: vlan.name,
      subnetId: vlan.subnet_id || undefined,
      supernetId: vlan.supernet_id || undefined,
      tagged: Boolean(vlan.tagged),
      untagged: Boolean(vlan.untagged),
      vlanNumber: vlan.vlan_number,
      description: vlan.description,
      createdAt: vlan.created_at,
      updatedAt: vlan.updated_at,
    }
  }

  /**
   * Get a VLAN by name
   */
  getByName(name: string, companyId: string): ExtendedVLANFields | null {
    // Create a prepared statement to get a VLAN by name and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, name, subnet_id, supernet_id, 
        tagged, untagged, vlan_number, description, 
        created_at, updated_at
      FROM vlans
      WHERE name = ? AND company_id = ?
    `)

    // Execute the query
    const vlan = stmt.get(name, companyId) as
      | {
          _id: string
          company_id: string
          name: string
          subnet_id: string | null
          supernet_id: string | null
          tagged: number
          untagged: number
          vlan_number: number
          description: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!vlan) {
      return null
    }

    return {
      _id: vlan._id,
      companyId: vlan.company_id,
      name: vlan.name,
      subnetId: vlan.subnet_id || undefined,
      supernetId: vlan.supernet_id || undefined,
      tagged: Boolean(vlan.tagged),
      untagged: Boolean(vlan.untagged),
      vlanNumber: vlan.vlan_number,
      description: vlan.description,
      createdAt: vlan.created_at,
      updatedAt: vlan.updated_at,
    }
  }

  /**
   * Create a new VLAN
   */
  create(
    companyId: string,
    input: Partial<ExtendedVLANFields>
  ): ExtendedVLANFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.name) {
      throw new Error('VLAN name is required')
    }
    if (input.vlanNumber === undefined) {
      throw new Error('VLAN number is required')
    }
    if (input.vlanNumber < 1 || input.vlanNumber > 4094) {
      throw new Error('VLAN number must be between 1 and 4094')
    }

    // Check if a VLAN with the same number already exists
    const existingVLAN = this.getByNumber(input.vlanNumber, companyId)
    if (existingVLAN) {
      throw new Error(
        `A VLAN with the number ${input.vlanNumber} already exists`
      )
    }

    // Check if a VLAN with the same name already exists
    const existingVLANName = this.getByName(input.name, companyId)
    if (existingVLANName) {
      throw new Error(`A VLAN with the name ${input.name} already exists`)
    }

    // Prepare parameters
    const name = input.name
    const subnetId = input.subnetId || null
    const supernetId = input.supernetId || null
    const tagged = input.tagged !== undefined ? (input.tagged ? 1 : 0) : 0
    const untagged = input.untagged !== undefined ? (input.untagged ? 1 : 0) : 0
    const vlanNumber = input.vlanNumber
    const description = input.description || ''

    // Insert the VLAN
    this.db
      .query(
        `
      INSERT INTO vlans (
        _id, company_id, name, subnet_id, supernet_id,
        tagged, untagged, vlan_number, description, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        name,
        subnetId,
        supernetId,
        tagged,
        untagged,
        vlanNumber,
        description,
        now,
        now
      )

    // Return the newly created VLAN
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing VLAN
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedVLANFields>
  ): ExtendedVLANFields | null {
    // Check if the VLAN exists
    const existingVLAN = this.getById(_id, companyId)
    if (!existingVLAN) {
      return null
    }

    // If updating the VLAN number, check for duplicates
    if (
      input.vlanNumber !== undefined &&
      input.vlanNumber !== existingVLAN.vlanNumber
    ) {
      if (input.vlanNumber < 1 || input.vlanNumber > 4094) {
        throw new Error('VLAN number must be between 1 and 4094')
      }

      const duplicateVLAN = this.getByNumber(input.vlanNumber, companyId)
      if (duplicateVLAN && duplicateVLAN._id !== _id) {
        throw new Error(
          `A VLAN with the number ${input.vlanNumber} already exists`
        )
      }
    }

    // If updating the name, check for duplicates
    if (input.name && input.name !== existingVLAN.name) {
      const duplicateVLAN = this.getByName(input.name, companyId)
      if (duplicateVLAN && duplicateVLAN._id !== _id) {
        throw new Error(`A VLAN with the name ${input.name} already exists`)
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE vlans SET updated_at = ?'
    const params: any[] = [now]

    if (input.name !== undefined) {
      updateSql += ', name = ?'
      params.push(input.name)
    }

    if (input.subnetId !== undefined) {
      updateSql += ', subnet_id = ?'
      params.push(input.subnetId || null)
    }

    if (input.supernetId !== undefined) {
      updateSql += ', supernet_id = ?'
      params.push(input.supernetId || null)
    }

    if (input.tagged !== undefined) {
      updateSql += ', tagged = ?'
      params.push(input.tagged ? 1 : 0)
    }

    if (input.untagged !== undefined) {
      updateSql += ', untagged = ?'
      params.push(input.untagged ? 1 : 0)
    }

    if (input.vlanNumber !== undefined) {
      updateSql += ', vlan_number = ?'
      params.push(input.vlanNumber)
    }

    if (input.description !== undefined) {
      updateSql += ', description = ?'
      params.push(input.description)
    }

    updateSql += ' WHERE _id = ? AND company_id = ?'
    params.push(_id, companyId)

    this.db.query(updateSql).run(...params)

    // Return the updated VLAN
    return this.getById(_id, companyId)
  }

  /**
   * Delete a VLAN
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the VLAN exists
    const existingVLAN = this.getById(_id, companyId)
    if (!existingVLAN) {
      return false
    }

    // Delete the VLAN
    this.db
      .query(
        `
      DELETE FROM vlans
      WHERE _id = ? AND company_id = ?
    `
      )
      .run(_id, companyId)

    return true
  }
}

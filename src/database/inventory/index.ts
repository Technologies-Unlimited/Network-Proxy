/**
 * Company Network Inventory Repository
 * Provides data access methods for company network inventory data using SQLite
 */

import { Database } from 'bun:sqlite'
import { getDatabase, generateId } from '../index'
import {
  companyNetworkInventoryTableSchema,
  companyNetworkInventoryIndexes,
  ExtendedCompanyNetworkInventoryFields,
} from '@/schema/network-administration/inventory/company/schema'

export class CompanyNetworkInventoryRepository {
  private db: Database

  constructor(db?: Database) {
    this.db = db || getDatabase()
  }

  /**
   * Initializes the database tables for company network inventory
   */
  initTables(): void {
    // Execute the schema creation SQL
    this.db.run(companyNetworkInventoryTableSchema)

    // Create indexes
    this.db.run(companyNetworkInventoryIndexes)
  }

  /**
   * Get all network inventory items for a company
   */
  async getForCompany(
    companyId: string
  ): Promise<ExtendedCompanyNetworkInventoryFields[]> {
    // Create a prepared statement to get all inventory items for a company
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, product_id, mac_address, stock_id,
        manufacturer_id, model_id, created_at, updated_at
      FROM company_network_inventory
      WHERE company_id = ?
    `)

    // Execute the query
    const inventoryItems = stmt.all(companyId) as Array<{
      _id: string
      company_id: string
      product_id: string
      mac_address: string
      stock_id: string
      manufacturer_id: string
      model_id: string
      created_at: number
      updated_at: number
    }>

    // Map the database results to the ExtendedCompanyNetworkInventoryFields interface
    const results = inventoryItems.map(item => {
      return {
        _id: item._id,
        companyId: item.company_id,
        productId: item.product_id,
        macAddress: item.mac_address,
        stockId: item.stock_id,
        manufacturerId: item.manufacturer_id,
        modelId: item.model_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }
    })

    return results
  }

  /**
   * Get a single network inventory item by ID
   */
  getById(
    _id: string,
    companyId: string
  ): ExtendedCompanyNetworkInventoryFields | null {
    // Create a prepared statement to get an inventory item by ID and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, product_id, mac_address, stock_id,
        manufacturer_id, model_id, created_at, updated_at
      FROM company_network_inventory
      WHERE _id = ? AND company_id = ?
    `)

    // Execute the query
    const item = stmt.get(_id, companyId) as
      | {
          _id: string
          company_id: string
          product_id: string
          mac_address: string
          stock_id: string
          manufacturer_id: string
          model_id: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!item) {
      return null
    }

    return {
      _id: item._id,
      companyId: item.company_id,
      productId: item.product_id,
      macAddress: item.mac_address,
      stockId: item.stock_id,
      manufacturerId: item.manufacturer_id,
      modelId: item.model_id,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  }

  /**
   * Get a network inventory item by MAC address
   */
  getByMacAddress(
    macAddress: string,
    companyId: string
  ): ExtendedCompanyNetworkInventoryFields | null {
    // Create a prepared statement to get an inventory item by MAC address and company ID
    const stmt = this.db.query(`
      SELECT 
        _id, company_id, product_id, mac_address, stock_id,
        manufacturer_id, model_id, created_at, updated_at
      FROM company_network_inventory
      WHERE mac_address = ? AND company_id = ?
    `)

    // Execute the query
    const item = stmt.get(macAddress, companyId) as
      | {
          _id: string
          company_id: string
          product_id: string
          mac_address: string
          stock_id: string
          manufacturer_id: string
          model_id: string
          created_at: number
          updated_at: number
        }
      | undefined

    if (!item) {
      return null
    }

    return {
      _id: item._id,
      companyId: item.company_id,
      productId: item.product_id,
      macAddress: item.mac_address,
      stockId: item.stock_id,
      manufacturerId: item.manufacturer_id,
      modelId: item.model_id,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  }

  /**
   * Create a new network inventory item
   */
  create(
    companyId: string,
    input: Partial<ExtendedCompanyNetworkInventoryFields>
  ): ExtendedCompanyNetworkInventoryFields {
    const _id = generateId()
    const now = Date.now()

    // Validate required fields
    if (!input.macAddress) {
      throw new Error('MAC address is required')
    }
    if (!input.productId) {
      throw new Error('Product ID is required')
    }
    if (!input.stockId) {
      throw new Error('Stock ID is required')
    }
    if (!input.manufacturerId) {
      throw new Error('Manufacturer ID is required')
    }
    if (!input.modelId) {
      throw new Error('Model ID is required')
    }

    // Check if an item with the same MAC address already exists
    const existingItem = this.getByMacAddress(input.macAddress, companyId)
    if (existingItem) {
      throw new Error(
        `An inventory item with MAC address ${input.macAddress} already exists`
      )
    }

    // Prepare parameters
    const macAddress = input.macAddress
    const productId = input.productId
    const stockId = input.stockId
    const manufacturerId = input.manufacturerId
    const modelId = input.modelId

    // Insert the inventory item
    this.db
      .query(
        `
      INSERT INTO company_network_inventory (
        _id, company_id, product_id, mac_address, stock_id,
        manufacturer_id, model_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        _id,
        companyId,
        productId,
        macAddress,
        stockId,
        manufacturerId,
        modelId,
        now,
        now
      )

    // Return the newly created item
    return this.getById(_id, companyId)!
  }

  /**
   * Update an existing network inventory item
   */
  update(
    _id: string,
    companyId: string,
    input: Partial<ExtendedCompanyNetworkInventoryFields>
  ): ExtendedCompanyNetworkInventoryFields | null {
    // Check if the item exists
    const existingItem = this.getById(_id, companyId)
    if (!existingItem) {
      return null
    }

    // If updating MAC address, check for duplicates
    if (input.macAddress && input.macAddress !== existingItem.macAddress) {
      const duplicateItem = this.getByMacAddress(input.macAddress, companyId)
      if (duplicateItem && duplicateItem._id !== _id) {
        throw new Error(
          `An inventory item with MAC address ${input.macAddress} already exists`
        )
      }
    }

    const now = Date.now()

    // Construct the SQL update statement based on provided fields
    let updateSql = 'UPDATE company_network_inventory SET updated_at = ?'
    const params: any[] = [now]

    if (input.macAddress !== undefined) {
      updateSql += ', mac_address = ?'
      params.push(input.macAddress)
    }

    if (input.productId !== undefined) {
      updateSql += ', product_id = ?'
      params.push(input.productId)
    }

    if (input.stockId !== undefined) {
      updateSql += ', stock_id = ?'
      params.push(input.stockId)
    }

    if (input.manufacturerId !== undefined) {
      updateSql += ', manufacturer_id = ?'
      params.push(input.manufacturerId)
    }

    if (input.modelId !== undefined) {
      updateSql += ', model_id = ?'
      params.push(input.modelId)
    }

    updateSql += ' WHERE _id = ? AND company_id = ?'
    params.push(_id, companyId)

    this.db.query(updateSql).run(...params)

    // Return the updated item
    return this.getById(_id, companyId)
  }

  /**
   * Delete a network inventory item
   */
  delete(_id: string, companyId: string): boolean {
    // Check if the item exists
    const existingItem = this.getById(_id, companyId)
    if (!existingItem) {
      return false
    }

    // Delete the item
    this.db
      .query(
        `
      DELETE FROM company_network_inventory
      WHERE _id = ? AND company_id = ?
    `
      )
      .run(_id, companyId)

    return true
  }
}

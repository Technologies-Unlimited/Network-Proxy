import mongoose from 'mongoose'
import { CompanyNetworkInventoryFields } from '../../../../types/network-administration/inventory/company/types'
import { ObjectId } from 'mongodb'

export interface ExtendedCompanyNetworkInventoryFields
  extends CompanyNetworkInventoryFields {
  _id: ObjectId
  companyId: ObjectId
  productId: ObjectId
  stockId: ObjectId
  manufacturerId: ObjectId
  modelId: ObjectId
}

const companyNetworkInventorySchema =
  new mongoose.Schema<ExtendedCompanyNetworkInventoryFields>({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    macAddress: { type: String, required: true },
    stockId: { type: mongoose.Schema.Types.ObjectId, required: true },
    manufacturerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    modelId: { type: mongoose.Schema.Types.ObjectId, required: true },
  })

export const CompanyNetworkInventoryModel =
  mongoose.model<ExtendedCompanyNetworkInventoryFields>(
    'CompanyNetworkInventory',
    companyNetworkInventorySchema
  )

export default companyNetworkInventorySchema

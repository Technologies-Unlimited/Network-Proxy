import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

export interface ExtendedCustomerNetworkInventoryItemFields {
  _id: ObjectId
  companyId: ObjectId
  networkInventoryId: ObjectId
  customerId: ObjectId
}

const customerNetworkInventoryItemSchema =
  new mongoose.Schema<ExtendedCustomerNetworkInventoryItemFields>({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    networkInventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  })

export const CustomerNetworkInventoryItemModel =
  mongoose.model<ExtendedCustomerNetworkInventoryItemFields>(
    'CustomerNetworkInventoryItem',
    customerNetworkInventoryItemSchema
  )

export default customerNetworkInventoryItemSchema

import mongoose from 'mongoose'
import { IPAddressFields } from '../../../../types/network-administration/ipam/ipaddress/types'
import { ObjectId } from 'mongodb'

export interface ExtendedIPAddressFields extends IPAddressFields {
  _id: ObjectId
  companyId: ObjectId
  networkInventoryId?: ObjectId
  poolId: ObjectId
  subnetId: ObjectId
  supernetId: ObjectId
}

const ipAddressSchema = new mongoose.Schema<ExtendedIPAddressFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  address: { type: String, required: true },
  description: { type: String, required: true },
  isUsed: { type: Boolean, required: true, default: false },
  networkInventoryId: { type: mongoose.Schema.Types.ObjectId },
  poolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  subnetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  supernetId: { type: mongoose.Schema.Types.ObjectId, required: true },
})

export const IPAddressModel = mongoose.model<ExtendedIPAddressFields>(
  'IPAddress',
  ipAddressSchema
)

export default ipAddressSchema

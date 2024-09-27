import mongoose from 'mongoose'
import { SubnetFields } from '../../../../types/network-administration/ipam/subnet/types'
import { ObjectId } from 'mongodb'

export interface ExtendedSubnetFields extends SubnetFields {
  _id: ObjectId
  companyId: ObjectId
  supernetId: ObjectId
}

const subnetSchema = new mongoose.Schema<ExtendedSubnetFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  cidr: { type: String, required: true },
  subnetAddress: { type: String, required: true },
  gateway: { type: String, required: true },
  description: { type: String, required: true },
  supernetId: { type: mongoose.Schema.Types.ObjectId, required: true },
})

export const SubnetModel = mongoose.model<ExtendedSubnetFields>(
  'Subnet',
  subnetSchema
)

export default subnetSchema

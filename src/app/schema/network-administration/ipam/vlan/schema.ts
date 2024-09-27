import mongoose from 'mongoose'
import { VLANFields } from '../../../../types/network-administration/ipam/vlan/types'
import { ObjectId } from 'mongodb'

export interface ExtendedVLANFields extends VLANFields {
  _id: ObjectId
  companyId: ObjectId
  subnetId?: ObjectId
  supernetId?: ObjectId
}

const vlanSchema = new mongoose.Schema<ExtendedVLANFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  subnetId: { type: mongoose.Schema.Types.ObjectId, required: false },
  supernetId: { type: mongoose.Schema.Types.ObjectId, required: false },
  tagged: { type: Boolean, required: true },
  untagged: { type: Boolean, required: true },
  vlanNumber: { type: Number, required: true },
  description: { type: String, required: true },
})

export const VLANModel = mongoose.model<ExtendedVLANFields>('VLAN', vlanSchema)

export default vlanSchema

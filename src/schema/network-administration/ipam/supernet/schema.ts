import mongoose from 'mongoose'
import { SupernetFields } from '../../../../types/network-administration/ipam/supernet/types'
import { ObjectId } from 'mongodb'

export interface ExtendedSupernetFields extends SupernetFields {
  _id: ObjectId
  companyId: ObjectId
}

const supernetSchema = new mongoose.Schema<ExtendedSupernetFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  cidr: { type: String, required: true },
  supernetAddress: { type: String, required: true },
})

export const SupernetModel = mongoose.model<ExtendedSupernetFields>(
  'Supernet',
  supernetSchema
)

export default supernetSchema

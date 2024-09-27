import mongoose from 'mongoose'
import { PoolFields } from '../../../../types/network-administration/ipam/pool/types'
import { ObjectId } from 'mongodb'

export interface ExtendedPoolFields extends PoolFields {
  _id: ObjectId
  companyId: ObjectId
  subnetId: ObjectId
  supernetId: ObjectId
}

const poolSchema = new mongoose.Schema<ExtendedPoolFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  startIp: { type: String, required: true },
  endIp: { type: String, required: true },
  description: { type: String, required: true },
  subnetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  supernetId: { type: mongoose.Schema.Types.ObjectId, required: true },
})

export const PoolModel = mongoose.model<ExtendedPoolFields>('Pool', poolSchema)

export default poolSchema

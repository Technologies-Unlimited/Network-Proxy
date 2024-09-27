import mongoose from 'mongoose'
import { OIDFields } from '../../../../types/network-administration/snmp/oid/types'
import { ObjectId } from 'mongodb'

export interface ExtendedOIDFields extends OIDFields {
  _id: ObjectId
  companyId: ObjectId
  manufacturerId?: ObjectId
  modelId?: ObjectId
  productId?: ObjectId
}

const oidSchema = new mongoose.Schema<ExtendedOIDFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  manufacturerId: { type: mongoose.Schema.Types.ObjectId, required: false },
  modelId: { type: mongoose.Schema.Types.ObjectId, required: false },
  productId: { type: mongoose.Schema.Types.ObjectId, required: false },
  oidName: { type: String, required: true },
  oid: { type: String, required: true },
  description: { type: String, required: true },
})

export const OIDModel = mongoose.model<ExtendedOIDFields>('OID', oidSchema)

export default oidSchema

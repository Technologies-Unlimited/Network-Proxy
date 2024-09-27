import mongoose from 'mongoose'
import { SNMPv3Fields } from '../../../../types/network-administration/snmp/snmpv3/types'
import { ObjectId } from 'mongodb'

export interface ExtendedSNMPv3Fields extends SNMPv3Fields {
  _id: ObjectId
  companyId: ObjectId
  manufacturerId?: ObjectId
  modelId?: ObjectId
  productId?: ObjectId
}

const snmpv3Schema = new mongoose.Schema<ExtendedSNMPv3Fields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  manufacturerId: { type: mongoose.Schema.Types.ObjectId, required: false },
  modelId: { type: mongoose.Schema.Types.ObjectId, required: false },
  productId: { type: mongoose.Schema.Types.ObjectId, required: false },
  communityName: { type: String, required: true },
  userName: { type: String, required: true },
  authMethod: { type: String, required: true },
  authPassword: { type: String, required: true },
  encryptionMethod: { type: String, required: true },
  encryptionPassword: { type: String, required: true },
})

export const SNMPv3Model = mongoose.model<ExtendedSNMPv3Fields>(
  'SNMPv3',
  snmpv3Schema
)

export default snmpv3Schema

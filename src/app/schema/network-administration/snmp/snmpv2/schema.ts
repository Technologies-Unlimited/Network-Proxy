import mongoose from 'mongoose'
import { SNMPv2Fields } from '../../../../types/network-administration/snmp/snmpv2/types'
import { ObjectId } from 'mongodb'

export interface ExtendedSNMPv2Fields extends SNMPv2Fields {
  _id: ObjectId
  companyId: ObjectId
  manufacturerId?: ObjectId
  modelId?: ObjectId
  productId?: ObjectId
}

const snmpv2Schema = new mongoose.Schema<ExtendedSNMPv2Fields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  manufacturerId: { type: mongoose.Schema.Types.ObjectId, required: false },
  modelId: { type: mongoose.Schema.Types.ObjectId, required: false },
  productId: { type: mongoose.Schema.Types.ObjectId, required: false },
  communityName: { type: String, required: true },
  readCommunity: { type: String, required: true },
  writeCommunity: { type: String, required: true },
})

export const SNMPv2Model = mongoose.model<ExtendedSNMPv2Fields>(
  'SNMPv2',
  snmpv2Schema
)

export default snmpv2Schema

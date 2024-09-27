import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'
import { SNMPMonitoringFields } from '../../../../../types/network-administration/snmp/templates/types'

export interface SNMPv3TemplateFields extends SNMPMonitoringFields {
  _id: ObjectId
  companyId: ObjectId
  manufacturerId?: ObjectId
  modelNameId?: ObjectId
  snmpv3SettingId: ObjectId
  productId?: ObjectId
  stockIds?: ObjectId[]
  networkInventoryIds?: ObjectId[]
}

const snmpv3TemplateSchema = new mongoose.Schema<SNMPv3TemplateFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  manufacturerId: { type: mongoose.Schema.Types.ObjectId, required: false },
  modelNameId: { type: mongoose.Schema.Types.ObjectId, required: false },
  snmpv3SettingId: { type: mongoose.Schema.Types.ObjectId, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, required: false },
  stockIds: [{ type: mongoose.Schema.Types.ObjectId, required: false }],
  networkInventoryIds: [
    { type: mongoose.Schema.Types.ObjectId, required: false },
  ],
  templateName: { type: String, required: true },
  description: { type: String, required: true },
})

export const SNMPv3TemplateModel = mongoose.model<SNMPv3TemplateFields>(
  'SNMPv3Template',
  snmpv3TemplateSchema
)

export default snmpv3TemplateSchema

import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'
import { SNMPMonitoringFields } from '../../../../../types/network-administration/snmp/templates/types'

export interface SNMPv2TemplateFields extends SNMPMonitoringFields {
  _id: ObjectId
  companyId: ObjectId
  manufacturerId?: ObjectId
  modelNameId?: ObjectId
  productId?: ObjectId
  snmpv2SettingId: ObjectId
  oidIds?: ObjectId[]
  stockIds?: ObjectId[]
  networkInventoryIds?: ObjectId[]
}

const snmpv2TemplateSchema = new mongoose.Schema<SNMPv2TemplateFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  manufacturerId: { type: mongoose.Schema.Types.ObjectId, required: false },
  modelNameId: { type: mongoose.Schema.Types.ObjectId, required: false },
  productId: { type: mongoose.Schema.Types.ObjectId, required: false },
  snmpv2SettingId: { type: mongoose.Schema.Types.ObjectId, required: true },
  oidIds: [{ type: mongoose.Schema.Types.ObjectId, required: false }],
  stockIds: [{ type: mongoose.Schema.Types.ObjectId, required: false }],
  networkInventoryIds: [
    { type: mongoose.Schema.Types.ObjectId, required: false },
  ],
  templateName: { type: String, required: true },
  description: { type: String, required: true },
})

export const SNMPv2TemplateModel = mongoose.model<SNMPv2TemplateFields>(
  'SNMPv2Template',
  snmpv2TemplateSchema
)

export default snmpv2TemplateSchema

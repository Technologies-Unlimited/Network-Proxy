import mongoose from 'mongoose'
import { ICMPMonitoringTemplateFields } from '../../../../types/network-administration/icmp/templates/types'
import { ObjectId } from 'mongodb'

export interface ExtendedICMPMonitoringTemplateFields
  extends ICMPMonitoringTemplateFields {
  _id: ObjectId
  companyId: ObjectId
  manufacturerId?: ObjectId
  modelNameId?: ObjectId
  productId?: ObjectId
  stockIds?: ObjectId[]
  networkInventoryIds?: ObjectId[]
}

const icmpMonitoringTemplateSchema =
  new mongoose.Schema<ExtendedICMPMonitoringTemplateFields>({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    templateName: { type: String, required: true },
    templateDescription: { type: String, required: true },
    icmpLossThreshold: { type: Number, required: true },
    icmpLatencyThreshold: { type: Number, required: true },
    manufacturerId: { type: mongoose.Schema.Types.ObjectId },
    modelNameId: { type: mongoose.Schema.Types.ObjectId },
    productId: { type: mongoose.Schema.Types.ObjectId },
    stockIds: [{ type: mongoose.Schema.Types.ObjectId }],
    networkInventoryIds: [{ type: mongoose.Schema.Types.ObjectId }],
  })

export const ICMPMonitoringTemplateModel =
  mongoose.model<ExtendedICMPMonitoringTemplateFields>(
    'ICMPMonitoringTemplate',
    icmpMonitoringTemplateSchema
  )

export default icmpMonitoringTemplateSchema

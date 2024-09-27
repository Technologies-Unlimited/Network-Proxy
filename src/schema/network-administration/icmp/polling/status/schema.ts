import mongoose from 'mongoose'
import {
  ICMPPollingStatusFields,
  DeviceStatus,
} from '../../../../../types/network-administration/icmp/polling/status/types'
import { ObjectId } from 'mongodb'

export interface ExtendedICMPPollingStatusFields
  extends ICMPPollingStatusFields {
  _id: ObjectId
  companyId: ObjectId
  icmpPollingTemplateId: ObjectId
  manufacturerId?: ObjectId
  modelNameId?: ObjectId
  productId?: ObjectId
  stockIds?: ObjectId[]
  networkInventoryIds?: ObjectId[]
}

const icmpPollingStatusSchema =
  new mongoose.Schema<ExtendedICMPPollingStatusFields>({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    icmpPollingTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    manufacturerId: { type: mongoose.Schema.Types.ObjectId },
    modelNameId: { type: mongoose.Schema.Types.ObjectId },
    productId: { type: mongoose.Schema.Types.ObjectId },
    stockIds: [{ type: mongoose.Schema.Types.ObjectId }],
    networkInventoryIds: [{ type: mongoose.Schema.Types.ObjectId }],
    uptime: { type: Number, required: false },
    downtime: { type: Number, required: false },
    deviceStatus: {
      type: String,
      enum: ['online', 'offline', 'unknown'] as DeviceStatus[],
      required: true,
    },
  })

export const ICMPPollingStatusModel =
  mongoose.model<ExtendedICMPPollingStatusFields>(
    'ICMPPollingStatus',
    icmpPollingStatusSchema
  )

export default icmpPollingStatusSchema

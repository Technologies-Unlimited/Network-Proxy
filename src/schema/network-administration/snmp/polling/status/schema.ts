import mongoose from 'mongoose'
import {
  SNMPPollingStatusFields,
  DeviceStatus,
} from '../../../../../types/network-administration/snmp/polling/status/types'
import { ObjectId } from 'mongodb'

export interface ExtendedSNMPPollingStatusFields
  extends SNMPPollingStatusFields {
  _id: ObjectId
  companyId: ObjectId
  snmpPollingTemplateId: ObjectId
  manufacturerId?: ObjectId
  modelNameId?: ObjectId
  productId?: ObjectId
  stockIds?: ObjectId[]
  networkInventoryIds?: ObjectId[]
}

const snmpPollingStatusSchema =
  new mongoose.Schema<ExtendedSNMPPollingStatusFields>({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    snmpPollingTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    manufacturerId: { type: mongoose.Schema.Types.ObjectId },
    modelNameId: { type: mongoose.Schema.Types.ObjectId },
    productId: { type: mongoose.Schema.Types.ObjectId },
    stockIds: [{ type: mongoose.Schema.Types.ObjectId }],
    networkInventoryIds: [{ type: mongoose.Schema.Types.ObjectId }],
    uptime: { type: Number, required: true },
    downtime: { type: Number, required: true },
    deviceStatus: {
      type: String,
      enum: ['online', 'offline', 'unknown'] as DeviceStatus[],
      required: true,
    },
  })

export const SNMPPollingStatusModel =
  mongoose.model<ExtendedSNMPPollingStatusFields>(
    'SNMPPollingStatus',
    snmpPollingStatusSchema
  )

export default snmpPollingStatusSchema

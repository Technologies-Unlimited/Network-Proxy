import mongoose from 'mongoose'
import {
  ICMPPollingTemplateFields,
  TimeInterval,
} from '../../../../../types/network-administration/icmp/polling/template/types'
import { ObjectId } from 'mongodb'

export interface ExtendedICMPPollingTemplateFields
  extends ICMPPollingTemplateFields {
  _id: ObjectId
  companyId: ObjectId
  icmpTemplateId: ObjectId
}

const timeIntervalSchema = new mongoose.Schema<TimeInterval>(
  {
    days: { type: Number, required: true },
    hours: { type: Number, required: true },
    minutes: { type: Number, required: true },
    seconds: { type: Number, required: true },
  },
  { _id: false }
)

const icmpPollingTemplateSchema =
  new mongoose.Schema<ExtendedICMPPollingTemplateFields>({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    icmpTemplateId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    frequency: { type: Number, required: true },
    timeout: { type: Number, required: true },
    retries: { type: Number, required: true },
    pollingFrequency: { type: timeIntervalSchema, required: true },
    downtimeTrigger: { type: timeIntervalSchema, required: true },
  })

export const ICMPPollingTemplateModel =
  mongoose.model<ExtendedICMPPollingTemplateFields>(
    'ICMPPollingTemplate',
    icmpPollingTemplateSchema
  )

export default icmpPollingTemplateSchema

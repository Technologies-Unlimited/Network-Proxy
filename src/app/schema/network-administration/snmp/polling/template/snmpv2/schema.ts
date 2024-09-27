import mongoose from 'mongoose'
import {
  SNMPPollingTemplateFields,
  TimeInterval,
} from '../../../../../../types/network-administration/snmp/polling/template/types'
import { ObjectId } from 'mongodb'

export interface ExtendedSNMPv2PollingTemplateFields
  extends SNMPPollingTemplateFields {
  _id: ObjectId
  companyId: ObjectId
  snmpv2TemplateId: ObjectId
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

const snmpv2PollingTemplateSchema =
  new mongoose.Schema<ExtendedSNMPv2PollingTemplateFields>({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    snmpv2TemplateId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    frequency: { type: Number, required: true },
    timeout: { type: Number, required: true },
    retries: { type: Number, required: true },
    pollingFrequency: { type: timeIntervalSchema, required: true },
    downtimeTrigger: { type: timeIntervalSchema, required: true },
  })

export const SNMPv2PollingTemplateModel =
  mongoose.model<ExtendedSNMPv2PollingTemplateFields>(
    'SNMPv2PollingTemplate',
    snmpv2PollingTemplateSchema
  )

export default snmpv2PollingTemplateSchema

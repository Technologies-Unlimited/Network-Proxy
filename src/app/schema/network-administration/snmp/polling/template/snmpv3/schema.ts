import mongoose from 'mongoose'
import {
  SNMPPollingTemplateFields,
  TimeInterval,
} from '../../../../../../types/network-administration/snmp/polling/template/types'
import { ObjectId } from 'mongodb'

export interface ExtendedSNMPv3PollingTemplateFields
  extends SNMPPollingTemplateFields {
  _id: ObjectId
  companyId: ObjectId
  snmpv3TemplateId: ObjectId
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

const snmpv3PollingTemplateSchema =
  new mongoose.Schema<ExtendedSNMPv3PollingTemplateFields>({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    snmpv3TemplateId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    frequency: { type: Number, required: true },
    timeout: { type: Number, required: true },
    retries: { type: Number, required: true },
    pollingFrequency: { type: timeIntervalSchema, required: true },
    downtimeTrigger: { type: timeIntervalSchema, required: true },
  })

export const SNMPv3PollingTemplateModel =
  mongoose.model<ExtendedSNMPv3PollingTemplateFields>(
    'SNMPv3PollingTemplate',
    snmpv3PollingTemplateSchema
  )

export default snmpv3PollingTemplateSchema

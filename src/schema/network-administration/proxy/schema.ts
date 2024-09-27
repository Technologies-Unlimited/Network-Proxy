import mongoose from 'mongoose'
import {
  ProxyFields,
  ProxyStatus,
} from '../../../types/network-administration/proxy/types'
import { ObjectId } from 'mongodb'

export interface ExtendedProxyFields extends ProxyFields {
  _id: ObjectId
  companyId: ObjectId
  supernetId: ObjectId
  subnetId: ObjectId
}

const proxySchema = new mongoose.Schema<ExtendedProxyFields>({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, auto: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  supernetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  subnetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  proxyName: { type: String, required: true },
  proxyStatus: {
    type: String,
    enum: ['online', 'offline'] as ProxyStatus[],
    required: true,
  },
  description: { type: String, required: true },
})

export const ProxyModel = mongoose.model<ExtendedProxyFields>(
  'Proxy',
  proxySchema
)

export default proxySchema

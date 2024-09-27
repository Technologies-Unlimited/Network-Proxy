export type ProxyStatus = 'online' | 'offline'

export interface ProxyFields {
  proxyName: string
  proxyStatus: ProxyStatus
  description: string
}

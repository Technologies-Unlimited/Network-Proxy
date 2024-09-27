declare module 'snmp-native' {
  export interface SessionOptions {
    host: string
    port?: number
    community?: string
    family?: 'udp4' | 'udp6'
    timeouts?: number[]
    version?: Version
    transport?: string
    trapPort?: number
    user?: string
    authKey?: string
    authProto?: string
    privKey?: string
    privProto?: string
  }

  export enum Version {
    v1 = 0,
    v2c = 1,
    v3 = 3,
  }

  export class Session {
    constructor(options: SessionOptions)
    get(options: GetOptions, callback: ResponseCallback): void
    getNext(options: GetOptions, callback: ResponseCallback): void
    getAll(options: GetAllOptions, callback: ResponseCallback): void
    getSubtree(options: GetSubtreeOptions, callback: ResponseCallback): void
    set(options: SetOptions, callback: ResponseCallback): void
    close(): void
  }

  export interface GetOptions {
    oid: string | number[]
  }

  export interface GetAllOptions {
    oids: (string | number[])[]
    abortOnError?: boolean
    combinedTimeout?: number
  }

  export interface GetSubtreeOptions {
    oid: string | number[]
    combinedTimeout?: number
  }

  export interface SetOptions {
    oid: string | number[]
    value: string | number | Buffer
    type: DataType
  }

  export type ResponseCallback = (
    error: Error | null,
    varbinds: VarBind[]
  ) => void

  export interface VarBind {
    oid: string
    type: number
    value: string | number | Buffer | null
    valueRaw?: Buffer
    valueHex?: string
    sendStamp?: number
    receiveStamp?: number
  }

  export type DataType =
    | 2
    | 4
    | 5
    | 6
    | 48
    | 64
    | 65
    | 66
    | 67
    | 68
    | 69
    | 70
    | 128
    | 129
    | 130
    | 160

  export const ObjectType: {
    Boolean: 1
    Integer: 2
    OctetString: 4
    Null: 5
    OID: 6
    IpAddress: 64
    Counter: 65
    Gauge: 66
    TimeTicks: 67
    Opaque: 68
    Counter64: 70
    NoSuchObject: 128
    NoSuchInstance: 129
    EndOfMibView: 130
  }
}

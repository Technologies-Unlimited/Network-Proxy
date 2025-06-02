declare module 'net-snmp' {
  export interface Varbind {
    oid: string
    type: number
    value: any
  }

  export interface SessionOptions {
    version?: number
    timeout?: number
    retries?: number
  }

  export interface UserOptions {
    name: string
    level: number
    authProtocol?: number
    authKey?: string
    privProtocol?: number
    privKey?: string
  }

  export interface Session {
    get(
      oids: string[],
      callback: (error: any, varbinds: Varbind[]) => void
    ): void
    close(): void
    subtree(
      oid: string,
      maxRepetitions: number,
      feedCb: (varbinds: Varbind[]) => void,
      doneCb: (error?: any) => void
    ): void
  }

  export const SecurityLevel: {
    noAuthNoPriv: number
    authNoPriv: number
    authPriv: number
  }

  export const AuthProtocols: {
    md5: number
    sha: number
    sha224: number
    sha256: number
    sha384: number
    sha512: number
  }

  export const PrivProtocols: {
    des: number
    aes: number
    aes256b: number
    aes256r: number
  }

  export const Version1: number
  export const Version2c: number

  export function createSession(
    target: string,
    community: string,
    options?: SessionOptions
  ): Session

  export function createV3Session(target: string, user: UserOptions): Session

  export function isVarbindError(varbind: Varbind): boolean
}

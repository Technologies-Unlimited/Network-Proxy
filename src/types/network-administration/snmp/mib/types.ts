/**
 * Type definitions for SNMP MIB browsing
 */

/**
 * Represents an OID found during MIB browsing
 */
export interface MIBEntry {
  /** The full OID string */
  oid: string

  /** The value of the OID */
  value: string

  /** The numeric SNMP data type */
  type: number

  /** Human readable name of the data type */
  typeName: string

  /** The display name (last part of the OID) */
  displayName: string

  /** Whether this OID already exists in the database */
  existsInDatabase?: boolean

  /** The name of the OID if it exists in the database */
  existingName?: string

  /** The description of the OID if it exists in the database */
  existingDescription?: string
}

/**
 * Request parameters for MIB browsing
 */
export interface MIBBrowserRequest {
  /** Company ID for authorization and scoping */
  companyId: string

  /** Target device hostname or IP address */
  host: string

  /** Target SNMP port (default: 161) */
  port?: number

  /** OID path to browse (default: 1.3.6.1.2.1.1 - system MIB) */
  oidPath?: string

  /** SNMP version to use (1, 2c, or 3) */
  snmpVersion: '1' | '2c' | '3'

  /** Community string for SNMPv1/v2c */
  community?: string

  /** Username for SNMPv3 */
  username?: string

  /** Security level for SNMPv3 (noAuthNoPriv, authNoPriv, authPriv) */
  securityLevel?: 'noAuthNoPriv' | 'authNoPriv' | 'authPriv'

  /** Authentication protocol for SNMPv3 */
  authProtocol?: 'MD5' | 'SHA' | 'SHA-224' | 'SHA-256' | 'SHA-384' | 'SHA-512'

  /** Authentication key for SNMPv3 */
  authKey?: string

  /** Privacy protocol for SNMPv3 */
  privProtocol?: 'DES' | 'AES' | 'AES-256'

  /** Privacy key for SNMPv3 */
  privKey?: string

  /** Optional template ID to use for authentication */
  templateId?: string
}

/**
 * Response from MIB browsing
 */
export interface MIBBrowserResponse {
  /** Array of MIB entries found */
  results: MIBEntry[]

  /** Error message if an error occurred */
  error?: string
}

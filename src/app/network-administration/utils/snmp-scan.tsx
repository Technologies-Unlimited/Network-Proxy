import * as snmp from 'snmp-native'
import { ExtendedSubnetFields } from '../../schema/network-administration/ipam/subnet/schema'
import { ExtendedPoolFields } from '../../schema/network-administration/ipam/pool/schema'
import { ExtendedSNMPv2Fields } from '../../schema/network-administration/snmp/snmpv2/schema'
import { ExtendedSNMPv3Fields } from '../../schema/network-administration/snmp/snmpv3/schema'
import { ExtendedIPAddressFields } from '../../schema/network-administration/ipam/ipaddress/schema'
import { ExtendedCompanyNetworkInventoryFields } from '../../schema/network-administration/inventory/company/schema'
import { getIpAddressesInRange, isIpInCidr } from './ip-utils'

export interface SnmpScanResult {
  ipAddress: string
  manufacturerId: string
  modelId: string
  productId: string
  oids: { [oid: string]: string }
}

let isScanningActive = false

export function startScan(
  subnet: ExtendedSubnetFields,
  pool: ExtendedPoolFields,
  snmpConfigs: (ExtendedSNMPv2Fields | ExtendedSNMPv3Fields)[],
  ipAddresses: ExtendedIPAddressFields[],
  networkInventory: ExtendedCompanyNetworkInventoryFields[],
  onProgress: (result: SnmpScanResult) => void
): Promise<void> {
  isScanningActive = true
  return scanSubnetPoolSnmp(
    subnet,
    pool,
    snmpConfigs,
    ipAddresses,
    networkInventory,
    onProgress
  )
}

export function stopScan(): void {
  isScanningActive = false
}

async function scanSubnetPoolSnmp(
  subnet: ExtendedSubnetFields,
  pool: ExtendedPoolFields,
  snmpConfigs: (ExtendedSNMPv2Fields | ExtendedSNMPv3Fields)[],
  ipAddresses: ExtendedIPAddressFields[],
  networkInventory: ExtendedCompanyNetworkInventoryFields[],
  onProgress: (result: SnmpScanResult) => void
): Promise<void> {
  const poolIpAddresses = getIpAddressesInRange(pool.startIp, pool.endIp)
  const subnetIpAddresses = poolIpAddresses.filter(ip =>
    isIpInCidr(ip, subnet.cidr)
  )

  for (const ip of subnetIpAddresses) {
    if (!isScanningActive) {
      console.log('Scan stopped')
      return
    }

    let success = false

    for (const snmpConfig of snmpConfigs) {
      try {
        const result = await performSnmpScan(ip, snmpConfig)
        const inventoryItem = findInventoryItem(
          ip,
          ipAddresses,
          networkInventory
        )

        if (inventoryItem) {
          const scanResult: SnmpScanResult = {
            ipAddress: ip,
            manufacturerId: inventoryItem.manufacturerId.toString(),
            modelId: inventoryItem.modelId.toString(),
            productId: inventoryItem.productId.toString(),
            oids: result.oids,
          }
          onProgress(scanResult)
        }

        success = true
        break
      } catch (error) {
        console.error(
          `SNMP scan failed for ${ip} with config:`,
          snmpConfig,
          error
        )
      }
    }

    if (!success) {
      console.warn(`Failed to scan ${ip} with all provided SNMP configurations`)
    }
  }
}

async function performSnmpScan(
  ip: string,
  snmpConfig: ExtendedSNMPv2Fields | ExtendedSNMPv3Fields
): Promise<{ oids: { [oid: string]: string } }> {
  return new Promise((resolve, reject) => {
    let session: snmp.Session

    if ('readCommunity' in snmpConfig) {
      // SNMPv2
      session = new snmp.Session({
        host: ip,
        community: snmpConfig.readCommunity,
      })
    } else {
      // SNMPv3
      session = new snmp.Session({
        host: ip,
        version: snmp.Version.v3,
        user: snmpConfig.userName,
        authProto: snmpConfig.authMethod,
        authKey: snmpConfig.authPassword,
        privProto: snmpConfig.encryptionMethod,
        privKey: snmpConfig.encryptionPassword,
      })
    }

    const oids: { [oid: string]: string } = {}

    session.getSubtree({ oid: '1.3.6.1' }, (error, varbinds) => {
      if (error) {
        console.error(`SNMP scan failed for ${ip}:`, error)
        session.close()
        reject(error)
      } else {
        for (const vb of varbinds) {
          oids[vb.oid] = vb.value?.toString() ?? ''
        }
        session.close()
        resolve({ oids })
      }
    })

    setTimeout(() => {
      session.close()
      reject(new Error(`SNMP scan timed out for ${ip}`))
    }, 60000) // 60 seconds timeout for full walk
  })
}

function findInventoryItem(
  ip: string,
  ipAddresses: ExtendedIPAddressFields[],
  networkInventory: ExtendedCompanyNetworkInventoryFields[]
): ExtendedCompanyNetworkInventoryFields | undefined {
  const ipAddressEntry = ipAddresses.find(ipAddr => ipAddr.address === ip)
  if (ipAddressEntry && ipAddressEntry.networkInventoryId) {
    return networkInventory.find(
      item =>
        item._id.toString() === ipAddressEntry.networkInventoryId?.toString()
    )
  }
  return undefined
}

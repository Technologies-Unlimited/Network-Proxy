'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedIPAddressFields } from '@/schema/network-administration/ipam/ipaddress/schema'
import { ObjectId } from 'mongodb'

const GET_IP_ADDRESSES_IN_POOL = gql`
  query GetIPAddressesInPool($companyId: ObjectId!) {
    getIPAddressesInPool(companyId: $companyId) {
      _id
      companyId
      address
      description
      isUsed
      networkInventoryId
      poolId
      subnetId
      supernetId
    }
  }
`

const UPDATE_IP_ADDRESS = gql`
  mutation UpdateIPAddress(
    $companyId: ObjectId!
    $id: ObjectId!
    $input: IPAddressInput!
  ) {
    updateIPAddress(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      address
      description
      isUsed
      networkInventoryId
      poolId
      subnetId
      supernetId
    }
  }
`

const DELETE_IP_ADDRESS = gql`
  mutation DeleteIPAddress($companyId: ObjectId!, $id: ObjectId!) {
    deleteIPAddress(companyId: $companyId, id: $id)
  }
`

const IP_ADDRESS_SUBSCRIPTION = gql`
  subscription OnIPAddressChanged($companyId: ObjectId!) {
    ipAddressChanged(companyId: $companyId) {
      _id
      companyId
      address
      description
      isUsed
      networkInventoryId
      poolId
      subnetId
      supernetId
    }
  }
`

export function useIPAddressAtom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(GET_IP_ADDRESSES_IN_POOL, {
    variables: { companyId: companyId.toHexString() },
  })

  const [updateIPAddressMutation] = useMutation(UPDATE_IP_ADDRESS)
  const [deleteIPAddressMutation] = useMutation(DELETE_IP_ADDRESS)

  const { data: subscriptionData } = useSubscription(IP_ADDRESS_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getIPAddresses = useCallback((): ExtendedIPAddressFields[] => {
    return (
      data?.getIPAddressesInPool.map((ip: ExtendedIPAddressFields) => ({
        ...ip,
        _id: ObjectId.createFromHexString(ip._id.toString()),
        companyId: ObjectId.createFromHexString(ip.companyId.toString()),
        networkInventoryId: ip.networkInventoryId
          ? ObjectId.createFromHexString(ip.networkInventoryId.toString())
          : null,
        poolId: ip.poolId
          ? ObjectId.createFromHexString(ip.poolId.toString())
          : null,
        subnetId: ip.subnetId
          ? ObjectId.createFromHexString(ip.subnetId.toString())
          : null,
        supernetId: ip.supernetId
          ? ObjectId.createFromHexString(ip.supernetId.toString())
          : null,
      })) || []
    )
  }, [data])

  const getIPAddressesWithSubnetsByIds = useCallback(
    (ipAddressIds: ObjectId[]): string[] => {
      const ipAddresses = getIPAddresses()
      return ipAddressIds.map(id => {
        const ipAddress = ipAddresses.find(ip => ip._id.equals(id))
        return ipAddress
          ? `${ipAddress.address} (${ipAddress.subnetId})`
          : 'Unknown IP'
      })
    },
    [getIPAddresses]
  )

  const getAllIPAddressesWithSubnets = useCallback((): string[] => {
    const ipAddresses = getIPAddresses()
    return ipAddresses.map(ip => `${ip.address} (${ip.subnetId})`)
  }, [getIPAddresses])

  const refreshIPAddressAtom = useCallback(() => {
    refetch()
  }, [refetch])

  const updateIPAddress = useCallback(
    async (
      _id: ObjectId,
      input: Partial<Omit<ExtendedIPAddressFields, '_id' | 'companyId'>>
    ): Promise<ExtendedIPAddressFields | undefined> => {
      try {
        const result = await updateIPAddressMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input,
          },
        })
        const updatedIPAddress = result.data.updateIPAddress
        return {
          ...updatedIPAddress,
          _id: ObjectId.createFromHexString(updatedIPAddress._id),
          companyId: ObjectId.createFromHexString(updatedIPAddress.companyId),
          networkInventoryId: updatedIPAddress.networkInventoryId
            ? ObjectId.createFromHexString(updatedIPAddress.networkInventoryId)
            : null,
          poolId: updatedIPAddress.poolId
            ? ObjectId.createFromHexString(updatedIPAddress.poolId)
            : null,
          subnetId: updatedIPAddress.subnetId
            ? ObjectId.createFromHexString(updatedIPAddress.subnetId)
            : null,
          supernetId: updatedIPAddress.supernetId
            ? ObjectId.createFromHexString(updatedIPAddress.supernetId)
            : null,
        }
      } catch (error) {
        console.error('Error updating IP address:', error)
        return undefined
      }
    },
    [updateIPAddressMutation, companyId]
  )

  const deleteIPAddress = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      try {
        const result = await deleteIPAddressMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteIPAddress
      } catch (error) {
        console.error('Error deleting IP address:', error)
        return false
      }
    },
    [deleteIPAddressMutation, companyId]
  )

  return {
    getIPAddresses,
    getIPAddressesWithSubnetsByIds,
    getAllIPAddressesWithSubnets,
    refreshIPAddressAtom,
    updateIPAddress,
    deleteIPAddress,
    loading,
    error,
  }
}

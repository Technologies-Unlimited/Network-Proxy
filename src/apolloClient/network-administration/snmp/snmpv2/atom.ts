'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedSNMPv2Fields } from '@/schema/network-administration/snmp/snmpv2/schema'
import { ObjectId } from 'mongodb'

const GET_SNMPV2S_FOR_COMPANY = gql`
  query GetSNMPv2sForCompany($companyId: ID!) {
    getSNMPv2sForCompany(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      communityName
      readCommunity
      writeCommunity
    }
  }
`

const UPDATE_SNMPV2 = gql`
  mutation UpdateSNMPv2($companyId: ID!, $id: ID!, $input: SNMPv2Input!) {
    updateSNMPv2(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      communityName
      readCommunity
      writeCommunity
    }
  }
`

const DELETE_SNMPV2 = gql`
  mutation DeleteSNMPv2($companyId: ID!, $id: ID!) {
    deleteSNMPv2(companyId: $companyId, id: $id)
  }
`

const SNMPV2_SUBSCRIPTION = gql`
  subscription OnSNMPv2Changed($companyId: ID!) {
    snmpv2Changed(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      communityName
      readCommunity
      writeCommunity
    }
  }
`

export function useSNMPv2Atom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(GET_SNMPV2S_FOR_COMPANY, {
    variables: { companyId: companyId.toHexString() },
  })

  const [updateSNMPv2Mutation] = useMutation(UPDATE_SNMPV2)
  const [deleteSNMPv2Mutation] = useMutation(DELETE_SNMPV2)

  const { data: subscriptionData } = useSubscription(SNMPV2_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getSNMPv2Settings = useCallback((): ExtendedSNMPv2Fields[] => {
    if (!data) return []
    return data.getSNMPv2sForCompany.map((snmpv2: ExtendedSNMPv2Fields) => ({
      ...snmpv2,
      _id: ObjectId.createFromHexString(snmpv2._id.toString()),
      companyId: ObjectId.createFromHexString(snmpv2.companyId.toString()),
      manufacturerId: snmpv2.manufacturerId
        ? ObjectId.createFromHexString(snmpv2.manufacturerId.toString())
        : undefined,
      modelId: snmpv2.modelId
        ? ObjectId.createFromHexString(snmpv2.modelId.toString())
        : undefined,
      productId: snmpv2.productId
        ? ObjectId.createFromHexString(snmpv2.productId.toString())
        : undefined,
    }))
  }, [data])

  const refreshSNMPv2Atom = useCallback(() => {
    refetch()
  }, [refetch])

  const updateSNMPv2 = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedSNMPv2Fields>
    ): Promise<ExtendedSNMPv2Fields | undefined> => {
      try {
        const result = await updateSNMPv2Mutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input: {
              ...input,
              manufacturerId: input.manufacturerId?.toHexString(),
              modelId: input.modelId?.toHexString(),
              productId: input.productId?.toHexString(),
            },
          },
        })
        const updatedSNMPv2 = result.data.updateSNMPv2
        return {
          ...updatedSNMPv2,
          _id: ObjectId.createFromHexString(updatedSNMPv2._id),
          companyId: ObjectId.createFromHexString(updatedSNMPv2.companyId),
          manufacturerId: updatedSNMPv2.manufacturerId
            ? ObjectId.createFromHexString(updatedSNMPv2.manufacturerId)
            : undefined,
          modelId: updatedSNMPv2.modelId
            ? ObjectId.createFromHexString(updatedSNMPv2.modelId)
            : undefined,
          productId: updatedSNMPv2.productId
            ? ObjectId.createFromHexString(updatedSNMPv2.productId)
            : undefined,
        }
      } catch (error) {
        console.error('Error updating SNMPv2:', error)
        return undefined
      }
    },
    [updateSNMPv2Mutation, companyId]
  )

  const deleteSNMPv2 = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      try {
        const result = await deleteSNMPv2Mutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSNMPv2
      } catch (error) {
        console.error('Error deleting SNMPv2:', error)
        return false
      }
    },
    [deleteSNMPv2Mutation, companyId]
  )

  return {
    getSNMPv2Settings,
    refreshSNMPv2Atom,
    updateSNMPv2,
    deleteSNMPv2,
    loading,
    error,
  }
}

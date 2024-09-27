'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedSNMPv3Fields } from '@/schema/network-administration/snmp/snmpv3/schema'
import { ObjectId } from 'mongodb'

const GET_SNMPV3S_FOR_COMPANY = gql`
  query GetSNMPv3sForCompany($companyId: ID!) {
    getSNMPv3sForCompany(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      communityName
      userName
      authMethod
      authPassword
      encryptionMethod
      encryptionPassword
    }
  }
`

const UPDATE_SNMPV3 = gql`
  mutation UpdateSNMPv3($companyId: ID!, $id: ID!, $input: SNMPv3Input!) {
    updateSNMPv3(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      communityName
      userName
      authMethod
      authPassword
      encryptionMethod
      encryptionPassword
    }
  }
`

const DELETE_SNMPV3 = gql`
  mutation DeleteSNMPv3($companyId: ID!, $id: ID!) {
    deleteSNMPv3(companyId: $companyId, id: $id)
  }
`

const SNMPV3_SUBSCRIPTION = gql`
  subscription OnSNMPv3Changed($companyId: ID!) {
    snmpv3Changed(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      communityName
      userName
      authMethod
      authPassword
      encryptionMethod
      encryptionPassword
    }
  }
`

export function useSNMPv3Atom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(GET_SNMPV3S_FOR_COMPANY, {
    variables: { companyId: companyId.toHexString() },
  })

  const [updateSNMPv3Mutation] = useMutation(UPDATE_SNMPV3)
  const [deleteSNMPv3Mutation] = useMutation(DELETE_SNMPV3)

  const { data: subscriptionData } = useSubscription(SNMPV3_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getSNMPv3Settings = useCallback((): ExtendedSNMPv3Fields[] => {
    if (!data) return []
    return data.getSNMPv3sForCompany.map((snmpv3: ExtendedSNMPv3Fields) => ({
      ...snmpv3,
      _id: ObjectId.createFromHexString(snmpv3._id.toString()),
      companyId: ObjectId.createFromHexString(snmpv3.companyId.toString()),
      manufacturerId: snmpv3.manufacturerId
        ? ObjectId.createFromHexString(snmpv3.manufacturerId.toString())
        : undefined,
      modelId: snmpv3.modelId
        ? ObjectId.createFromHexString(snmpv3.modelId.toString())
        : undefined,
      productId: snmpv3.productId
        ? ObjectId.createFromHexString(snmpv3.productId.toString())
        : undefined,
    }))
  }, [data])

  const refreshSNMPv3Atom = useCallback(() => {
    refetch()
  }, [refetch])

  const updateSNMPv3 = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedSNMPv3Fields>
    ): Promise<ExtendedSNMPv3Fields | undefined> => {
      try {
        const result = await updateSNMPv3Mutation({
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
        const updatedSNMPv3 = result.data.updateSNMPv3
        return {
          ...updatedSNMPv3,
          _id: ObjectId.createFromHexString(updatedSNMPv3._id),
          companyId: ObjectId.createFromHexString(updatedSNMPv3.companyId),
          manufacturerId: updatedSNMPv3.manufacturerId
            ? ObjectId.createFromHexString(updatedSNMPv3.manufacturerId)
            : undefined,
          modelId: updatedSNMPv3.modelId
            ? ObjectId.createFromHexString(updatedSNMPv3.modelId)
            : undefined,
          productId: updatedSNMPv3.productId
            ? ObjectId.createFromHexString(updatedSNMPv3.productId)
            : undefined,
        }
      } catch (error) {
        console.error('Error updating SNMPv3:', error)
        return undefined
      }
    },
    [updateSNMPv3Mutation, companyId]
  )

  const deleteSNMPv3 = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      try {
        const result = await deleteSNMPv3Mutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSNMPv3
      } catch (error) {
        console.error('Error deleting SNMPv3:', error)
        return false
      }
    },
    [deleteSNMPv3Mutation, companyId]
  )

  return {
    getSNMPv3Settings,
    refreshSNMPv3Atom,
    updateSNMPv3,
    deleteSNMPv3,
    loading,
    error,
  }
}

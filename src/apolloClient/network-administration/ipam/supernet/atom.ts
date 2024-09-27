'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ObjectId } from 'mongodb'
import { ExtendedSupernetFields } from '@/schema/network-administration/ipam/supernet/schema'

const GET_SUPERNETS_FOR_COMPANY = gql`
  query GetSupernetsForCompany($companyId: ID!) {
    getSupernetsForCompany(companyId: $companyId) {
      _id
      companyId
      name
      description
      cidr
      supernetAddress
    }
  }
`

const UPDATE_SUPERNET = gql`
  mutation UpdateSupernet($companyId: ID!, $id: ID!, $input: SupernetInput!) {
    updateSupernet(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      name
      description
      cidr
      supernetAddress
    }
  }
`

const DELETE_SUPERNET = gql`
  mutation DeleteSupernet($companyId: ID!, $id: ID!) {
    deleteSupernet(companyId: $companyId, id: $id)
  }
`

const SUPERNET_SUBSCRIPTION = gql`
  subscription OnSupernetChanged($companyId: ID!) {
    supernetChanged(companyId: $companyId) {
      _id
      companyId
      name
      description
      cidr
      supernetAddress
    }
  }
`

export function useSupernetAtom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(
    GET_SUPERNETS_FOR_COMPANY,
    {
      variables: { companyId: companyId.toHexString() },
    }
  )

  const [updateSupernetMutation] = useMutation(UPDATE_SUPERNET)
  const [deleteSupernetMutation] = useMutation(DELETE_SUPERNET)

  const { data: subscriptionData } = useSubscription(SUPERNET_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getSupernets = useCallback((): ExtendedSupernetFields[] => {
    return (
      data?.getSupernetsForCompany.map((supernet: ExtendedSupernetFields) => ({
        ...supernet,
        _id: ObjectId.createFromHexString(supernet._id.toString()),
        companyId: ObjectId.createFromHexString(supernet.companyId.toString()),
      })) || []
    )
  }, [data])

  const refreshSupernetAtom = useCallback(() => {
    refetch()
  }, [refetch])

  const updateSupernet = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedSupernetFields>
    ): Promise<ExtendedSupernetFields | undefined> => {
      try {
        const result = await updateSupernetMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input,
          },
        })
        const updatedSupernet = result.data.updateSupernet
        return {
          ...updatedSupernet,
          _id: ObjectId.createFromHexString(updatedSupernet._id),
          companyId: ObjectId.createFromHexString(updatedSupernet.companyId),
        }
      } catch (error) {
        console.error('Error updating supernet:', error)
        return undefined
      }
    },
    [updateSupernetMutation, companyId]
  )

  const deleteSupernet = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      try {
        const result = await deleteSupernetMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSupernet
      } catch (error) {
        console.error('Error deleting supernet:', error)
        return false
      }
    },
    [deleteSupernetMutation, companyId]
  )

  return {
    getSupernets,
    refreshSupernetAtom,
    updateSupernet,
    deleteSupernet,
    loading,
    error,
  }
}

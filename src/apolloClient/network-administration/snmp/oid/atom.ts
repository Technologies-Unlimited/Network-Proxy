'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedOIDFields } from '@/schema/network-administration/snmp/oid/schema'
import { ObjectId } from 'mongodb'

const GET_OIDS_FOR_COMPANY = gql`
  query GetOIDsForCompany($companyId: ID!) {
    getOIDsForCompany(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      oidName
      oid
      description
    }
  }
`

const UPDATE_OID = gql`
  mutation UpdateOID($companyId: ID!, $id: ID!, $input: OIDInput!) {
    updateOID(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      oidName
      oid
      description
    }
  }
`

const DELETE_OID = gql`
  mutation DeleteOID($companyId: ID!, $id: ID!) {
    deleteOID(companyId: $companyId, id: $id)
  }
`

const OID_SUBSCRIPTION = gql`
  subscription OnOIDChanged($companyId: ID!) {
    oidChanged(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelId
      productId
      oidName
      oid
      description
    }
  }
`

export function useOIDAtom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(GET_OIDS_FOR_COMPANY, {
    variables: { companyId: companyId.toHexString() },
  })

  const [updateOIDMutation] = useMutation(UPDATE_OID)
  const [deleteOIDMutation] = useMutation(DELETE_OID)

  const { data: subscriptionData } = useSubscription(OID_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getOIDs = useCallback((): ExtendedOIDFields[] => {
    return (
      data?.getOIDsForCompany.map((oid: ExtendedOIDFields) => ({
        ...oid,
        _id: ObjectId.createFromHexString(oid._id.toString()),
        companyId: ObjectId.createFromHexString(oid.companyId.toString()),
        manufacturerId: oid.manufacturerId
          ? ObjectId.createFromHexString(oid.manufacturerId.toString())
          : undefined,
        modelId: oid.modelId
          ? ObjectId.createFromHexString(oid.modelId.toString())
          : undefined,
        productId: oid.productId
          ? ObjectId.createFromHexString(oid.productId.toString())
          : undefined,
      })) || []
    )
  }, [data])

  const refreshOIDAtom = useCallback(() => {
    refetch()
  }, [refetch])

  const updateOID = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedOIDFields>
    ): Promise<ExtendedOIDFields | undefined> => {
      try {
        const result = await updateOIDMutation({
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
        const updatedOID = result.data.updateOID
        return {
          ...updatedOID,
          _id: ObjectId.createFromHexString(updatedOID._id),
          companyId: ObjectId.createFromHexString(updatedOID.companyId),
          manufacturerId: updatedOID.manufacturerId
            ? ObjectId.createFromHexString(updatedOID.manufacturerId)
            : undefined,
          modelId: updatedOID.modelId
            ? ObjectId.createFromHexString(updatedOID.modelId)
            : undefined,
          productId: updatedOID.productId
            ? ObjectId.createFromHexString(updatedOID.productId)
            : undefined,
        }
      } catch (error) {
        console.error('Error updating OID:', error)
        return undefined
      }
    },
    [updateOIDMutation, companyId]
  )

  const deleteOID = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      try {
        const result = await deleteOIDMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteOID
      } catch (error) {
        console.error('Error deleting OID:', error)
        return false
      }
    },
    [deleteOIDMutation, companyId]
  )

  return {
    getOIDs,
    refreshOIDAtom,
    updateOID,
    deleteOID,
    loading,
    error,
  }
}

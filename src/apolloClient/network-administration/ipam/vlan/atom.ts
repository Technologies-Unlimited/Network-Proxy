'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ObjectId } from 'mongodb'
import { ExtendedVLANFields } from '@/schema/network-administration/ipam/vlan/schema'

const GET_VLANS_FOR_COMPANY = gql`
  query GetVLANsForCompany($companyId: ID!) {
    getVLANsForCompany(companyId: $companyId) {
      _id
      companyId
      name
      subnetId
      supernetId
      tagged
      untagged
      vlanNumber
      description
    }
  }
`

const UPDATE_VLAN = gql`
  mutation UpdateVLAN($companyId: ID!, $id: ID!, $input: VLANInput!) {
    updateVLAN(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      name
      subnetId
      supernetId
      tagged
      untagged
      vlanNumber
      description
    }
  }
`

const DELETE_VLAN = gql`
  mutation DeleteVLAN($companyId: ID!, $id: ID!) {
    deleteVLAN(companyId: $companyId, id: $id)
  }
`

const VLAN_SUBSCRIPTION = gql`
  subscription OnVLANChanged($companyId: ID!) {
    vlanChanged(companyId: $companyId) {
      _id
      companyId
      name
      subnetId
      supernetId
      tagged
      untagged
      vlanNumber
      description
    }
  }
`

export function useVLANAtom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(GET_VLANS_FOR_COMPANY, {
    variables: { companyId: companyId.toHexString() },
  })

  const [updateVLANMutation] = useMutation(UPDATE_VLAN)
  const [deleteVLANMutation] = useMutation(DELETE_VLAN)

  const { data: subscriptionData } = useSubscription(VLAN_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getVLANs = useCallback((): ExtendedVLANFields[] => {
    return (
      data?.getVLANsForCompany.map((vlan: ExtendedVLANFields) => ({
        ...vlan,
        _id: ObjectId.createFromHexString(vlan._id.toString()),
        companyId: ObjectId.createFromHexString(vlan.companyId.toString()),
        subnetId: vlan.subnetId
          ? ObjectId.createFromHexString(vlan.subnetId.toString())
          : undefined,
        supernetId: vlan.supernetId
          ? ObjectId.createFromHexString(vlan.supernetId.toString())
          : undefined,
      })) || []
    )
  }, [data])

  const refreshVLANAtom = useCallback(() => {
    refetch()
  }, [refetch])

  const updateVLAN = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedVLANFields>
    ): Promise<ExtendedVLANFields | undefined> => {
      try {
        const result = await updateVLANMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input,
          },
        })
        const updatedVLAN = result.data.updateVLAN
        return {
          ...updatedVLAN,
          _id: ObjectId.createFromHexString(updatedVLAN._id),
          companyId: ObjectId.createFromHexString(updatedVLAN.companyId),
          subnetId: updatedVLAN.subnetId
            ? ObjectId.createFromHexString(updatedVLAN.subnetId)
            : undefined,
          supernetId: updatedVLAN.supernetId
            ? ObjectId.createFromHexString(updatedVLAN.supernetId)
            : undefined,
        }
      } catch (error) {
        console.error('Error updating VLAN:', error)
        return undefined
      }
    },
    [updateVLANMutation, companyId]
  )

  const deleteVLAN = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      try {
        const result = await deleteVLANMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteVLAN
      } catch (error) {
        console.error('Error deleting VLAN:', error)
        return false
      }
    },
    [deleteVLANMutation, companyId]
  )

  return {
    getVLANs,
    refreshVLANAtom,
    updateVLAN,
    deleteVLAN,
    loading,
    error,
  }
}

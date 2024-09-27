'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ObjectId } from 'mongodb'
import { ExtendedSubnetFields } from '@/schema/network-administration/ipam/subnet/schema'

const GET_SUBNETS = gql`
  query GetSubnets($companyId: ID!) {
    getSubnets(companyId: $companyId) {
      _id
      companyId
      name
      cidr
      subnetAddress
      gateway
      description
      supernetId
    }
  }
`

const UPDATE_SUBNET = gql`
  mutation UpdateSubnet($companyId: ID!, $id: ID!, $input: SubnetInput!) {
    updateSubnet(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      name
      cidr
      subnetAddress
      gateway
      description
      supernetId
    }
  }
`

const DELETE_SUBNET = gql`
  mutation DeleteSubnet($companyId: ID!, $id: ID!) {
    deleteSubnet(companyId: $companyId, id: $id)
  }
`

const SUBNET_SUBSCRIPTION = gql`
  subscription OnSubnetChanged($companyId: ID!) {
    subnetChanged(companyId: $companyId) {
      _id
      companyId
      name
      cidr
      subnetAddress
      gateway
      description
      supernetId
    }
  }
`

export function useSubnetAtom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(GET_SUBNETS, {
    variables: { companyId: companyId.toHexString() },
  })

  const [updateSubnetMutation] = useMutation(UPDATE_SUBNET)
  const [deleteSubnetMutation] = useMutation(DELETE_SUBNET)

  const { data: subscriptionData } = useSubscription(SUBNET_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getSubnets = useCallback((): ExtendedSubnetFields[] => {
    return (
      data?.getSubnets.map((subnet: ExtendedSubnetFields) => ({
        ...subnet,
        _id: ObjectId.createFromHexString(subnet._id.toString()),
        companyId: ObjectId.createFromHexString(subnet.companyId.toString()),
        supernetId: ObjectId.createFromHexString(subnet.supernetId.toString()),
      })) || []
    )
  }, [data])

  const refreshSubnetAtom = useCallback(() => {
    refetch()
  }, [refetch])

  const updateSubnet = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedSubnetFields>
    ): Promise<ExtendedSubnetFields | undefined> => {
      try {
        const result = await updateSubnetMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input,
          },
        })
        const updatedSubnet = result.data.updateSubnet
        return {
          ...updatedSubnet,
          _id: ObjectId.createFromHexString(updatedSubnet._id),
          companyId: ObjectId.createFromHexString(updatedSubnet.companyId),
          supernetId: ObjectId.createFromHexString(updatedSubnet.supernetId),
        }
      } catch (error) {
        console.error('Error updating subnet:', error)
        return undefined
      }
    },
    [updateSubnetMutation, companyId]
  )

  const deleteSubnet = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      try {
        const result = await deleteSubnetMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSubnet
      } catch (error) {
        console.error('Error deleting subnet:', error)
        return false
      }
    },
    [deleteSubnetMutation, companyId]
  )

  return {
    getSubnets,
    refreshSubnetAtom,
    updateSubnet,
    deleteSubnet,
    loading,
    error,
  }
}

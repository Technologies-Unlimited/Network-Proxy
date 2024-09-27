'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedPoolFields } from '@/schema/network-administration/ipam/pool/schema'
import { ObjectId } from 'mongodb'

const GET_POOLS = gql`
  query GetPools($companyId: ID!) {
    getPools(companyId: $companyId) {
      _id
      companyId
      name
      startIp
      endIp
      description
      subnetId
      supernetId
    }
  }
`

const UPDATE_POOL = gql`
  mutation UpdatePool($companyId: ID!, $id: ID!, $input: PoolInput!) {
    updatePool(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      name
      startIp
      endIp
      description
      subnetId
      supernetId
    }
  }
`

const DELETE_POOL = gql`
  mutation DeletePool($companyId: ID!, $id: ID!) {
    deletePool(companyId: $companyId, id: $id)
  }
`

const POOL_SUBSCRIPTION = gql`
  subscription OnPoolChanged($companyId: ID!) {
    poolChanged(companyId: $companyId) {
      _id
      companyId
      name
      startIp
      endIp
      description
      subnetId
      supernetId
    }
  }
`

export function usePoolAtom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(GET_POOLS, {
    variables: { companyId: companyId.toHexString() },
  })

  const [updatePoolMutation] = useMutation(UPDATE_POOL)
  const [deletePoolMutation] = useMutation(DELETE_POOL)

  const { data: subscriptionData } = useSubscription(POOL_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getPools = useCallback((): ExtendedPoolFields[] => {
    return (
      data?.getPools.map((pool: ExtendedPoolFields) => ({
        ...pool,
        _id: ObjectId.createFromHexString(pool._id.toString()),
        companyId: ObjectId.createFromHexString(pool.companyId.toString()),
        subnetId: ObjectId.createFromHexString(pool.subnetId.toString()),
        supernetId: ObjectId.createFromHexString(pool.supernetId.toString()),
      })) || []
    )
  }, [data])

  const getPoolNameStartIpEndIpAndSubnet = useCallback(
    (poolIds: ObjectId[]): string[] => {
      const pools = getPools()
      return poolIds.map(id => {
        const pool = pools.find(p => p._id.equals(id))
        return pool
          ? `${pool.name} (${pool.startIp} - ${pool.endIp}) [${pool.subnetId}]`
          : 'Unknown Pool'
      })
    },
    [getPools]
  )

  const refreshPoolAtom = useCallback(() => {
    refetch()
  }, [refetch])

  const updatePool = useCallback(
    async (
      _id: ObjectId,
      input: Partial<
        Omit<
          ExtendedPoolFields,
          '_id' | 'companyId' | 'subnetId' | 'supernetId'
        >
      >
    ): Promise<ExtendedPoolFields | undefined> => {
      try {
        const result = await updatePoolMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input,
          },
        })
        const updatedPool = result.data.updatePool
        return {
          ...updatedPool,
          _id: ObjectId.createFromHexString(updatedPool._id),
          companyId: ObjectId.createFromHexString(updatedPool.companyId),
          subnetId: ObjectId.createFromHexString(updatedPool.subnetId),
          supernetId: ObjectId.createFromHexString(updatedPool.supernetId),
        }
      } catch (error) {
        console.error('Error updating pool:', error)
        return undefined
      }
    },
    [updatePoolMutation, companyId]
  )

  const deletePool = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      try {
        const result = await deletePoolMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deletePool
      } catch (error) {
        console.error('Error deleting pool:', error)
        return false
      }
    },
    [deletePoolMutation, companyId]
  )

  return {
    getPools,
    getPoolNameStartIpEndIpAndSubnet,
    refreshPoolAtom,
    updatePool,
    deletePool,
    loading,
    error,
  }
}

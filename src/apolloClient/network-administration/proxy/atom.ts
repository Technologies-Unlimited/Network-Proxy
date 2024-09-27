'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ObjectId } from 'mongodb'
import { ExtendedProxyFields } from '@/schema/network-administration/proxy/schema'

const GET_PROXIES_FOR_COMPANY = gql`
  query GetProxiesForCompany($companyId: ID!) {
    getProxiesForCompany(companyId: $companyId) {
      _id
      companyId
      supernetId
      subnetId
      proxyName
      proxyStatus
      description
    }
  }
`

const UPDATE_PROXY = gql`
  mutation UpdateProxy(
    $companyId: ID!
    $id: ID!
    $supernetId: ID!
    $subnetId: ID!
    $input: ProxyInput!
  ) {
    updateProxy(
      companyId: $companyId
      id: $id
      supernetId: $supernetId
      subnetId: $subnetId
      input: $input
    ) {
      _id
      companyId
      supernetId
      subnetId
      proxyName
      proxyStatus
      description
    }
  }
`

const DELETE_PROXY = gql`
  mutation DeleteProxy(
    $companyId: ID!
    $id: ID!
    $supernetId: ID!
    $subnetId: ID!
  ) {
    deleteProxy(
      companyId: $companyId
      id: $id
      supernetId: $supernetId
      subnetId: $subnetId
    )
  }
`

const PROXY_SUBSCRIPTION = gql`
  subscription OnProxyChanged($companyId: ID!) {
    proxyChanged(companyId: $companyId) {
      _id
      companyId
      supernetId
      subnetId
      proxyName
      proxyStatus
      description
    }
  }
`

export function useProxyAtom(companyId: ObjectId) {
  const { data, loading, error, refetch } = useQuery(GET_PROXIES_FOR_COMPANY, {
    variables: { companyId: companyId.toHexString() },
  })

  const [updateProxyMutation] = useMutation(UPDATE_PROXY)
  const [deleteProxyMutation] = useMutation(DELETE_PROXY)

  const { data: subscriptionData } = useSubscription(PROXY_SUBSCRIPTION, {
    variables: { companyId: companyId.toHexString() },
  })

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getProxies = useCallback((): ExtendedProxyFields[] => {
    return (
      data?.getProxiesForCompany.map((proxy: ExtendedProxyFields) => ({
        ...proxy,
        _id: ObjectId.createFromHexString(proxy._id.toString()),
        companyId: ObjectId.createFromHexString(proxy.companyId.toString()),
        supernetId: ObjectId.createFromHexString(proxy.supernetId.toString()),
        subnetId: ObjectId.createFromHexString(proxy.subnetId.toString()),
      })) || []
    )
  }, [data])

  const refreshProxyAtom = useCallback(() => {
    refetch()
  }, [refetch])

  const updateProxy = useCallback(
    async (
      _id: ObjectId,
      supernetId: ObjectId,
      subnetId: ObjectId,
      input: Partial<ExtendedProxyFields>
    ): Promise<ExtendedProxyFields | undefined> => {
      try {
        const result = await updateProxyMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            supernetId: supernetId.toHexString(),
            subnetId: subnetId.toHexString(),
            input,
          },
        })
        const updatedProxy = result.data.updateProxy
        return {
          ...updatedProxy,
          _id: ObjectId.createFromHexString(updatedProxy._id),
          companyId: ObjectId.createFromHexString(updatedProxy.companyId),
          supernetId: ObjectId.createFromHexString(updatedProxy.supernetId),
          subnetId: ObjectId.createFromHexString(updatedProxy.subnetId),
        }
      } catch (error) {
        console.error('Error updating proxy:', error)
        return undefined
      }
    },
    [updateProxyMutation, companyId]
  )

  const deleteProxy = useCallback(
    async (
      _id: ObjectId,
      supernetId: ObjectId,
      subnetId: ObjectId
    ): Promise<boolean> => {
      try {
        const result = await deleteProxyMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            supernetId: supernetId.toHexString(),
            subnetId: subnetId.toHexString(),
          },
        })
        return result.data.deleteProxy
      } catch (error) {
        console.error('Error deleting proxy:', error)
        return false
      }
    },
    [deleteProxyMutation, companyId]
  )

  return {
    getProxies,
    refreshProxyAtom,
    updateProxy,
    deleteProxy,
    loading,
    error,
  }
}

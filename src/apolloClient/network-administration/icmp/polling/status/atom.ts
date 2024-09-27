'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedICMPPollingStatusFields } from '@/schema/network-administration/icmp/polling/status/schema'
import { ObjectId } from 'mongodb'

const GET_ICMP_POLLING_STATUSES_FOR_COMPANY = gql`
  query GetICMPPollingStatusesForCompany($companyId: ID!) {
    getICMPPollingStatusesForCompany(companyId: $companyId) {
      _id
      companyId
      icmpPollingTemplateId
      manufacturerId
      modelNameId
      productId
      stockIds
      networkInventoryIds
      uptime
      downtime
      deviceStatus
    }
  }
`

const UPDATE_ICMP_POLLING_STATUS = gql`
  mutation UpdateICMPPollingStatus(
    $companyId: ID!
    $id: ID!
    $input: ICMPPollingStatusInput!
  ) {
    updateICMPPollingStatus(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      icmpPollingTemplateId
      manufacturerId
      modelNameId
      productId
      stockIds
      networkInventoryIds
      uptime
      downtime
      deviceStatus
    }
  }
`

const DELETE_ICMP_POLLING_STATUS = gql`
  mutation DeleteICMPPollingStatus($companyId: ID!, $id: ID!) {
    deleteICMPPollingStatus(companyId: $companyId, id: $id)
  }
`

const ICMP_POLLING_STATUS_SUBSCRIPTION = gql`
  subscription OnICMPPollingStatusChanged($companyId: ID!) {
    icmpPollingStatusChanged(companyId: $companyId) {
      _id
      companyId
      icmpPollingTemplateId
      manufacturerId
      modelNameId
      productId
      stockIds
      networkInventoryIds
      uptime
      downtime
      deviceStatus
    }
  }
`

interface RawICMPPollingStatus {
  _id: string
  companyId: string
  icmpPollingTemplateId: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  stockIds?: string[]
  networkInventoryIds?: string[]
  uptime?: number
  downtime?: number
  deviceStatus: string
}

export function useICMPPollingStatusAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(
    GET_ICMP_POLLING_STATUSES_FOR_COMPANY,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  const [updateICMPPollingStatusMutation] = useMutation(
    UPDATE_ICMP_POLLING_STATUS
  )
  const [deleteICMPPollingStatusMutation] = useMutation(
    DELETE_ICMP_POLLING_STATUS
  )

  const { data: subscriptionData } = useSubscription(
    ICMP_POLLING_STATUS_SUBSCRIPTION,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getICMPPollingStatuses =
    useCallback((): ExtendedICMPPollingStatusFields[] => {
      return (
        data?.getICMPPollingStatusesForCompany.map(
          (status: RawICMPPollingStatus) => ({
            ...status,
            _id: ObjectId.createFromHexString(status._id),
            companyId: ObjectId.createFromHexString(status.companyId),
            icmpPollingTemplateId: ObjectId.createFromHexString(
              status.icmpPollingTemplateId
            ),
            manufacturerId: status.manufacturerId
              ? ObjectId.createFromHexString(status.manufacturerId)
              : undefined,
            modelNameId: status.modelNameId
              ? ObjectId.createFromHexString(status.modelNameId)
              : undefined,
            productId: status.productId
              ? ObjectId.createFromHexString(status.productId)
              : undefined,
            stockIds: status.stockIds
              ? status.stockIds.map((id: string) =>
                  ObjectId.createFromHexString(id)
                )
              : [],
            networkInventoryIds: status.networkInventoryIds
              ? status.networkInventoryIds.map((id: string) =>
                  ObjectId.createFromHexString(id)
                )
              : [],
            uptime: status.uptime,
            downtime: status.downtime,
          })
        ) || []
      )
    }, [data])

  const refreshICMPPollingStatusAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateICMPPollingStatus = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedICMPPollingStatusFields>
    ): Promise<ExtendedICMPPollingStatusFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateICMPPollingStatusMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input: {
              ...input,
              stockIds: input.stockIds?.map(id => id.toHexString()),
              networkInventoryIds: input.networkInventoryIds?.map(id =>
                id.toHexString()
              ),
            },
          },
        })
        const updatedStatus = result.data.updateICMPPollingStatus
        return {
          ...updatedStatus,
          _id: ObjectId.createFromHexString(updatedStatus._id),
          companyId: ObjectId.createFromHexString(updatedStatus.companyId),
          icmpPollingTemplateId: ObjectId.createFromHexString(
            updatedStatus.icmpPollingTemplateId
          ),
          manufacturerId: updatedStatus.manufacturerId
            ? ObjectId.createFromHexString(updatedStatus.manufacturerId)
            : undefined,
          modelNameId: updatedStatus.modelNameId
            ? ObjectId.createFromHexString(updatedStatus.modelNameId)
            : undefined,
          productId: updatedStatus.productId
            ? ObjectId.createFromHexString(updatedStatus.productId)
            : undefined,
          stockIds: updatedStatus.stockIds
            ? updatedStatus.stockIds.map((id: string) =>
                ObjectId.createFromHexString(id)
              )
            : [],
          networkInventoryIds: updatedStatus.networkInventoryIds
            ? updatedStatus.networkInventoryIds.map((id: string) =>
                ObjectId.createFromHexString(id)
              )
            : [],
          uptime: updatedStatus.uptime,
          downtime: updatedStatus.downtime,
        }
      } catch (error) {
        console.error('Error updating ICMP polling status:', error)
        return null
      }
    },
    [updateICMPPollingStatusMutation, companyId]
  )

  const deleteICMPPollingStatus = useCallback(
    async (id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        await deleteICMPPollingStatusMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: id.toHexString(),
          },
        })
        await refetch()
        const statuses = getICMPPollingStatuses()
        return !statuses.some(status => status._id.equals(id))
      } catch (error) {
        console.error('Error deleting ICMP polling status:', error)
        return false
      }
    },
    [
      deleteICMPPollingStatusMutation,
      companyId,
      refetch,
      getICMPPollingStatuses,
    ]
  )

  return {
    getICMPPollingStatuses,
    refreshICMPPollingStatusAtom,
    updateICMPPollingStatus,
    deleteICMPPollingStatus,
    loading,
    error,
  }
}

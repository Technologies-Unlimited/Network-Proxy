'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedSNMPPollingStatusFields } from '@/schema/network-administration/snmp/polling/status/schema'
import { ObjectId } from 'mongodb'

const GET_SNMP_POLLING_STATUSES_FOR_COMPANY = gql`
  query GetSNMPPollingStatusesForCompany($companyId: ID!) {
    getSNMPPollingStatusesForCompany(companyId: $companyId) {
      _id
      companyId
      snmpPollingTemplateId
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

const UPDATE_SNMP_POLLING_STATUS = gql`
  mutation UpdateSNMPPollingStatus(
    $companyId: ID!
    $id: ID!
    $input: SNMPPollingStatusInput!
  ) {
    updateSNMPPollingStatus(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      snmpPollingTemplateId
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

const DELETE_SNMP_POLLING_STATUS = gql`
  mutation DeleteSNMPPollingStatus($companyId: ID!, $id: ID!) {
    deleteSNMPPollingStatus(companyId: $companyId, id: $id)
  }
`

const SNMP_POLLING_STATUS_SUBSCRIPTION = gql`
  subscription OnSNMPPollingStatusChanged($companyId: ID!) {
    snmpPollingStatusChanged(companyId: $companyId) {
      _id
      companyId
      snmpPollingTemplateId
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

export function useSNMPPollingStatusAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(
    GET_SNMP_POLLING_STATUSES_FOR_COMPANY,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  const [updateSNMPPollingStatusMutation] = useMutation(
    UPDATE_SNMP_POLLING_STATUS
  )
  const [deleteSNMPPollingStatusMutation] = useMutation(
    DELETE_SNMP_POLLING_STATUS
  )

  const { data: subscriptionData } = useSubscription(
    SNMP_POLLING_STATUS_SUBSCRIPTION,
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

  const getSNMPPollingStatuses =
    useCallback((): ExtendedSNMPPollingStatusFields[] => {
      if (!companyId || !data) {
        return []
      }
      return data.getSNMPPollingStatusesForCompany.map(
        (status: ExtendedSNMPPollingStatusFields) => ({
          ...status,
          _id: ObjectId.createFromHexString(status._id.toString()),
          companyId: ObjectId.createFromHexString(status.companyId.toString()),
          snmpPollingTemplateId: ObjectId.createFromHexString(
            status.snmpPollingTemplateId.toString()
          ),
          manufacturerId: status.manufacturerId
            ? ObjectId.createFromHexString(status.manufacturerId.toString())
            : undefined,
          modelNameId: status.modelNameId
            ? ObjectId.createFromHexString(status.modelNameId.toString())
            : undefined,
          productId: status.productId
            ? ObjectId.createFromHexString(status.productId.toString())
            : undefined,
          stockIds: status.stockIds
            ? status.stockIds.map(id =>
                ObjectId.createFromHexString(id.toString())
              )
            : undefined,
          networkInventoryIds: status.networkInventoryIds
            ? status.networkInventoryIds.map(id =>
                ObjectId.createFromHexString(id.toString())
              )
            : undefined,
        })
      )
    }, [data, companyId])

  const refreshSNMPPollingStatusAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateSNMPPollingStatus = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedSNMPPollingStatusFields>
    ): Promise<ExtendedSNMPPollingStatusFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateSNMPPollingStatusMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input: {
              ...input,
              manufacturerId: input.manufacturerId?.toHexString(),
              modelNameId: input.modelNameId?.toHexString(),
              productId: input.productId?.toHexString(),
              stockIds: input.stockIds?.map(id => id.toHexString()),
              networkInventoryIds: input.networkInventoryIds?.map(id =>
                id.toHexString()
              ),
            },
          },
        })
        const updatedStatus = result.data.updateSNMPPollingStatus
        return {
          ...updatedStatus,
          _id: ObjectId.createFromHexString(updatedStatus._id),
          companyId: ObjectId.createFromHexString(updatedStatus.companyId),
          snmpPollingTemplateId: ObjectId.createFromHexString(
            updatedStatus.snmpPollingTemplateId
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
            : undefined,
          networkInventoryIds: updatedStatus.networkInventoryIds
            ? updatedStatus.networkInventoryIds.map((id: string) =>
                ObjectId.createFromHexString(id)
              )
            : undefined,
        }
      } catch (error) {
        console.error('Error updating SNMP polling status:', error)
        return null
      }
    },
    [updateSNMPPollingStatusMutation, companyId]
  )

  const deleteSNMPPollingStatus = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        const result = await deleteSNMPPollingStatusMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSNMPPollingStatus
      } catch (error) {
        console.error('Error deleting SNMP polling status:', error)
        return false
      }
    },
    [deleteSNMPPollingStatusMutation, companyId]
  )

  return {
    getSNMPPollingStatuses,
    refreshSNMPPollingStatusAtom,
    updateSNMPPollingStatus,
    deleteSNMPPollingStatus,
    loading,
    error,
  }
}

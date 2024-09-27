'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedCustomerNetworkInventoryItemFields } from '@/schema/network-administration/inventory/customer/schema'
import { ObjectId } from 'mongodb'

const GET_ALL_CUSTOMER_NETWORK_INVENTORY_ITEMS = gql`
  query GetAllCustomerNetworkInventoryItems($companyId: ID!, $customerId: ID!) {
    getAllCustomerNetworkInventoryItems(
      companyId: $companyId
      customerId: $customerId
    ) {
      _id
      companyId
      networkInventoryId
      customerId
    }
  }
`

const ASSIGN_NETWORK_INVENTORY_TO_CUSTOMER = gql`
  mutation AssignNetworkInventoryToCustomer(
    $companyId: ID!
    $customerId: ID!
    $networkInventoryId: ID!
  ) {
    assignNetworkInventoryToCustomer(
      companyId: $companyId
      customerId: $customerId
      networkInventoryId: $networkInventoryId
    ) {
      _id
      companyId
      networkInventoryId
      customerId
    }
  }
`

const UNASSIGN_NETWORK_INVENTORY_FROM_CUSTOMER = gql`
  mutation UnassignNetworkInventoryFromCustomer(
    $companyId: ID!
    $customerId: ID!
    $id: ID!
  ) {
    unassignNetworkInventoryFromCustomer(
      companyId: $companyId
      customerId: $customerId
      id: $id
    )
  }
`

const CUSTOMER_NETWORK_INVENTORY_SUBSCRIPTION = gql`
  subscription OnCustomerNetworkInventoryChanged(
    $companyId: ID!
    $customerId: ID!
  ) {
    customerNetworkInventoryChanged(
      companyId: $companyId
      customerId: $customerId
    ) {
      _id
      companyId
      networkInventoryId
      customerId
    }
  }
`

export function useCustomerNetworkInventoryAtom(
  companyId: ObjectId | null,
  customerId: ObjectId | null
) {
  const { data, loading, error, refetch } = useQuery(
    GET_ALL_CUSTOMER_NETWORK_INVENTORY_ITEMS,
    {
      variables: {
        companyId: companyId?.toHexString(),
        customerId: customerId?.toHexString(),
      },
      skip: !companyId || !customerId,
    }
  )

  const [assignNetworkInventoryToCustomerMutation] = useMutation(
    ASSIGN_NETWORK_INVENTORY_TO_CUSTOMER
  )
  const [unassignNetworkInventoryFromCustomerMutation] = useMutation(
    UNASSIGN_NETWORK_INVENTORY_FROM_CUSTOMER
  )

  const { data: subscriptionData } = useSubscription(
    CUSTOMER_NETWORK_INVENTORY_SUBSCRIPTION,
    {
      variables: {
        companyId: companyId?.toHexString(),
        customerId: customerId?.toHexString(),
      },
      skip: !companyId || !customerId,
    }
  )

  useEffect(() => {
    if (subscriptionData) {
      refetch()
    }
  }, [subscriptionData, refetch])

  const getCustomerNetworkInventory =
    useCallback((): ExtendedCustomerNetworkInventoryItemFields[] => {
      return (
        data?.getAllCustomerNetworkInventoryItems.map(
          (item: ExtendedCustomerNetworkInventoryItemFields) => ({
            ...item,
            _id: ObjectId.createFromHexString(item._id.toString()),
            companyId: ObjectId.createFromHexString(item.companyId.toString()),
            customerId: ObjectId.createFromHexString(
              item.customerId.toString()
            ),
            networkInventoryId: ObjectId.createFromHexString(
              item.networkInventoryId.toString()
            ),
          })
        ) || []
      )
    }, [data])

  const refreshCustomerNetworkInventoryAtom = useCallback(() => {
    if (companyId && customerId) {
      refetch()
    } else {
      console.error('Company ID or Customer ID is null')
    }
  }, [refetch, companyId, customerId])

  const updateCustomerNetworkInventory = useCallback(
    async (
      _id: ObjectId,
      networkInventoryId: ObjectId
    ): Promise<ExtendedCustomerNetworkInventoryItemFields | null> => {
      if (!companyId || !customerId) {
        console.error('Company ID or Customer ID is null')
        return null
      }
      try {
        const result = await assignNetworkInventoryToCustomerMutation({
          variables: {
            companyId: companyId.toHexString(),
            customerId: customerId.toHexString(),
            networkInventoryId: networkInventoryId.toHexString(),
          },
        })
        const assignedItem = result.data.assignNetworkInventoryToCustomer
        return {
          ...assignedItem,
          _id: ObjectId.createFromHexString(assignedItem._id),
          companyId: ObjectId.createFromHexString(assignedItem.companyId),
          customerId: ObjectId.createFromHexString(assignedItem.customerId),
          networkInventoryId: ObjectId.createFromHexString(
            assignedItem.networkInventoryId
          ),
        }
      } catch (error) {
        console.error('Error updating customer network inventory:', error)
        return null
      }
    },
    [assignNetworkInventoryToCustomerMutation, companyId, customerId]
  )

  const deleteCustomerNetworkInventory = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId || !customerId) {
        console.error('Company ID or Customer ID is null')
        return false
      }
      try {
        await unassignNetworkInventoryFromCustomerMutation({
          variables: {
            companyId: companyId.toHexString(),
            customerId: customerId.toHexString(),
            id: _id.toHexString(),
          },
        })
        await refetch()
        const items = getCustomerNetworkInventory()
        return !items.some(item => item._id.equals(_id))
      } catch (error) {
        console.error('Error deleting customer network inventory:', error)
        return false
      }
    },
    [
      unassignNetworkInventoryFromCustomerMutation,
      companyId,
      customerId,
      refetch,
      getCustomerNetworkInventory,
    ]
  )

  return {
    getCustomerNetworkInventory,
    refreshCustomerNetworkInventoryAtom,
    updateCustomerNetworkInventory,
    deleteCustomerNetworkInventory,
    loading,
    error,
  }
}

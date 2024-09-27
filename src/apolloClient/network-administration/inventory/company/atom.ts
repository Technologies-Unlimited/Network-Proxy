'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedCompanyNetworkInventoryFields } from '@/schema/network-administration/inventory/company/schema'
import { ObjectId } from 'mongodb'

const GET_ALL_COMPANY_NETWORK_INVENTORIES = gql`
  query GetAllCompanyNetworkInventories($companyId: ID!) {
    getAllCompanyNetworkInventories(companyId: $companyId) {
      _id
      companyId
      productId
      macAddress
      stockId
      manufacturerId
      modelId
    }
  }
`

const UPDATE_COMPANY_NETWORK_INVENTORY = gql`
  mutation UpdateCompanyNetworkInventory(
    $companyId: ID!
    $id: ID!
    $input: CompanyNetworkInventoryInput!
  ) {
    updateCompanyNetworkInventory(
      companyId: $companyId
      id: $id
      input: $input
    ) {
      _id
      companyId
      productId
      macAddress
      stockId
      manufacturerId
      modelId
    }
  }
`

const DELETE_COMPANY_NETWORK_INVENTORY = gql`
  mutation DeleteCompanyNetworkInventory($companyId: ID!, $id: ID!) {
    deleteCompanyNetworkInventory(companyId: $companyId, id: $id)
  }
`

const COMPANY_NETWORK_INVENTORY_SUBSCRIPTION = gql`
  subscription OnCompanyNetworkInventoryChanged($companyId: ID!) {
    companyNetworkInventoryChanged(companyId: $companyId) {
      _id
      companyId
      productId
      macAddress
      stockId
      manufacturerId
      modelId
    }
  }
`

export function useNetworkInventoryAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(
    GET_ALL_COMPANY_NETWORK_INVENTORIES,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  const [updateCompanyNetworkInventoryMutation] = useMutation(
    UPDATE_COMPANY_NETWORK_INVENTORY
  )
  const [deleteCompanyNetworkInventoryMutation] = useMutation(
    DELETE_COMPANY_NETWORK_INVENTORY
  )

  const { data: subscriptionData } = useSubscription(
    COMPANY_NETWORK_INVENTORY_SUBSCRIPTION,
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

  const getNetworkInventory =
    useCallback((): ExtendedCompanyNetworkInventoryFields[] => {
      return (
        data?.getAllCompanyNetworkInventories.map(
          (inv: ExtendedCompanyNetworkInventoryFields) => ({
            ...inv,
            _id: ObjectId.createFromHexString(inv._id.toString()),
            companyId: ObjectId.createFromHexString(inv.companyId.toString()),
            productId: ObjectId.createFromHexString(inv.productId.toString()),
            stockId: ObjectId.createFromHexString(inv.stockId.toString()),
            manufacturerId: ObjectId.createFromHexString(
              inv.manufacturerId.toString()
            ),
            modelId: ObjectId.createFromHexString(inv.modelId.toString()),
          })
        ) || []
      )
    }, [data])

  const getNetworkInventoryNamesByIds = useCallback(
    (inventoryIds: ObjectId[]): string[] => {
      const inventories = getNetworkInventory()
      return inventoryIds.map(id => {
        const inventory = inventories.find(inv => inv._id.equals(id))
        return inventory ? inventory.macAddress : 'Unknown Inventory'
      })
    },
    [getNetworkInventory]
  )

  const getAllNetworkInventoryNamesAndIds = useCallback((): {
    id: ObjectId
    name: string
  }[] => {
    const inventories = getNetworkInventory()
    return inventories.map(
      (inventory: ExtendedCompanyNetworkInventoryFields) => ({
        id: inventory._id,
        name: inventory.macAddress,
      })
    )
  }, [getNetworkInventory])

  const refreshNetworkInventoryAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateNetworkInventory = useCallback(
    async (
      _id: ObjectId,
      data: Partial<
        Omit<ExtendedCompanyNetworkInventoryFields, '_id' | 'companyId'>
      >
    ): Promise<ExtendedCompanyNetworkInventoryFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateCompanyNetworkInventoryMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input: data,
          },
        })
        const updatedInventory = result.data.updateCompanyNetworkInventory
        return {
          ...updatedInventory,
          _id: ObjectId.createFromHexString(updatedInventory._id),
          companyId: ObjectId.createFromHexString(updatedInventory.companyId),
          productId: ObjectId.createFromHexString(updatedInventory.productId),
          stockId: ObjectId.createFromHexString(updatedInventory.stockId),
          manufacturerId: ObjectId.createFromHexString(
            updatedInventory.manufacturerId
          ),
          modelId: ObjectId.createFromHexString(updatedInventory.modelId),
        }
      } catch (error) {
        console.error('Error updating network inventory:', error)
        return null
      }
    },
    [updateCompanyNetworkInventoryMutation, companyId]
  )

  const deleteNetworkInventory = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        await deleteCompanyNetworkInventoryMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        await refetch()
        const inventories = getNetworkInventory()
        return !inventories.some(inv => inv._id.equals(_id))
      } catch (error) {
        console.error('Error deleting network inventory:', error)
        return false
      }
    },
    [
      deleteCompanyNetworkInventoryMutation,
      companyId,
      refetch,
      getNetworkInventory,
    ]
  )

  return {
    getNetworkInventory,
    getNetworkInventoryNamesByIds,
    getAllNetworkInventoryNamesAndIds,
    refreshNetworkInventoryAtom,
    updateNetworkInventory,
    deleteNetworkInventory,
    loading,
    error,
  }
}

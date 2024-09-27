'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedICMPMonitoringTemplateFields } from '@/schema/network-administration/icmp/templates/schema'
import { ObjectId } from 'mongodb'

const GET_ALL_ICMP_TEMPLATES = gql`
  query GetAllICMPMonitoringTemplates($companyId: ID!) {
    getAllICMPMonitoringTemplates(companyId: $companyId) {
      _id
      companyId
      templateName
      templateDescription
      icmpLossThreshold
      icmpLatencyThreshold
      manufacturerId
      modelNameId
      productId
      stockIds
      networkInventoryIds
    }
  }
`

const UPDATE_ICMP_TEMPLATE = gql`
  mutation UpdateICMPMonitoringTemplate(
    $companyId: ID!
    $id: ID!
    $input: ICMPMonitoringTemplateInput!
  ) {
    updateICMPMonitoringTemplate(
      companyId: $companyId
      id: $id
      input: $input
    ) {
      _id
      companyId
      templateName
      templateDescription
      icmpLossThreshold
      icmpLatencyThreshold
      manufacturerId
      modelNameId
      productId
      stockIds
      networkInventoryIds
    }
  }
`

const DELETE_ICMP_TEMPLATE = gql`
  mutation DeleteICMPMonitoringTemplate($companyId: ID!, $id: ID!) {
    deleteICMPMonitoringTemplate(companyId: $companyId, id: $id)
  }
`

const ICMP_TEMPLATE_SUBSCRIPTION = gql`
  subscription OnICMPTemplateChanged($companyId: ID!) {
    icmpTemplateChanged(companyId: $companyId) {
      _id
      companyId
      templateName
      templateDescription
      icmpLossThreshold
      icmpLatencyThreshold
      manufacturerId
      modelNameId
      productId
      stockIds
      networkInventoryIds
    }
  }
`

export function useICMPTemplateAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(GET_ALL_ICMP_TEMPLATES, {
    variables: { companyId: companyId?.toHexString() },
    skip: !companyId,
  })

  const [updateICMPTemplateMutation] = useMutation(UPDATE_ICMP_TEMPLATE)
  const [deleteICMPTemplateMutation] = useMutation(DELETE_ICMP_TEMPLATE)

  const { data: subscriptionData } = useSubscription(
    ICMP_TEMPLATE_SUBSCRIPTION,
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

  const getICMPTemplates =
    useCallback((): ExtendedICMPMonitoringTemplateFields[] => {
      return (
        data?.getAllICMPMonitoringTemplates.map(
          (t: ExtendedICMPMonitoringTemplateFields) => ({
            ...t,
            _id: ObjectId.createFromHexString(t._id.toString()),
            companyId: ObjectId.createFromHexString(t.companyId.toString()),
            manufacturerId: t.manufacturerId
              ? ObjectId.createFromHexString(t.manufacturerId.toString())
              : undefined,
            modelNameId: t.modelNameId
              ? ObjectId.createFromHexString(t.modelNameId.toString())
              : undefined,
            productId: t.productId
              ? ObjectId.createFromHexString(t.productId.toString())
              : undefined,
            stockIds: t.stockIds
              ? t.stockIds.map(id =>
                  ObjectId.createFromHexString(id.toString())
                )
              : [],
            networkInventoryIds: t.networkInventoryIds
              ? t.networkInventoryIds.map(id =>
                  ObjectId.createFromHexString(id.toString())
                )
              : [],
          })
        ) || []
      )
    }, [data])

  const getICMPTemplateNamesByIds = useCallback(
    (templateIds: ObjectId[]) => {
      const templates = getICMPTemplates()
      return templateIds.map(id => {
        const template = templates.find(t => t._id.equals(id))
        return template ? template.templateName : 'Unknown Template'
      })
    },
    [getICMPTemplates]
  )

  const getAllICMPTemplateNamesAndIds = useCallback(() => {
    const templates = getICMPTemplates()
    return templates.map(template => ({
      id: template._id.toHexString(),
      name: template.templateName,
    }))
  }, [getICMPTemplates])

  const refreshICMPTemplateAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateICMPTemplate = useCallback(
    async (
      _id: ObjectId,
      data: Partial<ExtendedICMPMonitoringTemplateFields>
    ): Promise<ExtendedICMPMonitoringTemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateICMPTemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input: {
              ...data,
              manufacturerId: data.manufacturerId?.toHexString(),
              modelNameId: data.modelNameId?.toHexString(),
              productId: data.productId?.toHexString(),
              stockIds: data.stockIds?.map(id => id.toHexString()),
              networkInventoryIds: data.networkInventoryIds?.map(id =>
                id.toHexString()
              ),
            },
          },
        })
        const updatedTemplate = result.data.updateICMPMonitoringTemplate
        return {
          ...updatedTemplate,
          _id: ObjectId.createFromHexString(updatedTemplate._id),
          companyId: ObjectId.createFromHexString(updatedTemplate.companyId),
          manufacturerId: updatedTemplate.manufacturerId
            ? ObjectId.createFromHexString(updatedTemplate.manufacturerId)
            : undefined,
          modelNameId: updatedTemplate.modelNameId
            ? ObjectId.createFromHexString(updatedTemplate.modelNameId)
            : undefined,
          productId: updatedTemplate.productId
            ? ObjectId.createFromHexString(updatedTemplate.productId)
            : undefined,
          stockIds: updatedTemplate.stockIds
            ? updatedTemplate.stockIds.map((id: string) =>
                ObjectId.createFromHexString(id)
              )
            : [],
          networkInventoryIds: updatedTemplate.networkInventoryIds
            ? updatedTemplate.networkInventoryIds.map((id: string) =>
                ObjectId.createFromHexString(id)
              )
            : [],
        }
      } catch (error) {
        console.error('Error updating ICMP template:', error)
        return null
      }
    },
    [updateICMPTemplateMutation, companyId]
  )

  const deleteICMPTemplate = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        await deleteICMPTemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        await refetch()
        const templates = getICMPTemplates()
        return !templates.some(t => t._id.equals(_id))
      } catch (error) {
        console.error('Error deleting ICMP template:', error)
        return false
      }
    },
    [deleteICMPTemplateMutation, companyId, refetch, getICMPTemplates]
  )

  return {
    getICMPTemplates,
    getICMPTemplateNamesByIds,
    getAllICMPTemplateNamesAndIds,
    refreshICMPTemplateAtom,
    updateICMPTemplate,
    deleteICMPTemplate,
    loading,
    error,
  }
}

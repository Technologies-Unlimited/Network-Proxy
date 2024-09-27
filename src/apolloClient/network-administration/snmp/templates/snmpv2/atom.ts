'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { SNMPv2TemplateFields } from '@/schema/network-administration/snmp/templates/snmpv2/schema'
import { ObjectId } from 'mongodb'

const GET_SNMPV2_TEMPLATES_FOR_COMPANY = gql`
  query GetSNMPv2TemplatesForCompany($companyId: ID!) {
    getSNMPv2TemplatesForCompany(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelNameId
      productId
      snmpv2SettingId
      oidIds
      stockIds
      networkInventoryIds
      templateName
      description
    }
  }
`

const UPDATE_SNMPV2_TEMPLATE = gql`
  mutation UpdateSNMPv2Template(
    $companyId: ID!
    $id: ID!
    $input: SNMPv2TemplateInput!
  ) {
    updateSNMPv2Template(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      manufacturerId
      modelNameId
      productId
      snmpv2SettingId
      oidIds
      stockIds
      networkInventoryIds
      templateName
      description
    }
  }
`

const DELETE_SNMPV2_TEMPLATE = gql`
  mutation DeleteSNMPv2Template($companyId: ID!, $id: ID!) {
    deleteSNMPv2Template(companyId: $companyId, id: $id)
  }
`

const SNMPV2_TEMPLATE_SUBSCRIPTION = gql`
  subscription OnSNMPv2TemplateChanged($companyId: ID!) {
    snmpv2TemplateChanged(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelNameId
      productId
      snmpv2SettingId
      oidIds
      stockIds
      networkInventoryIds
      templateName
      description
    }
  }
`

export function useSNMPv2TemplateAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(
    GET_SNMPV2_TEMPLATES_FOR_COMPANY,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  const [updateSNMPv2TemplateMutation] = useMutation(UPDATE_SNMPV2_TEMPLATE)
  const [deleteSNMPv2TemplateMutation] = useMutation(DELETE_SNMPV2_TEMPLATE)

  const { data: subscriptionData } = useSubscription(
    SNMPV2_TEMPLATE_SUBSCRIPTION,
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

  const getSNMPv2Templates = useCallback((): SNMPv2TemplateFields[] => {
    if (!companyId || !data) {
      return []
    }
    return data.getSNMPv2TemplatesForCompany.map(
      (template: SNMPv2TemplateFields) => ({
        ...template,
        _id: ObjectId.createFromHexString(template._id.toString()),
        companyId: ObjectId.createFromHexString(template.companyId.toString()),
        manufacturerId: template.manufacturerId
          ? ObjectId.createFromHexString(template.manufacturerId.toString())
          : undefined,
        modelNameId: template.modelNameId
          ? ObjectId.createFromHexString(template.modelNameId.toString())
          : undefined,
        productId: template.productId
          ? ObjectId.createFromHexString(template.productId.toString())
          : undefined,
        snmpv2SettingId: ObjectId.createFromHexString(
          template.snmpv2SettingId.toString()
        ),
        oidIds: template.oidIds
          ? template.oidIds.map(id =>
              ObjectId.createFromHexString(id.toString())
            )
          : undefined,
        stockIds: template.stockIds
          ? template.stockIds.map(id =>
              ObjectId.createFromHexString(id.toString())
            )
          : undefined,
        networkInventoryIds: template.networkInventoryIds
          ? template.networkInventoryIds.map(id =>
              ObjectId.createFromHexString(id.toString())
            )
          : undefined,
      })
    )
  }, [data, companyId])

  const refreshSNMPv2TemplateAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateSNMPv2Template = useCallback(
    async (
      _id: ObjectId,
      input: Partial<SNMPv2TemplateFields>
    ): Promise<SNMPv2TemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateSNMPv2TemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input: {
              ...input,
              manufacturerId: input.manufacturerId?.toHexString(),
              modelNameId: input.modelNameId?.toHexString(),
              productId: input.productId?.toHexString(),
              snmpv2SettingId: input.snmpv2SettingId?.toHexString(),
              oidIds: input.oidIds?.map((id: ObjectId) => id.toHexString()),
              stockIds: input.stockIds?.map((id: ObjectId) => id.toHexString()),
              networkInventoryIds: input.networkInventoryIds?.map(
                (id: ObjectId) => id.toHexString()
              ),
            },
          },
        })
        const updatedTemplate = result.data.updateSNMPv2Template
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
          snmpv2SettingId: ObjectId.createFromHexString(
            updatedTemplate.snmpv2SettingId
          ),
          oidIds: updatedTemplate.oidIds
            ? updatedTemplate.oidIds.map((id: string) =>
                ObjectId.createFromHexString(id)
              )
            : undefined,
          stockIds: updatedTemplate.stockIds
            ? updatedTemplate.stockIds.map((id: string) =>
                ObjectId.createFromHexString(id)
              )
            : undefined,
          networkInventoryIds: updatedTemplate.networkInventoryIds
            ? updatedTemplate.networkInventoryIds.map((id: string) =>
                ObjectId.createFromHexString(id)
              )
            : undefined,
        }
      } catch (error) {
        console.error('Error updating SNMPv2 template:', error)
        return null
      }
    },
    [updateSNMPv2TemplateMutation, companyId]
  )

  const deleteSNMPv2Template = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        const result = await deleteSNMPv2TemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSNMPv2Template
      } catch (error) {
        console.error('Error deleting SNMPv2 template:', error)
        return false
      }
    },
    [deleteSNMPv2TemplateMutation, companyId]
  )

  return {
    getSNMPv2Templates,
    refreshSNMPv2TemplateAtom,
    updateSNMPv2Template,
    deleteSNMPv2Template,
    loading,
    error,
  }
}

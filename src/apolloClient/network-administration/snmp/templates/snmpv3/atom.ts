'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { SNMPv3TemplateFields } from '@/schema/network-administration/snmp/templates/snmpv3/schema'
import { ObjectId } from 'mongodb'

const GET_SNMPV3_TEMPLATES_FOR_COMPANY = gql`
  query GetSNMPv3TemplatesForCompany($companyId: ID!) {
    getSNMPv3TemplatesForCompany(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelNameId
      snmpv3SettingId
      productId
      stockIds
      networkInventoryIds
      templateName
      description
    }
  }
`

const UPDATE_SNMPV3_TEMPLATE = gql`
  mutation UpdateSNMPv3Template(
    $companyId: ID!
    $id: ID!
    $input: SNMPv3TemplateInput!
  ) {
    updateSNMPv3Template(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      manufacturerId
      modelNameId
      snmpv3SettingId
      productId
      stockIds
      networkInventoryIds
      templateName
      description
    }
  }
`

const DELETE_SNMPV3_TEMPLATE = gql`
  mutation DeleteSNMPv3Template($companyId: ID!, $id: ID!) {
    deleteSNMPv3Template(companyId: $companyId, id: $id)
  }
`

const SNMPV3_TEMPLATE_SUBSCRIPTION = gql`
  subscription OnSNMPv3TemplateChanged($companyId: ID!) {
    snmpv3TemplateChanged(companyId: $companyId) {
      _id
      companyId
      manufacturerId
      modelNameId
      snmpv3SettingId
      productId
      stockIds
      networkInventoryIds
      templateName
      description
    }
  }
`

export function useSNMPv3TemplateAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(
    GET_SNMPV3_TEMPLATES_FOR_COMPANY,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  const [updateSNMPv3TemplateMutation] = useMutation(UPDATE_SNMPV3_TEMPLATE)
  const [deleteSNMPv3TemplateMutation] = useMutation(DELETE_SNMPV3_TEMPLATE)

  const { data: subscriptionData } = useSubscription(
    SNMPV3_TEMPLATE_SUBSCRIPTION,
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

  const getSNMPv3Templates = useCallback((): SNMPv3TemplateFields[] => {
    if (!companyId || !data) {
      return []
    }
    return data.getSNMPv3TemplatesForCompany.map(
      (template: SNMPv3TemplateFields) => ({
        ...template,
        _id: ObjectId.createFromHexString(template._id.toString()),
        companyId: ObjectId.createFromHexString(template.companyId.toString()),
        manufacturerId: template.manufacturerId
          ? ObjectId.createFromHexString(template.manufacturerId.toString())
          : undefined,
        modelNameId: template.modelNameId
          ? ObjectId.createFromHexString(template.modelNameId.toString())
          : undefined,
        snmpv3SettingId: ObjectId.createFromHexString(
          template.snmpv3SettingId.toString()
        ),
        productId: template.productId
          ? ObjectId.createFromHexString(template.productId.toString())
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

  const refreshSNMPv3TemplateAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateSNMPv3Template = useCallback(
    async (
      _id: ObjectId,
      input: Partial<SNMPv3TemplateFields>
    ): Promise<SNMPv3TemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateSNMPv3TemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input: {
              ...input,
              manufacturerId: input.manufacturerId?.toHexString(),
              modelNameId: input.modelNameId?.toHexString(),
              snmpv3SettingId: input.snmpv3SettingId?.toHexString(),
              productId: input.productId?.toHexString(),
              stockIds: input.stockIds?.map(id => id.toHexString()),
              networkInventoryIds: input.networkInventoryIds?.map(id =>
                id.toHexString()
              ),
            },
          },
        })
        const updatedTemplate = result.data.updateSNMPv3Template
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
          snmpv3SettingId: ObjectId.createFromHexString(
            updatedTemplate.snmpv3SettingId
          ),
          productId: updatedTemplate.productId
            ? ObjectId.createFromHexString(updatedTemplate.productId)
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
        console.error('Error updating SNMPv3 template:', error)
        return null
      }
    },
    [updateSNMPv3TemplateMutation, companyId]
  )

  const deleteSNMPv3Template = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        const result = await deleteSNMPv3TemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSNMPv3Template
      } catch (error) {
        console.error('Error deleting SNMPv3 template:', error)
        return false
      }
    },
    [deleteSNMPv3TemplateMutation, companyId]
  )

  return {
    getSNMPv3Templates,
    refreshSNMPv3TemplateAtom,
    updateSNMPv3Template,
    deleteSNMPv3Template,
    loading,
    error,
  }
}

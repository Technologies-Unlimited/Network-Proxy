'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedSNMPv2PollingTemplateFields } from '@/schema/network-administration/snmp/polling/template/snmpv2/schema'
import { ObjectId } from 'mongodb'

const GET_SNMPV2_POLLING_TEMPLATES_FOR_COMPANY = gql`
  query GetSNMPv2PollingTemplatesForCompany($companyId: ID!) {
    getSNMPv2PollingTemplatesForCompany(companyId: $companyId) {
      _id
      companyId
      snmpv2TemplateId
      name
      description
      frequency
      timeout
      retries
      pollingFrequency {
        days
        hours
        minutes
        seconds
      }
      downtimeTrigger {
        days
        hours
        minutes
        seconds
      }
    }
  }
`

const UPDATE_SNMPV2_POLLING_TEMPLATE = gql`
  mutation UpdateSNMPv2PollingTemplate(
    $companyId: ID!
    $id: ID!
    $input: SNMPv2PollingTemplateInput!
  ) {
    updateSNMPv2PollingTemplate(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      snmpv2TemplateId
      name
      description
      frequency
      timeout
      retries
      pollingFrequency {
        days
        hours
        minutes
        seconds
      }
      downtimeTrigger {
        days
        hours
        minutes
        seconds
      }
    }
  }
`

const DELETE_SNMPV2_POLLING_TEMPLATE = gql`
  mutation DeleteSNMPv2PollingTemplate($companyId: ID!, $id: ID!) {
    deleteSNMPv2PollingTemplate(companyId: $companyId, id: $id)
  }
`

const SNMPV2_POLLING_TEMPLATE_SUBSCRIPTION = gql`
  subscription OnSNMPv2PollingTemplateChanged($companyId: ID!) {
    snmpv2PollingTemplateChanged(companyId: $companyId) {
      _id
      companyId
      snmpv2TemplateId
      name
      description
      frequency
      timeout
      retries
      pollingFrequency {
        days
        hours
        minutes
        seconds
      }
      downtimeTrigger {
        days
        hours
        minutes
        seconds
      }
    }
  }
`

export function useSNMPv2PollingTemplateAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(
    GET_SNMPV2_POLLING_TEMPLATES_FOR_COMPANY,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  const [updateSNMPv2PollingTemplateMutation] = useMutation(
    UPDATE_SNMPV2_POLLING_TEMPLATE
  )
  const [deleteSNMPv2PollingTemplateMutation] = useMutation(
    DELETE_SNMPV2_POLLING_TEMPLATE
  )

  const { data: subscriptionData } = useSubscription(
    SNMPV2_POLLING_TEMPLATE_SUBSCRIPTION,
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

  const getSNMPv2PollingTemplates =
    useCallback((): ExtendedSNMPv2PollingTemplateFields[] => {
      if (!companyId || !data) {
        return []
      }
      return data.getSNMPv2PollingTemplatesForCompany.map(
        (template: ExtendedSNMPv2PollingTemplateFields) => ({
          ...template,
          _id: ObjectId.createFromHexString(template._id.toString()),
          companyId: ObjectId.createFromHexString(
            template.companyId.toString()
          ),
          snmpv2TemplateId: ObjectId.createFromHexString(
            template.snmpv2TemplateId.toString()
          ),
        })
      )
    }, [data, companyId])

  const refreshSNMPv2PollingTemplateAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateSNMPv2PollingTemplate = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedSNMPv2PollingTemplateFields>
    ): Promise<ExtendedSNMPv2PollingTemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateSNMPv2PollingTemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input,
          },
        })
        const updatedTemplate = result.data.updateSNMPv2PollingTemplate
        return {
          ...updatedTemplate,
          _id: ObjectId.createFromHexString(updatedTemplate._id),
          companyId: ObjectId.createFromHexString(updatedTemplate.companyId),
          snmpv2TemplateId: ObjectId.createFromHexString(
            updatedTemplate.snmpv2TemplateId
          ),
        }
      } catch (error) {
        console.error('Error updating SNMPv2 polling template:', error)
        return null
      }
    },
    [updateSNMPv2PollingTemplateMutation, companyId]
  )

  const deleteSNMPv2PollingTemplate = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        const result = await deleteSNMPv2PollingTemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSNMPv2PollingTemplate
      } catch (error) {
        console.error('Error deleting SNMPv2 polling template:', error)
        return false
      }
    },
    [deleteSNMPv2PollingTemplateMutation, companyId]
  )

  return {
    getSNMPv2PollingTemplates,
    refreshSNMPv2PollingTemplateAtom,
    updateSNMPv2PollingTemplate,
    deleteSNMPv2PollingTemplate,
    loading,
    error,
  }
}

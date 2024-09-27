'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ExtendedSNMPv3PollingTemplateFields } from '@/schema/network-administration/snmp/polling/template/snmpv3/schema'
import { ObjectId } from 'mongodb'

const GET_SNMPV3_POLLING_TEMPLATES_FOR_COMPANY = gql`
  query GetSNMPv3PollingTemplatesForCompany($companyId: ID!) {
    getSNMPv3PollingTemplatesForCompany(companyId: $companyId) {
      _id
      companyId
      snmpv3TemplateId
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

const UPDATE_SNMPV3_POLLING_TEMPLATE = gql`
  mutation UpdateSNMPv3PollingTemplate(
    $companyId: ID!
    $id: ID!
    $input: SNMPv3PollingTemplateInput!
  ) {
    updateSNMPv3PollingTemplate(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      snmpv3TemplateId
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

const DELETE_SNMPV3_POLLING_TEMPLATE = gql`
  mutation DeleteSNMPv3PollingTemplate($companyId: ID!, $id: ID!) {
    deleteSNMPv3PollingTemplate(companyId: $companyId, id: $id)
  }
`

const SNMPV3_POLLING_TEMPLATE_SUBSCRIPTION = gql`
  subscription OnSNMPv3PollingTemplateChanged($companyId: ID!) {
    snmpv3PollingTemplateChanged(companyId: $companyId) {
      _id
      companyId
      snmpv3TemplateId
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

export function useSNMPv3PollingTemplateAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(
    GET_SNMPV3_POLLING_TEMPLATES_FOR_COMPANY,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  const [updateSNMPv3PollingTemplateMutation] = useMutation(
    UPDATE_SNMPV3_POLLING_TEMPLATE
  )
  const [deleteSNMPv3PollingTemplateMutation] = useMutation(
    DELETE_SNMPV3_POLLING_TEMPLATE
  )

  const { data: subscriptionData } = useSubscription(
    SNMPV3_POLLING_TEMPLATE_SUBSCRIPTION,
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

  const getSNMPv3PollingTemplates =
    useCallback((): ExtendedSNMPv3PollingTemplateFields[] => {
      if (!companyId || !data) {
        return []
      }
      return data.getSNMPv3PollingTemplatesForCompany.map(
        (template: ExtendedSNMPv3PollingTemplateFields) => ({
          ...template,
          _id: ObjectId.createFromHexString(template._id.toString()),
          companyId: ObjectId.createFromHexString(
            template.companyId.toString()
          ),
          snmpv3TemplateId: ObjectId.createFromHexString(
            template.snmpv3TemplateId.toString()
          ),
        })
      )
    }, [data, companyId])

  const refreshSNMPv3PollingTemplateAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateSNMPv3PollingTemplate = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ExtendedSNMPv3PollingTemplateFields>
    ): Promise<ExtendedSNMPv3PollingTemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateSNMPv3PollingTemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input,
          },
        })
        const updatedTemplate = result.data.updateSNMPv3PollingTemplate
        return {
          ...updatedTemplate,
          _id: ObjectId.createFromHexString(updatedTemplate._id),
          companyId: ObjectId.createFromHexString(updatedTemplate.companyId),
          snmpv3TemplateId: ObjectId.createFromHexString(
            updatedTemplate.snmpv3TemplateId
          ),
        }
      } catch (error) {
        console.error('Error updating SNMPv3 polling template:', error)
        return null
      }
    },
    [updateSNMPv3PollingTemplateMutation, companyId]
  )

  const deleteSNMPv3PollingTemplate = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        const result = await deleteSNMPv3PollingTemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        return result.data.deleteSNMPv3PollingTemplate
      } catch (error) {
        console.error('Error deleting SNMPv3 polling template:', error)
        return false
      }
    },
    [deleteSNMPv3PollingTemplateMutation, companyId]
  )

  return {
    getSNMPv3PollingTemplates,
    refreshSNMPv3PollingTemplateAtom,
    updateSNMPv3PollingTemplate,
    deleteSNMPv3PollingTemplate,
    loading,
    error,
  }
}

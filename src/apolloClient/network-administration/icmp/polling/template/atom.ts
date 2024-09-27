'use client'

import { useCallback, useEffect } from 'react'
import { gql, useQuery, useMutation, useSubscription } from '@apollo/client'
import { ICMPPollingTemplateFields } from '@/types/network-administration/icmp/polling/template/types'
import { ExtendedICMPPollingTemplateFields } from '@/schema/network-administration/icmp/polling/template/schema'
import { ObjectId } from 'mongodb'

const GET_ICMP_POLLING_TEMPLATES_FOR_COMPANY = gql`
  query GetICMPPollingTemplatesForCompany($companyId: ID!) {
    getICMPPollingTemplatesForCompany(companyId: $companyId) {
      _id
      companyId
      icmpTemplateId
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

const UPDATE_ICMP_POLLING_TEMPLATE = gql`
  mutation UpdateICMPPollingTemplate(
    $companyId: ID!
    $id: ID!
    $input: ICMPPollingTemplateInput!
  ) {
    updateICMPPollingTemplate(companyId: $companyId, id: $id, input: $input) {
      _id
      companyId
      icmpTemplateId
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

const DELETE_ICMP_POLLING_TEMPLATE = gql`
  mutation DeleteICMPPollingTemplate($companyId: ID!, $id: ID!) {
    deleteICMPPollingTemplate(companyId: $companyId, id: $id)
  }
`

const ICMP_POLLING_TEMPLATE_SUBSCRIPTION = gql`
  subscription OnICMPPollingTemplateChanged($companyId: ID!) {
    icmpPollingTemplateChanged(companyId: $companyId) {
      _id
      companyId
      icmpTemplateId
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

export function useICMPPollingTemplateAtom(companyId: ObjectId | null) {
  const { data, loading, error, refetch } = useQuery(
    GET_ICMP_POLLING_TEMPLATES_FOR_COMPANY,
    {
      variables: { companyId: companyId?.toHexString() },
      skip: !companyId,
    }
  )

  const [updateICMPPollingTemplateMutation] = useMutation(
    UPDATE_ICMP_POLLING_TEMPLATE
  )
  const [deleteICMPPollingTemplateMutation] = useMutation(
    DELETE_ICMP_POLLING_TEMPLATE
  )

  const { data: subscriptionData } = useSubscription(
    ICMP_POLLING_TEMPLATE_SUBSCRIPTION,
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

  const getICMPPollingTemplates =
    useCallback((): ExtendedICMPPollingTemplateFields[] => {
      return (
        data?.getICMPPollingTemplatesForCompany.map(
          (template: ExtendedICMPPollingTemplateFields) => ({
            ...template,
            _id: ObjectId.createFromHexString(template._id.toString()),
            companyId: ObjectId.createFromHexString(
              template.companyId.toString()
            ),
            icmpTemplateId: ObjectId.createFromHexString(
              template.icmpTemplateId.toString()
            ),
          })
        ) || []
      )
    }, [data])

  const refreshICMPPollingTemplateAtom = useCallback(() => {
    if (companyId) {
      refetch()
    } else {
      console.error('Company ID is null')
    }
  }, [refetch, companyId])

  const updateICMPPollingTemplate = useCallback(
    async (
      _id: ObjectId,
      input: Partial<ICMPPollingTemplateFields>
    ): Promise<ExtendedICMPPollingTemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }
      try {
        const result = await updateICMPPollingTemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
            input,
          },
        })
        const updatedTemplate = result.data.updateICMPPollingTemplate
        return {
          ...updatedTemplate,
          _id: ObjectId.createFromHexString(updatedTemplate._id),
          companyId: ObjectId.createFromHexString(updatedTemplate.companyId),
          icmpTemplateId: ObjectId.createFromHexString(
            updatedTemplate.icmpTemplateId
          ),
        }
      } catch (error) {
        console.error('Error updating ICMP polling template:', error)
        return null
      }
    },
    [updateICMPPollingTemplateMutation, companyId]
  )

  const deleteICMPPollingTemplate = useCallback(
    async (_id: ObjectId): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }
      try {
        await deleteICMPPollingTemplateMutation({
          variables: {
            companyId: companyId.toHexString(),
            id: _id.toHexString(),
          },
        })
        await refetch()
        const templates = getICMPPollingTemplates()
        return !templates.some(template => template._id.equals(_id))
      } catch (error) {
        console.error('Error deleting ICMP polling template:', error)
        return false
      }
    },
    [
      deleteICMPPollingTemplateMutation,
      companyId,
      refetch,
      getICMPPollingTemplates,
    ]
  )

  return {
    getICMPPollingTemplates,
    refreshICMPPollingTemplateAtom,
    updateICMPPollingTemplate,
    deleteICMPPollingTemplate,
    loading,
    error,
  }
}

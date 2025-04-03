import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import LoginForm from './index'
import { validateUserSession } from '@/actions/auth/production/identity'

export const metadata: Metadata = {
  title: 'Network Proxy Login',
  description: 'Log in to your Network Proxy account',
}

export default async function LoginPage() {
  // Validate session on the server
  const sessionResult = await validateUserSession()

  // If the user is already logged in, redirect to dashboard
  if (sessionResult.data?.status === 'loggedIn') {
    redirect('/network-administration')
  }

  // If the user is in the MFA verification step, redirect there
  if (
    sessionResult.data?.status === 'loggingIn' &&
    sessionResult.data.redirectUrl === '/auth/login/mfa-verification'
  ) {
    redirect('/auth/login/mfa-verification')
  }

  return <LoginForm />
}

import { redirect } from 'next/navigation'
import { validateUserSession } from '@/actions/auth/production/identity'
import MFAVerificationForm from './index'

export default async function MFAVerificationPage() {
  // Validate session on the server
  const sessionResult = await validateUserSession()

  console.log('[MFA-PAGE] Session validation result:', {
    success: sessionResult.success,
    status: sessionResult.data?.status,
    hasTokenString: !!sessionResult.data?.tokenString,
    timestamp: new Date().toISOString(),
  })

  // If the user is already logged in, redirect to dashboard
  if (sessionResult.data?.status === 'loggedIn') {
    console.log('[MFA-PAGE] User already logged in, redirecting to dashboard')
    redirect('/network-administration')
  }

  // If the user is not in the MFA verification step, redirect to login
  if (
    sessionResult.data?.status !== 'loggingIn' ||
    !sessionResult.data.tokenString
  ) {
    console.log(
      '[MFA-PAGE] Invalid session state for MFA verification, redirecting to login:',
      {
        status: sessionResult.data?.status,
        hasTokenString: !!sessionResult.data?.tokenString,
        timestamp: new Date().toISOString(),
      }
    )
    redirect('/auth/login')
  }

  // User is in the correct state for MFA verification
  console.log('[MFA-PAGE] Rendering MFA verification form')
  return <MFAVerificationForm />
}

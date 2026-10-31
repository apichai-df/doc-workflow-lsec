import { createClient } from '@supabase/supabase-js'
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)
export async function requireAdmin(req) {
  const authorization = req.headers.get('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    console.error('SERVER AUTH: Missing access token')
    throw new Error('UNAUTHORIZED')
  }

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token)

  if (userError || !user) {
    console.error('SERVER AUTH: Invalid user token', {
      message: userError?.message,
    })
    throw new Error('UNAUTHORIZED')
  }

  const {
    data: profile,
    error: profileError,
  } = await admin
    .from('profiles')
    .select('id, system_role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  console.log('SERVER AUTH CHECK', {
    authUserId: user.id,
    email: user.email,
    profileId: profile?.id,
    systemRole: profile?.system_role,
    isActive: profile?.is_active,
    profileError: profileError?.message,
  })

  if (profileError) {
    console.error('SERVER AUTH: Profile query failed', profileError)
    throw new Error(`PROFILE_ERROR: ${profileError.message}`)
  }

  if (!profile) {
    console.error('SERVER AUTH: Profile not found', {
      authUserId: user.id,
      email: user.email,
    })
    throw new Error('PROFILE_NOT_FOUND')
  }

  const allowedRoles = ['super_admin', 'admin']

  if (
    profile.is_active !== true ||
    !allowedRoles.includes(profile.system_role)
  ) {
    console.error('SERVER AUTH: Permission denied', {
      authUserId: user.id,
      systemRole: profile.system_role,
      isActive: profile.is_active,
    })

    throw new Error('FORBIDDEN')
  }

  return {
    user,
    profile,
  }
}
export async function requireUser (req) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  const {
    data: { user },
    error
  } = await admin.auth.getUser(token)
  if (error || !user) throw new Error('UNAUTHORIZED')
  return user
}
export function apiError (e) {
  const s =
    e.message === 'UNAUTHORIZED' ? 401 : e.message === 'FORBIDDEN' ? 403 : 500
  return Response.json(
    { error: s === 500 ? e.message : 'ไม่มีสิทธิ์ใช้งาน' },
    { status: s }
  )
}

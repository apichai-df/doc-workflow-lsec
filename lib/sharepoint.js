async function graphToken() {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  })
  const response = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  )
  const result = await response.json()
  if (!response.ok) throw new Error(result.error_description || 'ขอ Microsoft token ไม่สำเร็จ')
  return result.access_token
}

export async function uploadFinalPdf(bytes, filename) {
  const driveId = String(process.env.SHAREPOINT_DRIVE_ID || '').trim()
  if (!driveId || driveId.includes(',') || driveId.startsWith('http')) {
    throw new Error('SHAREPOINT_DRIVE_ID ไม่ถูกต้อง')
  }
  const folder = String(process.env.SHAREPOINT_FOLDER_PATH || '').trim().replace(/^\/+|\/+$/g, '')
  const safe = filename.replace(/["*:<>?/\\|#%]/g, '_')
  const path = folder ? `${folder}/${safe}` : safe
  const token = await graphToken()
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodeURI(path)}:/content`,
    { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: bytes }
  )
  const item = await response.json()
  if (!response.ok) throw new Error(item.error?.message || 'อัปโหลด SharePoint ไม่สำเร็จ')
  return { ...item, driveId }
}

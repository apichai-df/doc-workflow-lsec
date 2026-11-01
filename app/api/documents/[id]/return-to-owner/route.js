import { admin, requireUser, apiError } from '../../../../../lib/server-auth'
export async function POST(req, { params }) {
  try {
    const { user } = await requireUser(req)
    const { id } = await params
    const { comment = '' } = await req.json()
    if (String(comment).trim().length < 3) return Response.json({ error: 'กรุณาระบุเหตุผลที่ส่งกลับ' }, { status: 400 })
    const result = await admin.rpc('return_revision_to_owner', { p_document_id: id, p_user_id: user.id, p_comment: String(comment).trim() })
    if (result.error) throw result.error
    return Response.json({ ok: true })
  } catch (error) { return apiError(error) }
}

import { admin, requireUser, apiError } from '../../../../../lib/server-auth'
import { applyLayers, sha256 } from '../../../../../lib/pdf-revision'
import { uploadFinalPdf } from '../../../../../lib/sharepoint'

export async function POST(req, { params }) {
  let uploadedPath = null
  let finalized = false
  try {
    const { user } = await requireUser(req)
    const { id } = await params
    const body = await req.json()
    const layers = Array.isArray(body.layers) ? body.layers : []
    const comment = String(body.comment || '').trim()
    const state = await admin.rpc('get_active_assignment', { p_document_id: id, p_user_id: user.id })
    if (state.error) throw state.error
    const assignment = state.data?.[0]
    if (!assignment) throw new Error('FORBIDDEN')
    if (assignment.requires_signature && !layers.length) throw new Error('ขั้นตอนนี้ต้องลงลายเซ็น')
    if (assignment.requires_comment && comment.length < 3) throw new Error('ขั้นตอนนี้ต้องแสดงความคิดเห็น')
    const revision = await admin.from('document_revisions').select('*').eq('document_id', id).eq('is_current', true).single()
    if (revision.error) throw revision.error
    const source = await admin.storage.from('documents').download(revision.data.file_path)
    if (source.error) throw source.error
    const sourceBytes = Buffer.from(await source.data.arrayBuffer())
    const merged = layers.length ? await applyLayers(sourceBytes, layers) : sourceBytes
    const nextNumber = Number(revision.data.revision_number) + 1
    uploadedPath = `${id}/revision-${String(nextNumber).padStart(3, '0')}-signed.pdf`
    const uploaded = await admin.storage.from('documents').upload(uploadedPath, merged, { contentType: 'application/pdf', upsert: false })
    if (uploaded.error) throw uploaded.error
    const finalize = await admin.rpc('finalize_signed_revision', {
      p_document_id: id, p_user_id: user.id, p_step_id: assignment.step_id,
      p_source_revision_id: revision.data.id, p_revision_number: nextNumber,
      p_file_path: uploadedPath, p_file_name: `revision-${String(nextNumber).padStart(3, '0')}-signed.pdf`,
      p_file_size: merged.length, p_sha256: sha256(merged), p_comment: comment
    })
    if (finalize.error) throw finalize.error
    finalized = true
    const result = finalize.data?.[0] || {}
    let archive = null
    if (result.workflow_completed) {
      await admin.from('documents').update({ status: 'archive_pending' }).eq('id', id)
      try {
        const item = await uploadFinalPdf(merged, `final-${id}.pdf`)
        archive = item
        const archived = await admin.rpc('mark_revision_archived', {
          p_document_id: id, p_revision_id: result.revision_id, p_drive_id: item.driveId,
          p_item_id: item.id, p_web_url: item.webUrl, p_file_name: item.name,
          p_file_size: item.size, p_sha256: sha256(merged), p_user_id: user.id
        })
        if (archived.error) throw archived.error
      } catch (archiveError) {
        return Response.json({ ok: true, completed: true, archivePending: true, archiveError: archiveError.message })
      }
    }
    return Response.json({ ok: true, completed: Boolean(result.workflow_completed), archive })
  } catch (error) {
    if (uploadedPath && !finalized) await admin.storage.from('documents').remove([uploadedPath])
    return apiError(error)
  }
}

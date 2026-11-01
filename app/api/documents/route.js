import { admin, requireUser, apiError } from '../../../lib/server-auth'
import { sha256 } from '../../../lib/pdf-revision'

export async function POST(req) {
  try {
    const { user } = await requireUser(req)
    const form = await req.formData()
    const file = form.get('file')
    const title = String(form.get('title') || '').trim()
    const description = String(form.get('description') || '').trim()
    const templateId = String(form.get('template_id') || '')
    if (!file || file.type !== 'application/pdf' || !title || !templateId) {
      return Response.json({ error: 'กรอกข้อมูลและเลือก PDF/Workflow ให้ครบ' }, { status: 400 })
    }
    const documentId = crypto.randomUUID()
    const revisionId = crypto.randomUUID()
    const bytes = Buffer.from(await file.arrayBuffer())
    const path = `${documentId}/revision-000-original.pdf`
    const uploaded = await admin.storage.from('documents').upload(path, bytes, { contentType: 'application/pdf', upsert: false })
    if (uploaded.error) throw uploaded.error
    const doc = await admin.from('documents').insert({
      id: documentId, title, description, owner_id: user.id, file_name: file.name,
      file_path: path, file_size: bytes.length, status: 'owner_review'
    })
    if (doc.error) { await admin.storage.from('documents').remove([path]); throw doc.error }
    const rev = await admin.from('document_revisions').insert({
      id: revisionId, document_id: documentId, revision_number: 0, file_path: path,
      file_name: 'revision-000-original.pdf', file_size: bytes.length, sha256: sha256(bytes),
      created_by: user.id, revision_type: 'original', is_current: true
    })
    if (rev.error) throw rev.error
    const current = await admin.from('documents').update({ current_revision_id: revisionId }).eq('id', documentId)
    if (current.error) throw current.error
    const workflow = await admin.rpc('instantiate_revision_workflow', {
      p_document_id: documentId, p_template_id: templateId, p_owner_id: user.id
    })
    if (workflow.error) throw workflow.error
    return Response.json({ id: documentId }, { status: 201 })
  } catch (error) { return apiError(error) }
}

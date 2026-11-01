import { admin, requireUser, apiError } from '../../../../../lib/server-auth'

export async function GET(req, { params }) {
  try {
    const { user } = await requireUser(req)
    const { id } = await params
    const doc = await admin.from('documents').select(`*,owner:profiles!documents_owner_id_fkey(id,full_name),
      revision:document_revisions!documents_current_revision_id_fkey(*),
      workflow:document_workflows(id,current_step,status,
        steps:document_workflow_steps(id,step_order,name,status,requires_signature,requires_comment,decided_at,
          assignees:workflow_step_assignees(id,user_id,status,acted_at,user:profiles(id,full_name)))))`)
      .eq('id', id).single()
    if (doc.error) throw doc.error
    const workflow = Array.isArray(doc.data.workflow)
      ? doc.data.workflow[0]
      : doc.data.workflow
    const revision = Array.isArray(doc.data.revision)
      ? doc.data.revision[0]
      : doc.data.revision
    const steps = [...(workflow?.steps || [])].sort((a, b) => a.step_order - b.step_order)
    const active = steps.find(x => x.status === 'active')
    const participant = doc.data.owner_id === user.id || steps.some(s => s.assignees?.some(a => a.user_id === user.id))
    if (!participant) throw new Error('FORBIDDEN')
    if (!workflow || steps.length === 0) {
      return Response.json({ error: 'ไม่พบขั้นตอน Workflow ของเอกสาร กรุณาตรวจ Migration v4' }, { status: 409 })
    }
    if (!revision?.file_path) {
      return Response.json({ error: 'ไม่พบ PDF Revision ปัจจุบัน' }, { status: 409 })
    }
    const signed = await admin.storage.from('documents').createSignedUrl(revision.file_path, 1800)
    if (signed.error) throw signed.error
    const actions = await admin.from('workflow_actions').select('*,actor:profiles(id,full_name)').eq('document_id', id).order('created_at', { ascending: false })
    if (actions.error) throw actions.error
    return Response.json({
      document: { ...doc.data, revision }, workflow, steps, active,
      canAct: Boolean(active?.assignees?.some(a => a.user_id === user.id && a.status === 'pending')),
      isOwner: doc.data.owner_id === user.id,
      revisionUrl: signed.data.signedUrl,
      actions: actions.data || []
    })
  } catch (error) { return apiError(error) }
}

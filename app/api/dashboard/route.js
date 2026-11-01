import { admin, requireUser, apiError } from '../../../lib/server-auth'

const documentSelect = `
  id,title,description,status,owner_id,file_name,created_at,updated_at,current_revision_id,
  owner:profiles!documents_owner_id_fkey(id,full_name),
  workflow:document_workflows(id,current_step,status,
    steps:document_workflow_steps(id,step_order,name,status,requires_signature,requires_comment,decided_at,
      assignees:workflow_step_assignees(id,user_id,status,acted_at,user:profiles(id,full_name))))
`

export async function GET(req) {
  try {
    const { user, profile } = await requireUser(req)
    const [owned, assignments] = await Promise.all([
      admin.from('documents').select(documentSelect).eq('owner_id', user.id).order('updated_at', { ascending: false }),
      admin.from('workflow_step_assignees').select(`id,status,acted_at,
        step:document_workflow_steps!inner(id,step_order,name,status,requires_signature,requires_comment,
          workflow:document_workflows!inner(id,document_id,status,
            document:documents!inner(${documentSelect})))`)
        .eq('user_id', user.id)
    ])
    if (owned.error) throw owned.error
    if (assignments.error) throw assignments.error
    const rows = assignments.data || []
    const inbox = rows.filter(x => x.status === 'pending' && x.step?.status === 'active')
    const history = rows.filter(x => ['approved', 'rejected'].includes(x.status))
      .sort((a, b) => new Date(b.acted_at || 0) - new Date(a.acted_at || 0))
    return Response.json({ profile, owned: owned.data || [], inbox, history })
  } catch (error) { return apiError(error) }
}

import { admin, requireUser, apiError } from '../../../../../lib/server-auth'
import { sha256 } from '../../../../../lib/pdf-revision'
import { uploadFinalPdf } from '../../../../../lib/sharepoint'
export async function POST(req,{params}){
 try{
  const {user}=await requireUser(req);const {id}=await params
  const doc=await admin.from('documents').select('id,owner_id,status,current_revision_id,revision:document_revisions!documents_current_revision_id_fkey(*)').eq('id',id).single()
  if(doc.error)throw doc.error
  if(doc.data.owner_id!==user.id)throw new Error('FORBIDDEN')
  if(!['approved','archive_pending'].includes(doc.data.status))return Response.json({error:'เอกสารยังไม่พร้อมจัดเก็บ'},{status:409})
  const file=await admin.storage.from('documents').download(doc.data.revision.file_path);if(file.error)throw file.error
  const bytes=Buffer.from(await file.data.arrayBuffer()),item=await uploadFinalPdf(bytes,`final-${id}.pdf`)
  const saved=await admin.rpc('mark_revision_archived',{p_document_id:id,p_revision_id:doc.data.current_revision_id,p_drive_id:item.driveId,p_item_id:item.id,p_web_url:item.webUrl,p_file_name:item.name,p_file_size:item.size,p_sha256:sha256(bytes),p_user_id:user.id})
  if(saved.error)throw saved.error
  return Response.json({ok:true,webUrl:item.webUrl})
 }catch(error){return apiError(error)}
}

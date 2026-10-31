# Deployment checklist
## Supabase
Run schema.sql, create first Auth user, make super_admin, copy Project URL, publishable/anon key and service_role key.
## Microsoft 365
Create a SharePoint site and Document Library named SignedDocuments. Register an Entra ID app, create client secret, add Microsoft Graph Application permission Sites.ReadWrite.All, and grant admin consent. Get Site ID with GET /sites/{hostname}:/sites/{siteName}; list libraries with GET /sites/{siteId}/drives and copy the intended drive id.
## Vercel
Import GitHub repo, Framework Next.js, leave Output Directory blank. Add all variables from .env.example. Redeploy.
## Security
Never expose SUPABASE_SERVICE_ROLE_KEY or MICROSOFT_CLIENT_SECRET as NEXT_PUBLIC variables. Prefer certificate/federated credentials and Sites.Selected for production least privilege when available in the tenant governance model.

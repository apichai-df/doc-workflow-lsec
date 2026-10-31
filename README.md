# Enterprise Document Workflow
พร้อม Deploy บน Vercel: Next.js + Supabase + PDF.js/browser PDF viewer + Canvas signature + pdf-lib + Microsoft Graph/SharePoint.

## ติดตั้งย่อ
1. สร้าง Supabase project ใหม่และรัน `supabase/schema.sql`
2. สร้างผู้ใช้คนแรกใน Supabase Authentication แล้วรัน `update profiles set system_role='super_admin' where id='USER_UUID';`
3. ตั้ง `.env.local` ตาม `.env.example`
4. `npm install && npm run dev`
5. ตั้ง Microsoft Entra app และ SharePoint Drive ID ตาม `docs/DEPLOYMENT.md`

## หมายเหตุ
- Admin CRUD Auth ทำผ่าน server API และ service role ไม่ถูกส่งไปเบราว์เซอร์
- PDF ฉบับอนุมัติถูกอัปโหลดไป SharePoint พร้อม SHA-256 metadata ใน Supabase
- pdf-lib บันทึกด้วย object streams เพื่อลด overhead แต่ไม่ recompress รูปเดิมทั้งหมด
- MVP แสดง PDF ด้วย browser PDF viewer เพื่อรองรับ deployment เสถียร ส่วน signature overlay ลากอิสระบนหน้าแรก; production ขั้นถัดไปควรเพิ่ม PDF.js page canvas และ page selector สำหรับทุกหน้า

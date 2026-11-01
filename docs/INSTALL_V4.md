# ติดตั้ง v4

1. สำรองฐานข้อมูลและสร้าง Git branch ใหม่
2. รัน `supabase/migrations/20261031_v3_review_layers.sql` หากยังไม่เคยรัน
3. รัน `supabase/migrations/20261101_v4_revision_workflow.sql`
4. รักษา `.env.local` เดิมและตรวจ `SHAREPOINT_DRIVE_ID`
5. รัน `npm install`
6. รัน `npm run build`
7. รัน `npm run dev`

## การทดสอบที่ต้องทำ
- สร้างเอกสารใหม่ด้วย Workflow ที่เปิด `owner_sign_first`
- เจ้าของเลือกหน้า วางลายเซ็น แล้วกดส่ง
- ตรวจว่า Storage มี `revision-001-signed.pdf`
- ผู้ตรวจคนถัดไปต้องเห็น Revision 1 และลายเซ็นเจ้าของใน PDF
- ผู้ตรวจคนแรกต้องไม่เห็นเอกสารใน Inbox แต่เห็นใน History
- ทำซ้ำจนขั้นสุดท้ายและตรวจไฟล์ final ใน SharePoint

## หมายเหตุสำคัญ
- เอกสารเก่าถูก Backfill เป็น Revision 0 แต่ Workflow เดิมไม่ได้แทรกขั้นเจ้าของย้อนหลัง
- ทดสอบสถาปัตยกรรม v4 ด้วยเอกสารใหม่ก่อน
- อย่า Commit `.env.local`

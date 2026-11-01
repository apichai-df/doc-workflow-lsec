# คู่มืออัปเกรด v3

## ก่อนเริ่ม
- สำรอง Supabase Database
- สร้าง Git branch: `git checkout -b upgrade-v3`
- เก็บ `.env.local` ไว้ในเครื่อง ห้าม Commit

## ฐานข้อมูล
รัน `supabase/migrations/20261031_v3_review_layers.sql` หนึ่งครั้ง แล้วตรวจว่าตาราง `signatures` มี `workflow_step_id`, `image_data`, `z_index`, `is_visible` และ `is_locked`.

## ทดสอบ
1. Admin สร้าง/แก้ไข/ปิด Workflow
2. ครูอัปโหลด PDF และเลือก Workflow
3. ผู้ตรวจเพิ่มความคิดเห็นและส่งกลับ
4. ผู้ตรวจเพิ่มลายเซ็น 2 จุด ทำสำเนา ลาก ปรับขนาด และบันทึกร่าง
5. อนุมัติส่งต่อ และตรวจว่าขั้นที่ต้องลงนามไม่ผ่านหากไม่มีลายเซ็น
6. ขั้นสุดท้ายสร้าง PDF และตรวจไฟล์ใน SharePoint

## Rollback
หากแอปมีปัญหา ให้กลับ Branch เดิม ส่วน Migration เพิ่มคอลัมน์โดยไม่ลบข้อมูลเดิม จึงไม่จำเป็นต้อง Drop คอลัมน์ทันที

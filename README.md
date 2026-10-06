# ยืมเงินด้วย QR

ระบบบันทึกการยืมเงิน: ผู้ดูแลสร้าง QR ประจำตัวให้แต่ละคน → ผู้ยืมสแกน QR → กดตัวเลขจำนวนเงิน → บันทึก
ข้อมูลเก็บใน Google Sheets (ถ้ายังไม่ตั้งค่า จะเก็บลงไฟล์ `data/db.json` ในเครื่องแทน)

## รันในเครื่อง

```bash
npm install
npm start
```

- ผู้ดูแล: http://localhost:3000/admin (รหัสผ่านอยู่ที่ `ADMIN_PASSWORD` ในไฟล์ `.env`)
- มือถือต้องต่อ Wi-Fi วงเดียวกับเครื่องที่รัน แล้วใช้แอปกล้องสแกน QR ได้เลย
- หน้า `/scan` (สแกนในเบราว์เซอร์) ใช้กล้องได้เฉพาะเมื่อเปิดผ่าน https คือหลัง deploy แล้ว

## หน้าต่าง ๆ

| หน้า        | ใช้ทำอะไร                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------- |
| `/admin`    | สร้าง/ลบ QR, บันทึกการคืนเงิน, ดูรายการยืม-คืนและยอดคงค้าง, Export CSV / XLSX, ล้างข้อมูล |
| `/b/<รหัส>` | หน้าที่ QR พาไป — กดจำนวนเงินแล้วบันทึก                                                   |
| `/scan`     | สแกน QR ในเบราว์เซอร์                                                                     |

## ต่อ Google Sheets

1. สร้าง Google Sheet เปล่า 1 ไฟล์ แล้วคัดลอก ID จาก URL (ส่วนระหว่าง `/d/` กับ `/edit`)
2. ที่ [Google Cloud Console](https://console.cloud.google.com/) สร้างโปรเจกต์ → เปิดใช้ **Google Sheets API**
3. ไปที่ IAM & Admin → Service Accounts → สร้าง service account → แท็บ Keys → Add key → JSON
4. นำไฟล์ที่ดาวน์โหลดมาวางในโฟลเดอร์นี้ ตั้งชื่อ `credentials.json`
5. เปิด Google Sheet → Share → ใส่อีเมลของ service account (`client_email` ในไฟล์) ให้สิทธิ์ **Editor**
6. ใส่ `GOOGLE_SHEET_ID=...` ใน `.env` แล้ว `npm start` ใหม่

ระบบจะสร้างแท็บ `people` และ `loans` พร้อมหัวตารางให้เอง หน้า admin จะแสดงป้าย "Google Sheets" เมื่อเชื่อมสำเร็จ

## Deploy บน Netlify

โปรเจกต์มี `netlify.toml` และ `netlify/functions/api.js` แล้ว: หน้าเว็บใน `public/` เป็นไฟล์ static ส่วน `/api/*` รันเป็น Netlify Function

1. push โค้ดขึ้น GitHub แล้วต่อ repo กับ Netlify (ไม่ต้องกรอก build command เอง ระบบอ่านจาก `netlify.toml`)
2. ที่ Netlify เพิ่ม environment variables:

| ชื่อ | ค่า |
| --- | --- |
| `ADMIN_PASSWORD` | รหัสผ่านเข้าหน้า admin |
| `GOOGLE_SHEET_ID` | ID ของชีต |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ค่า `client_email` ใน `credentials.json` |
| `GOOGLE_PRIVATE_KEY` | ค่า `private_key` ใน `credentials.json` (ไม่เอาเครื่องหมาย `"` หน้า-หลัง) |
| `PUBLIC_BASE_URL` | ที่อยู่เว็บ เช่น `https://ชื่อเว็บ.netlify.app` |

3. สั่ง deploy ใหม่ เพราะค่า env มีผลกับ deploy ครั้งถัดไป

บน Netlify ต้องใช้ Google Sheets เท่านั้น (เขียนไฟล์ `data/db.json` ไม่ได้) และ QR ที่สร้างตอนรันในเครื่องต้องดาวน์โหลด/พิมพ์ใหม่จากหน้า admin หลัง deploy

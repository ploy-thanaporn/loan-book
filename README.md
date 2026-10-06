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

| หน้า | ใช้ทำอะไร |
| --- | --- |
| `/admin` | สร้าง/ลบ QR, บันทึกการคืนเงิน, ดูรายการยืม-คืนและยอดคงค้าง, Export CSV / XLSX, ล้างข้อมูล |
| `/b/<รหัส>` | หน้าที่ QR พาไป — กดจำนวนเงินแล้วบันทึก |
| `/scan` | สแกน QR ในเบราว์เซอร์ |

## ต่อ Google Sheets

1. สร้าง Google Sheet เปล่า 1 ไฟล์ แล้วคัดลอก ID จาก URL (ส่วนระหว่าง `/d/` กับ `/edit`)
2. ที่ [Google Cloud Console](https://console.cloud.google.com/) สร้างโปรเจกต์ → เปิดใช้ **Google Sheets API**
3. ไปที่ IAM & Admin → Service Accounts → สร้าง service account → แท็บ Keys → Add key → JSON
4. นำไฟล์ที่ดาวน์โหลดมาวางในโฟลเดอร์นี้ ตั้งชื่อ `credentials.json`
5. เปิด Google Sheet → Share → ใส่อีเมลของ service account (`client_email` ในไฟล์) ให้สิทธิ์ **Editor**
6. ใส่ `GOOGLE_SHEET_ID=...` ใน `.env` แล้ว `npm start` ใหม่

ระบบจะสร้างแท็บ `people` และ `loans` พร้อมหัวตารางให้เอง หน้า admin จะแสดงป้าย "Google Sheets" เมื่อเชื่อมสำเร็จ

## Deploy ฟรี

GitHub Pages รันได้เฉพาะเว็บ static จึงรัน Node.js ตัวนี้ไม่ได้ ให้ push โค้ดขึ้น GitHub แล้วต่อ repo กับบริการที่รัน Node ฟรี เช่น [Render](https://render.com) (Web Service, Free):

- Build command: `npm install` / Start command: `npm start`
- Environment variables: `ADMIN_PASSWORD`, `GOOGLE_SHEET_ID`, `GOOGLE_CREDENTIALS_JSON` (เนื้อหาไฟล์ `credentials.json` ทั้งไฟล์), `PUBLIC_BASE_URL` (URL ของเว็บที่ได้)
- ต้องใช้ Google Sheets เมื่อ deploy เพราะไฟล์ในเครื่องของบริการฟรีจะหายเมื่อรีสตาร์ต
- QR ที่สร้างตอนรันในเครื่องชี้ไปที่ IP ในวง Wi-Fi หลัง deploy ให้ดาวน์โหลด/พิมพ์ QR ใหม่จากหน้า admin (รายชื่อเดิมใช้ต่อได้)

ไฟล์ `.env`, `credentials.json` และ `data/` ถูกใส่ใน `.gitignore` แล้ว ห้าม commit ขึ้น GitHub

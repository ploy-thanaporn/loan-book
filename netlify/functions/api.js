const serverless = require('serverless-http');

let handler = null;
let init = null;

// โหลดแอปตอนถูกเรียกครั้งแรก เพื่อให้จับ error จากค่า env ที่ผิดแล้วตอบเป็นข้อความที่อ่านรู้เรื่องได้
function load() {
  if (handler) return;
  const server = require('../../server');
  init = server.init;
  handler = serverless(server.app, {
    binary: ['image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  });
}

// แปล error ตอนเริ่มระบบเป็นคำแนะนำว่าต้องแก้ค่า env ตัวไหน
function explain(err) {
  const message = String(err?.message || err);
  const status = err?.response?.status || err?.status;
  if (/ไม่พบ credentials/.test(message)) {
    return 'ยังไม่เห็นค่า GOOGLE_SERVICE_ACCOUNT_EMAIL หรือ GOOGLE_PRIVATE_KEY';
  }
  if (/JSON/.test(message)) return 'ค่า GOOGLE_CREDENTIALS_JSON ไม่ใช่ JSON ที่ถูกต้อง';
  if (/DECODER|PEM|private key|unsupported|asn1|No key/i.test(message)) {
    return 'ค่า GOOGLE_PRIVATE_KEY ไม่ถูกรูปแบบ — คัดลอกใหม่ตั้งแต่ -----BEGIN PRIVATE KEY----- ถึง -----END PRIVATE KEY-----';
  }
  if (/invalid_grant|invalid_client|account not found/i.test(message)) {
    return 'GOOGLE_SERVICE_ACCOUNT_EMAIL กับ GOOGLE_PRIVATE_KEY ไม่ตรงกัน หรือกุญแจถูกลบไปแล้ว';
  }
  if (/has not been used|is disabled/i.test(message)) {
    return 'ยังไม่ได้เปิดใช้ Google Sheets API ในโปรเจกต์ Google Cloud';
  }
  if (status === 403 || /permission/i.test(message)) {
    return 'service account ยังไม่มีสิทธิ์ในชีต — แชร์ชีตให้อีเมลของ service account เป็น Editor';
  }
  if (status === 404 || status === 400 || /not found|invalid argument/i.test(message)) {
    return 'ค่า GOOGLE_SHEET_ID ไม่ถูกต้อง (ไม่พบชีตนี้)';
  }
  return 'เชื่อมต่อ Google Sheets ไม่สำเร็จ — ดูรายละเอียดที่ Logs → Functions → api ใน Netlify';
}

exports.handler = async (event, context) => {
  // ถ้าถูกเรียกด้วย path ของ function ตรง ๆ ให้แปลงกลับเป็น /api/... ที่ Express รู้จัก
  event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '/api');
  try {
    load();
    await init();
  } catch (err) {
    console.error('เริ่มระบบไม่สำเร็จ:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: `เซิร์ฟเวอร์ตั้งค่าไม่ครบ: ${explain(err)}` }),
    };
  }
  return handler(event, context);
};

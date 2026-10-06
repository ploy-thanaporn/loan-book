const serverless = require('serverless-http');
const { app, init } = require('../../server');

const handler = serverless(app, {
  binary: ['image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
});

exports.handler = async (event, context) => {
  // ถ้าถูกเรียกด้วย path ของ function ตรง ๆ ให้แปลงกลับเป็น /api/... ที่ Express รู้จัก
  event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '/api');
  try {
    await init();
  } catch (err) {
    console.error('เริ่มระบบไม่สำเร็จ:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'เซิร์ฟเวอร์ยังตั้งค่าไม่ครบ กรุณาตรวจสอบ environment variables' }),
    };
  }
  return handler(event, context);
};

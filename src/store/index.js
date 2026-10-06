const fs = require('fs');
const path = require('path');
const { createLocalStore } = require('./local');
const { createSheetsStore } = require('./sheets');

const ROOT = path.join(__dirname, '..', '..');

// ตัดช่องว่าง เครื่องหมายคำพูด และ , ท้ายบรรทัด ที่มักติดมาตอนคัดลอกค่าจากไฟล์ JSON
const envText = (value) =>
  (value || '')
    .trim()
    .replace(/,$/, '')
    .replace(/^(["'])([\s\S]*)\1$/, '$2')
    .trim();

// หน้าตั้งค่าบางที่แปลงการขึ้นบรรทัดใหม่ในกุญแจเป็นช่องว่างหรือ \n ตัวอักษร จึงจัดรูปแบบ PEM ใหม่เสมอ
function normalizePrivateKey(raw) {
  const text = envText(raw).replace(/\\n/g, '\n');
  const match = text.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (!match) return text;
  const body = match[1].replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

// รับได้ทั้ง ID ล้วนและ URL เต็มของชีต
const sheetId = (raw) => {
  const text = envText(raw);
  const match = text.match(/\/d\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : text;
};

let missingVariable = null;

function loadCredentials() {
  if (envText(process.env.GOOGLE_CREDENTIALS_JSON)) {
    const parsed = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    return { ...parsed, private_key: normalizePrivateKey(parsed.private_key) };
  }
  const email = envText(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const key = envText(process.env.GOOGLE_PRIVATE_KEY);
  if (email && key) {
    return { client_email: email, private_key: normalizePrivateKey(key) };
  }
  // ตั้งมาแค่ตัวเดียว: จำไว้เพื่อบอกให้ตรงว่าขาดตัวไหน (ถ้าไม่มี credentials.json ให้ใช้แทน)
  if (email || key) {
    missingVariable = email ? 'GOOGLE_PRIVATE_KEY' : 'GOOGLE_SERVICE_ACCOUNT_EMAIL';
  }
  const file = path.resolve(ROOT, process.env.GOOGLE_CREDENTIALS_FILE || 'credentials.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}

// มี GOOGLE_SHEET_ID = ใช้ Google Sheets, ไม่มี = เก็บลงไฟล์ในเครื่อง
function createStore() {
  const spreadsheetId = sheetId(process.env.GOOGLE_SHEET_ID);
  if (!spreadsheetId) {
    return createLocalStore(path.resolve(ROOT, process.env.DATA_FILE || 'data/db.json'));
  }
  const credentials = loadCredentials();
  if (!credentials && missingVariable) {
    const other =
      missingVariable === 'GOOGLE_PRIVATE_KEY' ? 'GOOGLE_SERVICE_ACCOUNT_EMAIL' : 'GOOGLE_PRIVATE_KEY';
    const hint =
      missingVariable === 'GOOGLE_PRIVATE_KEY'
        ? 'ค่า private_key ใน credentials.json'
        : 'ค่า client_email ใน credentials.json';
    // แสดงเฉพาะชื่อตัวแปรที่เซิร์ฟเวอร์เห็นจริง (ไม่แสดงค่า) เพื่อช่วยไล่ว่าค่าที่ตั้งไว้มาถึงหรือยัง
    const seen = Object.keys(process.env)
      .filter((name) => name.trim().startsWith('GOOGLE_'))
      .map((name) => (envText(process.env[name]) ? `"${name}"` : `"${name}" (ค่าว่าง)`))
      .sort()
      .join(', ');
    throw Object.assign(
      new Error(
        `มี ${other} แล้ว แต่ยังไม่มี ${missingVariable} (${hint}) — ตัวแปรที่เซิร์ฟเวอร์เห็นตอนนี้: ${seen}`,
      ),
      { setup: true },
    );
  }
  if (!credentials) {
    throw new Error(
      'ตั้งค่า GOOGLE_SHEET_ID แล้วแต่ไม่พบ credentials ของ service account ' +
        '(วางไฟล์ credentials.json ไว้ที่โฟลเดอร์โปรเจกต์ หรือกำหนด GOOGLE_SERVICE_ACCOUNT_EMAIL กับ GOOGLE_PRIVATE_KEY)',
    );
  }
  return createSheetsStore({ spreadsheetId, credentials });
}

module.exports = { createStore };

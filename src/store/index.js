const fs = require('fs');
const path = require('path');
const { createLocalStore } = require('./local');
const { createSheetsStore } = require('./sheets');

const ROOT = path.join(__dirname, '..', '..');

function loadCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  const file = path.resolve(ROOT, process.env.GOOGLE_CREDENTIALS_FILE || 'credentials.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}

// มี GOOGLE_SHEET_ID = ใช้ Google Sheets, ไม่มี = เก็บลงไฟล์ในเครื่อง
function createStore() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    return createLocalStore(path.resolve(ROOT, process.env.DATA_FILE || 'data/db.json'));
  }
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error(
      'ตั้งค่า GOOGLE_SHEET_ID แล้วแต่ไม่พบ credentials ของ service account ' +
        '(วางไฟล์ credentials.json ไว้ที่โฟลเดอร์โปรเจกต์ หรือกำหนด GOOGLE_CREDENTIALS_JSON)',
    );
  }
  return createSheetsStore({ spreadsheetId, credentials });
}

module.exports = { createStore };

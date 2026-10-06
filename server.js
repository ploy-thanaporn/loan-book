require('dotenv').config();

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const { createStore } = require('./src/store');

const PORT = Number(process.env.PORT) || 3000;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';
const MAX_AMOUNT = 10_000_000;
const MAX_NAME_LENGTH = 80;
const MAX_NOTE_LENGTH = 200;
const SESSION_DAYS = 7;
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  adminPassword = crypto.randomBytes(6).toString('base64url');
  console.warn(`ยังไม่ได้ตั้ง ADMIN_PASSWORD ใน .env — ใช้รหัสชั่วคราว: ${adminPassword}`);
}
const sessionToken = crypto
  .createHmac('sha256', process.env.SESSION_SECRET || adminPassword)
  .update('loan-qr-admin')
  .digest('hex');

const store = createStore();
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

const publicDir = path.join(__dirname, 'public');
const page = (name) => (req, res) => res.sendFile(path.join(publicDir, name));

// ---------- helpers ----------

const now = () => new Date().toLocaleString('sv-SE', { timeZone: TIMEZONE });
const newId = () => crypto.randomBytes(6).toString('base64url');

const safeEqual = (a, b) => {
  const hash = (value) => crypto.createHash('sha256').update(String(value)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
};

const readCookie = (req, name) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
};

const isAdmin = (req) => safeEqual(readCookie(req, 'admin'), sessionToken);

const requireAdmin = (req, res, next) => {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'กรุณาเข้าสู่ระบบผู้ดูแล' });
};

const lanAddress = () => {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
};

// URL ที่ฝังใน QR ต้องเป็นที่อยู่ที่มือถือเปิดได้ จึงไม่ใช้ localhost
const baseUrl = (req) => {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  if (['localhost', '127.0.0.1', '::1'].includes(req.hostname)) {
    const lan = lanAddress();
    if (lan) return `http://${lan}:${PORT}`;
  }
  return `${req.protocol}://${req.get('host')}`;
};

// รหัสที่ฝังใน QR (รายชื่อเก่าที่ยังไม่มีคอลัมน์ qr ใช้ id เป็นรหัส QR)
const qrCode = (person) => person.qr || person.id;

const findByQr = async (code) =>
  (await store.listPeople()).find((p) => code && qrCode(p) === code);

const borrowUrl = (req, code) => `${baseUrl(req)}/b/${code}`;

const cleanText = (value, max) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);

const TYPE_LABELS = { borrow: 'ยืม', repay: 'คืน' };

const parseAmount = (amount) => {
  const value = Math.round(Number(amount) * 100) / 100;
  return Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT ? value : null;
};

// ยอดยืม ยอดคืน และยอดคงค้างของแต่ละคน
const balances = (loans) => {
  const byPerson = new Map();
  for (const loan of loans) {
    const entry = byPerson.get(loan.personId) || {
      personId: loan.personId,
      name: loan.name,
      borrowed: 0,
      repaid: 0,
      count: 0,
    };
    if (loan.type === 'repay') entry.repaid += loan.amount;
    else entry.borrowed += loan.amount;
    entry.count += 1;
    byPerson.set(loan.personId, entry);
  }
  for (const entry of byPerson.values()) {
    entry.borrowed = Math.round(entry.borrowed * 100) / 100;
    entry.repaid = Math.round(entry.repaid * 100) / 100;
    entry.balance = Math.round((entry.borrowed - entry.repaid) * 100) / 100;
  }
  return byPerson;
};

const exportRows = async () => {
  const loans = await store.listLoans();
  return loans.map((loan, index) => ({ no: index + 1, ...loan, typeLabel: TYPE_LABELS[loan.type] }));
};

const exportName = (ext) => `loans-${now().replace(/[-: ]/g, '').slice(0, 12)}.${ext}`;

const csvCell = (value) => {
  let text = String(value ?? '');
  // กันไม่ให้ Excel ตีความข้อความเป็นสูตร
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// ---------- pages ----------

app.get('/b/:code', page('borrow.html'));
app.get('/scan', page('scan.html'));
app.get('/admin', page('admin.html'));
app.get('/vendor/html5-qrcode.min.js', (req, res) =>
  res.sendFile(require.resolve('html5-qrcode/html5-qrcode.min.js')),
);
app.use(express.static(publicDir));

// ---------- public API (ผู้ยืม) ----------

app.get('/api/people/:code', async (req, res) => {
  const person = await findByQr(req.params.code);
  if (!person) return res.status(404).json({ error: 'ไม่พบข้อมูลของ QR นี้' });
  res.json({ name: person.name });
});

app.post('/api/loans', async (req, res) => {
  const { amount, note } = req.body || {};
  // personId = ชื่อฟิลด์เดิม เผื่อมือถือยังค้างหน้าเว็บเวอร์ชันเก่าไว้
  const code = (req.body || {}).code ?? (req.body || {}).personId;
  const value = parseAmount(amount);
  if (value === null) return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
  const person = await findByQr(typeof code === 'string' ? code : '');
  if (!person) return res.status(404).json({ error: 'ไม่พบข้อมูลของ QR นี้' });

  const loan = {
    id: newId(),
    timestamp: now(),
    personId: person.id,
    name: person.name,
    amount: value,
    note: cleanText(note, MAX_NOTE_LENGTH),
    type: 'borrow',
  };
  await store.addLoan(loan);
  res.status(201).json(loan);
});

// ---------- admin API ----------

const loginFails = new Map();

app.post('/api/admin/login', (req, res) => {
  const entry = loginFails.get(req.ip);
  if (entry && entry.resetAt < Date.now()) loginFails.delete(req.ip);
  const fails = loginFails.get(req.ip);
  if (fails && fails.count >= LOGIN_MAX_FAILS) {
    return res.status(429).json({ error: 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที' });
  }

  if (!safeEqual((req.body || {}).password, adminPassword)) {
    loginFails.set(req.ip, {
      count: (fails?.count || 0) + 1,
      resetAt: fails?.resetAt || Date.now() + LOGIN_WINDOW_MS,
    });
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  }

  loginFails.delete(req.ip);
  res.cookie('admin', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ ok: true });
});

app.use('/api/admin', requireAdmin);

app.get('/api/admin/summary', async (req, res) => {
  const [people, loans] = await Promise.all([store.listPeople(), store.listLoans()]);
  const totals = balances(loans);
  const empty = { borrowed: 0, repaid: 0, balance: 0, count: 0 };
  const sum = (key) =>
    Math.round([...totals.values()].reduce((acc, entry) => acc + entry[key], 0) * 100) / 100;
  res.json({
    storage: store.label,
    baseUrl: baseUrl(req),
    borrowed: sum('borrowed'),
    repaid: sum('repaid'),
    balance: sum('balance'),
    people: people.map((person) => ({
      ...empty,
      ...totals.get(person.id),
      id: person.id,
      name: person.name,
      createdAt: person.createdAt,
      qr: qrCode(person),
      url: borrowUrl(req, qrCode(person)),
    })),
    loans: loans.reverse(),
  });
});

app.post('/api/admin/repayments', async (req, res) => {
  const { personId, amount, note } = req.body || {};
  const value = parseAmount(amount);
  if (value === null) return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
  const person = (await store.listPeople()).find((p) => p.id === personId);
  if (!person) return res.status(404).json({ error: 'ไม่พบบุคคลนี้' });

  const balance = balances(await store.listLoans()).get(person.id)?.balance || 0;
  if (value > balance) {
    return res.status(400).json({
      error: `จำนวนเงินคืนมากกว่ายอดคงค้าง (คงค้าง ${balance.toLocaleString('th-TH')} บาท)`,
    });
  }

  const repayment = {
    id: newId(),
    timestamp: now(),
    personId: person.id,
    name: person.name,
    amount: value,
    note: cleanText(note, MAX_NOTE_LENGTH),
    type: 'repay',
  };
  await store.addLoan(repayment);
  res.status(201).json(repayment);
});

app.post('/api/admin/people', async (req, res) => {
  const name = cleanText((req.body || {}).name, MAX_NAME_LENGTH);
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อ' });
  const person = { id: newId(), name, createdAt: now(), qr: newId() };
  await store.addPerson(person);
  res.status(201).json(person);
});

app.delete('/api/admin/people/:id', async (req, res) => {
  const removed = await store.deletePerson(req.params.id);
  if (!removed) return res.status(404).json({ error: 'ไม่พบบุคคลนี้' });
  res.json({ ok: true });
});

app.delete('/api/admin/people/:id/loans', async (req, res) => {
  const removed = await store.deleteLoansByPerson(req.params.id);
  res.json({ ok: true, removed });
});

app.get('/api/admin/people/:id/qr.png', async (req, res) => {
  const person = (await store.listPeople()).find((p) => p.id === req.params.id);
  if (!person) return res.status(404).json({ error: 'ไม่พบบุคคลนี้' });
  const png = await QRCode.toBuffer(borrowUrl(req, qrCode(person)), { width: 600, margin: 2 });
  if (req.query.download) res.attachment(`qr-${person.id}.png`);
  res.set('Cache-Control', 'private, max-age=3600');
  res.type('png').send(png);
});

app.get('/api/admin/export.csv', async (req, res) => {
  const rows = await exportRows();
  const lines = [
    ['ลำดับ', 'วันที่เวลา', 'รหัสบุคคล', 'ชื่อ', 'ประเภท', 'จำนวนเงิน', 'หมายเหตุ'],
    ...rows.map((r) => [r.no, r.timestamp, r.personId, r.name, r.typeLabel, r.amount, r.note]),
  ].map((line) => line.map(csvCell).join(','));
  res.attachment(exportName('csv'));
  // BOM ให้ Excel อ่านภาษาไทยถูก
  res.type('text/csv; charset=utf-8').send(`﻿${lines.join('\r\n')}\r\n`);
});

app.get('/api/admin/export.xlsx', async (req, res) => {
  const rows = await exportRows();
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet('รายการยืม-คืน');
  sheet.columns = [
    { header: 'ลำดับ', key: 'no', width: 8 },
    { header: 'วันที่เวลา', key: 'timestamp', width: 22 },
    { header: 'รหัสบุคคล', key: 'personId', width: 14 },
    { header: 'ชื่อ', key: 'name', width: 28 },
    { header: 'ประเภท', key: 'typeLabel', width: 10 },
    { header: 'จำนวนเงิน', key: 'amount', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'หมายเหตุ', key: 'note', width: 36 },
  ];
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };

  const summary = workbook.addWorksheet('สรุปรายบุคคล');
  summary.columns = [
    { header: 'รหัสบุคคล', key: 'personId', width: 14 },
    { header: 'ชื่อ', key: 'name', width: 28 },
    { header: 'ยืมรวม', key: 'borrowed', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'คืนรวม', key: 'repaid', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'คงค้าง', key: 'balance', width: 16, style: { numFmt: '#,##0.00' } },
  ];
  summary.addRows([...balances(rows).values()]);
  summary.getRow(1).font = { bold: true };

  res.attachment(exportName('xlsx'));
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
});

app.post('/api/admin/clear', async (req, res) => {
  const scope = (req.body || {}).scope;
  if (!['loans', 'people', 'all'].includes(scope)) {
    return res.status(400).json({ error: 'ขอบเขตการล้างข้อมูลไม่ถูกต้อง' });
  }
  await store.clear(scope);
  res.json({ ok: true });
});

// ---------- errors ----------

app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบ API นี้' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่' });
});

store
  .init()
  .then(() => {
    app.listen(PORT, (err) => {
      if (err) throw err;
      const lan = lanAddress();
      console.log(`เก็บข้อมูลที่: ${store.label}`);
      console.log(`เปิดในเครื่อง:  http://localhost:${PORT}/admin`);
      if (lan) console.log(`เปิดจากมือถือ (Wi-Fi เดียวกัน): http://${lan}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('เริ่มระบบไม่สำเร็จ:', err.message);
    process.exit(1);
  });

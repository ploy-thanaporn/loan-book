const { JWT } = require('google-auth-library');

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
// บน serverless แต่ละ instance มี cache ของตัวเอง จึงไม่ cache เพื่อให้ QR ที่เพิ่งสร้างใช้ได้ทันที
const PEOPLE_TTL_MS = process.env.AWS_LAMBDA_FUNCTION_NAME ? 0 : 60 * 1000;

const TABS = {
  people: ['id', 'name', 'createdAt', 'qr'],
  loans: ['id', 'timestamp', 'personId', 'name', 'amount', 'note', 'type'],
};

const lastColumn = (tab) => String.fromCharCode(64 + TABS[tab].length);
const dataRange = (tab) => `${tab}!A2:${lastColumn(tab)}`;

function createSheetsStore({ spreadsheetId, credentials }) {
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheetIds = {};
  let peopleCache = null;
  let peopleCachedAt = 0;

  const call = async (method, suffix, data) => {
    const res = await client.request({ url: `${API}/${spreadsheetId}${suffix}`, method, data });
    return res.data;
  };

  // คืนทุกแถวตามตำแหน่งจริงในชีต (รวมแถวว่าง) เพื่อใช้อ้างเลขแถวตอนแก้/ลบ
  const readRaw = async (tab) => {
    const range = encodeURIComponent(dataRange(tab));
    const data = await call('GET', `/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
    return data.values || [];
  };

  const readRows = async (tab) =>
    (await readRaw(tab)).filter((row) => row.length && row[0] !== '');

  // index นับจากแถวข้อมูลแรก (แถว 2 ของชีต)
  const deleteRows = (tab, indexes) =>
    call('POST', ':batchUpdate', {
      requests: [...indexes]
        .sort((a, b) => b - a)
        .map((index) => ({
          deleteDimension: {
            range: {
              sheetId: sheetIds[tab],
              dimension: 'ROWS',
              startIndex: index + 1,
              endIndex: index + 2,
            },
          },
        })),
    });

  const matchingIndexes = (rows, column, value) =>
    rows.flatMap((row, index) => (String(row[column] ?? '') === value ? [index] : []));

  const appendRow = async (tab, row) => {
    const range = encodeURIComponent(`${tab}!A1`);
    // RAW: ไม่ให้ Sheets ตีความค่าที่ผู้ใช้พิมพ์เป็นสูตร
    await call(
      'POST',
      `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: [row] },
    );
  };

  const clearTab = (tab) =>
    call('POST', `/values/${encodeURIComponent(dataRange(tab))}:clear`, {});

  const toPerson = (row) => ({
    id: String(row[0] ?? ''),
    name: String(row[1] ?? ''),
    createdAt: String(row[2] ?? ''),
    qr: String(row[3] ?? ''),
  });

  const toLoan = (row) => ({
    id: String(row[0] ?? ''),
    timestamp: String(row[1] ?? ''),
    personId: String(row[2] ?? ''),
    name: String(row[3] ?? ''),
    amount: Number(row[4]) || 0,
    note: String(row[5] ?? ''),
    // แถวเก่าที่ไม่มีคอลัมน์ type ถือเป็นรายการยืม
    type: row[6] === 'repay' ? 'repay' : 'borrow',
  });

  return {
    kind: 'sheets',
    label: 'Google Sheets',

    async init() {
      const meta = await call('GET', '?fields=sheets.properties(sheetId,title)');
      for (const sheet of meta.sheets || []) {
        sheetIds[sheet.properties.title] = sheet.properties.sheetId;
      }

      const missing = Object.keys(TABS).filter((tab) => sheetIds[tab] === undefined);
      if (missing.length) {
        const res = await call('POST', ':batchUpdate', {
          requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
        });
        for (const reply of res.replies) {
          const props = reply.addSheet.properties;
          sheetIds[props.title] = props.sheetId;
        }
      }

      for (const tab of Object.keys(TABS)) {
        const range = encodeURIComponent(`${tab}!A1:${lastColumn(tab)}1`);
        await call('PUT', `/values/${range}?valueInputOption=RAW`, { values: [TABS[tab]] });
      }
    },

    async listPeople() {
      if (!peopleCache || Date.now() - peopleCachedAt > PEOPLE_TTL_MS) {
        peopleCache = (await readRows('people')).map(toPerson);
        peopleCachedAt = Date.now();
      }
      return peopleCache.slice();
    },

    async addPerson(person) {
      await appendRow('people', [person.id, person.name, person.createdAt, person.qr]);
      peopleCache = null;
    },

    async deletePerson(id) {
      const indexes = matchingIndexes(await readRaw('people'), 0, id);
      if (!indexes.length) return false;
      await deleteRows('people', indexes);
      peopleCache = null;
      return true;
    },

    async deleteLoansByPerson(personId) {
      const indexes = matchingIndexes(await readRaw('loans'), 2, personId);
      if (indexes.length) await deleteRows('loans', indexes);
      return indexes.length;
    },

    async listLoans() {
      return (await readRows('loans')).map(toLoan);
    },

    async addLoan(loan) {
      await appendRow('loans', [
        loan.id,
        loan.timestamp,
        loan.personId,
        loan.name,
        loan.amount,
        loan.note,
        loan.type,
      ]);
    },

    async clear(scope) {
      if (scope !== 'people') await clearTab('loans');
      if (scope !== 'loans') {
        await clearTab('people');
        peopleCache = null;
      }
    },
  };
}

module.exports = { createSheetsStore };

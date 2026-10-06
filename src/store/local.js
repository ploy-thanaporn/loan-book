const fs = require('fs');
const path = require('path');

// ที่เก็บข้อมูลสำรองแบบไฟล์ JSON ใช้ตอนยังไม่ได้ตั้งค่า Google Sheets
function createLocalStore(file) {
  let db = { people: [], loans: [] };

  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(db, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  };

  return {
    kind: 'local',
    label: `ไฟล์ในเครื่อง (${path.relative(process.cwd(), file)})`,

    async init() {
      if (fs.existsSync(file)) {
        const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
        db = { people: loaded.people || [], loans: loaded.loans || [] };
      }
    },

    async listPeople() {
      return db.people.slice();
    },

    async addPerson(person) {
      db.people.push(person);
      save();
    },

    async deletePerson(id) {
      const before = db.people.length;
      db.people = db.people.filter((p) => p.id !== id);
      if (db.people.length === before) return false;
      save();
      return true;
    },

    async deleteLoansByPerson(personId) {
      const before = db.loans.length;
      db.loans = db.loans.filter((loan) => loan.personId !== personId);
      if (db.loans.length !== before) save();
      return before - db.loans.length;
    },

    async listLoans() {
      return db.loans.map((loan) => ({ ...loan, type: loan.type === 'repay' ? 'repay' : 'borrow' }));
    },

    async addLoan(loan) {
      db.loans.push(loan);
      save();
    },

    async clear(scope) {
      if (scope !== 'people') db.loans = [];
      if (scope !== 'loans') db.people = [];
      save();
    },
  };
}

module.exports = { createLocalStore };

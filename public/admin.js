const $ = (id) => document.getElementById(id);
const money = (value) =>
  Number(value).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

let state = null;

const showLogin = (visible) => {
  $('login').classList.toggle('hidden', !visible);
  $('app').classList.toggle('hidden', visible);
};

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/login')) showLogin(true);
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
};

// #/p/<id> = หน้ารายละเอียดของคนนั้น, อย่างอื่น = หน้ารายชื่อ
const routePersonId = () => {
  const match = location.hash.match(/^#\/p\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

// v= เปลี่ยนตามรหัส QR เพื่อไม่ให้เบราว์เซอร์โชว์รูปเก่าหลังสร้าง QR ใหม่
const qrUrl = (person) =>
  `/api/admin/people/${encodeURIComponent(person.id)}/qr.png?v=${encodeURIComponent(person.qr)}`;

const stat = (label, value, className = '') =>
  el('div', { className: `stat ${className}` }, [
    el('div', { className: 'label', textContent: label }),
    el('div', { className: 'value', textContent: `${money(value)} ฿` }),
  ]);

const renderStats = (container, totals) =>
  container.replaceChildren(
    stat('ยืมทั้งหมด', totals.borrowed),
    stat('คืนแล้ว', totals.repaid),
    stat('คงค้าง', totals.balance, totals.balance > 0 ? 'owed' : ''),
  );

const amountCells = (loan) => [
  el('td', { className: 'num', textContent: loan.type === 'repay' ? '' : money(loan.amount) }),
  el('td', { className: 'num repaid', textContent: loan.type === 'repay' ? money(loan.amount) : '' }),
];

const emptyRow = (columns, text) =>
  el('tr', {}, [el('td', { colSpan: columns, className: 'muted', textContent: text })]);

const totalCells = (totals) => [
  el('td', { className: 'num', textContent: money(totals.borrowed) }),
  el('td', { className: 'num repaid', textContent: money(totals.repaid) }),
  el('td', {
    className: totals.balance > 0 ? 'num owed' : 'num',
    textContent: money(totals.balance),
  }),
];

function renderList() {
  renderStats($('totalStats'), state);

  $('people').replaceChildren(
    ...(state.people.length
      ? state.people.map((person) => {
          const href = `#/p/${encodeURIComponent(person.id)}`;
          return el(
            'tr',
            {
              className: 'clickable',
              onclick: () => {
                location.hash = href;
              },
            },
            [
              el('td', {}, [el('a', { href, textContent: person.name })]),
              ...totalCells(person),
            ],
          );
        })
      : [emptyRow(4, 'ยังไม่มีรายชื่อ — เพิ่มชื่อเพื่อสร้าง QR')]),
  );
  $('peopleTotal').replaceChildren(
    ...(state.people.length > 1
      ? [el('tr', {}, [el('td', { textContent: 'รวม' }), ...totalCells(state)])]
      : []),
  );

  $('printGrid').replaceChildren(
    ...state.people.map((person) =>
      el('div', { className: 'qr-card' }, [
        el('img', { src: qrUrl(person), alt: '' }),
        el('div', { className: 'name', textContent: person.name }),
      ]),
    ),
  );

  $('loans').replaceChildren(
    ...(state.loans.length
      ? state.loans.map((loan) =>
          el('tr', {}, [
            el('td', { textContent: loan.timestamp }),
            el('td', { textContent: loan.name }),
            ...amountCells(loan),
            el('td', { className: 'note', textContent: loan.note }),
          ]),
        )
      : [emptyRow(5, 'ยังไม่มีรายการ')]),
  );
}

function renderDetail(person) {
  $('detailName').textContent = person.name;
  renderStats($('detailStats'), person);

  $('detailQr').replaceChildren(
    el('img', { src: qrUrl(person), alt: `QR ของ ${person.name}` }),
    el('div', { className: 'name', textContent: person.name }),
    el('div', { className: 'row no-print', style: 'justify-content:center;margin-top:10px' }, [
      el('a', { className: 'btn small', href: `${qrUrl(person)}&download=1`, textContent: 'ดาวน์โหลด' }),
      el('button', {
        className: 'small',
        type: 'button',
        textContent: 'พิมพ์',
        onclick: () => window.print(),
      }),
      el('a', { className: 'btn small', href: person.url, target: '_blank', textContent: 'เปิดลิงก์' }),
    ]),
  );

  const loans = state.loans.filter((loan) => loan.personId === person.id);
  $('detailLoans').replaceChildren(
    ...(loans.length
      ? loans.map((loan) =>
          el('tr', {}, [
            el('td', { textContent: loan.timestamp }),
            ...amountCells(loan),
            el('td', { className: 'note', textContent: loan.note }),
          ]),
        )
      : [emptyRow(4, 'ยังไม่มีรายการ')]),
  );
}

function render() {
  if (!state) return;
  const personId = routePersonId();
  const person = personId && state.people.find((p) => p.id === personId);
  if (personId && !person) {
    location.hash = '#/';
    return;
  }
  $('listView').classList.toggle('hidden', Boolean(person));
  $('detailView').classList.toggle('hidden', !person);
  if (person) renderDetail(person);
  else renderList();
}

async function load() {
  state = await api('/api/admin/summary');
  showLogin(false);
  $('storage').textContent = state.storage;
  render();
}

window.addEventListener('hashchange', () => {
  $('repayMessage').textContent = '';
  $('detailError').textContent = '';
  $('repayAmount').value = '';
  $('repayNote').value = '';
  render();
  window.scrollTo(0, 0);
});

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('loginError').textContent = '';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('password').value }),
    });
    $('password').value = '';
    await load();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  showLogin(true);
});

$('personForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('personError').textContent = '';
  try {
    const person = await api('/api/admin/people', {
      method: 'POST',
      body: JSON.stringify({ name: $('personName').value }),
    });
    $('personName').value = '';
    await load();
    location.hash = `#/p/${encodeURIComponent(person.id)}`;
  } catch (err) {
    $('personError').textContent = err.message;
  }
});

$('repayForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('repayMessage');
  message.className = 'error';
  message.textContent = '';
  const amount = Number($('repayAmount').value.replace(/,/g, ''));
  if (!(amount > 0)) {
    message.textContent = 'กรุณากรอกจำนวนเงินเป็นตัวเลขมากกว่า 0';
    return;
  }
  try {
    const saved = await api('/api/admin/repayments', {
      method: 'POST',
      body: JSON.stringify({ personId: routePersonId(), amount, note: $('repayNote').value }),
    });
    $('repayAmount').value = '';
    $('repayNote').value = '';
    await load();
    message.className = 'muted';
    message.textContent = `บันทึกแล้ว: คืน ${money(saved.amount)} บาท`;
  } catch (err) {
    message.textContent = err.message;
  }
});

async function personAction(url, method) {
  $('detailError').textContent = '';
  try {
    await api(url, { method });
    await load();
  } catch (err) {
    $('detailError').textContent = err.message;
  }
}

const currentPerson = () => state.people.find((p) => p.id === routePersonId());

$('deleteLoans').addEventListener('click', () => {
  const person = currentPerson();
  if (!person) return;
  if (!confirm(`ลบประวัติยืม-คืนทั้งหมดของ "${person.name}"?\nยอดจะกลับเป็น 0 และกู้คืนไม่ได้ (ชื่อและ QR ยังอยู่)`)) return;
  personAction(`/api/admin/people/${encodeURIComponent(person.id)}/loans`, 'DELETE');
});

$('deletePerson').addEventListener('click', () => {
  const person = currentPerson();
  if (!person) return;
  if (!confirm(`ลบ "${person.name}" และ QR ของคนนี้?\nQR ที่พิมพ์ไปแล้วจะสแกนไม่ได้อีก (ประวัติยืม-คืนยังอยู่ในรายการทั้งหมด)`)) return;
  personAction(`/api/admin/people/${encodeURIComponent(person.id)}`, 'DELETE');
});

$('print').addEventListener('click', () => window.print());
$('refresh').addEventListener('click', () => load().catch(() => {}));

for (const button of document.querySelectorAll('[data-clear]')) {
  button.addEventListener('click', async () => {
    const scope = button.dataset.clear;
    const what = {
      loans: 'รายการยืม-คืนทั้งหมด',
      people: 'รายชื่อและ QR ทั้งหมด',
      all: 'รายการยืม-คืน รายชื่อ และ QR ทั้งหมด',
    }[scope];
    const answer = prompt(`จะลบ${what}แบบถาวร\nพิมพ์คำว่า "ลบ" เพื่อยืนยัน`);
    if (answer === null) return;
    if (answer.trim() !== 'ลบ') {
      $('clearError').textContent = 'ยังไม่ได้ลบ — ต้องพิมพ์คำว่า "ลบ" ให้ตรง';
      return;
    }
    $('clearError').textContent = '';
    try {
      await api('/api/admin/clear', { method: 'POST', body: JSON.stringify({ scope }) });
      await load();
    } catch (err) {
      $('clearError').textContent = err.message;
    }
  });
}

load().catch(() => {});

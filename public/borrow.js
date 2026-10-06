const MAX_DIGITS = 7;
const code = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const section of ['loading', 'notFound', 'form', 'success']) {
    $(section).classList.toggle('hidden', section !== id);
  }
};

let digits = '';
let saving = false;

const render = () => {
  $('amount').textContent = Number(digits || 0).toLocaleString('th-TH');
  $('save').disabled = saving || !Number(digits);
};

$('keypad').addEventListener('click', (event) => {
  const key = event.target.closest('button')?.dataset.key;
  if (!key || saving) return;
  if (key === 'clear') digits = '';
  else if (key === 'back') digits = digits.slice(0, -1);
  else if (digits.length < MAX_DIGITS && !(digits === '' && key === '0')) digits += key;
  $('error').textContent = '';
  render();
});

$('save').addEventListener('click', async () => {
  if (saving || !Number(digits)) return;
  saving = true;
  $('save').textContent = 'กำลังบันทึก…';
  render();
  try {
    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, amount: Number(digits), note: $('note').value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
    $('doneName').textContent = data.name;
    $('doneAmount').textContent = data.amount.toLocaleString('th-TH');
    $('doneTime').textContent = data.timestamp;
    show('success');
  } catch (err) {
    $('error').textContent =
      err instanceof TypeError ? 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบแล้วลองใหม่' : err.message;
  } finally {
    saving = false;
    $('save').textContent = 'บันทึกการยืม';
    render();
  }
});

$('again').addEventListener('click', () => {
  digits = '';
  $('note').value = '';
  render();
  show('form');
});

fetch(`/api/people/${encodeURIComponent(code)}`)
  .then(async (res) => {
    if (!res.ok) return show('notFound');
    $('personName').textContent = (await res.json()).name;
    show('form');
  })
  .catch(() => {
    $('loading').textContent = 'เชื่อมต่อไม่ได้ กรุณาลองใหม่';
  });

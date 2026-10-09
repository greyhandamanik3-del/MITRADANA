/* =========================================================
   MITRADANA — logika aplikasi (terhubung ke Supabase)
   Data disimpan di tabel loans dan payments.
   ========================================================= */

const CFG = window.MITRADANA_CONFIG || {};
let sb = null;
try {
  sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
} catch (e) {
  console.error('Supabase gagal dimuat:', e);
}

const $ = x => document.getElementById(x);
let loans = [];
let reportRows = [];

/* ---------- Utilitas ---------- */
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const money = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const datefmt = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
  $('toast').textContent = msg;
  $('toast').classList.add('show');
  clearTimeout(window.tt);
  window.tt = setTimeout(() => $('toast').classList.remove('show'), 2500);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Perhitungan ----------
   total tagihan  = pokok + target keuntungan
   sisa           = total tagihan - total pembayaran (tidak pernah negatif)
   status         = Lunas jika sisa 0, Terlambat jika lewat jatuh tempo, selain itu Aktif
   keuntungan diterima = keuntungan hanya dihitung setelah pokok lunas dibayar
------------------------------------------------------------------ */
function paid(l) { return l.payments.reduce((a, p) => a + Number(p.amount), 0); }
function balance(l) { return Math.max(0, Number(l.amount) + Number(l.profit || 0) - paid(l)); }
function status(l) {
  if (balance(l) <= 0) return 'paid';
  if (l.dueDate && l.dueDate < today()) return 'late';
  return 'active';
}
function statusClass(l) {
  const s = status(l);
  return s === 'active' ? 'activeStatus' : s;
}
function label(s) { return s === 'paid' ? 'Lunas' : s === 'late' ? 'Terlambat' : 'Aktif'; }

// Keuntungan yang sudah diterima, hanya dari pembayaran yang lolos filter
function profitAt(l, pred) {
  const pd = l.payments.filter(pred).reduce((a, p) => a + Number(p.amount), 0);
  return Math.min(Number(l.profit || 0), Math.max(0, pd - Number(l.amount)));
}
function profitGot(l) { return profitAt(l, () => true); }

/* ---------- Data dari Supabase ---------- */
function fromRow(row, payRows) {
  return {
    id: row.id,
    name: row.name,
    phone: row.whatsapp || '',
    amount: Number(row.amount),
    profit: Number(row.target_profit || 0),
    loanDate: row.loan_date,
    dueDate: row.due_date || '',
    notes: row.note || '',
    created: new Date(row.created_at).getTime(),
    payments: payRows
      .filter(p => p.loan_id === row.id)
      .map(p => ({ id: p.id, amount: Number(p.amount), date: p.payment_date, note: p.note || '' }))
  };
}

async function loadAll() {
  if (!sb) { toast('Koneksi ke Supabase belum siap. Cek config.js.'); return; }
  const [{ data: lr, error: le }, { data: pr, error: pe }] = await Promise.all([
    sb.from('loans').select('*').order('created_at', { ascending: false }),
    sb.from('payments').select('*').order('payment_date', { ascending: true })
  ]);
  if (le || pe) {
    console.error(le || pe);
    toast('Gagal memuat data: ' + (le || pe).message);
    return;
  }
  loans = (lr || []).map(r => fromRow(r, pr || []));
  render();
}

async function deleteAll() {
  const { error } = await sb.from('loans').delete().not('id', 'is', null);
  if (error) throw error;
}

/* ---------- Render ---------- */
function render() {
  const active = loans.filter(l => status(l) !== 'paid');
  $('activeTotal').textContent = money(active.reduce((s, l) => s + balance(l), 0));
  $('activeCount').textContent = active.length + ' transaksi aktif';
  $('lentTotal').textContent = money(loans.reduce((s, l) => s + Number(l.amount), 0));
  $('paymentTotal').textContent = money(loans.reduce((s, l) => s + paid(l), 0));
  $('profitTotal').textContent = money(loans.reduce((s, l) => s + profitGot(l), 0));
  $('balanceTotal').textContent = money(loans.reduce((s, l) => s + balance(l), 0));
  $('borrowerCount').textContent = new Set(loans.map(l => l.name.toLowerCase())).size + ' orang';
  $('paidCount').textContent = loans.filter(l => status(l) === 'paid').length + ' transaksi';
  $('lateCount').textContent = loans.filter(l => status(l) === 'late').length + ' transaksi';

  const latest = [...loans].sort((a, b) => b.created - a.created).slice(0, 5);
  $('recentRows').innerHTML = latest.map(l => `<tr>
      <td class="name">${esc(l.name)}<span class="sub">${datefmt(l.loanDate)}</span></td>
      <td>${money(l.amount)}</td>
      <td>${money(balance(l))}</td>
      <td><span class="status ${statusClass(l)}">${label(status(l))}</span></td>
    </tr>`).join('');
  $('recentEmpty').style.display = latest.length ? 'none' : 'block';

  renderLoans();
  makeReport(true);
}

function renderLoans() {
  const q = $('search').value.toLowerCase(), f = $('filter').value;
  const a = loans
    .filter(l => (l.name.toLowerCase().includes(q) || (l.phone || '').includes(q)) && (f === 'all' || status(l) === f))
    .sort((x, y) => y.created - x.created);
  $('loanRows').innerHTML = a.map(l => `<tr>
      <td class="name">${esc(l.name)}<span class="sub">${esc(l.phone || 'Nomor tidak tersedia')}</span></td>
      <td>${datefmt(l.loanDate)}</td>
      <td>${money(l.amount + Number(l.profit || 0))}<span class="sub">Pokok ${money(l.amount)}</span></td>
      <td>${money(paid(l))}</td>
      <td>${money(balance(l))}</td>
      <td>${datefmt(l.dueDate)}</td>
      <td><span class="status ${statusClass(l)}">${label(status(l))}</span></td>
      <td><button class="mini" data-act="pay" data-id="${l.id}" ${status(l) === 'paid' ? 'disabled' : ''}>Bayar</button><button class="mini" data-act="edit" data-id="${l.id}">Edit</button><button class="mini" data-act="del" data-id="${l.id}">Hapus</button></td>
    </tr>`).join('');
  $('loanEmpty').style.display = a.length ? 'none' : 'block';
}

/* ---------- Modal ---------- */
function openLoan(id) {
  $('loanForm').reset();
  $('id').value = '';
  $('loanDate').value = today();
  $('profit').value = 0;
  $('modalTitle').textContent = id ? 'Edit pinjaman' : 'Tambah pinjaman';
  if (id) {
    const l = loans.find(x => x.id === id);
    if (!l) return;
    $('id').value = l.id;
    $('name').value = l.name;
    $('phone').value = l.phone;
    $('amount').value = l.amount;
    $('profit').value = l.profit || 0;
    $('loanDate').value = l.loanDate;
    $('dueDate').value = l.dueDate;
    $('notes').value = l.notes;
  }
  $('loanModal').classList.add('open');
}
function closeLoan() { $('loanModal').classList.remove('open'); }
function closePay() { $('payModal').classList.remove('open'); }

function openPay(l) {
  $('payForm').reset();
  $('payId').value = l.id;
  $('payDate').value = today();
  $('payAmount').max = balance(l);
  $('payInfo').textContent = l.name + ' · Sisa ' + money(balance(l));
  $('payModal').classList.add('open');
}

/* ---------- Simpan pinjaman ---------- */
$('loanForm').onsubmit = async e => {
  e.preventDefault();
  const id = $('id').value;
  const amount = Number($('amount').value);
  const profit = Number($('profit').value || 0);
  const d = {
    name: $('name').value.trim(),
    whatsapp: $('phone').value.trim() || null,
    amount,
    target_profit: profit,
    loan_date: $('loanDate').value,
    due_date: $('dueDate').value || null,
    note: $('notes').value.trim() || null
  };

  if (!d.name) return toast('Nama peminjam wajib diisi.');
  if (!(amount > 0) || profit < 0) return toast('Periksa nominal pinjaman.');
  if (!d.loan_date) return toast('Tanggal pinjam wajib diisi.');

  if (id) {
    const l = loans.find(x => x.id === id);
    if (l && paid(l) > amount + profit) {
      return toast('Total kewajiban baru kurang dari pembayaran yang tercatat.');
    }
  }

  const res = id
    ? await sb.from('loans').update(d).eq('id', id)
    : await sb.from('loans').insert(d);
  if (res.error) return toast('Gagal menyimpan: ' + res.error.message);

  closeLoan();
  toast('Pinjaman tersimpan.');
  await loadAll();
};

/* ---------- Aksi di tabel (edit, bayar, hapus) ---------- */
$('loanRows').onclick = async e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const l = loans.find(x => x.id === b.dataset.id);
  if (!l) return;

  if (b.dataset.act === 'edit') return openLoan(l.id);
  if (b.dataset.act === 'pay') {
    if (status(l) !== 'paid') openPay(l);
    return;
  }
  if (b.dataset.act === 'del') {
    if (!confirm('Hapus pinjaman dan semua riwayat pembayarannya?')) return;
    const { error } = await sb.from('loans').delete().eq('id', l.id);
    if (error) return toast('Gagal menghapus: ' + error.message);
    toast('Pinjaman dihapus.');
    await loadAll();
  }
};

/* ---------- Catat pembayaran ---------- */
$('payForm').onsubmit = async e => {
  e.preventDefault();
  const l = loans.find(x => x.id === $('payId').value);
  const n = Number($('payAmount').value);
  if (!l) return toast('Pinjaman tidak ditemukan. Muat ulang halaman.');
  if (!(n > 0) || n > balance(l)) return toast('Pembayaran harus positif dan tidak melebihi sisa tagihan.');
  if (!$('payDate').value) return toast('Tanggal pembayaran wajib diisi.');

  const { error } = await sb.from('payments').insert({
    loan_id: l.id,
    amount: n,
    payment_date: $('payDate').value,
    note: $('payNote').value.trim() || null
  });
  if (error) return toast('Gagal mencatat pembayaran: ' + error.message);

  closePay();
  toast('Pembayaran dicatat.');
  await loadAll();
};

/* ---------- Laporan ---------- */
function makeReport(silent) {
  const st = $('start').value, en = $('end').value;
  if (!st || !en || st > en) {
    if (!silent) toast('Pilih rentang tanggal yang benar.');
    return;
  }

  const rows = [];
  loans.forEach(l => {
    if (l.loanDate >= st && l.loanDate <= en) {
      rows.push({ date: l.loanDate, type: 'Pinjaman baru', name: l.name, amount: Number(l.amount) });
    }
    l.payments.forEach(p => {
      if (p.date >= st && p.date <= en) rows.push({ date: p.date, type: 'Pembayaran', name: l.name, amount: Number(p.amount) });
    });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  reportRows = rows;

  const lent = rows.filter(x => x.type === 'Pinjaman baru').reduce((s, x) => s + x.amount, 0);
  const payTotal = rows.filter(x => x.type === 'Pembayaran').reduce((s, x) => s + x.amount, 0);
  // Keuntungan periode = keuntungan diterima sampai akhir periode dikurangi sampai awal periode
  const profit = loans.reduce((s, l) => s + profitAt(l, p => p.date <= en) - profitAt(l, p => p.date < st), 0);

  $('rLent').textContent = money(lent);
  $('rPay').textContent = money(payTotal);
  $('rPrincipal').textContent = money(payTotal - profit);
  $('rProfit').textContent = money(profit);
  $('rBalance').textContent = money(loans.reduce((s, l) => s + balance(l), 0));
  $('rPaid').textContent = loans.filter(l => status(l) === 'paid').length;

  $('reportRows').innerHTML = rows.map(r => `<tr>
      <td>${datefmt(r.date)}</td>
      <td>${r.type}</td>
      <td>${esc(r.name)}</td>
      <td>${money(r.amount)}</td>
    </tr>`).join('');
  $('reportEmpty').style.display = rows.length ? 'none' : 'block';
}

/* ---------- Navigasi ---------- */
function page(p) {
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'page-' + p));
  $('pageTitle').textContent = ({ dashboard: 'Dashboard', loans: 'Data Pinjaman', reports: 'Laporan Keuangan', settings: 'Pengaturan' })[p];
  if (p === 'reports') makeReport(true);
}

document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => page(b.dataset.page));
document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => page(b.dataset.goto));
$('newTop').onclick = $('newList').onclick = () => openLoan();
$('closeLoan').onclick = $('cancelLoan').onclick = closeLoan;
$('closePay').onclick = $('cancelPay').onclick = closePay;
$('search').oninput = renderLoans;
$('filter').onchange = renderLoans;

$('makeReport').onclick = () => { makeReport(); toast('Laporan diperbarui.'); };

$('csv').onclick = () => {
  const rows = [['Tanggal', 'Jenis transaksi', 'Peminjam', 'Nominal'], ...reportRows.map(r => [r.date, r.type, r.name, r.amount])];
  const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
  download('laporan-mitradana.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
};
$('print').onclick = () => window.print();

/* ---------- Pengaturan: backup, pulihkan, hapus ---------- */
$('backup').onclick = () => download('mitradana-backup.json', JSON.stringify({ app: 'MITRADANA', loans }, null, 2), 'application/json');

$('restore').onchange = async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    const arr = Array.isArray(data) ? data : data.loans;
    if (!Array.isArray(arr)) throw new Error('format');
    if (!confirm('Backup akan mengganti seluruh data online. Lanjutkan?')) return;

    await deleteAll();
    for (const l of arr) {
      const { data: ins, error } = await sb.from('loans').insert({
        name: l.name,
        whatsapp: l.phone || null,
        amount: Number(l.amount),
        target_profit: Number(l.profit || 0),
        loan_date: l.loanDate,
        due_date: l.dueDate || null,
        note: l.notes || null
      }).select().single();
      if (error) throw error;

      // Insert satu per satu supaya pengecekan sisa tagihan di database berjalan benar
      for (const p of (l.payments || [])) {
        const { error: pe } = await sb.from('payments').insert({
          loan_id: ins.id,
          amount: Number(p.amount),
          payment_date: p.date,
          note: p.note || null
        });
        if (pe) throw pe;
      }
    }
    toast('Backup dipulihkan.');
    await loadAll();
  } catch (err) {
    console.error(err);
    toast('File backup tidak valid atau gagal dipulihkan.');
  }
  e.target.value = '';
};

$('clear').onclick = async () => {
  if (!confirm('Hapus seluruh data pinjaman dan pembayaran di database?')) return;
  try {
    await deleteAll();
    toast('Seluruh data dihapus.');
    await loadAll();
  } catch (err) {
    toast('Gagal menghapus data: ' + err.message);
  }
};

/* ---------- Inisialisasi ---------- */
(function initReportDates() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Senin = 0
  d.setDate(d.getDate() - day);
  const fmt = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  $('start').value = fmt(d);
  d.setDate(d.getDate() + 6);
  $('end').value = fmt(d);
})();

loadAll().then(() => {
  if (new Date().getDay() === 0) {
    setTimeout(() => toast('Pengingat: periksa laporan mingguan MITRADANA.'), 800);
  }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

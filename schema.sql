-- =========================================================
-- MITRADANA — schema Supabase
-- Aman dijalankan ulang (idempotent). Jalankan seluruh file di
-- Supabase Dashboard > SQL Editor > Run.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- Tabel pinjaman (satu baris = satu transaksi) ----------
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text,
  amount numeric not null check (amount > 0),
  loan_date date not null default current_date,
  due_date date,
  target_profit numeric not null default 0 check (target_profit >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Tabel pembayaran ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- Untuk database yang sudah ada sebelumnya
alter table public.payments add column if not exists note text;

create index if not exists idx_payments_loan_id on public.payments(loan_id);
create index if not exists idx_loans_loan_date on public.loans(loan_date);
create index if not exists idx_payments_payment_date on public.payments(payment_date);

-- ---------- Trigger: updated_at otomatis ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_loans_updated_at on public.loans;
create trigger trg_loans_updated_at
  before update on public.loans
  for each row execute function public.set_updated_at();

-- ---------- Trigger: pembayaran tidak boleh melebihi sisa tagihan ----------
-- Pengecekan ini ada di database, jadi tetap berlaku walau ada dua
-- perangkat mencatat pembayaran bersamaan.
create or replace function public.check_payment_limit()
returns trigger language plpgsql as $$
declare
  total_tagihan numeric;
  sudah_dibayar numeric;
begin
  select amount + target_profit into total_tagihan
  from public.loans where id = new.loan_id;

  select coalesce(sum(amount), 0) into sudah_dibayar
  from public.payments where loan_id = new.loan_id;

  if sudah_dibayar + new.amount > total_tagihan then
    raise exception 'Pembayaran melebihi sisa tagihan';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_payment on public.payments;
create trigger trg_check_payment
  before insert on public.payments
  for each row execute function public.check_payment_limit();

-- ---------- Row Level Security ----------
-- Aplikasi ini tanpa login, jadi akses dibuka untuk anon key.
-- Artinya siapa pun yang punya link aplikasi bisa membaca dan mengubah data.
-- Pakai hanya untuk pemakaian pribadi. Untuk multi-user, perlu Supabase Auth.
alter table public.loans enable row level security;
alter table public.payments enable row level security;

drop policy if exists "loans_all" on public.loans;
create policy "loans_all" on public.loans
  for all using (true) with check (true);

drop policy if exists "payments_all" on public.payments;
create policy "payments_all" on public.payments
  for all using (true) with check (true);

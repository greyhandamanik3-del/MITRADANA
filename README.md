# MITRADANA

Aplikasi pencatatan pinjaman. Data tersimpan online di Supabase, dan bisa dibuka dari HP maupun komputer.

## Isi folder

- `index.html`: tampilan (desain asli, script sudah terhubung ke Supabase)
- `app.js`: logika aplikasi (tambah, edit, hapus, pembayaran, laporan, backup)
- `config.js`: URL dan key Supabase
- `schema.sql`: tabel, trigger, dan keamanan di database
- `manifest.json`, `sw.js`: agar bisa dipasang sebagai aplikasi di HP

## 1. Jalankan schema.sql

Buka Supabase → SQL Editor → paste isi `schema.sql` → Run.
File ini aman dijalankan ulang di database yang sudah ada. Yang ditambahkan: kolom catatan pembayaran dan pengecekan agar pembayaran tidak melebihi sisa tagihan.

## 2. Upload ke GitHub

Upload `index.html`, `app.js`, `config.js`, `schema.sql`, `manifest.json`, `sw.js`, dan `README.md` ke repo.
Hapus `styles.css` dari repo jika sudah pernah diupload, karena CSS sekarang sudah ada di dalam `index.html`.

## 3. Deploy ke Vercel

Login Vercel pakai akun GitHub → Add New → Project → pilih repo → Deploy.
Tidak perlu setting apa pun karena ini situs statis.

## Catatan keamanan

Key di `config.js` adalah publishable key, jadi memang aman ada di frontend. Tapi karena aplikasi tanpa login, siapa pun yang tahu link aplikasi bisa membaca dan mengubah data. Bagikan link hanya ke orang yang dipercaya. Jangan pernah memasukkan service_role key ke file mana pun.

## Rumus keuntungan

```
total tagihan       = pokok + target keuntungan
sisa tagihan        = total tagihan - total pembayaran (tidak pernah negatif)
keuntungan diterima = dihitung dari pembayaran setelah pokok lunas dibayar,
                      dibatasi target keuntungan
```

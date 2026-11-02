# POIN Quest

Checklist kegiatan harian agen asuransi (Sistem Management Kegiatan Vision), dihitung jadi XP.
Tim Protekinaja. Setiap akun punya data sendiri: XP, log, catatan harian, Daftar Nama dan Leads, serta Jadwal. Semua tersimpan otomatis dan tersinkron ke semua perangkat.

## Isi folder

| File | Fungsi |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Aplikasinya |
| `config.js` | **Satu-satunya file yang perlu kamu isi**: alamat proyek dan kunci publik Supabase |
| `vendor/supabase.js` | Pustaka Supabase (versi 2.117.3), disimpan di sini supaya tidak bergantung CDN |
| `manifest.webmanifest`, `sw.js`, `icons/` | Supaya bisa dipasang di layar utama dan tetap terbuka saat offline |
| `supabase/schema.sql` | Tabel (aksi, pengaturan, catatan harian, daftar nama, jadwal) dan aturan akses. Jalankan sekali di SQL Editor Supabase |

Ikon di folder `icons/` hanya tulisan "POIN" sementara, belum logo final.

Langkah lengkapnya ada di dokumen panduan setup.

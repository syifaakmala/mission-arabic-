# Mission Arabic

Website game edukasi Bahasa Arab dengan empat jenis misi dan tiga tingkat kesulitan dalam rentang CEFR A1–A2.

Versi framework pada paket ini menggunakan **Next.js 15.5.29** (rilis keamanan Maintenance LTS per 3 November 2026).

## Isi permainan

- **Level Mudah (A1):** pengenalan kosakata dan dialog dasar.
- **Level Sedang (A1–A2):** penguatan kosakata dan dialog sederhana.
- **Level Sulit (A2):** kosakata lebih luas dan percakapan sehari-hari yang lebih kontekstual.
- **4 misi di setiap level:** Memory Game, Word Search, Arrange the Letters, dan Arabic Conversation Challenge.
- **9 tema terpisah di setiap misi:** buah-buahan, hewan, keluarga dan rumah, sekolah dan kelas, makanan dan minuman, waktu dan hari, angka, profesi, serta tempat umum.
- Skor XP, status penyelesaian, dan progres tersimpan di `localStorage` browser.
- Audio pelafalan menggunakan Web Speech API (`speechSynthesis`) dari browser/perangkat.

## Persyaratan

- Node.js 20.9 atau lebih baru.
- npm.
- Browser modern. Chrome atau Edge direkomendasikan untuk dukungan text-to-speech yang lebih konsisten.

## Menjalankan di komputer

1. Ekstrak ZIP.
2. Buka folder `mission-arabic` melalui VS Code atau terminal.
3. Jalankan:

   ```bash
   npm install
   npm run dev
   ```

4. Buka `http://localhost:3000` di browser.

Untuk memeriksa TypeScript:

```bash
npm run typecheck
```

Untuk membuat build produksi:

```bash
npm run build
npm run start
```

## Upload ke GitHub

1. Buat repository baru di GitHub, misalnya `mission-arabic`.
2. Ekstrak ZIP ini dan buka terminal di folder hasil ekstrak.
3. Jalankan perintah berikut (ganti URL dengan URL repository milikmu):

   ```bash
   git init
   git add .
   git commit -m "Initial Mission Arabic website"
   git branch -M main
   git remote add origin https://github.com/USERNAME/mission-arabic.git
   git push -u origin main
   ```

## Deploy ke Vercel

1. Masuk ke [Vercel](https://vercel.com/) dan pilih **Add New → Project**.
2. Import repository `mission-arabic` dari GitHub.
3. Framework akan terdeteksi sebagai **Next.js** secara otomatis.
4. Biarkan Build Command dan Output Directory menggunakan pengaturan default.
5. Klik **Deploy**.

Tidak ada environment variable yang wajib diisi untuk versi awal ini.

## Catatan penting

- Versi awal ini tidak membutuhkan database, login, atau API eksternal.
- Progres tersimpan pada browser/perangkat yang digunakan. Progres tidak otomatis tersinkron antarperangkat atau antarbrowser.
- Audio menggunakan suara Bahasa Arab yang tersedia pada sistem operasi/browser. Ketersediaan dan kualitas suara dapat berbeda antarperangkat. Jika suara Arab tidak tersedia, fitur permainan tetap dapat digunakan.
- Ilustrasi kosakata menggunakan emoji agar versi awal ringan dan tidak bergantung pada layanan gambar eksternal. Aset ilustrasi khusus dapat ditambahkan pada tahap pengembangan berikutnya.
- Materi percakapan dan kosakata merupakan konten awal untuk prototipe pembelajaran A1–A2 dan sebaiknya ditinjau kembali oleh pengajar Bahasa Arab sebelum digunakan sebagai materi pembelajaran resmi.

## Struktur folder

```text
mission-arabic/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── mission-arabic-app.tsx
├── lib/
│   └── content.ts
├── public/
├── .gitignore
├── next.config.mjs
├── next-env.d.ts
├── package.json
└── tsconfig.json
```

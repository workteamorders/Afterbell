# Afterbell: tiga arah konsep visual (Langkah 0)

Kepribadian merek: Tenang, Presisi, Transparan. Semua rasio kontras di bawah dihitung dengan rumus WCAG 2.x terhadap permukaan dasar kecuali disebut lain.

---

## A. Afterhours Almanac

**a. Ide inti.** Afterbell sebagai almanak malam: tabel waktu dan angka yang tenang, dibaca di bawah lampu setelah bel penutupan.

**b. Dunia.** Almanak astronomi dan ephemeris: tabel terbit-terbenam dan fase bulan yang memprediksi siklus dengan presisi dan mencantumkan dasar hitungannya. Cocok karena inti produk adalah waktu (sesi New York vs pasar on-chain 24/7) dan angka bersumber, dan penggunanya (trader di luar AS) sering membuka aplikasi saat malam di New York.

**c. Palet (gelap utama).**

| Peran | Nama | Hex | Kontras |
|---|---|---|---|
| Permukaan dasar | Night ink | `#0E1311` | |
| Permukaan kedua | Raised ink | `#161D1A` | |
| Teks utama | Moonpaper | `#ECE6D6` | 15,1:1 |
| Teks redup | Lichen | `#9DA69E` | 7,5:1 |
| Aksen utama (tombol utama, teks `#0E1311` di atasnya) | Brass | `#E2B85E` | 10,1:1 |
| Aksen pendukung (tautan, garis data) | Sea-glass | `#86C5B8` | 9,6:1 |

Status: sukses `#6FCF97`, bahaya `#FF8A7A`, peringatan `#F39A52`, info `#93B6EA` (semua di atas 8:1). Garis input `#6E7B74` (4,2:1). Mode terang ("day edition") dirancang sebagai varian penuh, bukan dibalik otomatis.

**d. Font.** Newsreader (display; serif dengan optical size 6 sampai 72, tenang seperti judul almanak, punya tabular figures) + Familjen Grotesk (isi dan UI; grotesk jernih, punya tabular figures) + Spline Sans Mono (alamat, hash, kolom angka).

**e. Bahasa bentuk.** Radius 2px. Garis rambut 1px. Lapisan dipisah dengan beda nada, tanpa bayangan. Tabel adalah komponen utama. Ikon garis 1,5px, ujung bulat. Tanpa tekstur. Gerak: linear yang tenang, seperti jarum jam; tidak ada pantulan.

**f. Detail khas.** Dial sesi 24 jam: cincin tipis di header yang menunjukkan busur sesi New York dalam jam lokal pengguna, titik "sekarang", tanda tutup awal dan hari libur. Ditambah garis titik-titik yang menghubungkan label dan angka di ringkasan biaya, seperti baris almanak.

**g. Risiko.** Gelap-utama mudah terbaca sebagai "crypto dark mode" generik. Judul serif bisa terasa lambat bagi trader aktif. Brass dan oranye peringatan berdekatan rona, jadi peringatan wajib selalu membawa ikon dan label. Mode terang menuntut pekerjaan desain kedua.

**Bukan gaya terlarang karena:** hijau-hitam tanpa panel putih terangkat dan tanpa biru tua.

---

## B. Sounding Chart (direkomendasikan)

**a. Ide inti.** Setiap saham tokenisasi dibaca seperti peta laut: seberapa dalam airnya (likuiditas), siapa yang menyurvei dan kapan (sumber dan tanggal periksa), dan di mana bahayanya (batasan hak dan wilayah).

**b. Dunia.** Peta navigasi laut. Konvensinya sama persis dengan kebutuhan produk: angka kedalaman dan garis kontur; diagram sumber data dan tanggal survei di tiap lembar; legenda yang menjelaskan simbol (padanan /methodology); magenta untuk informasi yang tidak boleh terlewat. Navigator tidak butuh hiasan, mereka butuh angka yang bisa dipercaya.

**c. Palet (terang utama, dengan "night chart").**

| Peran | Nama | Hex | Kontras |
|---|---|---|---|
| Permukaan dasar | Chart paper | `#F5F8F6` | |
| Permukaan kedua | Shoal | `#E2EEEC` | |
| Permukaan ketiga (hover, terpilih) | Deep shoal | `#CDE1DF` | |
| Teks utama | Sounding ink | `#11252A` | 14,9:1 |
| Teks redup | Survey grey | `#43595F` | 5,4:1 di permukaan ketiga |
| Aksen utama (tombol utama, teks putih) | Chart magenta | `#A01E6C` | 7,3:1 |
| Aksen pendukung (kontur, tautan) | Contour teal | `#1C6B74` | 5,8:1 |

Status: sukses `#17663F`, bahaya `#B3261E`, peringatan `#7F4F00`, info `#2A5C9A` (semua di atas 4,5:1 di ketiga permukaan). Garis input `#6A8589` (3,3 sampai 3,7:1).
Night chart: dasar `#0B1517`, teks `#D5E4E1`, magenta `#E57DB9` (teks gelap di atasnya 7,0:1), teal `#6FC0C4`. Alasan dua mode: peta elektronik di anjungan kapal memang punya palet siang dan malam.

**d. Font.** Archivo, variabel dengan sumbu lebar 62 sampai 125: semi-condensed untuk label dan tabel padat, normal untuk isi, expanded untuk judul; italic untuk anotasi, mengikuti konvensi kartografi yang menulis nama perairan miring; punya tabular figures. Ditambah Red Hat Mono untuk angka kedalaman, alamat, dan hash.

**e. Bahasa bentuk.** Radius 4px. Garis 1px. Lapisan dipisah dengan tingkat kedalaman tint, bukan bayangan. Hanya dialog dan sheet yang melayang (garis 1px + bayangan sangat tipis). Motif kontur dipakai hemat di 4 tempat: meter likuiditas, latar hero, 404, perayaan swap. Ikon garis 1,5px bergaya simbol peta. Gerak: mengendap seperti air tenang, ease-out tanpa pantulan; perayaan berupa riak kontur yang meluas sekali (transform + opacity).

**f. Detail khas.** Meter likuiditas sebagai sounding: tiga angka (100, 1.000, 10.000 dolar) dicetak di dalam pita kontur Deep, Medium, Thin. Ditambah kotak sumber di setiap token, meniru diagram sumber data peta laut: "Source: issuer prospectus · Last checked 4 Nov 2026".

**g. Risiko.** Metafora bisa kebablasan; copy wajib tetap harfiah ("Liquidity: Deep", bukan istilah pelaut). Garis kontur gampang berubah jadi hiasan. Teal umum di fintech. Magenta bisa terasa main-main bila dipakai lebih luas dari tombol utama. Tint terdalam membatasi warna status yang boleh diletakkan di atasnya.

**Bukan gaya terlarang karena:** tidak ada panel putih terangkat (lapisan adalah tint datar), aksen magenta bukan biru tua.

---

## C. Annotated Term Sheet

**a. Ide inti.** Afterbell sebagai term sheet yang sudah dibaca dan dianotasi orang yang teliti: setiap klaim punya catatan kaki, angka yang menentukan keputusan diberi stabilo.

**b. Dunia.** Dokumen keuangan bergaya tipografi Swiss (term sheet, prospektus, laporan tahunan), yaitu bentuk hukum produk ini sendiri (tracker certificate, structured note). Pensil biru dan stabilo editor mewakili transparansi: kami membaca dokumennya dan menunjukkan di mana kami membacanya.

**c. Palet (terang utama, varian gelap "carbon copy").**

| Peran | Nama | Hex | Kontras |
|---|---|---|---|
| Permukaan dasar | Sheet | `#FBFBF9` | |
| Permukaan kedua | Ledger band | `#EFEFEA` | |
| Teks utama | Ink | `#141414` | 17,8:1 |
| Teks redup | Graphite | `#5A5A55` | 6,7:1 |
| Aksen utama (hanya isian di belakang teks tinta) | Highlighter | `#D9F25E` | tinta di atasnya 14,8:1 |
| Aksen pendukung (catatan kaki, tautan) | Blue pencil | `#2B47C9` | 7,1:1 |

Status: sukses `#1C7436`, bahaya `#BD2430`, peringatan `#855600`, info memakai blue pencil. Garis `#8A8A84` (3,4:1). Tombol utama: isian stabilo + garis tinta 1px agar batasnya lolos 3:1.

**d. Font.** Schibsted Grotesk (UI, tabel, angka; grotesk koran dengan tabular figures) + Spectral (serif untuk teks panjang: metodologi, risiko, catatan kaki; dirancang untuk membaca dokumen di layar).

**e. Bahasa bentuk.** Sudut 0px. Grid 12 kolom yang terlihat lewat garis rambut. Lapisan dipisah dengan garis, bukan bayangan atau warna. Angka besar. Ikon garis 1,25px bersudut tajam. Gerak: bertahap dan tegas, seperti tanda yang dibubuhkan.

**f. Detail khas.** Sistem catatan kaki: setiap label hak, angka, dan status punya superscript biru; fokus atau hover membuka catatan di margin (desktop) atau di bawah baris (HP) berisi sumber dan tanggal. Ditambah sapuan stabilo di atas total biaya tepat sebelum tombol tanda tangan.

**g. Risiko.** Paling dekat ke rasa "formulir bank yang kaku" yang dilarang. Stabilo lime bisa terbaca neon crypto bila tidak hemat. Dingin secara emosi. Catatan kaki padat bisa sesak di HP.

**Bukan gaya terlarang karena:** lembar putih dengan garis rambut, bukan krem bergaris tebal dengan bayangan keras.

---

## Rekomendasi: B, Sounding Chart

Metafora peta laut memuat empat pertanyaan inti produk tanpa dipaksa: kedalaman adalah likuiditas, tanggal survei adalah "Last checked", legenda adalah /methodology, dan magenta menandai satu hal yang harus dilakukan. Terang-utama lebih nyaman untuk membaca teks hak dan risiko yang panjang, sementara palet malam punya alasan nyata (peta kapal siang dan malam), bukan sekadar mode gelap. Arah ini juga paling jauh dari gaya Theorem, hood.exe, dan template AI.

Arah A paling kuat untuk detail jam pasar tetapi mengorbankan keterbacaan teks hukum. Arah C paling jujur secara tipografi tetapi paling berisiko terasa kaku. Bila B dipilih, dial sesi dari A bisa dipinjam sebagai komponen status pasar dalam bahasa bentuk B.

# Afterbell: keputusan dan hasil verifikasi

Tanggal pemeriksaan: 2026-11-04 (WITA). Tahap: aplikasi selesai dibangun (Beranda, Jelajah, detail token, Portofolio, Methodology, Help, Risk/Terms/Privacy, 404/offline/error, SEO), Stage 2 dihentikan di pemeriksaan toolchain. Bagian 0 sampai 12 ditulis pada tahap riset; bagian 13 mencatat keputusan dan temuan tahap pembangunan.

Dokumen ini dicatat menurut aturan di Bagian 0: identifier hanya dari dokumentasi resmi atau panggilan langsung; bila keduanya berbeda, perilaku langsung menang dan selisihnya dicatat di bawah.

## 0. Cara verifikasi dan batasannya

- Shell di sesi ini (container cloud maupun VM di mesin pemilik) hanya bisa menjangkau registry paket (npm, PyPI). Panggilan ke RPC Solana, Jupiter, dan situs penerbit dari shell ditolak oleh proxy.
- Panggilan langsung dilakukan lewat dua jalur:
  1. `fetch()` dari panel browser bawaan aplikasi desktop (jaringan asli pemilik). Jalur ini sempat berfungsi, lalu terputus di tengah sesi.
  2. Permintaan GET lewat alat pengambil web (untuk API publik berbasis GET: Jupiter `/order`, Jupiter Tokens, xStocks API).
- Akibatnya: pemeriksaan on-chain per mint (keberadaan akun, program pemilik, decimals) BELUM dilakukan langsung ke RPC. Itu menjadi tugas `pnpm registry:check` di tahap pembangunan. Angka decimals di bawah berasal dari Jupiter Tokens API (indeks Jupiter, bukan RPC) dan ditandai begitu.

## 1. Status daftar "Belum terverifikasi"

| Item | Status | Ringkasan |
|---|---|---|
| Mint, program token, decimals | Sebagian | Mint xStocks dari API resmi xStocks. Program Token-2022 (dokumen xStocks + Jupiter Tokens API). Decimals dari Jupiter Tokens API. Cek on-chain mentah tertunda ke `registry:check`. Ondo, Backpack, PreStocks: lihat §4. |
| Syarat dan batasan wilayah penerbit | Sebagian | Ondo: daftar lengkap. Backpack: AS, Inggris, UEA, Jepang. xStocks: bukan untuk AS / US Persons; daftar lengkap ada di assets.backed.fi (belum dibaca). PreStocks: bukan untuk AS / US persons; syarat lengkap belum dibaca. |
| Sumber harga saham dasar gratis berizin jelas | Diperiksa, tidak ada | Fitur premium/diskon tampil "Not available". Lihat D-013. |
| Kalender libur bursa AS | Terverifikasi | Tabel resmi NYSE 2026 sampai 2028, termasuk tutup awal 13.00 ET. |
| Batas Jupiter per IP atau per proyek; izin komersial | Sebagian | Dengan key: per organisasi (dokumen resmi). Tanpa key: cakupan tidak disebut. Lisensi API ambigu untuk produk komersial; perlu persetujuan tertulis (langkah manual pemilik). |
| Referral account Jupiter dimiliki PDA | Secara teknis mungkin, belum dibuktikan | IDL program referral: `partner` bukan signer saat inisialisasi dan saat `claim`. Halaman fees Jupiter (dibaca ulang 2026-11-04) tidak menyinggung kepemilikan PDA. Gerbang P tidak dijalankan (tanpa toolchain). |
| CPI Jupiter dari vault PDA | Belum (Tahap 2) | Hanya relevan untuk Tahap 2. |
| Rust, Solana CLI, Anchor | Diperiksa 2026-11-04 | Container cloud: rustc dan cargo ada; Solana CLI dan Anchor tidak ada. VM pada mesin pemilik: ketiganya tidak ada. Tidak dipasang (aturan). Tahap 2 berhenti; lihat `docs/STAGE2-FEE-ROUTER-SPEC.md`. |

## 2. Selisih dokumentasi vs perilaku langsung

1. **Batas Jupiter tanpa key.** Dokumen: 0,5 RPS, 30 per menit. Langsung (2026-11-04): respons `/swap/v2/order` tanpa key membawa `x-ratelimit-current: 1` dan `x-ratelimit-remaining: 19`, artinya kuota jendela 20. Yang dipakai: anggaran 20 permintaan per 60 detik per klien.
2. **Field respons `/order`.** Respons langsung masih memuat `priceImpactPct` dan `swapType` (keduanya ditandai deprecated di dokumen) serta field yang tidak didokumentasikan: `jitOptimized`, `guaranteedPrice`. Kode hanya membaca field yang terdokumentasi; field deprecated tidak dipakai.
3. **RPC publik Solana.** Sumber sekunder: 100 permintaan per 10 detik per IP. Langsung dari browser (origin `https://example.com`): HTTP 403 `"Access forbidden"`. Tidak dipakai, baik dari browser maupun dari function.
4. **dRPC tanpa key.** Sumber sekunder menyebut tier gratis besar. Langsung: `"chain is not available on free plan, please upgrade to paid plan"` (code 35).
5. **Program token xStocks.** Pine Analytics menyebut "SPL tokens". Dokumen developer xStocks dan Jupiter Tokens API: Token-2022 dengan ekstensi Scaled UI Amount.
6. **Jaminan xStocks.** Halaman legal xStocks: "fully collateralized by the corresponding underlying asset". Pine Analytics mengutip pengungkapan bahwa jaminan "may not always consist of the underlying shares". Label hak xStocks baru ditulis setelah prospektus di assets.backed.fi dibaca.
7. **Kedalaman pasar dari `priceImpact`.** Kuotasi langsung 1.000 USDC ke TSLAx dan ke TSLAon keduanya dirutekan 100% lewat JupiterZ (RFQ), `priceImpact` sekitar 0. Jupiter Tokens API mencatat likuiditas DEX TSLAon sekitar 0,45 dolar. Jadi `priceImpact` saja tidak menggambarkan kedalaman untuk rute RFQ. Lihat D-007.

## 3. Jupiter (sumber: developers.jup.ag)

- Kuotasi: `GET https://api.jup.ag/swap/v2/order`. Eksekusi: `POST https://api.jup.ag/swap/v2/execute` dengan `signedTransaction` (base64) dan `requestId`. Header key: `x-api-key`.
- Tanpa `taker`, `/order` hanya memberi kuotasi (`transaction: null`). Dengan `taker`, `transaction` kosong berarti gagal dibangun; baca `router` + `errorCode`.
- `/execute` hanya untuk transaksi dari `/order`. Rute JupiterZ menambahkan tanda tangan market maker saat `/execute`, jadi pengiriman wajib lewat `/execute`, bukan RPC sendiri.
- Transaksi versi 1 butuh `@solana/kit` v8+. Default `maxSupportedTransactionVersion` adalah `"0"`; Afterbell memakai default demi kompatibilitas wallet.
- Fee: `referralAccount` + `referralFee` (50 sampai 255 bps). Jupiter mengambil 20% fee integrator. Tidak ada platform fee terpisah saat referral aktif. Bila referralTokenAccount untuk `feeMint` belum ada, swap tetap jalan tanpa fee integrator dan respons kembali ke platform fee default.
- Platform fee default: 0 (JUP/JLP/jupSOL dari SOL atau stable; pasangan pegged), 2 (SOL-stable), 5 (LST-stable), 10 (lainnya), 50 (token di bawah 24 jam). Kuotasi langsung USDC ke TSLAx dan TSLAon: 10 bps.
- Prioritas `feeMint`: SOL, stablecoin, LST, bluechip, lainnya.
- Field fee pada respons: `feeBps` (total), `feeMint`, `platformFee.{amount,feeBps,feeMint}`, `referralAccount`.
- Referral account versi 2: referralTokenAccount = ATA dari (`mint`, `referralAccount`, owner off-curve diizinkan, program token yang sesuai). Bisa diperiksa keberadaannya dengan `getMultipleAccounts` (sumber: `@jup-ag/referral-sdk` 0.3.0).
- Program referral: `REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3`. Project Jupiter (dari dokumen fee): `DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc`. Dashboard: referral.jup.ag.
- IDL (`@jup-ag/referral-sdk` 0.3.0): `initializeReferralAccountWithName` dan `claim` memperlakukan `partner` sebagai non-signer; `claim` membayar ke ATA milik `partner`. `transferReferralAccount` mewajibkan tanda tangan `partner`.
- Batas laju (dokumen): Keyless 0,5 RPS; Free 1 RPS (key wajib); per organisasi, bukan per key. Jendela geser 60 detik. `/swap/v2/execute` punya bucket sendiri (Keyless 20 RPS, Free 50 RPS). Header: `x-ratelimit-remaining`, `x-ratelimit-current`, `x-ratelimit-reset`. CORS dari browser: berfungsi (langsung).
- Lisensi (SDK & API License Agreement): lisensi dirumuskan untuk "internal development efforts"; larangan sublicense/menjual konten API; wajib menampilkan "Powered by Jupiter" (§8.4) dan melabeli API yang dipakai dengan benar (§2.3); wajib mematuhi hukum termasuk menyaring dan memblokir wallet yang dibatasi (§7.3); penggunaan di luar perjanjian butuh persetujuan tertulis lewat info@jup.ag (§2.4); hukum Panama. Ini bukan nasihat hukum.

## 4. Penerbit dan mint

Mint di bawah belum diperiksa on-chain secara langsung (lihat §0).

| Simbol | Mint | Sumber mint | Program (sumber) | Decimals (Jupiter Tokens API) |
|---|---|---|---|---|
| TSLAx | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` | api.xstocks.fi `/api/v2/public/assets/TSLAx` | Token-2022 | 8 |
| NVDAx | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | api.xstocks.fi `/api/v2/public/assets/NVDAx` | Token-2022 | 8 |
| CRCLx | `XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1` | api.xstocks.fi `/api/v2/public/assets/CRCLx` | Token-2022 | belum dicek |
| SPYx | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` | api.xstocks.fi `/api/v2/public/assets/SPYx` | Token-2022 | belum dicek |
| TSLAon | `KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo` | BELUM resmi (Jupiter Tokens API, Solflare) | Token-2022 | 9 |
| SPCX | `SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb` | BELUM resmi (Jupiter Tokens API: "SpaceX - Backpack Securities") | Token-2022 | 6 |

Catatan per penerbit:

- **xStocks (Backed Assets (JE) Limited, Jersey).** Bearer debt instrument berbentuk tracker certificate; prospektus dasar disetujui FMA Liechtenstein; tanpa hak suara. Token-2022 dengan Scaled UI Amount (saldo tampil = saldo mentah × multiplier). Primary market (issuance/redemption) butuh onboarding KYC/AML dan wallet yang di-whitelist; batas order primary minimal 1.000 dolar menurut API. Tidak untuk AS / US Persons. ToS melarang penggunaan komersial situs dan data-mining.
- **Ondo Global Markets (Ondo Global Markets (BVI) Limited).** Structured note (debt instrument), hukum Swiss lewat Sales Terms, tanpa hak pemegang saham; jaminan 1:1 plus buffer, security agent dengan hak jaminan prioritas pertama; Regulation S. Dilarang untuk: Afghanistan, Belarus, Kanada, Krimea/Donetsk/Luhansk/Kherson/Zaporizhzhia/Sevastopol, Kuba, Korea Utara, Iran, Libya, Myanmar, Rusia, Somalia, Sudan Selatan, Sudan, Suriah, Amerika Serikat. Daftar mint resmi: CSV Dropbox yang ditautkan dari docs.ondo.finance/addresses (alat pengambil diblokir robots.txt) atau API `api.gm.ondo.finance/v1/assets/all/addresses` (wajib key). Program Ondo Stocks: `XzTT4XB8m7sLD2xi6snefSasaswsKCxx5Tifjondogm`.
- **Backpack Securities (SPCX).** Menurut artikel Backpack sendiri (learn.backpack.exchange, diperbarui 2026-07-22): token adalah klaim atas SPV, 1:1 lewat mint dan redeem; dapat ditebus menjadi saham dan dipindah lewat infrastruktur ACATS/DTCC; tidak tersedia di AS, Inggris, UEA, Jepang, dan tidak di Backpack EU. Halaman resmi yang memuat mint belum ditemukan. Backpack memperingatkan airdrop palsu bertema saham tokenisasi pada 2026-11-03 dan merujuk ke "official Solana mint directory" miliknya.
- **PreStocks.** Situs resmi: eksposur ekonomi lewat SPV, tanpa kepemilikan atau hak suara, dividen, informasi; tidak untuk AS / US persons. Mint tidak tercantum di situs. Pine Analytics mencatat sengketa Mei 2026 (Anthropic dan OpenAI menyatakan transfer saham terkait tidak sah).

## 5. RPC

- `solana-rpc.publicnode.com`: berfungsi tanpa key dari browser (langsung, `getAccountInfo` USDC: program `spl-token`, decimals 6). Syarat penggunaannya belum dibaca.
- Helius Free (halaman harga): 1 juta kredit/bulan, 10 RPS, `sendTransaction` 1/detik, `getProgramAccounts` 5/detik.
- Pilihan penyedia dan kuncinya adalah langkah manual pemilik. Function dibuat agnostik penyedia (`RPC_UPSTREAM_URL` di variabel lingkungan Cloudflare).

## 6. Hosting (Cloudflare)

- Self-Serve Subscription Agreement (terakhir diperbarui 2025-09-12): tidak ada larangan eksplisit penggunaan komersial pada plan gratis. Ada larangan relevan: §2.2.1(j) "virtual private network or other similar proxy services" dan §2.2.1(h) memproses data kartu kredit di properti plan gratis. `/api/rpc` adalah relay terbatas untuk aplikasi sendiri (allowlist metode, asal dibatasi); tetap masuk daftar tinjauan pemilik.
- Halaman dokumentasi Pages kini menulis "Start new projects with Workers."
- Function Pages dihitung ke kuota Workers Free: 100.000 permintaan/hari (reset 00.00 UTC), CPU 10 ms per permintaan, 50 subrequest. Aset statis gratis tanpa batas.
- Rate Limiting binding: periode 10 atau 60 detik, per lokasi, perkiraan (eventually consistent). Ketersediaan di plan gratis dan di Pages Functions tidak disebut di dokumen.

## 7. Kalender bursa (sumber: nyse.com/markets/hours-calendars, dicek silang dengan nasdaq.com untuk 2026)

| Libur | 2026 | 2027 | 2028 |
|---|---|---|---|
| New Year's Day | 1 Jan | 1 Jan | tidak ada (jatuh hari Sabtu) |
| Martin Luther King, Jr. Day | 19 Jan | 18 Jan | 17 Jan |
| Washington's Birthday | 16 Feb | 15 Feb | 21 Feb |
| Good Friday | 3 Apr | 26 Mar | 14 Apr |
| Memorial Day | 25 Mei | 31 Mei | 29 Mei |
| Juneteenth | 19 Jun | 18 Jun (observed) | 19 Jun |
| Independence Day | 3 Jul (observed) | 5 Jul (observed) | 4 Jul |
| Labor Day | 7 Sep | 6 Sep | 4 Sep |
| Thanksgiving Day | 26 Nov | 25 Nov | 23 Nov |
| Christmas Day | 25 Des | 24 Des (observed) | 25 Des |

Tutup awal 13.00 ET: 27 Nov 2026, 24 Des 2026, 26 Nov 2027, 3 Jul 2028, 24 Nov 2028. Jam reguler 09.30 sampai 16.00 ET.

## 8. Harga saham dasar

- Pyth: Hermes wajib API key sejak upgrade Pyth Core 2026-08-26 (uji coba gratis, lalu berbayar). Daftar sponsored push feed Solana yang terbaca tidak menunjukkan ekuitas AS; ada pemberitahuan deprecation push feed Solana per 2026-11-15.
- Ondo: endpoint harga mencakup harga token dan harga saham dasar, tetapi wajib key, "intended for display only", tanpa syarat lisensi tertulis (rujukan: support@ondo.finance).
- xStocks: endpoint publik `/public/assets/{symbol}/price-data` ada (`{"quote":398.09}` untuk TSLAx), tetapi ToS membatasi penggunaan komersial dan tidak ada syarat API tertulis.

## 9. Versi paket (npm, 2026-11-04)

next 16.4.5 · react 19.3.1 · @solana/kit 8.6.0 · @solana/react 8.6.0 · @wallet-standard/react 1.0.3 · @solana/wallet-adapter-react 0.15.40 · zod 4.6.7 · wrangler 4.157.0 · vitest 5.1.0 · @playwright/test 1.64.1 · pnpm 12.16.1 (belum terpasang di VM).

Next.js 16.4.5 (`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`): `output: 'export'` didukung. Tidak didukung saat export: rute dinamis tanpa `generateStaticParams()`, Route Handler yang membaca Request, cookies, rewrites, redirects, headers, proxy, ISR, Server Actions, optimasi gambar dengan loader bawaan.

## 10. Keputusan

- **D-001 Folder kerja.** `/Users/aldy/Project/WP/Afterbell` (folder yang dipilih pemilik; sama dengan `afterbell` di spesifikasi pada APFS bawaan yang tidak peka huruf besar-kecil). Folder `../theorem` tidak terhubung ke sesi ini dan belum dibaca.
- **D-002 Hosting tetap Cloudflare Pages + Pages Functions** sesuai spesifikasi, walau Cloudflare menyarankan Workers untuk proyek baru. Function ditulis tipis agar pindah ke Workers Static Assets tidak mengubah aplikasi.
- **D-003 Satu function `/api/rpc` dengan dua peran.** POST: relay JSON-RPC baca. GET: status geo (negara dari Cloudflare, `blocked: boolean`). Alasan: static export tidak bisa membaca header permintaan, dan spesifikasi membatasi kode server pada satu function.
- **D-004 Allowlist metode:** `getAccountInfo`, `getMultipleAccounts`, `getBalance`, `getLatestBlockhash`, `simulateTransaction`, `getSignatureStatuses`, `sendTransaction`. Selain itu ditolak, termasuk `getProgramAccounts` dan `getTokenAccountsByOwner`. `sendTransaction` disimpan hanya sebagai cadangan; jalur utama kirim adalah Jupiter `/execute` (wajib untuk rute RFQ).
- **D-005 Batas laju function:** Rate Limiting binding bila tersedia di plan gratis (diuji saat deploy); bila tidak, token bucket per isolate sebagai upaya terbaik, dicatat sebagai batasan.
- **D-006 Jupiter dipanggil langsung dari browser tanpa key.** Kunci tidak boleh ada di klien, dan proxy berkunci akan membagi 1 RPS per organisasi ke semua pengguna. Anggaran per klien 20 per 60 detik (perilaku langsung), dengan cache 10 detik, penggabungan permintaan, dan antrean. Meter likuiditas dihitung di halaman detail dan saat diminta; daftar Jelajah hanya memakai nilai dari cache.
- **D-007 Metrik meter likuiditas.** Karena rute RFQ memberi `priceImpact` sekitar 0, meter memakai harga efektif per unit pada 100, 1.000, dan 10.000 dolar, dihitung dari `inAmount`/`outAmount`, lalu penurunan harga efektif dibanding kuotasi 100 dolar, ditambah jenis rute (`router`). Ambang Dalam/Sedang/Tipis ditetapkan dari data langsung saat pembangunan dan ditulis di /methodology.
- **D-008 Biaya Afterbell yang ditampilkan** = `feeBps` respons hanya bila `referralAccount` respons sama dengan milik Afterbell dan `feeBps` sama dengan `referralFee` yang diminta; selain itu 0. Ditambah cek keberadaan referralTokenAccount (ATA) untuk `feeMint`. Uji langsung butuh referral account milik pemilik.
- **D-009 Alur transaksi.** `/order` dengan `taker` → `simulateTransaction` lewat `/api/rpc` (`sigVerify: false`) → wallet menandatangani (Wallet Standard) → `/execute` → status dan tautan explorer. Bila Jupiter menanggung biaya jaringan (`signatureFeePayer` bukan taker), UI menyebutkannya.
- **D-010 Wallet:** `@solana/kit` + `@solana/react` + `@wallet-standard/react` (berbasis Wallet Standard, dipelihara aktif, mendukung transaksi v1).
- **D-011 Token-2022 Scaled UI Amount.** Jumlah tampil = mentah × multiplier ÷ 10^decimals; multiplier dibaca dari ekstensi mint (`jsonParsed`). Jumlah ke Jupiter selalu mentah.
- **D-012 Fakta kendali penerbit on-chain** (freeze authority, permanent delegate, pausable, transfer hook) dicatat `registry:check` dan ditampilkan sebagai fakta, bukan penilaian. Usulan; diputuskan saat pembangunan.
- **D-013 Premium/diskon: "Not available"** sampai ada sumber gratis berizin jelas. Tidak ada scraping.
- **D-014 Kalender** disimpan sebagai data bersumber (2026 sampai 2028). Di luar rentang itu, status pasar menampilkan "calendar not loaded" alih-alih menebak.
- **D-015 Isi registry awal** hanya token dengan mint dari sumber resmi penerbit. xStocks lewat API resmi. Ondo, SPCX, PreStocks masuk setelah sumber resmi didapat (CSV Ondo lewat browser atau diunduh pemilik; direktori mint resmi Backpack; dokumen PreStocks).
- **D-016 Penyaringan wallet (lisensi Jupiter §7.3).** Usulan: daftar blokir sisi klien dari data OFAC SDN (data publik pemerintah AS) untuk alamat Solana. Perlu dicek apakah SDN memuat alamat SOL. Pilihan penyedia penyaringan tetap keputusan pemilik.
- **D-017 Atribusi Jupiter.** "Powered by Jupiter" tampil di alur swap; label API dan router mengikuti §2.3. Rumusan label pasti dikonfirmasi ke Jupiter bersama permintaan persetujuan tertulis.
- **D-018 Toolchain Tahap 2** tidak diperiksa (lihat §1). Tidak dipasang otomatis.

## 11. Langkah manual pemilik (daftar berjalan)

1. Buat referral account dan referralTokenAccount (SOL dan USDC) di referral.jup.ag; isi variabel lingkungan.
2. Kirim email ke info@jup.ag untuk persetujuan tertulis penggunaan komersial dengan referral fee, dan konfirmasi label atribusi.
3. Pilih penyedia RPC gratis dan buat kuncinya; baca syaratnya.
4. Baca syarat tiap penerbit (prospektus xStocks di assets.backed.fi, Sales Terms Ondo, User Agreement Backpack, ToS PreStocks).
5. Tinjau syarat Cloudflare (§2.2.1(j) soal proxy) bersama penasihat hukum.
6. Bila CSV Ondo tidak bisa diambil otomatis, unduh dari tautan di docs.ondo.finance/addresses.
7. Periksa nama dan domain "Afterbell".

## 12. Sumber

- Jupiter: developers.jup.ag/docs/swap/fees, /docs/swap/order-and-execute.md, /docs/api-reference/swap/order.md, /docs/api-reference/swap/execute.md, /docs/portal/faq, /docs/portal/rate-limits.md, /docs/portal/plans.md, /docs/portal/api-keys.md, /docs/tool-kits/referral-program.md, /docs/legal/sdk-api-license-agreement; paket npm @jup-ag/referral-sdk 0.3.0.
- xStocks: docs.xstocks.fi/docs, /docs/product-legal-overview, /docs/issuance-and-redemption, /developers, /apis/openapi/assets; api.xstocks.fi/api/v2/public/assets/{TSLAx,NVDAx,CRCLx,SPYx}; xstocks.fi/documents/xstocks-terms-of-service.pdf.
- Ondo: docs.ondo.finance/ondo-stocks/legal-and-regulatory.md, /ondo-stocks/eligibility.md, /addresses.md, /api-reference/assets/*.
- Backpack: learn.backpack.exchange/articles/how-to-buy-spacex-stock; thedefiant.io (peringatan airdrop palsu, 2026-11-03).
- PreStocks: prestocks.com.
- Pine Analytics, "Tokenized Equities on Solana" (2026-06-17).
- Phemex News (data Blockworks), 2026-10-17: volume saham tokenisasi Q3 2026 7,1 miliar dolar AS.
- NYSE: nyse.com/markets/hours-calendars; Nasdaq: nasdaq.com/market-activity/stock-market-holiday-schedule.
- Cloudflare: cloudflare.com/terms, developers.cloudflare.com/pages, /pages/platform/limits, /pages/functions/pricing, /workers/platform/limits, /workers/runtime-apis/bindings/rate-limit.
- Pyth: docs.pyth.network/price-feeds/pro/pyth-core-upgrade, /price-feeds/use-real-time-data/push-integration; dev-forum.pyth.network (deprecation push feed).
- Helius: helius.dev/pricing.

## 13. Tahap pembangunan: keputusan dan temuan (2026-11-04)

Bagian ini menambah atau mengoreksi bagian 10. Bila ada beda, bagian 13 yang berlaku.

- **D-019 Wallet memakai paket Wallet Standard langsung** (`@wallet-standard/app`, `@wallet-standard/features`, `@solana/wallet-standard-features`, `@wallet-standard/base`), bukan `@wallet-standard/react` seperti di D-010. Alasan: kebutuhan hanya mendaftar wallet, connect, dan `solana:signTransaction`; lapisan React tambahan tidak diperlukan dan menambah bobot. Perilaku sama (Wallet Standard). Hanya wallet dengan rantai `solana:mainnet` dan fitur `solana:signTransaction` yang ditampilkan.
- **D-020 CSP memakai `'unsafe-inline'` untuk script dan style** (`public/_headers`). Alasan: ekspor statis Next.js menyisipkan skrip inline (data RSC dan bootstrap), dan skrip tema awal sengaja inline agar tidak berkedip. Nonce atau hash per build tidak tersedia pada ekspor statis tanpa langkah build tambahan. Mitigasi: `default-src 'self'`, `connect-src 'self' https://api.jup.ag`, `frame-ancestors 'none'`, `object-src 'none'`. Perlu ditinjau bila ada pengamanan lanjutan (hash otomatis saat build).
- **D-021 Ambang meter likuiditas adalah nilai awal, bukan hasil pencocokan data.** D-007 menulis ambang akan ditetapkan dari data langsung saat pembangunan; itu tidak dilakukan karena shell tidak bisa menjangkau Jupiter. Ambang: Deep di bawah 0,5 persen pada $10.000, Medium di bawah 2 persen, selain itu Thin. Dipilih dari kisaran slippage yang lazim dilaporkan, dan /methodology menyatakan itu terus terang. Penyimpangan diukur terhadap harga efektif $100 (negatif dipotong ke 0). Tinjau setelah ada data nyata.
- **D-022 Geoblock gagal-tertutup.** Status wilayah dibaca dari GET `/api/rpc` (header `cf-ipcountry`). Bila permintaan gagal atau negara tidak diketahui, tombol beli/jual tidak tampil (mode lihat-saja) sampai wilayah terkonfirmasi. Panel swap saat memuat hanya menampilkan kerangka dan pembatasan penerbit. `simulateTransaction` dan `sendTransaction` juga ditolak di sisi function untuk negara terblokir. Diuji di e2e dan pada runtime workerd (wrangler pages dev: KP terblokir, ID tidak).
- **D-023 Upstream RPC.** Produksi tanpa `RPC_UPSTREAM_URL` mengembalikan 503. `ALLOW_DEFAULT_UPSTREAM=1` (hanya `.dev.vars` lokal) mengizinkan RPC publik publicnode untuk pengembangan. Kunci RPC hanya ada di variabel lingkungan Cloudflare; pemeriksaan bundel (`pnpm lint:bundle`) mencari pola kunci dan URL penyedia di `out/`.
- **D-024 Isi registry.** 4 penerbit (xStocks, Ondo, Backpack, PreStocks) dengan label hak, sumber, dan tanggal periksa; 4 token (TSLAx, NVDAx, CRCLx, SPYx), semuanya xStocks, mint dari API resmi xStocks. Token Ondo, SPCX, dan PreStocks tidak dimasukkan (tidak ada sumber mint resmi yang terbaca; D-015). `pnpm registry:validate` lolos secara skema. Pemeriksaan on-chain (`pnpm registry:check`) BELUM dijalankan: shell tidak menjangkau RPC. Pemilik wajib menjalankannya.
- **D-025 Daftar penyaringan wallet kosong** (`registry/blocked-wallets.json`). Mekanisme ada dan diuji (alamat di daftar tidak bisa swap), tetapi belum ada sumber data. Ini tidak lengkap sampai pemilik memilih penyedia (D-016).
- **D-026 Offline.** Banner global saat `navigator.onLine` salah, ditambah halaman `/offline`. Tidak ada service worker (tidak diminta; menghindari cache transaksi basi).
- **D-027 Halaman hukum dipecah:** Risk, Terms, Privacy. Ketiganya ditandai "Draft awaiting legal review". Tidak ada klaim hukum; pembatasan tanggung jawab ditunda ke penasihat hukum.
- **D-028 Field `priceImpact`.** Skema membaca `priceImpact` (angka, persen) dari `/order`; field deprecated `priceImpactPct` tidak dipakai. Di UI diberi label "Price impact (Jupiter estimate)" dan keterangan bahwa rujukan harga Jupiter bisa usang di luar jam pasar. Belum dibandingkan dengan nilai nyata (tanpa akses langsung); cek bila angka tampak aneh.
- **D-029 Kontak.** Footer menampilkan `NEXT_PUBLIC_CONTACT_EMAIL` bila diisi; bila tidak, teks "Contact details are added before public launch". Tidak ada alamat yang dikarang.
- **D-030 Pemuatan malas paket Solana.** `@solana/kit` dan `@solana-program/token` dimuat lewat import dinamis hanya saat menurunkan ATA (portofolio dan saldo swap). Base58 untuk `firstSignature` ditulis lokal dan diuji terhadap `@solana/kit`. Alasan: Performance Lighthouse halaman beranda dan detail token di bawah 90 sebelum perubahan ini.
- **D-031 Stabilitas tata letak (CLS).** Kerangka muat panel swap dan meter likuiditas diberi tinggi minimal mendekati panel penuh; CLS halaman token turun dari 0,21 ke 0,004.
- **D-032 Biaya Afterbell pada ringkasan** mengikuti D-008. Tanpa `NEXT_PUBLIC_REFERRAL_ACCOUNT`, ringkasan menampilkan "0 bps". Tampilan nominal berupa perkiraan ("about") bila dihitung dari bps, dan nominal pasti bila respons memuat `platformFee.amount`. Belum diuji langsung terhadap respons berreferral (butuh referral account pemilik).
- **D-033 Hasil kuotasi tak pasti.** Bila `/execute` gagal tanpa hasil jelas, aplikasi memeriksa `getSignatureStatuses` dengan tanda tangan turunan (hanya bila transaksi tidak ditanggung pihak lain) dan, bila tak terbukti, menyatakan hasil tidak diketahui plus tautan explorer. Tidak pernah menyatakan sukses tanpa bukti.
- **D-034 Cara uji.** E2E Playwright berjalan terhadap `out/` dengan jaringan palsu (`tests/e2e/mocks.ts`) dan wallet tiruan (`tests/e2e/wallet.ts`); semua angka di sana adalah DATA CONTOH untuk uji. Tidak ada transaksi nyata dikirim dari skrip mana pun. Lighthouse dijalankan pada build dengan jaringan palsu (`MOCK=1`), lihat `docs/LIGHTHOUSE.md`.
- **D-035 Tahap 2 dihentikan** di pemeriksaan toolchain (D-018 diperbarui): Solana CLI dan Anchor tidak tersedia, tidak dipasang. Spesifikasi dan rencana uji ada di `docs/STAGE2-FEE-ROUTER-SPEC.md`. Gerbang P tidak dijalankan; rencana cadangan `distribute()` dipilih sampai ada bukti.

### Yang belum bisa diverifikasi dari sesi ini

- Panggilan nyata ke Jupiter dan RPC (tanpa akses jaringan dari shell): bentuk respons asli dicek hanya lewat skema longgar dan data dokumentasi; uji dengan jaringan palsu.
- Respons `/order` dengan `referralAccount` milik Afterbell (butuh akun referral pemilik).
- Transaksi mainnet sungguhan dengan wallet asli (hanya pemilik di browser, sengaja tidak dilakukan dari skrip).
- On-chain `registry:check`.
- Lighthouse pada situs yang sudah dideploy dan pada perangkat nyata.

## 14. Langkah manual pemilik (tambahan)

8. Jalankan `pnpm install`, `pnpm registry:check` (butuh RPC; set `RPC_URL`), lalu `pnpm test`, `pnpm build`, `pnpm test:e2e`.
9. Isi variabel lingkungan Cloudflare Pages: `RPC_UPSTREAM_URL`, `ALLOWED_ORIGINS`, `BLOCKED_COUNTRIES`, `RATE_LIMIT_PER_MINUTE`; dan build-time `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REFERRAL_ACCOUNT`, `NEXT_PUBLIC_REFERRAL_FEE_BPS`, `NEXT_PUBLIC_CONTACT_EMAIL`. Tentukan daftar `BLOCKED_COUNTRIES` bersama penasihat hukum.
10. Pilih sumber daftar penyaringan wallet dan isi `registry/blocked-wallets.json`.
11. Minta penasihat hukum meninjau Risk, Terms, Privacy dan pembatasan wilayah.
12. Setelah deploy, jalankan ulang Lighthouse dan uji satu swap kecil dengan wallet sendiri.
13. Tahap 2: pasang Rust, Solana CLI, Anchor sendiri (atau setujui pemasangan), lalu jalankan Gerbang P.

## 15. Lapisan Ethereum (2026-11-04)

Permintaan pemilik: "coba buat saja ini pakai etherium". Solana tetap utuh; Ethereum ditambahkan sebagai jaringan kedua.

**Keputusan**

- **D-040 Cakupan.** Ethereum mainnet (chain ID 1) lewat Uniswap v3. Alasan: tidak butuh API key (kuotasi lewat `QuoterV2` on-chain, eksekusi lewat `SwapRouter02`), jadi sesuai batasan "gratis saja". Agregator berkunci (mis. 0x, 1inch) tidak dipakai karena syarat kunci/biayanya belum diverifikasi.
- **D-041 Robinhood Chain tidak ditambahkan (digantikan oleh §18, 2026-11-07).** Chain ID, RPC publik, alamat kontrak (token, DEX, USDC), explorer, dan syarat penggunaan belum dikonfirmasi dari sumber resmi di sesi ini, dan aturan proyek melarang mengarang identifier. Untuk menambahkannya: isi satu entri di `src/lib/evm/chains.ts` (dengan sumber), token di `registry/evm-tokens.json`, dan variabel `EVM_RPC_UPSTREAM_URL_<CHAIN>`; relay, UI, dan tes sudah mengikuti `?chain=`. Jalur ke penerbit (xStocks/Robinhood) perlu dibaca syaratnya oleh pemilik dulu.
- **D-042 Registry.** `registry/evm-tokens.json`: TSLAx, NVDAx, CRCLx, SPYx di Ethereum, masing-masing dengan alamat (EIP-55), sumber, dan tanggal periksa. Alamat diambil dari API publik xStocks (`api.xstocks.fi`) dan dicatat sebagai sumber. Skema melarang field `decimals`: decimals dibaca dari kontrak saat runtime (`readDecimals`), karena dokumen xStocks tidak menyebutnya dan angka yang diketik bisa salah.
- **D-043 Rute dan kuotasi.** Satu kolam Uniswap v3. Tingkat biaya yang dicoba: 0,01%, 0,05%, 0,3%, 1% (dokumen Uniswap tidak membuat daftar kolam per token, jadi tingkat lain tidak ditemukan; ini dinyatakan di Methodology dan di panel likuiditas). Kuotasi terbaik dipilih; revert dari quoter dianggap "tidak ada kolam", kegagalan jaringan tidak disamarkan sebagai itu (diuji).
- **D-044 Likuiditas.** Metrik dan ambang sama dengan Solana (penyimpangan harga efektif terhadap $100). Bila kolam tidak bisa mengisi sebuah ukuran, status `limited` menyebut ukuran mana yang tidak terisi, bukan angka karangan. Pengamatan manual saat riset (DexScreener, bukan sumber data aplikasi): kolam xStocks di Ethereum mainnet sangat kecil (sekitar $228 pada satu token), jadi banyak token akan tampil Thin atau "pool too small". Itu fakta pasar yang ditampilkan apa adanya.
- **D-045 Approval.** Jumlah pas, bukan tak terbatas (`buildApprove`; tes e2e memeriksa nilai di calldata). Approval disimulasikan (`eth_call` dari alamat pengguna) sebelum wallet diminta menandatangani, lalu swap disimulasikan (`eth_call` + `eth_estimateGas`) sebelum tombol "Swap in wallet" muncul.
- **D-046 Biaya Afterbell di EVM = 0 bps.** Tidak ada mekanisme biaya yang diverifikasi untuk jalur Uniswap langsung; tahap 2 (router biaya) tetap hanya spesifikasi. Review menampilkan "0 bps" dan biaya jaringan dalam ETH (estimasi gas x harga gas). Price impact tidak ditampilkan di review karena quoter tidak memberi harga referensi pasar; meter kedalaman yang menjelaskan.
- **D-047 Relay.** `/api/rpc?chain=ethereum` memakai allowlist EVM terpisah (`eth_call`, `eth_getBalance`, `eth_blockNumber`, `eth_chainId`, `eth_estimateGas`, `eth_gasPrice`, `eth_getTransactionReceipt`). `eth_sendRawTransaction`/`eth_sendTransaction`/`eth_getLogs` tidak diteruskan: wallet pengguna yang mengirim. Validasi params ketat (field heks, alamat 42 karakter, data maks 8 KiB, tag blok `latest`/heks). `eth_estimateGas` dan `eth_call` ke SwapRouter02 diblokir untuk negara yang diblokir (sama seperti simulasi Solana); baca saldo dan kuotasi tetap boleh. Upstream: `EVM_RPC_UPSTREAM_URL_ETHEREUM`; tanpa itu 503 (RPC publik hanya dengan `ALLOW_DEFAULT_UPSTREAM=1`).
- **D-048 Wallet.** EIP-6963 (penemuan) + EIP-1193 (permintaan), terpisah dari wallet Solana. Chain salah → tombol "Switch wallet to Ethereum". Hasil: hash dari wallet, receipt dipoll lewat relay, jumlah diterima dibaca dari log `Transfer` pada receipt, hasil tak jelas diberi tautan Etherscan dan peringatan jangan mengulang.
- **D-049 Halaman.** `/e/[symbol]` (statis), tautan dua arah dengan `/s/[symbol]`, Explore dengan filter jaringan, Portfolio dengan bagian Ethereum (balanceOf per token registry), riwayat sesi menyimpan jaringan, sitemap, dan teks di Methodology/Help/Risk/Terms/Privacy.

**Belum terverifikasi (Ethereum)**

- Perilaku langsung terhadap RPC Ethereum dan Uniswap asli: semua tes memakai jaringan palsu dan data contoh. `pnpm registry:check` sekarang juga memeriksa (hanya baca) chain ID, kode kontrak USDC/Quoter/Router/Factory, dan `decimals()` tiap token; belum dijalankan terhadap jaringan asli dari sandbox ini.
- Decimals token xStocks (dibaca runtime), dan apakah ada kolam di tingkat biaya selain empat yang dicoba.
- Interaksi token xStocks yang menyesuaikan saldo (rebasing/multiplier) dengan kolam Uniswap v3: tidak diuji. Ditulis sebagai risiko di Methodology dan Risk. Jangan swap jumlah besar sebelum dicoba kecil.
- Transaksi Ethereum sungguhan dengan wallet asli (sengaja tidak dilakukan dari skrip).
- Syarat penggunaan xStocks untuk Ethereum dan pembatasan wilayah/US persons: teks penerbit di panel hak sama dengan Solana; pemilik perlu membaca ulang dokumen penerbit.

**Langkah manual pemilik (Ethereum)**

14. Set `EVM_RPC_UPSTREAM_URL_ETHEREUM` di Cloudflare Pages (penyedia RPC Ethereum dengan tier gratis; kunci hanya di variabel lingkungan).
15. Jalankan `EVM_RPC_URL=<rpc> pnpm registry:check` dan pastikan semua baris OK.
16. Coba swap sangat kecil dengan wallet sendiri; perhatikan hasil approval dan jumlah diterima untuk token yang menyesuaikan saldo.
17. Putuskan Robinhood Chain hanya setelah data resmi (chain ID, RPC, alamat, syarat) tersedia; lihat D-041.
18. Minta penasihat hukum meninjau teks Ethereum di Risk/Terms/Privacy.

## 16. Audit desain setelah lapisan Ethereum (2026-11-05)

Screenshot semua halaman di 360, 768, dan 1440 px (`scripts/shots.ts`; tanpa overflow horizontal, tanpa galat konsol selain 404 yang disengaja). Temuan dan perbaikan:

- Footer menulis "Swaps are routed by Jupiter" padahal ada swap Ethereum lewat Uniswap v3. Teks diperbaiki; atribusi Jupiter tetap.
- Filter Explore tidak punya label yang terlihat. Ditambah label "Network" dan "Issuer" per grup.
- Portfolio punya dua empty state besar dengan dua tombol Connect. Sekarang hanya satu aksi utama (Solana); bagian Ethereum berupa paragraf singkat dan tombol sekunder.
- Link "Open TSLAx" di Beranda melayang jauh dari kolomnya; dipindah ke kolom kiri.
- Beranda tidak menyebut Ethereum; ditambah satu kalimat.
- Data contoh Ethereum di mock uji terlalu ekstrem (24,8% impact pada $10.000). Itu kesalahan data uji, bukan perilaku produk; dikoreksi.
- Mode gelap, dialog review di 1440×900: tombol utama "Swap in wallet" terpotong di bawah dialog (isi dan tombol bergulir bersama). Dialog diubah: judul dan baris aksi tetap terlihat, hanya isi yang bergulir; baris aksi diberi garis pemisah. Berlaku untuk semua dialog (Solana dan Ethereum).
- Lighthouse diukur ulang (lihat docs/LIGHTHOUSE.md). Semua halaman memenuhi target: Performance 90 ke atas, lainnya 95 ke atas. Explore paling tipis (91).

Belum selesai: mode gelap hanya diperiksa pada dialog review Ethereum (360 dan 1440), belum semua halaman; pengukuran pada perangkat dan jaringan nyata belum ada.

## 17. Latar hidup interaktif (2026-11-05)

Permintaan pemilik: latar yang selalu hidup dan sangat interaktif dengan kursor.

- **D-050 Bentuk.** Canvas 2D di belakang semua halaman (`LiveBackground`): garis kontur kedalaman (marching squares, `src/lib/contour.ts`) dari medan gelombang yang mengalir pelan, sesuai bahasa peta laut Sounding Chart. Pengganti kontur SVG statis di hero dan kepala halaman (dihapus agar tidak dobel); kontur kecil di meter likuiditas dan empty state tetap.
- **D-051 Interaksi.** Kursor = "gunung laut" (garis merapat melingkar, mengikuti dengan lembut); gerak cepat meninggalkan jejak gelombang yang memudar; klik atau ketuk memancarkan riak yang meluas; scroll menggeser medan sedikit. Tanpa pustaka, tanpa jaringan.
- **D-052 Performa dan aksesibilitas.** Mulai setelah idle (konten tidak tertunda); resolusi sel menyesuaikan diri bila bingkai lambat; berhenti saat tab tersembunyi dan tidak menggambar saat dialog terbuka; DPR dibatasi 1,5. `aria-hidden`, `pointer-events: none`, disembunyikan saat cetak. `prefers-reduced-motion`: satu gambar statis, tanpa gerak dan tanpa reaksi kursor (diuji). Garis berdaya rendah (alfa 0,22 dan 0,4) agar teks tetap terbaca; kartu pilar di Beranda diberi latar solid. Warna mengikuti token `--contour` dan tema terang/gelap.
- **D-053 Body transparan.** `body` kini `background: transparent`; warna dasar tetap di `<html>`. Perlu supaya canvas dengan z-index -1 terlihat.
- **Terukur** (Lighthouse seluler, jaringan contoh): Beranda 99, Explore 91, token Solana 99, token Ethereum 97, Portfolio 98 untuk Performance; kategori lain 98 ke atas. 60 fps pada uji headless di container; perangkat nyata (terutama HP lama) belum diukur.
- **D-054 Kehalusan gerak kursor.** Kursor diikuti pegas kritis (`smoothDamp`, 0,11 s) sehingga tidak ada lonjakan kecepatan saat mulai atau berhenti; kecepatan dan kekuatan ikut dihaluskan. Jejak gelombang kini berkesinambungan (satu tetesan tiap 9 px atau lebih di sepanjang jalur yang sudah dihaluskan, lebih renggang dan lebih kuat saat cepat), bukan loncatan per event. Pembatasan bingkai 15 ms dihapus (satu bingkai per rAF) agar tidak terjadi lompat-bingkai; dt dibatasi 50 ms. Gaussian hanya dihitung di kotak batas sekitar tiap sumber, jadi biaya per bingkai turun. Uji headless 1440×900 dengan gerak kursor melingkar 90 langkah + klik: 163 bingkai, p50 = p95 = 16,7 ms, maksimum 16,8 ms, nol bingkai di atas 20 ms.

## 18. Robinhood Chain (2026-11-07)

Permintaan pemilik: pakai Robinhood Chain sebagai jaringan EVM kedua, dengan harapan menguji lebih mudah. Semua fakta di bawah dibaca dari sumber resmi pada 2026-11-07; D-041 (tunda sampai data resmi ada) kini terpenuhi untuk mainnet.

**Fakta resmi yang dipakai** (tiap alamat punya sumber di `src/lib/evm/chains.ts` dan `registry/evm-tokens.json`):

- Chain: Robinhood Chain mainnet, chain ID 4663, ETH sebagai gas, explorer Blockscout `robinhoodchain.blockscout.com`, RPC publik `rpc.mainnet.chain.robinhood.com` (Robinhood: dibatasi laju, bukan untuk produksi; sumber: docs.robinhood.com/chain/connecting). Chain dibangun di atas Arbitrum Nitro (halaman Protocol Contracts).
- Stock Token: ERC-20, 18 desimal, tidak rebasing. `balanceOf` tetap; dividen dan split mengubah `uiMultiplier` (ERC-8056). Daftar alamat dari API publik `api.robinhood.com/rhj/assets` (60 permintaan/detik, tanpa autentikasi).
- USDG (Paxos) 0x5fc5…d168 dan WETH 0x0Bd7…AD73 dari halaman Token Contracts.
- Uniswap v2, v3, v4 aktif di Robinhood Chain (blog Uniswap). Alamat v4 (PoolManager, Universal Router, V4Quoter, StateView, Permit2) dari halaman deployment v4 Uniswap. Alamat v3 untuk chain ini TIDAK berhasil saya ambil, jadi v3 tidak dipakai.

**Keputusan:**

- **D-055 Hanya mainnet, tanpa testnet.** Dokumen Robinhood memberi chain ID testnet (46630) dan RPC, tetapi tidak mendokumentasikan Stock Token, DEX, atau faucet di testnet. Tanpa token dan DEX, testnet tidak bisa menjalankan alur swap. Maka satu-satunya cara menguji alur on-chain nyata adalah mainnet dengan jumlah kecil dari dompet pemilik (lihat §19 langkah). Semua tes otomatis memakai jaringan dan wallet palsu.
- **D-056 Uniswap v4, bukan v3.** Likuiditas Stock Token di Robinhood Chain ada di v4. `EvmChain` kini union (`uniswap-v3` / `uniswap-v4`) dan semua kode (kuotasi, calldata, persetujuan, teks) bercabang menurut `venue`. Kuotasi: StateView.getLiquidity memastikan kolam hidup, lalu V4Quoter.quoteExactInputSingle; kolam terbaik dipilih. Swap: UniversalRouter.execute(V4_SWAP) dengan aksi SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL; penerima = pemanggil (wallet pengguna).
- **D-057 Pencarian kolam dibatasi, dan itu dikatakan.** Hanya kolam USDG ↔ token tanpa hook dengan pasangan (fee, tickSpacing) standar (0,01/1, 0,05/10, 0,3/60, 1/200). Kolam berpasangan ETH, kolam dengan hook, atau parameter lain tidak ditemukan; UI menyebut batas ini. Kolam seperti itu bisa ditambahkan manual lewat `pools` di entri token (skema `evmPoolSchema`, wajib bersumber). `pnpm registry:check --pools` memindai peristiwa Initialize PoolManager dan mencetak kandidatnya.
- **D-058 Persetujuan via Permit2.** v4 menarik token lewat Permit2: (1) ERC-20 approve ke Permit2 sejumlah pas, (2) Permit2.approve ke Universal Router sejumlah pas dengan kedaluwarsa pendek (batas waktu swap + 10 menit), (3) swap. Langkah yang sudah terpenuhi dilewati (`planApprovals`, murni dan diuji). Tidak pernah tak terbatas.
- **D-059 USDG dianggap $1 untuk meter kedalaman.** USDG stablecoin; bila lepas dari $1 meter bergeser sebanyak itu. Dikatakan di Risk dan Methodology. Decimals USDG tidak tertulis di sumber resmi: dikonfigurasi 6 dan DICOCOKKAN dengan kontrak saat runtime (`verifyQuoteDecimals`); bila beda, kuotasi dan swap berhenti. `registry:check` juga memeriksanya.
- **D-060 Registry Stock Token dari API resmi.** 97 token (alamat lolos cek checksum EIP-55; dua pengambilan terpisah cocok). CRWV muncul di API tetapi catatannya terpotong sehingga statusnya tidak terbaca; tidak dimasukkan. Daftar yang saya dapat terpotong di CRWV, jadi token setelahnya (mis. TSLA, NVDA, AAPL) belum ada. `pnpm registry:sync-robinhood` mengambil daftar lengkap dari API resmi (hanya ACTIVE, chain 4663, 18 desimal, alamat EIP-55 valid) dan mempertahankan `pools` manual. Penerbit baru `robinhood` (Robinhood Assets (Jersey) Limited; surat utang tertokenisasi; tidak boleh ditawarkan ke US persons; Kanada, Inggris, Swiss dan lainnya dibatasi) dengan sumber.
- **D-061 Wallet menambahkan chain dengan parameter resmi.** Bila wallet belum mengenal chain 4663, Afterbell meminta `wallet_addEthereumChain` dengan nama, RPC publik, dan explorer resmi; wallet menampilkan dan memeriksa sendiri. Hanya dipicu saat pengguna menekan "Switch wallet".
- **D-062 Relay.** `?chain=robinhood` memakai `EVM_RPC_UPSTREAM_URL_ROBINHOOD` (tanpa fallback ke upstream Ethereum; tanpa itu dan tanpa `ALLOW_DEFAULT_UPSTREAM=1` dijawab 503). Universal Router menjadi sasaran geoblock (eth_call ke router dan semua eth_estimateGas diblokir untuk negara terblokir). Daftar metode tidak berubah.
- **D-063 Bahasa menurut syarat Robinhood.** Syarat Robinhood Chain melarang menyebut Stock Token sebagai "tokenized stocks/equities", memakai "Hood Chain", atau mengesankan afiliasi. Halaman Robinhood memakai "Stock Token"; ada pemberitahuan "Independent of Robinhood". Teks umum situs masih menyebut "tokenized US stocks" untuk kategori Solana/Ethereum dan menyebut Stock Token Robinhood terpisah; tes menjaga frasa terlarang tidak muncul di data penerbit dan token. Syarat yang sama melarang VPN untuk menyembunyikan lokasi, melarang membangun produk yang bersaing (5.2(e)) dan menyaratkan persetujuan tertulis bagi pesaing langsung (5.11(f)). Apakah Afterbell termasuk "produk bersaing" adalah pertanyaan hukum, bukan teknis: **minta penasihat hukum meninjau sebelum peluncuran publik.**
- **D-064 Rute.** `/e/robinhood/<simbol>` (Ethereum tetap `/e/<simbol>`), Explore punya filter "Robinhood Chain", Portfolio punya bagian "On Robinhood Chain" (saldo dibaca 8 sekaligus, desimal hanya untuk yang dipegang), riwayat sesi menyimpan `network`.

- **D-065 Hasil pembacaan on-chain (2026-11-09, `pnpm registry:check`, RPC publik Robinhood) dan keputusan kolam.** Terbaca langsung dari chain: chain ID 4663; alamat PoolManager, Universal Router, Quoter, StateView, Permit2 dan USDG punya kode kontrak; USDG 6 desimal; ke-97 token punya kode dan 18 desimal (pemeriksaan penuh selesai tanpa satu pun FAIL). Nama dan simbol dicetak untuk dibandingkan dengan daftar Robinhood; pemilik baru membandingkan sampai token OUST, sisanya belum. Kolam USDG tanpa hook di grid standar (fee/tick 100/1, 500/10, 3000/60, 10000/200) dengan likuiditas > 0 hanya ada untuk **16 dari 97** token: SPCX, SPY, GLD, SNOW, QQQ, INTC, MSFT, TTWO, META, RDDT, SNDK, AMZN, GOOGL, SGOV, PLTR, MU. PoolManager memuat 1.135.750 kolam yang pernah diinisialisasi; tiap token punya 16 sampai 3.427. Inisialisasi bisa dilakukan siapa saja, jadi jumlah itu tidak menunjukkan pasar. Pembacaan kolam USDG tanpa hook di luar grid standar menemukan 95 token dengan kolam berlikuiditas > 0, tetapi contoh yang terlihat berfee 4,85%, 5% dan 96% dengan likuiditas jauh di bawah kolam standar. **Keputusan: tidak ada kolam di luar grid standar yang ditambahkan ke `pools` dari hasil massal ini.** Alasan: tanpa sumber harga acuan, kolam kecil berfee ganjil bisa memberi harga jauh dari pasar, dan kuotasi terbaik hanya melindungi dari harga yang lebih buruk, bukan dari kolam yang menyimpang. Kolam ber-hook tetap tidak dipakai (hook adalah kode pihak ketiga yang ikut berjalan saat swap). Token tanpa kolam standar berlikuiditas menampilkan keadaan "tidak ada likuiditas" di panel swap. Alat: `pnpm registry:check --pools-only` (laporan kolam; membaca semua peristiwa Initialize sekali) dan `--pools-from <file>` (membaca likuiditas kolam USDG tanpa hook non-standar dari keluaran sebelumnya). Daftar 16 token itu adalah foto keadaan pada tanggal tersebut; likuiditas berubah.

**Belum terverifikasi:** bahwa Universal Router yang dipakai adalah yang diinginkan (halaman Uniswap memuat dua entri: "Universal Router" 0x8876…C0904 yang dipakai, dan "2.1.2" 0x204F…0498); perilaku nyata Permit2 dan swap v4 di chain ini (belum ada transaksi nyata); bahwa token dengan `uiMultiplier` berinteraksi benar dengan kolam v4; apakah harga di kolam 16 token itu wajar terhadap pasar (aplikasi tidak punya harga acuan). Semua tes yang lulus memakai jaringan palsu.
- **D-066 Uji alur Robinhood Chain di fork lokal tanpa uang (2026-11-09).** RPC publik Robinhood hanya menyimpan state sekitar 10 menit, jadi `anvil --fork-url` langsung gagal ("historical state ... is not available") dan memerlukan RPC arsip. Pola yang dipakai (meniru Dockhood): `pnpm fork` (scripts/fork.ts) melakukan fork sekali, menjalankan transaksi nyata di jalur yang dipakai Afterbell (approve ERC-20, Permit2, kuotasi V4Quoter untuk beli dan jual di semua kolam dan jumlah, satu beli dan satu jual sungguhan), lalu `pinTouched` menulis ulang akun dan slot yang tersentuh (termasuk yang hanya dibaca, lewat `debug_traceTransaction` dengan `prestateTracer`) dan menyimpan `anvil_dumpState` ke `.fork/robinhood-4663.json` (di-gitignore). Setelah itu Anvil dijalankan dengan `--load-state` tanpa upstream, jadi tidak perlu kunci Alchemy dan bisa dipakai kapan saja. Dompet uji: `src/lib/evm/dev-wallet.ts`, provider EIP-1193 yang diumumkan lewat daftar EIP-6963 yang sama dengan wallet asli. Ia memakai akun Anvil bawaan yang kuncinya publik; kode pengiriman hanya meneruskan ke node lokal lewat akun yang sudah terbuka (tidak ada penandatanganan di browser), menanyakan `window.confirm` per transaksi dengan nomor dan jenisnya, menolak `from` selain akun uji, dan hanya menerima chain 0x1237. Ia mulai di chain 0x1 supaya alur "Switch wallet" ikut teruji. **Pembatas:** aktif hanya bila build memakai `NEXT_PUBLIC_DEV_WALLET=1` dan halaman dibuka dari localhost/127.0.0.1 dan RPC-nya alamat lokal. `next.config.mjs` selalu menanamkan variabelnya (kosong di produksi) supaya cabangnya dibuang saat build; `pnpm lint:bundle` gagal bila string `dev-wallet.afterbell.local` ada di `out/`. CSP produksi (`public/_headers`) tidak diubah; `pnpm preview:dev` hanya melonggarkan salinan `out/_headers` (menambah alamat node lokal ke `connect-src`, membuang `upgrade-insecure-requests`). Alur: `pnpm fork`, isi `EVM_RPC_UPSTREAM_URL_ROBINHOOD=http://127.0.0.1:8545` di `.dev.vars` (hapus setelahnya), `pnpm preview:dev`, buka `/e/robinhood/SPY`, pilih "Dev wallet (local fork)". Batas hasil: fork menguji kode Afterbell (urutan approve, kalldata, simulasi, penerimaan) terhadap state mainnet yang dibekukan; ia tidak membuktikan perilaku dompet nyata, harga pasar saat ini, atau penerimaan swap di mainnet. Tes: `tests/dev-wallet.test.ts`. Yang belum dijalankan oleh saya: `pnpm fork` sendiri terhadap RPC mainnet (perlu Foundry di Mac pemilik).
- **D-067 Vercel sebagai tempat uji alternatif (2026-11-09).** Cloudflare Pages tetap host yang direncanakan (§6). Untuk mencoba situs yang sudah hidup (wallet asli) tanpa akun Cloudflare, ditambahkan adaptor Vercel: `api/rpc.ts` (handler `export default { fetch }` yang memanggil `handleRpc` yang sama dengan `process.env`) dan `vercel.json` (framework `null`, `pnpm build`, keluaran `out`, `cleanUrls` karena Vercel tidak membaca `_headers`, dan header keamanan/CSP yang sama dengan `public/_headers`; kedua daftar header harus diubah bersamaan). Dua hal teknis: impor relatif di jalur fungsi (`api/rpc.ts` ke `src/server/rpc-handler.ts` ke `src/lib/evm/chains.ts`) memakai ekstensi `.js`, karena pembangun Vercel meninggalkan impor tanpa ekstensi dan Node menolaknya pada paket `type: module` (diuji dengan `vercel build` lokal dan menjalankan hasilnya); dan perintah build Vercel adalah `pnpm build && pnpm lint:bundle`, sehingga deploy gagal bila ada rahasia atau kode dompet uji di `out/`. Perbedaan perilaku: di Vercel (`VERCEL=1`) negara dibaca dari `x-vercel-ip-country` dan IP dari `x-real-ip`, header Cloudflare dari klien diabaikan, supaya tidak bisa dipalsukan; di Cloudflare tetap `cf-ipcountry` dan `cf-connecting-ip`. Batas laju tetap token bucket per instans (upaya terbaik; di Vercel beberapa instans berjalan paralel). **Syarat paket:** paket Hobby Vercel hanya untuk penggunaan non-komersial dan mendefinisikan penggunaan komersial sebagai deployment untuk keuntungan siapa pun yang terlibat, termasuk tautan afiliasi sebagai tujuan utama (vercel.com/docs/limits/fair-use-guidelines, dibaca 2026-11-09). Karena Afterbell bisa menarik biaya referral (`REFERRAL_ACCOUNT`), deployment di Hobby hanya untuk uji pribadi dengan `NEXT_PUBLIC_REFERRAL_ACCOUNT` kosong; untuk produksi diperlukan paket Pro, atau tetap Cloudflare. Dompet uji (D-066) tidak ada di build Vercel: ia hanya aktif di localhost dengan node lokal, dan `lint:bundle` memastikan kodenya tidak ikut. Jadi uji di Vercel memakai wallet asli dan uang sungguhan dalam jumlah sangat kecil, dengan `EVM_RPC_UPSTREAM_URL_ROBINHOOD` dari penyedia RPC. Sebelum situs dibuka ke publik, tinjauan hukum D-063 tetap berlaku.

## 19. Langkah manual pemilik: Robinhood Chain

1. `pnpm registry:sync-robinhood` lalu tinjau `git diff registry/evm-tokens.json` (menambah token di luar daftar awal, mis. TSLA/NVDA/AAPL, dan CRWV bila ACTIVE).
2. `pnpm registry:check` (RPC publik Robinhood dibatasi laju; untuk 100+ token pakai `EVM_RPC_URL_ROBINHOOD=<rpc dari penyedia>`). Semua baris harus OK; perhatikan nama/simbol dan kolam standar yang ditemukan.
3. `pnpm registry:check --pools-only > /tmp/rh-scan.txt 2>&1` untuk melihat semua kolam per token, lalu `pnpm registry:check --pools-from /tmp/rh-scan.txt` untuk likuiditas kolam non-standar. Tambahkan ke `pools` hanya setelah diperiksa satu per satu (lihat D-065: hasil massal tidak dimasukkan).
4. Isi `EVM_RPC_UPSTREAM_URL_ROBINHOOD` di Cloudflare Pages (Alchemy atau penyedia lain; RPC publik Robinhood tidak untuk produksi).
5. Lebih dulu, uji alurnya tanpa uang di fork lokal (D-066: `pnpm fork`, lalu `pnpm preview:dev`). Setelah itu uji alur nyata dengan jumlah sangat kecil dari dompet sendiri: beli USDG kecil di Robinhood Chain (bridge resmi: docs.robinhood.com/chain/bridging), swap sangat kecil, periksa explorer. Perhatikan jumlah transaksi persetujuan dan jumlah yang diterima.
6. Minta penasihat hukum meninjau D-063 dan teks Risk/Terms sebelum publik.

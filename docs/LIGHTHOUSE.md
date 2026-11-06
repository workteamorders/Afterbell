# Lighthouse (mobile, simulated throttling)

Run on 2026-11-04 against the built output (out/) served locally with MOCKED network (Jupiter and /api/rpc answered by scripts/static-server.mjs MOCK=1, example data). Chromium in a cloud container; real-device and real-network numbers can differ. One run per page; re-run on the owner machine against the deployed site.

| Page | Perf | A11y | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| home | 99 | 99 | 100 | 100 | 1.4 s | 0 | 100 ms |
| explore | 95 | 100 | 100 | 100 | 1.2 s | 0.001 | 270 ms |
| token | 92 | 100 | 100 | 100 | 1.4 s | 0.004 | 340 ms |
| portfolio | 97 | 98 | 100 | 100 | 1.4 s | 0 | 190 ms |
| methodology | 99 | 100 | 100 | 100 | 1.4 s | 0 | 140 ms |
| help | 100 | 100 | 100 | 100 | 1.4 s | 0 | 70 ms |
| risk | 100 | 100 | 100 | 100 | 1.4 s | 0 | 70 ms |

Diukur ulang setelah lapisan Ethereum ditambahkan (build dengan `NEXT_PUBLIC_JUPITER_BASE` ke jaringan contoh; EVM dijawab `evmMock` di static-server). Satu run per halaman. Explore turun dari 95 ke 90 karena kode kuotasi Ethereum (viem) ikut dimuat; belum dioptimalkan.

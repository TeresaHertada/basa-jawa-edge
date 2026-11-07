# BASA JAWA Edge

Pelatihan dan tuning di Google Colab, kode dan jejak eksperimen di GitHub, serta PWA untuk notebook dan smartphone melalui GitHub Pages. Alur pelatihan utama sekarang menggunakan notebook 01. `02_Jalankan_PWA.cmd` hanya pratinjau lokal opsional di Windows.

## Mulai dari awal

1. Ekstrak paket revisi ke folder baru. Buat repositori publik bernama `basa-jawa-edge` di akun GitHub Anda. Salin isi folder proyek ke akar repositori sehingga README.md, notebooks/, src/, data/, protocol/, dan docs/ berada pada tingkat pertama. Gunakan GitHub Desktop di Windows untuk commit dan push; jangan hanya mengunggah berkas ZIP.
2. Buka `notebooks/01_Colab_Latih_Tuning_Trace_PWA.ipynb` dengan Google Colab. Isi REPO_URL dengan alamat repositori Anda pada sel pertama. Notebook melakukan clone seluruh kode; membuka notebook dari GitHub saja tidak membawa folder data dan sumber ke runtime.
3. Pilih runtime CPU untuk eksperimen utama. Jalankan sel berurutan. Paket pin scikit-learn 1.8.0; versi pustaka yang benar-benar digunakan dicatat ke run_manifest.json. Bila Colab meminta restart setelah instalasi, restart dan ulangi dari sel awal.
4. Baca `protocol/experiment.json` sebelum melatih. Data, aturan split, daftar percobaan, batas JSON 512 KiB, serta toleransi validasi 0,01 dikunci sebelum evaluasi test. Simpan perubahan protokol sebagai commit yang terpisah.
5. Periksa audit data dan partisi. Snapshot menyediakan 2.009 baris kalimat dan 80 dialog. Normalisasi untuk pengelompokan memakai NFKC, casefold, dan peringkasan whitespace. Baris dengan group atau teks paralel identik disatukan. Pembagian referensi adalah 1.199 train, 396 validation, dan 414 test; grup tidak beririsan.
6. Jalankan baseline, kemudian 45 percobaan: lima konfigurasi fitur dikalikan sembilan kombinasi keluarga/parameter. Tiga keluarga adalah Logistic Regression, Linear SVM, dan Multinomial Naive Bayes. Kosakata, IDF, dan classifier di-fit pada train. Tuning hanya melihat validation.
7. Pilih model dari kandidat yang memenuhi batas JSON. Cari skor validasi eligible terbaik, lalu pilih JSON terkecil yang selisih macro-F1-nya paling jauh 0,01 dari skor tersebut. Ini adalah aturan trade-off yang sudah ditentukan, bukan pemilihan berdasarkan test.
8. Jalankan evaluasi test satu kali sesudah keputusan final. Baca confusion matrix dan hasil per kelas. Jika ingin mengubah metode sesudah melihat test, rancangan evaluasi perlu data uji baru yang belum dipakai untuk memilih model.
9. Jalankan trace satu kalimat. `trace_features.csv` menghubungkan n-gram, frekuensi, IDF, TF-IDF, dan kontribusi fitur kepada skor tiap kelas. `trace_summary.json` merekonstruksi skor dan memeriksa kesesuaiannya dengan classifier Python.
10. Ekspor PWA dan unduh `github_update.zip` sebelum runtime berakhir. Arsip berisi **seluruh** folder docs/ dan bukti run yang kecil. Simpan juga notebook dengan output. Model Python terpilih tersedia di folder run dan dapat diunduh terpisah bila diperlukan; .gitignore mencegah bobot/checkpoint besar masuk Git biasa.
11. Ekstrak ZIP pembaruan ke salinan lokal repositori di Windows. Commit dan push perubahan docs/ serta runs/<run_id>/. GitHub Desktop memperlihatkan berkas yang berubah. Gunakan pesan commit yang menyebut run ID. Simpan salinan notebook hasil melalui File → Save a copy in GitHub, atau unduh lalu commit melalui Desktop.
12. Pada Settings → Pages, pilih Deploy from a branch → main → /docs → Save. Gunakan alamat HTTPS yang ditampilkan GitHub; alamat proyek biasanya berbentuk `https://USERNAME.github.io/basa-jawa-edge/`. Pilih Enforce HTTPS jika tersedia. Folder docs/ sudah menyertakan .nojekyll.
13. Buka alamat HTTPS, tunggu Siap offline, lalu cocokkan Run ID dan Versi pada bagian bantuan dengan runs/<run_id>/pwa_export.json. Buka pemeriksaan teknis test.html dan simpan hasil aktual dari perangkat. Jika rilis belum berganti, tunggu pembaruan service worker, tutup tab/aplikasi, lalu buka ulang saat online.
14. Tutup aplikasi, aktifkan mode pesawat dan matikan Wi-Fi, lalu buka kembali. Periksa pencarian, prediksi, kuis, dan dialog. Catat hasil nyata; ikon terpasang saja belum membuktikan fungsi offline. Browser dapat menghapus cache dan perlu memuat ulang saat online.
15. Setelah pengujian teknis, jalankan empat tugas kepada siswa menurut panduan DOCX. Rekam keberhasilan mandiri, bantuan, waktu, dan tanggapan. Dataset pelatihan tetap sekunder; observasi pengguna merupakan data primer evaluasi. Data peserta dan lembar persetujuan disimpan terpisah dari repositori publik.

## Struktur yang penting

| Lokasi | Fungsi |
|---|---|
| notebooks/01_Colab_Latih_Tuning_Trace_PWA.ipynb | Alur utama CPU, baseline, 45 trial, seleksi, test, trace, ekspor |
| notebooks/02_Colab_DistilBERT_Opsional.ipynb | Fine-tuning Javanese DistilBERT opsional dengan GPU |
| src/lab.py | Fungsi pelatihan dan ekspor, dapat dibaca dan ditelusuri |
| src/deep_optional.py | Loop PyTorch, loss, optimizer, validasi dan evaluasi opsional |
| protocol/experiment.json | Aturan yang harus ditetapkan sebelum test |
| data/ | Snapshot sekunder, sumber, dan atribusi |
| runs/<run_id>/ | Manifest, partisi, tabel tuning, keputusan, hasil test, dan trace |
| docs/ | PWA statis yang dipublikasikan oleh GitHub Pages |

## Apa yang benar-benar ditelusuri

`run_manifest.json` mencatat ID run, commit sumber jika tersedia, hash kode, versi Python/pustaka, dan lingkungan eksekusi. `dataset_audit.json` mencatat hash CSV. `partitions.csv` menghubungkan baris sumber ke grup dan partisi. `trials.csv` memuat parameter dan hasil setiap trial. `selection.json` menjelaskan keputusan sebelum test. `test_predictions.csv` menyimpan keluaran per kalimat. Model browser menyimpan run ID dan hash sumber. `pwa_export.json` menghubungkan run dengan versi PWA yang aktif. Saat menjalankan dari ZIP tanpa Git, commit akan kosong dan hash kode tetap dicatat.

## Dua jalur model

Jalur utama melatih LR, Linear SVM, dan Multinomial NB dari train; ketiganya dapat diekspor ke penjumlahan bobot fitur pada browser. Skor SVM yang dinormalisasi dengan softmax bukan probabilitas terkalibrasi. Antarmuka hanya menampilkan perkiraan label.

Jalur opsional memakai backbone `w11wo/javanese-distilbert-small-imdb`, menambahkan kepala klasifikasi empat label, dan menguji dua learning rate. Backbone ini adalah model bahasa pada ulasan Jawa, bukan classifier honorifik yang mungkin sudah mempelajari test Unggah-Ungguh. Revision SHA model diambil dan dicatat saat eksekusi. Gunakan partisi persis dari eksperimen utama. GPU diperlukan untuk jalur ini. Hasil DistilBERT menjadi pembanding penelitian dan tidak otomatis mengganti model pada PWA ringan. Simpan checkpoint besar ke Drive/tempat model yang sesuai; GitHub biasa membatasi berkas 100 MiB dan unggahan browser 25 MiB.

## Status pengujian paket

Hasil di `runs/reference_local_validation_release` adalah pemeriksaan pengembang pada runtime lokal, **bukan hasil Google Colab milik siswa**. Main notebook dijalankan sel demi sel untuk memeriksa integrasi. Fine-tuning DistilBERT belum dijalankan pada GPU Colab. Pengujian browser fisik, hosting GitHub Pages, offline pada perangkat sasaran, dan uji pengguna perlu dilakukan oleh tim. Tidak ada klaim peningkatan kemampuan belajar atau kepuasan pengguna yang sudah diukur.

## Dataset dan batas interpretasi

Sumber dataset: https://huggingface.co/datasets/JavaneseHonorifics/Unggah-Ungguh . Penelitian: Farhansyah et al., ACL 2025, https://aclanthology.org/2025.acl-long.1296/ . Materi mempertahankan lisensi CC-BY-NC 4.0 untuk penggunaan nonkomersial dan atribusi sumber. Snapshot dibekukan dengan hash berkas; revision commit upstream saat pengambilan awal tidak terekam. Jangan mengganti CSV dengan versi terbaru tanpa membuat protokol dan eksperimen baru.

Prediksi model mempelajari label tingkat tutur pada dataset. Ia tidak menilai semua aspek kesopanan menurut hubungan sosial. Pencarian memakai kecocokan kata/frasa pada bank contoh; kuis memakai label sumber; dialog menampilkan peran dan konteks asli. Data lengkap dapat tampil dalam bank materi, tetapi pembelajaran classifier hanya memakai train.

## Rujukan platform

Google Colab: https://research.google.com/colaboratory/faq.html

GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

HTTPS: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https

Backbone opsional: https://huggingface.co/w11wo/javanese-distilbert-small-imdb

'use strict';

const $ = id => document.getElementById(id);
const levels = ['Ngoko', 'Ngoko Alus', 'Krama', 'Krama Alus'];
const routes = {
  beranda: 'Beranda', contoh: 'Contoh', prediksi: 'Prediksi',
  kuis: 'Kuis', dialog: 'Dialog', panduan: 'Panduan'
};
const progressKey = 'basajawa_pwa_progress';
const esc = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const label = n => `<span class="level-label" data-level="${Number(n)}">${levels[Number(n)] || 'Label sumber'}</span>`;
const arrow = '<svg class="icon" aria-hidden="true"><use href="#icon-arrow"/></svg>';
const emptyProgress = () => ({correct: 0, total: 0, review: []});
const sentenceId = row => String(row.index);
const parallelKey = row => JSON.stringify([row.group, normalized(row['indonesian sentence'])]);

let model, corpus, release, quiz, deferredInstall, toastTimer;
let dialogIndex = 0;
let progress = readProgress();
const rowsById = new Map();
const parallelRows = new Map();

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey));
    if (saved && Number.isInteger(saved.correct) && Number.isInteger(saved.total)
      && saved.correct >= 0 && saved.total >= saved.correct) {
      const review = Array.isArray(saved.review)
        ? [...new Set(saved.review.filter(id => typeof id === 'string' || Number.isInteger(id)).map(String))]
        : [];
      return {correct: saved.correct, total: saved.total, review};
    }
  } catch (_) {}
  return emptyProgress();
}

function message(text) {
  $('global-message').textContent = text;
  $('global-message').hidden = !text;
}

function toast(text) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

function showProgress() {
  const counts = {correct: progress.correct, total: progress.total, review: progress.review.length};
  document.querySelectorAll('[data-progress]').forEach(element => {
    element.textContent = counts[element.dataset.progress].toLocaleString('id-ID');
  });
  $('review-quiz').disabled = !corpus || !counts.review;
  $('home-quiz-label').textContent = counts.review ? 'Latih ulang' : counts.total ? 'Lanjut kuis' : 'Mulai kuis';
}

function reveal(element) {
  element.focus({preventScroll: true});
  element.scrollIntoView({block: 'nearest'});
}

function route(focus = false) {
  if (location.hash === '#main-content') return;
  const candidate = location.hash.replace(/^#\/?/, '').split('?')[0];
  const currentView = Object.hasOwn(routes, candidate) ? candidate : 'beranda';
  document.querySelectorAll('[data-view]').forEach(element => {
    element.hidden = element.dataset.view !== currentView;
  });
  document.querySelectorAll('[data-nav]').forEach(element => {
    const active = element.dataset.nav === currentView;
    element.classList.toggle('active', active);
    if (active) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  });
  $('breadcrumb-current').textContent = routes[currentView];
  document.title = `${routes[currentView]} · BASA-JAWA Edge`;
  if (currentView === 'kuis' && corpus && !quiz) nextQuiz();
  if (focus) {
    const heading = $(`view-${currentView}`).querySelector('h1');
    window.scrollTo({top: 0, behavior: 'instant'});
    heading.tabIndex = -1;
    heading.focus({preventScroll: true});
  }
}

function normalized(text) {
  return String(text).normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function exampleCard(row, idx) {
  return `<article class="example-card">
    <div class="example-top">${label(row.label)}<span class="example-id">#${esc(row.index)}</span></div>
    <p class="example-sentence" lang="jv">${esc(row['javanese sentence'])}</p>
    <p class="translation">${esc(row['indonesian sentence'])}</p>
    <div class="example-footer">
      <small class="source-id">Sumber index ${esc(row.index)} · group ${esc(row.group)}</small>
      <button type="button" class="text-action" data-predict-index="${idx}">Coba prediksi ${arrow}</button>
    </div>
  </article>`;
}

function search(focus = false) {
  if (!corpus) return message('Materi belum siap. Tunggu sebentar atau muat ulang halaman.');
  const query = $('query').value.trim();
  const q = normalized(query);
  const selected = $('level').value;
  const tokens = q ? q.split(' ') : [];
  let rows = corpus.sentences.map((row, idx) => {
    const fields = ['javanese sentence', 'indonesian sentence', 'english sentence'].map(key => normalized(row[key]));
    const text = fields.join(' ');
    const score = (fields.some(value => value === q) ? 10 : 0)
      + (fields.some(value => value.includes(q)) ? 4 : 0)
      + tokens.filter(token => text.includes(token)).length;
    return {row, idx, score};
  }).filter(item => (!q || item.score > 0) && (selected === '' || String(item.row.label) === selected));
  if (q) rows.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const count = rows.length;
  rows = rows.slice(0, q || selected !== '' ? 5 : 3);
  $('search-heading').textContent = q ? `Contoh untuk “${query}”`
    : selected !== '' ? `Contoh ${levels[Number(selected)]}` : 'Contoh untuk memulai';
  $('search-count').textContent = count ? `${rows.length} ditampilkan${q || selected !== '' ? ` dari ${count} kecocokan` : ''}` : '0 contoh';
  $('search-results').innerHTML = rows.length
    ? rows.map(({row, idx}) => exampleCard(row, idx)).join('')
    : '<div class="empty surface panel"><h2>Belum menemukan contoh</h2><p>Coba kata yang lebih singkat, misalnya “makan”, atau pilih semua tingkat tutur.</p></div>';
  if (focus) reveal($('search-heading'));
}

function countCharacters() {
  $('character-count').textContent = `${$('sentence').value.length} / 1000 karakter`;
}

function useExample(index = 0, predictNow = false) {
  if (!corpus) return message('Materi belum siap. Tunggu sebentar atau muat ulang halaman.');
  const row = corpus.sentences[index];
  if (!row) return;
  $('sentence').value = row['javanese sentence'];
  countCharacters();
  if (predictNow) classify(false);
  else $('sentence').focus();
}

function classify(focus = true) {
  if (!model) return message('Model belum siap. Tunggu sebentar atau muat ulang halaman.');
  const text = $('sentence').value;
  if (!text.trim()) {
    $('prediction').innerHTML = '<h2>Mulai dengan satu kalimat</h2><p>Tulis kalimat bahasa Jawa atau pilih Gunakan contoh.</p>';
    $('sentence').focus();
    return;
  }
  const prediction = BasaInference.predict(model, text);
  $('prediction').innerHTML = prediction.featureCount
    ? `<p class="eyebrow">PERKIRAAN MODEL LOKAL</p>
       <h2>${esc(prediction.level)}</h2>
       <p>Pola kalimatmu paling dekat dengan label ini menurut model.</p>
       <p>Bandingkan kalimatmu dengan contoh berlabel sama.</p>
       <button type="button" class="button soft" data-find-level="${Number(prediction.label)}">Lihat contoh ${esc(prediction.level)} ${arrow}</button>`
    : '<h2>Polanya belum dikenali</h2><p>Coba kalimat Jawa yang lebih lengkap.</p>';
  if (focus) reveal($('prediction'));
}

function nextQuiz(review = false, focus = false) {
  if (!corpus) return;
  const pool = review ? progress.review.map(id => rowsById.get(id)).filter(Boolean) : corpus.sentences;
  if (!pool.length) return;
  const choices = pool.length > 1 ? pool.filter(row => row !== quiz?.row) : pool;
  const row = review ? choices[0] : choices[Math.floor(Math.random() * choices.length)];
  quiz = {row, attempts: [], done: false};
  $('question').innerHTML = `<h2 class="eyebrow question-heading" id="question-heading" tabindex="-1">${review ? 'LATIH ULANG' : 'SOAL LATIHAN'}</h2>
    <p class="quiz-sentence" lang="jv">${esc(row['javanese sentence'])}</p>
    <p class="question-instruction">Tingkat tutur apa yang dipakai pada kalimat ini?</p>
    <details class="quiz-clue" id="quiz-clue"><summary>Buka petunjuk</summary>
      <p>Kalimat ini berarti <q>${esc(row['indonesian sentence'].trim())}</q></p>
      <p>Perhatikan kata kerja atau sapaan yang dipakai. Ingat contoh tingkat tutur yang pernah kamu baca.</p>
    </details>
    <div class="answers">${levels.map((name, n) => `<button type="button" class="answer" data-answer="${n}"><span class="answer-letter" aria-hidden="true">${'ABCD'[n]}</span><span>${name}</span></button>`).join('')}</div>
    <div id="feedback" class="feedback" tabindex="-1" hidden></div>`;
  $('quiz-actions').hidden = true;
  if (focus) reveal($('question-heading'));
}

function saveFirstAttempt(row, correct) {
  const id = sentenceId(row);
  progress.total += 1;
  if (correct) progress.correct += 1;
  progress.review = progress.review.filter(other => other !== id);
  if (!correct) progress.review.push(id);
  try {
    localStorage.setItem(progressKey, JSON.stringify(progress));
  } catch (_) {
    message('Browser membatasi penyimpanan. Progres hanya bertahan selama halaman ini terbuka.');
  }
  showProgress();
}

function showDiscussion(title, correct) {
  quiz.done = true;
  const row = quiz.row;
  const gold = Number(row.label);
  $('question').querySelectorAll('[data-answer]').forEach(button => {
    button.disabled = true;
    button.classList.toggle('source-answer', Number(button.dataset.answer) === gold);
  });

  const alternatives = (parallelRows.get(parallelKey(row)) || []).filter(candidate =>
    Number(candidate.label) !== gold && normalized(candidate['javanese sentence']) !== normalized(row['javanese sentence']));
  const comparison = alternatives.find(candidate => Number(candidate.label) === quiz.attempts[0]) || alternatives[0];
  const feedback = $('feedback');
  feedback.className = `feedback${correct ? ' correct' : ''}`;
  feedback.innerHTML = `<h3>${title}</h3>
    <p>Label dalam sumber adalah ${label(row.label)}.</p>
    <p>Arti kalimatnya <q>${esc(row['indonesian sentence'].trim())}</q></p>
    ${comparison ? `<div class="comparison">
      <p>Bandingkan dengan kalimat lain yang artinya sama.</p>
      <strong lang="jv">${esc(comparison['javanese sentence'])}</strong>
      <p>${label(comparison.label)} · Amati kata yang berubah di antara kedua kalimat.</p>
      <small class="source-id">Sumber pembanding #${esc(comparison.index)}</small>
    </div>` : ''}
    <p><small class="source-id">Sumber soal #${esc(row.index)} · Unggah-Ungguh</small></p>`;
  feedback.hidden = false;
  $('quiz-actions').hidden = false;
  reveal(feedback);
}

function answer(n) {
  if (!quiz || quiz.done || !Number.isInteger(n) || !levels[n] || quiz.attempts.includes(n)) return;
  const first = quiz.attempts.length === 0;
  const correct = n === Number(quiz.row.label);
  quiz.attempts.push(n);
  if (first) saveFirstAttempt(quiz.row, correct);
  if (correct) {
    showDiscussion(first ? 'Tepat di percobaan pertama' : 'Tepat setelah mencoba lagi', true);
    return;
  }

  const chosen = $('question').querySelector(`[data-answer="${n}"]`);
  chosen.disabled = true;
  chosen.classList.add('chosen');
  chosen.querySelector('.answer-letter').textContent = '×';
  if (!first) {
    showDiscussion('Mari bandingkan dengan contoh', false);
    return;
  }

  const feedback = $('feedback');
  feedback.className = 'feedback try-again';
  feedback.innerHTML = `<h3>Coba sekali lagi</h3>
    <p>Pilihan ${levels[n]} berbeda dari label sumber. Baca petunjuk, lalu pilih jawaban lain.</p>
    <button type="button" class="text-action" id="show-discussion">Lihat pembahasan ${arrow}</button>`;
  $('quiz-clue').open = true;
  feedback.hidden = false;
  reveal(feedback);
}

function renderDialog() {
  if (!corpus) return;
  const row = corpus.conversations[dialogIndex];
  $('dialog-result').innerHTML = `<aside class="surface panel">
    <p class="eyebrow">SITUASI</p><h2>Siapa berbicara?</h2>
    <div class="role-pair">${['a', 'b'].map(role => `<div class="role-person">
      <span class="speaker-dot ${role}">${role.toUpperCase()}</span>
      <div><small>PEMBICARA ${role.toUpperCase()}</small><strong lang="en">${esc(row['role ' + role])}</strong></div>
    </div>`).join('')}</div>
    <div class="context-original"><strong>Konteks dari sumber</strong><p lang="en">${esc(row.context)}</p></div>
    <small class="source-id">Sumber dialog index ${esc(row.index)} · Unggah-Ungguh</small>
  </aside><article class="surface panel">
    <p class="eyebrow">PERCAKAPAN</p><h2>Baca ucapan A dan B</h2>
    ${['a', 'b'].map(role => `<div class="utterance ${role}">
      <span class="speaker-dot ${role}">${role.toUpperCase()}</span>
      <div class="utterance-body"><span class="utterance-role" lang="en">${esc(row['role ' + role])}</span>
        <div class="speech-bubble"><p lang="jv">${esc(row[role + ' utterance'])}</p>${label(row[role + ' utterance category'])}</div>
      </div>
    </div>`).join('')}
  </article>`;
  $('dialog-count').textContent = `Dialog ${dialogIndex + 1} dari ${corpus.conversations.length}`;
}

function moveDialog(offset) {
  if (!corpus) return;
  const count = corpus.conversations.length;
  dialogIndex = (dialogIndex + offset + count) % count;
  renderDialog();
  reveal($('dialog-result'));
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join('');
}

async function loadJSON(path, files) {
  const embedded = $('basajawa-embedded');
  if (embedded) return JSON.parse(embedded.textContent)[path];
  const response = await fetch('./' + path);
  if (!response.ok) throw Error(`Berkas ${path} gagal dimuat.`);
  const text = await response.text();
  if (files && window.isSecureContext && crypto.subtle && await sha256(text) !== files[path].sha256) {
    throw Error('Berkas tidak sesuai versi. Muat ulang atau pasang ulang aplikasi.');
  }
  return JSON.parse(text);
}

function status(text, ready, detail) {
  $('offline-label').textContent = text;
  $('offline-status').classList.toggle('ready', ready);
  $('offline-help-message').textContent = detail;
}

async function checkOffline() {
  if (location.protocol === 'file:') {
    status('Pratinjau lokal', false, 'Untuk memeriksa pemasangan dan cache offline, buka melalui localhost atau GitHub Pages (HTTPS).');
    return false;
  }
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    status('Pratinjau web', false, 'Pemasangan PWA dan cache offline memerlukan HTTPS atau localhost.');
    return false;
  }
  const controller = navigator.serviceWorker.controller;
  if (!controller || !release) {
    status('Menyiapkan offline…', false, 'Tunggu penyiapan penyimpanan. Jika belum berubah, muat ulang saat online.');
    return false;
  }
  try {
    const result = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(Error('timeout')); }, 6000);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };
      controller.postMessage({type: 'STATUS'}, [channel.port2]);
    });
    const ready = result.ready && result.version === release.version;
    status(ready ? (navigator.onLine ? 'Siap offline' : 'Mode offline') : 'Perbarui halaman', ready,
      ready ? 'Berkas rilis ini sudah tersimpan di browser. Coba buka kembali dalam mode pesawat.'
        : 'Berkas belum lengkap atau versi sedang diperbarui. Muat ulang saat online.');
    return ready;
  } catch (_) {
    status('Periksa koneksi', false, 'Kesiapan offline belum terkonfirmasi. Muat ulang saat online, lalu periksa kembali.');
    return false;
  }
}

async function installApp() {
  if (deferredInstall) {
    const prompt = deferredInstall;
    deferredInstall = null;
    await prompt.prompt();
    await prompt.userChoice;
  } else {
    location.hash = '#/panduan';
    toast('Ikuti petunjuk di bagian Pasang aplikasi.');
  }
}

window.addEventListener('hashchange', () => route(true));
$('search-form').addEventListener('submit', event => { event.preventDefault(); search(true); });
$('level').addEventListener('change', () => search());
$('classify-form').addEventListener('submit', event => { event.preventDefault(); classify(); });
$('sentence').addEventListener('input', countCharacters);
$('use-example').addEventListener('click', () => useExample());
$('next-quiz').addEventListener('click', () => nextQuiz(false, true));
$('review-quiz').addEventListener('click', () => nextQuiz(true, true));
$('home-quiz-link').addEventListener('click', () => {
  if (progress.review.length) nextQuiz(true);
});
$('next-dialog').addEventListener('click', () => moveDialog(1));
$('prev-dialog').addEventListener('click', () => moveDialog(-1));
$('reset-progress').addEventListener('click', () => {
  progress = emptyProgress();
  quiz = undefined;
  try { localStorage.removeItem(progressKey); } catch (_) {}
  showProgress();
  toast('Progres kuis pada browser ini sudah direset.');
});
$('refresh-status').addEventListener('click', checkOffline);
$('install').addEventListener('click', installApp);
$('install-again').addEventListener('click', installApp);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; });
window.addEventListener('appinstalled', () => toast('Aplikasi berhasil dipasang. Selamat belajar!'));
window.addEventListener('online', checkOffline);
window.addEventListener('offline', checkOffline);
window.addEventListener('storage', event => {
  if (event.key !== progressKey && event.key !== null) return;
  progress = readProgress();
  if (corpus) progress.review = progress.review.filter(id => rowsById.has(id));
  showProgress();
});
document.addEventListener('click', event => {
  const quick = event.target.closest('[data-query]');
  if (quick) {
    $('query').value = quick.dataset.query;
    search(true);
  }
  const predict = event.target.closest('[data-predict-index]');
  if (predict) {
    useExample(Number(predict.dataset.predictIndex), true);
    location.hash = '#/prediksi';
  }
  const find = event.target.closest('[data-find-level]');
  if (find) {
    $('query').value = '';
    $('level').value = find.dataset.findLevel;
    search();
    location.hash = '#/contoh';
  }
  const option = event.target.closest('[data-answer]');
  if (option) answer(Number(option.dataset.answer));
  if (event.target.closest('#show-discussion') && quiz?.attempts.length === 1 && !quiz.done) {
    showDiscussion('Mari bandingkan dengan contoh', false);
  }
});

(async () => {
  showProgress();
  route();
  try {
    release = await loadJSON('release.json');
    [model, corpus] = await Promise.all([
      loadJSON('assets/model.json', release.files), loadJSON('assets/corpus.json', release.files)
    ]);
    for (const row of corpus.sentences) {
      rowsById.set(sentenceId(row), row);
      const key = parallelKey(row);
      if (!parallelRows.has(key)) parallelRows.set(key, []);
      parallelRows.get(key).push(row);
    }
    progress.review = progress.review.filter(id => rowsById.has(id));
    showProgress();
    $('bank-size').textContent = `${corpus.sentences.length.toLocaleString('id-ID')} contoh · ${corpus.conversations.length} dialog`;
    $('model-info').textContent = `Versi ${release.version} · run ${model.run_id || 'legacy reference'} · model ${model.variant} · ${model.idf.length} fitur.`;
    search();
    renderDialog();
    route();
    if (location.protocol !== 'file:' && window.isSecureContext && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', checkOffline);
      await navigator.serviceWorker.register('./sw.js', {scope: './'});
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(Error('Penyimpanan offline belum selesai. Periksa koneksi lalu muat ulang.')), 20000))
      ]);
    }
    await checkOffline();
  } catch (error) {
    message((model && corpus ? 'Fitur belajar sudah dimuat. ' : 'Aplikasi belum siap. ') + error.message);
    status('Belum siap offline', false, 'Periksa koneksi dan kelengkapan berkas, lalu muat ulang.');
  }
})();

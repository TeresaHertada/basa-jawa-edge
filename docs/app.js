'use strict';
const $ = id => document.getElementById(id);
const levels = ['Ngoko','Ngoko Alus','Krama','Krama Alus'];
const routes = {beranda:'Beranda',contoh:'Contoh kalimat',prediksi:'Prediksi tingkat tutur',kuis:'Kuis latihan',dialog:'Dialog peran',panduan:'Panduan & aplikasi'};
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = n => `<span class="level-label" data-level="${Number(n)}">${levels[Number(n)] || 'Label sumber'}</span>`;
const arrow = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';
let model, corpus, release, currentQuiz, answered = false, dialogIndex = 0, deferredInstall, toastTimer;
let progress = {correct:0,total:0};
try {const saved=JSON.parse(localStorage.getItem('basajawa_pwa_progress'));if(saved && Number.isInteger(saved.correct) && Number.isInteger(saved.total) && saved.correct>=0 && saved.total>=saved.correct) progress={correct:saved.correct,total:saved.total};} catch (_) {}
function message(text) {$('global-message').textContent=text;$('global-message').hidden=!text;}
function toast(text) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4000);}
function showProgress() {for(const key of ['correct','total'])document.querySelectorAll(`[data-progress="${key}"]`).forEach(el=>{el.textContent=progress[key];});}
function route(focus=false) {
  if(location.hash==='#main-content')return;
  const candidate=location.hash.replace(/^#\/?/,'').split('?')[0];
  const current=Object.hasOwn(routes,candidate)?candidate:'beranda';
  document.querySelectorAll('[data-view]').forEach(el=>{el.hidden=el.dataset.view!==current;});
  document.querySelectorAll('[data-nav]').forEach(el=>{const active=el.dataset.nav===current;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('breadcrumb-current').textContent=routes[current];document.title=`${routes[current]} · BASA-JAWA Edge`;
  if(current==='kuis' && corpus && !currentQuiz)nextQuiz();
  if(focus){window.scrollTo({top:0,behavior:'instant'});$('main-content').focus({preventScroll:true});}
}
function normalized(text) {return String(text).normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();}
function exampleCard(row,idx) {
 return `<article class="example-card"><div class="example-top">${label(row.label)}<span class="example-id">#${esc(row.index)}</span></div><p class="example-sentence">${esc(row['javanese sentence'])}</p><p class="translation">${esc(row['indonesian sentence'])}</p><div class="example-footer"><small class="source-id">Sumber index ${esc(row.index)} · group ${esc(row.group)}</small><button class="text-action" data-predict-index="${idx}">Coba prediksi ${arrow}</button></div></article>`;
}
function search() {
 if(!corpus)return message('Materi belum siap. Tunggu sebentar atau muat ulang halaman.');
 const q=normalized($('query').value),selected=$('level').value,tokens=q?q.split(' '):[];
 let rows=corpus.sentences.map((row,idx)=>{
  const fields=['javanese sentence','indonesian sentence','english sentence'].map(key=>normalized(row[key]));
  const text=fields.join(' ');const score=(fields.some(value=>value===q)?10:0)+(fields.some(value=>value.includes(q))?4:0)+tokens.filter(token=>text.includes(token)).length;
  return {row,idx,score};
 }).filter(item=>(!q || item.score>0) && (selected==='' || String(item.row.label)===selected));
 if(q)rows.sort((a,b)=>b.score-a.score || a.idx-b.idx);
 const count=rows.length;rows=rows.slice(0,q || selected!==''?5:3);
 $('search-heading').textContent=q?`Contoh untuk “${$('query').value.trim()}”`:selected!==''?`Contoh ${levels[Number(selected)]}`:'Contoh untuk memulai';
 $('search-count').textContent=count?`${rows.length} ditampilkan${q || selected!==''?` dari ${count} kecocokan`:''}`:'0 contoh';
 $('search-results').innerHTML=rows.length?rows.map(({row,idx})=>exampleCard(row,idx)).join(''):'<div class="empty surface"><h2>Belum menemukan contoh.</h2><p>Coba kata yang lebih singkat, misalnya “makan”, atau pilih semua tingkat tutur.</p></div>';
}
function countCharacters() {$('character-count').textContent=`${$('sentence').value.length} / 1000 karakter`;}
function useExample(index=0,predictNow=false) {if(!corpus)return;const row=corpus.sentences[index];$('sentence').value=row['javanese sentence'];countCharacters();if(predictNow)classify();else $('sentence').focus();}
function classify() {
 if(!model)return message('Model belum siap. Tunggu sebentar atau muat ulang halaman.');
 const text=$('sentence').value;
 if(!text.trim()){$('prediction').innerHTML='<div class="empty-result"><h2>Mulai dengan satu kalimat.</h2><p>Tuliskan kalimat bahasa Jawa atau pilih Gunakan contoh.</p></div>';$('sentence').focus();return;}
 const prediction=BasaInference.predict(model,text);
 if(!prediction.featureCount){$('prediction').innerHTML='<div class="empty-result"><h2>Polanya belum dikenali.</h2><p>Coba kalimat Jawa yang lebih lengkap.</p></div>';return;}
 $('prediction').innerHTML=`<article class="prediction-card"><span class="result-symbol" aria-hidden="true">✦</span><span class="eyebrow">PERKIRAAN MODEL LOKAL</span><h2>${esc(prediction.level)}</h2><p>Pola kalimatmu paling dekat dengan label ini menurut model.</p><div class="result-divider"></div><p class="result-hint">Bandingkan dengan contoh bersumber untuk memahami pilihan katanya.</p><button class="button primary" data-find-level="${Number(prediction.label)}">Lihat contoh ${esc(prediction.level)} ${arrow}</button><small>Perkiraan ini belum menilai kesopanan menurut seluruh konteks sosial.</small></article>`;
}
function nextQuiz() {
 if(!corpus)return message('Materi belum siap.');
 let next=corpus.sentences[Math.floor(Math.random()*corpus.sentences.length)];
 if(next===currentQuiz)next=corpus.sentences[(corpus.sentences.indexOf(next)+1)%corpus.sentences.length];
 currentQuiz=next;answered=false;
 $('question').innerHTML=`<span class="question-caption">AMATI KALIMAT INI</span><p class="quiz-sentence">${esc(currentQuiz['javanese sentence'])}</p><p class="question-instruction">Apa label tingkat tutur pada sumber?</p><div class="answers">${levels.map((name,n)=>`<button class="answer" data-answer="${n}"><span class="answer-letter">${'ABCD'[n]}</span><span>${name}</span></button>`).join('')}</div><div id="feedback" aria-live="polite"></div>`;
 $('quiz-hint').textContent='Pilih satu jawaban untuk melihat umpan balik.';
}
function answer(n) {
 if(answered || !currentQuiz)return;answered=true;
 const correct=n===Number(currentQuiz.label);progress.total++;if(correct)progress.correct++;
 try{localStorage.setItem('basajawa_pwa_progress',JSON.stringify(progress));}catch(_){message('Browser membatasi penyimpanan. Progres hanya bertahan selama halaman ini terbuka.');}
 $('question').querySelectorAll('[data-answer]').forEach(button=>{button.disabled=true;if(Number(button.dataset.answer)===n)button.classList.add('chosen');if(Number(button.dataset.answer)===Number(currentQuiz.label))button.classList.add('source-answer');});
 $('feedback').className=`feedback ${correct?'correct':''}`;
 $('feedback').innerHTML=`<strong>${correct?'Sesuai label sumber.':'Mari pelajari contoh ini.'}</strong><p>Label sumber: ${label(currentQuiz.label)}</p><p>${esc(currentQuiz['indonesian sentence'])}</p><small>Sumber index ${esc(currentQuiz.index)}. Label ini tidak berarti semua alternatif lain salah dalam setiap konteks.</small>`;
 $('quiz-hint').textContent='Sudah dibaca? Lanjutkan ke soal berikutnya.';showProgress();
}
function renderDialog() {
 if(!corpus)return;
 const row=corpus.conversations[dialogIndex];
 $('dialog-result').innerHTML=`<aside class="surface context-panel"><span class="eyebrow">PAHAMI SITUASINYA</span><h2>Siapa berbicara?</h2><div class="role-pair">${['a','b'].map(role=>`<div class="role-person"><span class="speaker-dot ${role}">${role.toUpperCase()}</span><div><small>PEMBICARA ${role.toUpperCase()}</small><strong>${esc(row['role '+role])}</strong></div></div>`).join('')}</div><div class="context-original"><strong>Konteks asli sumber</strong><p lang="en">${esc(row.context)}</p></div><small class="source-id">Sumber dialog index ${esc(row.index)}<br>Unggah-Ungguh</small></aside><article class="surface conversation-panel"><div class="conversation-heading"><span class="eyebrow">PERCAKAPAN</span><span class="quiet-text">Dua peran, satu situasi</span></div>${['a','b'].map(role=>`<div class="utterance ${role}"><span class="speaker-dot ${role}">${role.toUpperCase()}</span><div class="utterance-body"><span class="utterance-role">${esc(row['role '+role])}</span><div class="speech-bubble"><p>${esc(row[role+' utterance'])}</p>${label(row[role+' utterance category'])}</div></div></div>`).join('')}</article>`;
 $('dialog-count').textContent=`Dialog ${dialogIndex+1} dari ${corpus.conversations.length}`;
}
async function sha256(text) {const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');}
async function loadJSON(path,files) {
 const embedded=$('basajawa-embedded');if(embedded)return JSON.parse(embedded.textContent)[path];
 const response=await fetch('./'+path);if(!response.ok)throw Error(`Berkas ${path} gagal dimuat.`);
 const text=await response.text();
 if(files && window.isSecureContext && crypto.subtle && await sha256(text)!==files[path].sha256)throw Error('Berkas tidak sesuai versi. Muat ulang atau pasang ulang aplikasi.');
 return JSON.parse(text);
}
function status(text,ready,detail) {$('offline-label').textContent=text;$('offline-status').classList.toggle('ready',ready);$('offline-help-message').textContent=detail;}
async function checkOffline() {
 if(location.protocol==='file:'){status('Pratinjau lokal',false,'Ini pratinjau tampilan dari berkas. Untuk memasang PWA dan memeriksa cache offline, jalankan melalui localhost atau GitHub Pages (HTTPS).');return false;}
 if(!window.isSecureContext || !('serviceWorker' in navigator)){status('Pratinjau web',false,'Pemasangan PWA dan cache offline memerlukan HTTPS atau localhost.');return false;}
 const controller=navigator.serviceWorker.controller;
 if(!controller){status('Menyiapkan offline…',false,'Tunggu penyiapan penyimpanan. Jika belum berubah, muat ulang saat online.');return false;}
 try{
  const result=await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(Error('timeout'));},6000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};controller.postMessage({type:'STATUS'},[channel.port2]);});
  const ready=result.ready && result.version===release.version;
  status(ready?(navigator.onLine?'Siap offline':'Mode offline'):'Memperbarui aplikasi…',ready,ready?'Semua berkas pada versi ini tersedia dalam cache browser. Uji kembali saat mode pesawat untuk memastikan pada perangkatmu.':'Penyimpanan belum lengkap atau versi sedang diperbarui. Muat ulang saat online.');return ready;
 }catch(_){status('Periksa koneksi',false,'Kesiapan offline belum terkonfirmasi. Muat ulang saat online, lalu periksa kembali.');return false;}
}
async function installApp() {
 if(deferredInstall){const prompt=deferredInstall;deferredInstall=null;await prompt.prompt();await prompt.userChoice;}
 else{location.hash='#/panduan';toast('Petunjuk pemasangan tersedia di Panduan & aplikasi.');}
}
window.addEventListener('hashchange',()=>route(true));
$('search-form').addEventListener('submit',event=>{event.preventDefault();search();});
$('level').addEventListener('change',search);
$('classify-form').addEventListener('submit',event=>{event.preventDefault();classify();});
$('sentence').addEventListener('input',countCharacters);
$('use-example').addEventListener('click',()=>useExample());
$('next-quiz').addEventListener('click',nextQuiz);
$('next-dialog').addEventListener('click',()=>{if(corpus){dialogIndex=(dialogIndex+1)%corpus.conversations.length;renderDialog();}});
$('prev-dialog').addEventListener('click',()=>{if(corpus){dialogIndex=(dialogIndex-1+corpus.conversations.length)%corpus.conversations.length;renderDialog();}});
$('reset-progress').addEventListener('click',()=>{progress={correct:0,total:0};try{localStorage.removeItem('basajawa_pwa_progress');}catch(_){}showProgress();toast('Progres kuis pada browser ini sudah direset.');});
$('refresh-status').addEventListener('click',checkOffline);
$('install').addEventListener('click',installApp);$('install-again').addEventListener('click',installApp);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;});
window.addEventListener('appinstalled',()=>toast('Aplikasi berhasil dipasang. Selamat belajar!'));
window.addEventListener('online',checkOffline);window.addEventListener('offline',checkOffline);
document.addEventListener('click',event=>{
 const quick=event.target.closest('[data-query]');if(quick){$('query').value=quick.dataset.query;search();}
 const predict=event.target.closest('[data-predict-index]');if(predict){useExample(Number(predict.dataset.predictIndex),true);location.hash='#/prediksi';}
 const find=event.target.closest('[data-find-level]');if(find){$('query').value='';$('level').value=find.dataset.findLevel;search();location.hash='#/contoh';}
 const option=event.target.closest('[data-answer]');if(option)answer(Number(option.dataset.answer));
});
(async()=>{
 showProgress();route();
 try{
  release=await loadJSON('release.json');
  [model,corpus]=await Promise.all([loadJSON('assets/model.json',release.files),loadJSON('assets/corpus.json',release.files)]);
  $('bank-size').textContent=`${corpus.sentences.length.toLocaleString('id-ID')} contoh · ${corpus.conversations.length} dialog`;
  $('model-info').textContent=`Versi ${release.version} · run ${model.run_id || 'legacy reference'} · model ${model.variant} · ${model.idf.length} fitur. Tidak ada API AI eksternal.`;
  $('home-example').innerHTML=`${label(corpus.sentences[0].label)}<p class="example-sentence">${esc(corpus.sentences[0]['javanese sentence'])}</p><p class="translation">${esc(corpus.sentences[0]['indonesian sentence'])}</p><small class="source-id">Sumber index ${esc(corpus.sentences[0].index)} · Unggah-Ungguh</small>`;
  search();renderDialog();route();
  if(location.protocol!=='file:' && window.isSecureContext && 'serviceWorker' in navigator){
   navigator.serviceWorker.addEventListener('controllerchange',checkOffline);
   await navigator.serviceWorker.register('./sw.js',{scope:'./'});
   await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Penyimpanan offline belum selesai. Periksa koneksi lalu muat ulang.')),20000))]);
  }
  await checkOffline();
 }catch(error){message((model&&corpus?'Fitur belajar sudah dimuat, tetapi kesiapan offline belum terkonfirmasi. ':'Aplikasi belum siap. ')+error.message);status('Belum siap offline',false,'Periksa koneksi dan kelengkapan berkas aplikasi, lalu muat ulang.');}
})();

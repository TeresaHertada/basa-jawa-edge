'use strict';
const $ = id => document.getElementById(id);
const levels = ['Ngoko','Ngoko Alus','Krama','Krama Alus'];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = n => `<span class="level-label" data-level="${Number(n)}">${levels[Number(n)] || 'Label sumber'}</span>`;
let model, corpus, release, currentQuiz, answered = false, dialogIndex = 0, deferredInstall;
let progress = {correct:0,total:0};
try { const saved=JSON.parse(localStorage.getItem('basajawa_pwa_progress')); if(saved && Number.isFinite(saved.correct) && Number.isFinite(saved.total)) progress=saved; } catch (_) {}
function message(text) { $('global-message').textContent=text; $('global-message').hidden=!text; }
function showProgress() { $('progress').textContent=`${progress.correct} / ${progress.total} sesuai label`; }
function openTab(id) {
  for(const name of ['learn','classify','quiz','dialog']) $(name).hidden=name!==id;
  document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  if(id==='quiz' && corpus && !currentQuiz) nextQuiz();
  if(id==='dialog' && corpus && !$('dialog-result').textContent) nextDialog();
}
function normalized(text) { return String(text).normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim(); }
function search() {
  if(!corpus) return message('Materi belum siap. Tunggu sebentar atau muat ulang halaman.');
  const q=normalized($('query').value), selected=$('level').value;
  if(!q) {$('search-results').innerHTML='<p class="empty">Masukkan kata atau frasa terlebih dahulu.</p>';return;}
  const tokens=q.split(' ');
  const rows=corpus.sentences.map((row,idx)=>{
    const jav=normalized(row['javanese sentence']);
    const fields=[jav,normalized(row['indonesian sentence']),normalized(row['english sentence'])];
    const text=fields.join(' ');
    const score=(fields.some(value=>value===q)?10:0)+(fields.some(value=>value.includes(q))?4:0)+tokens.filter(token=>text.includes(token)).length;
    return {row,idx,score};
  }).filter(item=>item.score>0 && (selected==='' || item.row.label===selected)).sort((a,b)=>b.score-a.score || a.idx-b.idx).slice(0,5);
  $('search-results').innerHTML=rows.length?`<p class="examples-caption">${rows.length} contoh terkait · urutan berdasarkan kecocokan kata</p>`+rows.map(({row})=>`<article class="example"><div class="example-top">${label(row.label)}<span class="source-id">Contoh #${esc(row.index)}</span></div><p class="javanese">${esc(row['javanese sentence'])}</p><p class="example-translation">${esc(row['indonesian sentence'])}</p><small class="source-id">Sumber index ${esc(row.index)} · group ${esc(row.group)} · Unggah-Ungguh</small></article>`).join(''):'<p class="empty">Belum ada contoh yang cocok. Coba kata lebih singkat atau pilih semua tingkat.</p>';
}
function classify() {
  if(!model) return message('Model belum siap. Tunggu sebentar atau muat ulang halaman.');
  const text=$('sentence').value;
  if(!text.trim()) {$('prediction').innerHTML='<p class="empty">Masukkan satu kalimat bahasa Jawa terlebih dahulu.</p>';return;}
  const prediction=BasaInference.predict(model,text);
  if(!prediction.featureCount){$('prediction').innerHTML='<p class="empty">Belum ada pola teks yang dikenali. Coba kalimat Jawa yang lebih lengkap.</p>';return;}
  $('prediction').innerHTML=`<article class="prediction-card"><small class="subtle">PERKIRAAN MODEL</small><h4>${esc(prediction.level)}</h4><p>Gunakan hasil ini untuk membandingkan pola kalimat dengan contoh sumber. Periksa juga siapa pembicaranya dan kepada siapa kalimat ditujukan.</p><p class="subtle">Prediksi eksperimental; belum menjadi penilaian kesopanan sesuai konteks.</p></article>`;
}
function nextQuiz() {
  if(!corpus) return message('Materi belum siap.');
  currentQuiz=corpus.sentences[Math.floor(Math.random()*corpus.sentences.length)];answered=false;
  $('question').innerHTML=`<article class="quiz-card"><p class="quiz-sentence">${esc(currentQuiz['javanese sentence'])}</p><p class="subtle">Apa label tingkat tutur pada sumber?</p><div class="answers">${levels.map((name,n)=>`<button class="answer" data-answer="${n}">${name}</button>`).join('')}</div><div id="feedback" aria-live="polite"></div></article>`;
  $('question').querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',()=>answer(Number(button.dataset.answer))));
}
function answer(n) {
  if(answered || !currentQuiz) return;answered=true;
  const correct=n===Number(currentQuiz.label);progress.total++;if(correct)progress.correct++;
  try{localStorage.setItem('basajawa_pwa_progress',JSON.stringify(progress));}catch(_){message('Browser membatasi penyimpanan. Progres hanya bertahan selama halaman ini terbuka.');}
  $('question').querySelectorAll('[data-answer]').forEach(button=>{button.disabled=true;if(Number(button.dataset.answer)===n)button.classList.add('chosen');});
  $('feedback').className='feedback';
  $('feedback').innerHTML=`<p><strong>${correct?'Sesuai label sumber.':'Mari lihat kembali contoh ini.'}</strong> Label sumber: ${label(currentQuiz.label)}</p><p>${esc(currentQuiz['indonesian sentence'])}</p><small class="source-id">Sumber index ${esc(currentQuiz.index)}. Label sumber tidak berarti semua alternatif lain salah dalam setiap konteks.</small>`;
  showProgress();
}
function nextDialog() {
  if(!corpus) return message('Materi belum siap.');
  const row=corpus.conversations[dialogIndex++ % corpus.conversations.length];
  $('dialog-result').innerHTML=`<article class="dialog-card"><p class="dialog-context">${esc(row.context)}</p>${['a','b'].map(role=>`<div class="utterance"><span class="speaker">${role.toUpperCase()}</span><div><p class="role">Peran ${role.toUpperCase()}: ${esc(row['role '+role])}</p><p>${esc(row[role+' utterance'])}</p>${label(row[role+' utterance category'])}</div></div>`).join('')}<small class="source-id">Sumber dialog index ${esc(row.index)} · Unggah-Ungguh</small></article>`;
}
async function sha256(text) {const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');}
async function loadJSON(path, files) {
  const response=await fetch('./'+path);if(!response.ok)throw Error(`Berkas ${path} gagal dimuat.`);
  const text=await response.text();
  if(files && window.isSecureContext && crypto.subtle && await sha256(text)!==files[path].sha256)throw Error('Berkas tidak sesuai versi. Muat ulang atau pasang ulang aplikasi.');
  return JSON.parse(text);
}
async function checkOffline() {
  if(!window.isSecureContext || !('serviceWorker' in navigator)) {$('offline-status').textContent='Pratinjau web · perlu HTTPS';return false;}
  const controller=navigator.serviceWorker.controller;
  if(!controller){$('offline-status').textContent='Menyiapkan penyimpanan offline…';return false;}
  try{
    const status=await new Promise((resolve,reject)=>{
      const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('timeout')),6000);
      channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
      controller.postMessage({type:'STATUS'},[channel.port2]);
    });
    $('offline-status').textContent=status.ready?'Siap offline':'Penyimpanan offline belum lengkap';
    $('offline-status').classList.toggle('ready',status.ready);
    return status.ready;
  }catch(_){$('offline-status').textContent='Periksa koneksi dan muat ulang';return false;}
}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>openTab(button.dataset.tab)));
$('search-form').addEventListener('submit',event=>{event.preventDefault();search();});
$('classify-form').addEventListener('submit',event=>{event.preventDefault();classify();});
document.querySelectorAll('[data-query]').forEach(button=>button.addEventListener('click',()=>{$('query').value=button.dataset.query;search();}));
$('next-quiz').addEventListener('click',nextQuiz);$('next-dialog').addEventListener('click',nextDialog);
$('reset-progress').addEventListener('click',()=>{progress={correct:0,total:0};try{localStorage.removeItem('basajawa_pwa_progress');}catch(_){}showProgress();});
$('refresh-status').addEventListener('click',checkOffline);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;});
$('install').addEventListener('click',async()=>{
  if(deferredInstall){await deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;}
  else{$('help').open=true;$('help').scrollIntoView({behavior:'smooth'});}
});
window.addEventListener('online',checkOffline);window.addEventListener('offline',checkOffline);
(async()=>{
  showProgress();
  try{
    release=await loadJSON('release.json');
    [model,corpus]=await Promise.all([loadJSON('assets/model.json',release.files),loadJSON('assets/corpus.json',release.files)]);
    $('bank-size').textContent=`${corpus.sentences.length.toLocaleString('id-ID')} contoh · ${corpus.conversations.length} dialog`;
    $('model-info').textContent=`Versi ${release.version} · run ${model.run_id || 'legacy reference'} · model ${model.variant} · ${model.idf.length} fitur. Tidak ada API AI eksternal.`;
    if(window.isSecureContext && 'serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('controllerchange',checkOffline);
      await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Penyimpanan offline belum selesai. Periksa koneksi lalu muat ulang.')),20000))]);await checkOffline();
    } else await checkOffline();
  }catch(error){message((model&&corpus?'Fitur belajar sudah dimuat, tetapi kesiapan offline belum terkonfirmasi. ':'Aplikasi belum siap. ')+error.message+' Gunakan server lokal atau HTTPS.');$('offline-status').textContent='Kesiapan offline belum terkonfirmasi';}
})();

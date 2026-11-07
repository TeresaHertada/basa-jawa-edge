'use strict';
let report;
const el=id=>document.getElementById(id);
const median=values=>percentile(values,.5);
function percentile(values,p){const a=[...values].sort((a,b)=>a-b),index=(a.length-1)*p,low=Math.floor(index);return a[low]+(a[Math.ceil(index)]-a[low])*(index-low);}
el('run').addEventListener('click',async()=>{
  el('run').disabled=true;el('save').disabled=true;el('status').textContent='Memeriksa kesetaraan model dan mengukur tiga ulangan…';
  try{
    const [model,data,release]=await Promise.all(['assets/model.json','assets/verification.json','release.json'].map(async path=>{const r=await fetch('./'+path);if(!r.ok)throw Error(path+' tidak tersedia');return r.json();}));
    let maxError=0,labelMismatches=0,featureMismatches=0;const predictions=[];
    for(const fixture of data.fixtures){
      const got=BasaInference.predict(model,fixture.text);
      predictions.push(got.label);
      if(got.label!==fixture.label)labelMismatches++;
      if(got.featureCount!==fixture.feature_count)featureMismatches++;
      const expected=fixture.normalized_scores || fixture.probabilities;
      got.normalizedScores.forEach((p,i)=>{maxError=Math.max(maxError,Math.abs(p-expected[i]));});
    }
    const test=data.fixtures.slice(0,data.held_out_count),trials=[];
    for(let repeat=0;repeat<3;repeat++){
      await new Promise(resolve=>setTimeout(resolve,0));
      for(const fixture of test.slice(0,30))BasaInference.predict(model,fixture.text);
      const elapsed=[];
      for(const fixture of test){const start=performance.now();BasaInference.predict(model,fixture.text);elapsed.push(performance.now()-start);}
      trials.push({p50_ms:percentile(elapsed,.5),p95_ms:percentile(elapsed,.95)});
    }
    let correct=0;
    test.forEach((fixture,i)=>{if(predictions[i]===data.expected_labels[i])correct++;});
    report={app_version:release.version,created_at:new Date().toISOString(),runtime:'browser JavaScript',
      user_agent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},secure_context:window.isSecureContext,
      model:model.variant,held_out_queries:test.length,parity_fixtures:data.fixtures.length,
      label_mismatches:labelMismatches,feature_mismatches:featureMismatches,max_normalized_score_error:maxError,
      score_semantics:model.score_semantics || 'uncalibrated model probabilities',training_run_id:model.run_id || 'legacy reference',
      parity_pass:labelMismatches===0 && featureMismatches===0 && maxError<1e-10,
      held_out_accuracy:correct/test.length,trials,median_trial_p50_ms:median(trials.map(t=>t.p50_ms)),
      median_trial_p95_ms:median(trials.map(t=>t.p95_ms)),
      timing_scope:'warm classifier only; 30 warmups and 414 predictions per trial; 3 trials; performance.now resolution is browser dependent',
      note:'Record device model, CPU, RAM, OS/browser version, power and network condition separately. No learner outcomes collected.'};
    el('output').textContent=JSON.stringify(report,null,2);el('save').disabled=false;
    el('status').textContent=report.parity_pass?'LULUS: prediksi sesuai acuan Python. Hasil waktu berlaku untuk browser dan perangkat ini.':'GAGAL: periksa ekspor dan versi berkas sebelum uji pengguna.';
  }catch(error){el('status').textContent='Pemeriksaan gagal: '+error.message;}
  finally{el('run').disabled=false;}
});
el('save').addEventListener('click',()=>{
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='basajawa_browser_'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

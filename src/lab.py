"""Traceable BASA-JAWA experiments. Main training needs CPU only.

Read functions in notebook order: start_run -> load_snapshot -> partition ->
fit_trial -> select_trial -> evaluate_test_once -> export_pwa -> trace_sentence.
"""
import csv
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
from time import perf_counter
import unicodedata
from datetime import datetime, timezone
import uuid

import joblib
import numpy as np
from scipy.special import softmax
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC
from threadpoolctl import threadpool_limits

LABELS = {0:'Ngoko',1:'Ngoko Alus',2:'Krama',3:'Krama Alus'}
SOURCE = 'JavaneseHonorifics/Unggah-Ungguh, bundled released snapshot, CC-BY-NC 4.0'

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)

def write_json(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(canonical(value),encoding='utf-8')

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def write_csv(path,rows,fieldnames=None):
    rows=list(rows);path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fields=fieldnames or list(rows[0])
    with path.open('w',encoding='utf-8',newline='') as file:
        writer=csv.DictWriter(file,fieldnames=fields);writer.writeheader();writer.writerows(rows)

def git_output(root,*args):
    result=subprocess.run(['git','-C',str(root),*args],text=True,capture_output=True)
    return result.stdout.strip() if result.returncode==0 else None

def start_run(root,config,run_id=None):
    root=Path(root).resolve()
    run_id=run_id or datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'_'+uuid.uuid4().hex[:6]
    if not re.fullmatch(r'[A-Za-z0-9_-]+',run_id):raise ValueError('Use a plain run ID.')
    run=root/'runs'/run_id
    if run.exists():raise FileExistsError('Run already exists. Preserve it; choose a new run ID.')
    run.mkdir(parents=True)
    packages={name:importlib.metadata.version(name) for name in ['numpy','scipy','scikit-learn','joblib','threadpoolctl','pandas','matplotlib']}
    metadata=dict(run_id=run_id,created_at_utc=datetime.now(timezone.utc).isoformat(),
        runtime='Google Colab' if 'google.colab' in sys.modules or os.environ.get('COLAB_RELEASE_TAG') else 'local/reference execution',
        platform=platform.platform(),python=sys.version,packages=packages,
        source_git_commit=git_output(root,'rev-parse','HEAD'),git_worktree_status=git_output(root,'status','--porcelain'),
        training_code_sha256=digest(Path(__file__)),protocol_sha256=hashlib.sha256(canonical(config).encode()).hexdigest(),
        thread_settings={k:os.environ.get(k) for k in ['OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS']},
        repository_notebook_code_sha256={p.name:hashlib.sha256(canonical([c['source'] for c in json.loads(p.read_text())['cells'] if c['cell_type']=='code']).encode()).hexdigest() for p in (root/'notebooks').glob('*.ipynb')})
    write_json(run/'run_manifest.json',metadata);write_json(run/'protocol.json',config)
    (run/'requirements_actual.txt').write_text('\n'.join(f'{name}=={version}' for name,version in packages.items())+'\n')
    write_json(root/'runs/LAST_RUN.json',{'run_id':run_id})
    return run,metadata

def load_snapshot(root,config,run):
    root=Path(root)
    with (root/'data/translation.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    with (root/'data/conversation.csv').open(encoding='utf-8-sig',newline='') as f:dialogues=list(csv.DictReader(f))
    if digest(root/'data/translation.csv')!=config['secondary_snapshot_sha256']:
        raise ValueError('Dataset hash differs from the frozen protocol. Review the changed dataset before starting a new protocol.')
    assert len({r['index'] for r in rows})==len(rows)
    assert all(r['javanese sentence'].strip() and int(r['label']) in LABELS for r in rows)
    hashes={name:digest(root/'data'/name) for name in ['translation.csv','conversation.csv']}
    write_json(Path(run)/'dataset_audit.json',dict(translation_rows=len(rows),dialogue_rows=len(dialogues),
        label_counts={LABELS[i]:sum(int(r['label'])==i for r in rows) for i in LABELS},hashes=hashes,
        provenance='Bundled snapshot; original source URLs retained in data/source_manifest.json. Upstream revision was not captured; file hashes pin these exact bytes.'))
    return rows,dialogues

def normalize(text):
    return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',str(text)).casefold()).strip()

def safe_groups(rows):
    """Connected components of source group or identical normalized parallel text."""
    parent=list(range(len(rows)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    seen={}
    for i,row in enumerate(rows):
        for column in ['group','javanese sentence','indonesian sentence']:
            value=normalize(row[column]);key=(column,value)
            if value and key in seen:
                a,b=find(i),find(seen[key]);parent[b]=a
            else:seen[key]=i
    return np.array([find(i) for i in range(len(rows))])

def partition(rows,config,run=None):
    groups=safe_groups(rows);labels=np.array([int(r['label']) for r in rows])
    splitter=GroupShuffleSplit(n_splits=1,test_size=config['test_fraction'],random_state=config['seed_test'])
    development,test=next(splitter.split(rows,labels,groups))
    splitter=GroupShuffleSplit(n_splits=1,test_size=config['validation_fraction_of_remaining'],random_state=config['seed_validation'])
    train,validation=next(splitter.split(development,groups=groups[development]))
    parts={'train':development[train],'validation':development[validation],'test':test}
    sets=[set(groups[ids]) for ids in parts.values()]
    assert len(set.union(*sets))==sum(len(s) for s in sets)
    assert all(set(labels[ids])==set(LABELS) for ids in parts.values())
    if run:
        write_csv(Path(run)/'partitions.csv',[dict(row_index=int(i),source_index=rows[int(i)]['index'],
            group_component=int(groups[i]),partition=name,label=int(labels[i])) for name,ids in parts.items() for i in ids])
        write_json(Path(run)/'split_summary.json',{name:dict(rows=len(ids),groups=len(set(groups[ids]))) for name,ids in parts.items()})
    return parts,groups

def trial_specs(config):
    specs=[]
    for feature in config['features']:
        for family in ['logistic_regression','linear_svm','multinomial_nb']:
            values=config['alpha_values'] if family=='multinomial_nb' else config['C_values']
            for value in values:
                specs.append(dict(trial_id=f'T{len(specs)+1:03}',feature=feature,family=family,
                    parameter_name='alpha' if family=='multinomial_nb' else 'C',parameter_value=value))
    return specs

def make_pipeline(spec):
    feature=spec['feature'];char=feature['analyzer']=='char'
    tf=TfidfVectorizer(analyzer=feature['analyzer'],ngram_range=(2,5) if char else (1,2),
        min_df=2 if char else 1,sublinear_tf=True,max_features=feature['max_features'])
    value=spec['parameter_value'];family=spec['family']
    if family=='logistic_regression':clf=LogisticRegression(C=value,max_iter=1500,class_weight='balanced',random_state=42)
    elif family=='linear_svm':clf=LinearSVC(C=value,class_weight='balanced',random_state=42,max_iter=10000,dual='auto')
    elif family=='multinomial_nb':clf=MultinomialNB(alpha=value)
    else:raise ValueError(family)
    return Pipeline([('tfidf',tf),('classifier',clf)])

def portable_model(pipeline,spec,metadata,source_hash):
    tf=pipeline.named_steps['tfidf'];clf=pipeline.named_steps['classifier']
    if spec['family']=='multinomial_nb':weights=clf.feature_log_prob_;bias=clf.class_log_prior_
    else:weights=clf.coef_;bias=clf.intercept_
    return dict(schema=2,variant=spec['trial_id']+'_'+spec['family']+'_'+spec['feature']['name'],
        classifier_type=spec['family'],score_semantics='softmax of SVM decision scores; not probabilities' if spec['family']=='linear_svm' else 'uncalibrated model probabilities',
        run_id=metadata['run_id'],source_git_commit=metadata['source_git_commit'],training_code_sha256=metadata['training_code_sha256'],
        source_sha256=source_hash,source=SOURCE,classes=[int(x) for x in clf.classes_],class_names=[LABELS[int(x)] for x in clf.classes_],
        analyzer=tf.analyzer,ngram_range=list(tf.ngram_range),lowercase=tf.lowercase,sublinear_tf=tf.sublinear_tf,norm=tf.norm,
        vocabulary={k:int(v) for k,v in tf.vocabulary_.items()},idf=tf.idf_.tolist(),coefficients=weights.tolist(),intercept=bias.tolist())

def decision_scores(pipeline,texts):
    clf=pipeline.named_steps['classifier'];x=pipeline.named_steps['tfidf'].transform(texts)
    if isinstance(clf,MultinomialNB):return np.asarray(x @ clf.feature_log_prob_.T)+clf.class_log_prior_
    return clf.decision_function(x)

def fit_trial(spec,rows,parts,config,metadata,source_hash):
    """No test rows are read by this function."""
    pipeline=make_pipeline(spec)
    train=[rows[int(i)] for i in parts['train']];validation=[rows[int(i)] for i in parts['validation']]
    started=perf_counter()
    with threadpool_limits(limits=1):
        pipeline.fit([r['javanese sentence'] for r in train],[int(r['label']) for r in train])
    seconds=perf_counter()-started
    truth=[int(r['label']) for r in validation];pred=pipeline.predict([r['javanese sentence'] for r in validation])
    exported=portable_model(pipeline,spec,metadata,source_hash)
    exported.update(training_rows=len(parts['train']),joblib_sha256='0'*64)
    size=len(canonical(exported).encode())
    record=dict(trial_id=spec['trial_id'],family=spec['family'],feature=spec['feature']['name'],
        parameter_name=spec['parameter_name'],parameter_value=spec['parameter_value'],
        validation_macro_f1=float(f1_score(truth,pred,labels=list(LABELS),average='macro',zero_division=0)),
        validation_accuracy=float(accuracy_score(truth,pred)),features=len(exported['vocabulary']),model_json_bytes=size,
        eligible=size<=config['model_json_budget_bytes'],fit_seconds=seconds)
    return pipeline,record

def select_trial(records,config,run):
    eligible=[r for r in records if r['eligible']]
    if not eligible:raise RuntimeError('No candidate fits the predefined JSON budget.')
    best=max(r['validation_macro_f1'] for r in eligible);floor=best-config['validation_tolerance']
    selected=min((r for r in eligible if r['validation_macro_f1']>=floor),key=lambda r:(r['model_json_bytes'],-r['validation_macro_f1'],r['trial_id']))
    write_json(Path(run)/'selection.json',dict(selected=selected,best_eligible_validation_macro_f1=best,floor=floor,
        reason=config['selection'],test_used_for_selection=False))
    return selected

def evaluate_test_once(pipeline,selected,rows,parts,run):
    path=Path(run)/'test_metrics.json'
    if path.exists():raise RuntimeError('Test already evaluated for this run. Read its saved result; do not retune using test.')
    test=[rows[int(i)] for i in parts['test']];texts=[r['javanese sentence'] for r in test]
    truth=[int(r['label']) for r in test];pred=pipeline.predict(texts)
    metrics=dict(selected_trial=selected['trial_id'],macro_f1=float(f1_score(truth,pred,labels=list(LABELS),average='macro',zero_division=0)),
        accuracy=float(accuracy_score(truth,pred)),rows=len(test),confusion_matrix=confusion_matrix(truth,pred,labels=list(LABELS)).tolist(),
        per_class=classification_report(truth,pred,labels=list(LABELS),target_names=list(LABELS.values()),output_dict=True,zero_division=0))
    write_json(path,metrics)
    write_csv(Path(run)/'test_predictions.csv',[dict(source_index=r['index'],text=r['javanese sentence'],truth=int(y),prediction=int(p)) for r,y,p in zip(test,truth,pred)])
    joblib.dump(pipeline,Path(run)/'selected_pipeline.joblib',compress=3)
    return metrics

def verification(pipeline,rows,parts):
    queries=[rows[int(i)]['javanese sentence'] for i in parts['test']]
    extra=['','  ','x','1234567890xyzxyz','KULA NEDHA PECEL DINTEN PUNIKI.','Kula\t\t\nnedha pecel.','kélingan sekolah','👋 Kowe sinau apa?','İ σ Σ ς']
    scores=decision_scores(pipeline,queries+extra);normalized=softmax(scores,axis=1);pred=pipeline.predict(queries+extra)
    counts=pipeline.named_steps['tfidf'].transform(queries+extra).getnnz(axis=1)
    return dict(held_out_count=len(queries),expected_labels=[int(rows[int(i)]['label']) for i in parts['test']],
        fixtures=[dict(text=q,label=int(y),feature_count=int(n),decision_scores=s.tolist(),normalized_scores=p.tolist()) for q,y,n,s,p in zip(queries+extra,pred,counts,scores,normalized)])

def export_pwa(root,run,pipeline,spec,metadata,rows,dialogues,parts):
    root=Path(root);docs=root/'docs';assets=docs/'assets';assets.mkdir(exist_ok=True)
    source_hash=digest(root/'data/translation.csv')
    portable=portable_model(pipeline,spec,metadata,source_hash)
    portable['training_rows']=len(parts['train']);portable['joblib_sha256']=digest(Path(run)/'selected_pipeline.joblib')
    write_json(assets/'model.json',portable);write_json(assets/'corpus.json',dict(source=SOURCE,sentences=rows,conversations=dialogues))
    write_json(assets/'verification.json',verification(pipeline,rows,parts))
    contents={}
    for path in sorted(docs.rglob('*')):
        if path.is_file() and not path.name.startswith('.') and path.name not in ['release.json','sw.js']:
            contents[path.relative_to(docs).as_posix()]=dict(bytes=path.stat().st_size,sha256=digest(path))
    version=hashlib.sha256(canonical(contents).encode()).hexdigest()[:16]
    write_json(docs/'release.json',dict(version=version,run_id=metadata['run_id'],model_variant=portable['variant'],files=contents,features=len(portable['idf'])))
    paths=['./','./release.json',*['./'+name for name in contents]]
    template=(root/'pwa_worker.template.js').read_text(encoding='utf-8')
    (docs/'sw.js').write_text(template.replace('__BUILD__',version).replace('__ASSETS__',json.dumps(paths)),encoding='utf-8')
    report=dict(version=version,run_id=metadata['run_id'],model=portable['variant'],classifier_type=spec['family'],
        model_json_bytes=(assets/'model.json').stat().st_size,static_files_bytes=sum(p.stat().st_size for p in docs.rglob('*') if p.is_file()),
        code_commit=metadata['source_git_commit'],training_code_sha256=metadata['training_code_sha256'],dataset_sha256=source_hash,
        note='Static file size differs from compressed transfer size, Joblib size, and browser memory.')
    write_json(Path(run)/'pwa_export.json',report)
    return report

def trace_sentence(pipeline,exported,text,run):
    tf=pipeline.named_steps['tfidf'];x=tf.transform([text]);vocab=tf.get_feature_names_out()
    counts={}
    for gram in tf.build_analyzer()(text):counts[gram]=counts.get(gram,0)+1
    weights=np.asarray(exported['coefficients']);bias=np.asarray(exported['intercept'])
    evidence=[]
    for index,value in zip(x.indices,x.data):
        gram=vocab[index];row=dict(feature_index=int(index),ngram=gram,raw_count=counts[gram],idf=float(tf.idf_[index]),tfidf=float(value))
        for i,name in enumerate(exported['class_names']):row['contribution_'+name]=float(value*weights[i,index])
        evidence.append(row)
    evidence.sort(key=lambda r:-abs(r['tfidf']))
    write_csv(Path(run)/'trace_features.csv',evidence)
    reconstructed=bias+np.asarray(x @ weights.T).ravel();expected=decision_scores(pipeline,[text])[0]
    assert np.allclose(reconstructed,expected,atol=1e-10)
    trace=dict(text=text,recognized_features=int(x.nnz),classes=exported['class_names'],intercepts=bias.tolist(),
        reconstructed_decision_scores=reconstructed.tolist(),prediction=int(pipeline.predict([text])[0]),
        explanation='Each class score equals its intercept plus the sum of feature contributions. These are model decisions, not contextual politeness judgments.')
    write_json(Path(run)/'trace_summary.json',trace)
    return evidence,trace

def plot_results(records,run):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    colors={'logistic_regression':'#19786a','linear_svm':'#c87828','multinomial_nb':'#496a9b'}
    fig,ax=plt.subplots(figsize=(8,4.7))
    for family,color in colors.items():
        rows=[r for r in records if r['family']==family]
        ax.scatter([r['model_json_bytes']/1024 for r in rows],[r['validation_macro_f1'] for r in rows],label=family,color=color,alpha=.8)
    ax.set(xscale='log',xlabel='Model JSON size (KiB, log scale)',ylabel='Validation macro-F1',title='Validation evidence before test evaluation')
    ax.legend();ax.grid(alpha=.2);fig.tight_layout();fig.savefig(Path(run)/'validation_tradeoff.png',dpi=170);plt.close(fig)

def make_update_zip(root,run):
    """GitHub updates contain the complete docs release plus small experiment evidence."""
    import zipfile
    root=Path(root);run=Path(run);path=run/'github_update.zip'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        for file in (root/'docs').rglob('*'):
            if file.is_file():z.write(file,file.relative_to(root))
        for file in run.rglob('*'):
            if file.is_file() and file.suffix not in ['.zip','.joblib','.pt','.bin','.safetensors']:
                z.write(file,file.relative_to(root))
    return path

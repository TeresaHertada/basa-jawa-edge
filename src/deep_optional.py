"""Optional fine-tuning experiment, separate from the deployable PWA model.

Uses an IMDB-domain masked-language-model backbone, not an existing
Unggah-Ungguh classifier that might already have seen the held-out rows.
Run this module only from the optional notebook after the main experiment.
"""
import copy
import json
from pathlib import Path
import random
import time
import numpy as np
from sklearn.metrics import f1_score,accuracy_score,classification_report,confusion_matrix
from . import lab

def seed_all(seed):
    import torch
    random.seed(seed);np.random.seed(seed);torch.manual_seed(seed)
    if torch.cuda.is_available():torch.cuda.manual_seed_all(seed)

def fit_one(model_id,revision,lr,rows,parts,tokenizer,output,epochs=2,max_length=128,batch_size=16):
    import torch
    from transformers import AutoModelForSequenceClassification
    seed_all(42);device=torch.device('cuda')
    model=AutoModelForSequenceClassification.from_pretrained(model_id,revision=revision,
        num_labels=4,id2label=lab.LABELS,label2id={v:k for k,v in lab.LABELS.items()},trust_remote_code=False)
    model.to(device)
    def collate(batch):
        texts=[r['javanese sentence'] for r in batch]
        encoded=tokenizer(texts,padding=True,truncation=True,max_length=max_length,return_tensors='pt')
        encoded['labels']=torch.tensor([int(r['label']) for r in batch],dtype=torch.long)
        return encoded
    generator=torch.Generator().manual_seed(42)
    train=torch.utils.data.DataLoader([rows[int(i)] for i in parts['train']],batch_size=batch_size,shuffle=True,collate_fn=collate,generator=generator)
    validation=torch.utils.data.DataLoader([rows[int(i)] for i in parts['validation']],batch_size=batch_size,shuffle=False,collate_fn=collate)
    counts=np.bincount([int(rows[int(i)]['label']) for i in parts['train']],minlength=4)
    weights=torch.tensor(len(parts['train'])/(4*counts),dtype=torch.float32,device=device)
    criterion=torch.nn.CrossEntropyLoss(weight=weights)
    optimizer=torch.optim.AdamW(model.parameters(),lr=lr,weight_decay=.01)
    history=[];best=-1;checkpoint=None
    for epoch in range(1,epochs+1):
        model.train();loss_sum=0;started=time.perf_counter()
        for step,batch in enumerate(train,1):
            batch={k:v.to(device) for k,v in batch.items()};labels=batch.pop('labels')
            optimizer.zero_grad(set_to_none=True);logits=model(**batch).logits;loss=criterion(logits,labels)
            loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.0);optimizer.step();loss_sum+=loss.item()
            if step==1 or step%20==0:print(f'lr={lr} epoch={epoch} step={step}/{len(train)} loss={loss.item():.4f}')
        model.eval();truth=[];pred=[]
        with torch.no_grad():
            for batch in validation:
                truth.extend(batch.pop('labels').tolist());pred.extend(model(**{k:v.to(device) for k,v in batch.items()}).logits.argmax(-1).cpu().tolist())
        score=float(f1_score(truth,pred,labels=list(lab.LABELS),average='macro',zero_division=0))
        record=dict(learning_rate=lr,epoch=epoch,mean_train_batch_loss=loss_sum/len(train),validation_macro_f1=score,elapsed_seconds=time.perf_counter()-started)
        history.append(record);print(record);lab.write_csv(Path(output)/f'lr_{lr}_history.csv',history)
        if score>best:
            best=score;checkpoint={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
            state_file=Path(output)/f'deep_checkpoints/lr_{lr}/best_state.pt'
            state_file.parent.mkdir(parents=True,exist_ok=True);torch.save(checkpoint,state_file)
            lab.write_json(Path(output)/f'lr_{lr}_best.json',record)
    del optimizer;del model;torch.cuda.empty_cache()
    return checkpoint,history

def evaluate_selected(model_id,revision,state,tokenizer,rows,parts,output,max_length=128,batch_size=16):
    import torch
    from transformers import AutoModelForSequenceClassification
    path=Path(output)/'deep_test_metrics.json'
    if path.exists():raise RuntimeError('Deep test already evaluated; use saved results.')
    seed_all(42);device=torch.device('cuda')
    model=AutoModelForSequenceClassification.from_pretrained(model_id,revision=revision,num_labels=4,
        id2label=lab.LABELS,label2id={v:k for k,v in lab.LABELS.items()},trust_remote_code=False)
    model.load_state_dict(state);model.to(device);model.eval();truth=[];pred=[]
    with torch.no_grad():
        ids=parts['test']
        for start in range(0,len(ids),batch_size):
            batch=[rows[int(i)] for i in ids[start:start+batch_size]]
            encoded=tokenizer([r['javanese sentence'] for r in batch],padding=True,truncation=True,max_length=max_length,return_tensors='pt')
            pred.extend(model(**{k:v.to(device) for k,v in encoded.items()}).logits.argmax(-1).cpu().tolist())
            truth.extend(int(r['label']) for r in batch)
    metrics=dict(macro_f1=float(f1_score(truth,pred,labels=list(lab.LABELS),average='macro',zero_division=0)),accuracy=float(accuracy_score(truth,pred)),
        confusion_matrix=confusion_matrix(truth,pred,labels=list(lab.LABELS)).tolist(),
        per_class=classification_report(truth,pred,labels=list(lab.LABELS),target_names=list(lab.LABELS.values()),output_dict=True,zero_division=0),
        note='Optional DistilBERT result. Not exported to the lightweight PWA runtime. GPU times are not comparable with CPU/browser timings.')
    lab.write_json(path,metrics)
    checkpoint=Path(output)/'deep_checkpoints/selected';checkpoint.mkdir(parents=True,exist_ok=True)
    model.save_pretrained(checkpoint,safe_serialization=True);tokenizer.save_pretrained(checkpoint)
    lab.write_csv(Path(output)/'deep_test_predictions.csv',[dict(source_index=rows[int(i)]['index'],truth=y,prediction=p) for i,y,p in zip(parts['test'],truth,pred)])
    return metrics,checkpoint

---
language:
- jv
- en
- id
pretty_name: Javanese Honorifics (Unggah-Ungguh)
configs:
- config_name: translation
  data_files:
  - split: train
    path: data/translation/train-*
- config_name: conversation
  data_files:
  - split: train
    path: data/conversation/train-*
dataset_info:
- config_name: translation
  features:
  - name: index
    dtype: int64
  - name: label
    dtype: int64
  - name: javanese sentence
    dtype: string
  - name: group
    dtype: int64
  - name: indonesian sentence
    dtype: string
  - name: english sentence
    dtype: string
  splits:
  - name: train
    num_bytes: 407091
    num_examples: 2009
  dataset_size: 407091
- config_name: conversation
  features:
  - name: index
    dtype: int64
  - name: role a
    dtype: string
  - name: role b
    dtype: string
  - name: context
    dtype: string
  - name: a utterance
    dtype: string
  - name: a utterance category
    dtype: int64
  - name: b utterance
    dtype: string
  - name: b utterance category
    dtype: int64
  splits:
  - name: train
    num_bytes: 25347
    num_examples: 80
  dataset_size: 25347
license: cc-by-nc-4.0
size_categories:
- 1K<n<10K
---

# Javanese Honorifics Dataset (Unggah-Ungguh - Released Version)

The Javanese language, spoken by over 98 million people, features a distinctive honorific system known as Unggah-Ungguh Basa. In this dataset we present UNGGAH-UNGGUH, a carefully curated dataset designed to encapsulate the nuances of Unggah-Ungguh Basa, the Javanese speech etiquette framework that dictates the choice of words and phrases based on social hierarchy and context.

- **Paper:** https://arxiv.org/pdf/2502.20864
- **Github:** https://github.com/JavaneseHonorifics
- **Venue:** ACL 2025 Main Conference

## Dataset Description

Current version of the released dataset (v1.0) covers ~2k paralel sentences for translation category and 80 instances for conversation category (about 50% of whole dataset).

- **Funded by:** Lembaga Pengelola Dana Pendidikan (LPDP)
- **Language:** Javanese
- **Licence:** CC-BY-NC 4.0

## Dataset Structure

Unggah-Ungguh present 2 categories: Conversation and Translation.
The translation dataset (~4K instances):

- index: Unique ID for each instance
- label: Honorific level of the Javanese sentence (0: Ngoko, 1: Ngoko Alus, 2: Krama, 3: Krama Alus)
- javanese sentence: A sentence in Javanese with a specific honorific level
- group: Group ID for related sentence sets
- indonesian sentence: Translation in Indonesian
- english sentence: Translation in English

The conversation dataset (160 instances):

- index: Unique ID for each instance
- role a: Social role of Speaker A
- role b: Social role of Speaker B
- context: Description of the conversation context
- a utterance: (EXAMPLE) Appropriate utterance by Speaker A
- a utterance category: Honorific level of Speaker A’s utterance
- b utterance: (EXAMPLE) Appropriate utterance by Speaker B
- b utterance category: Honorific level of Speaker B’s utterance

## Citation
```
@inproceedings{farhansyah-etal-2025-language,
    title = "Do Language Models Understand Honorific Systems in {J}avanese?",
    author = "Farhansyah, Mohammad Rifqi  and
      Darmawan, Iwan  and
      Kusumawardhana, Adryan  and
      Winata, Genta Indra  and
      Aji, Alham Fikri  and
      Wijaya, Derry Tanti",
    editor = "Che, Wanxiang  and
      Nabende, Joyce  and
      Shutova, Ekaterina  and
      Pilehvar, Mohammad Taher",
    booktitle = "Proceedings of the 63rd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)",
    month = jul,
    year = "2025",
    address = "Vienna, Austria",
    publisher = "Association for Computational Linguistics",
    url = "https://aclanthology.org/2025.acl-long.1296/",
    doi = "10.18653/v1/2025.acl-long.1296",
    pages = "26732--26754",
    ISBN = "979-8-89176-251-0",
    abstract = "The Javanese language features a complex system of honorifics that vary according to the social status of the speaker, listener, and referent. Despite its cultural and linguistic significance, there has been limited progress in developing a comprehensive corpus to capture these variations for natural language processing (NLP) tasks. In this paper, we present Unggah-Ungguh, a carefully curated dataset designed to encapsulate the nuances of Unggah-Ungguh Basa, the Javanese speech etiquette framework that dictates the choice of words and phrases based on social hierarchy and context. Using Unggah-Ungguh, we assess the ability of language models (LMs) to process various levels of Javanese honorifics through classification and machine translation tasks. To further evaluate cross-lingual LMs, we conduct machine translation experiments between Javanese (at specific honorific levels) and Indonesian. Additionally, we explore whether LMs can generate contextually appropriate Javanese honorifics in conversation tasks, where the honorific usage should align with the social role and contextual cues. Our findings indicate that current LMs struggle with most honorific levels, exhibiting a bias toward certain honorific tiers."
}
```

## Dataset Card Authors

- M. Rifqi Farhansyah ([@rifqifarhansyah](https://github.com/rifqifarhansyah))
- Iwan Darmawan ([@idar0006](https://github.com/idar0006))
- Adryan Kusumawardhana ([@adryankus](https://github.com/adryankus))
- Genta Indra Winata ([@gentaiscool](https://github.com/gentaiscool))
- Alham Fikri Aji ([@afaji](https://github.com/afaji))
- Derry Tanti Wijaya ([@derrywijaya](https://github.com/derrywijaya))
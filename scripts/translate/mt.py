# Translate unique English UI strings into the target languages with NLLB-200.
# Usage: python mt.py strings.json out_dir lang1,lang2 [limit]
import json, re, sys, os, time
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

CODES = {'tr': 'tur_Latn', 'am': 'amh_Ethi', 'fil': 'tgl_Latn', 'id': 'ind_Latn', 'ne': 'npi_Deva', 'ml': 'mal_Mlym'}
PH = re.compile(r'\{\{\s*(\w+)\s*\}\}')
# Emojis and symbols at either end stay outside the translation (the model drops them).
EDGE = re.compile(r'^([^\w{}\[\]"«(]*)(.*?)([^\w{}\[\]"»)?!.:…]*)$', re.S)


def split_edges(text):
    m = EDGE.match(text)
    return (m.group(1), m.group(2), m.group(3)) if m and m.group(2) else ('', text, '')


def tidy(src, out):
    out = out.strip()
    if out.startswith('- '):
        out = out[2:]
    if not src.rstrip().endswith(('.', '。')):
        out = re.sub(r'\s*[.。]$', '', out)
    return out


def protect(text):
    names = PH.findall(text)
    out = text
    for i, _ in enumerate(names):
        out = PH.sub(f'[{i}]', out, count=1)
    return out, names


def restore(text, names):
    for i, n in enumerate(names):
        text = text.replace(f'[{i}]', '{{' + n + '}}', 1)
    missing = [n for n in names if '{{' + n + '}}' not in text]
    # A placeholder the model lost is appended, so interpolation still shows the value.
    return text + ''.join(' {{' + n + '}}' for n in missing)


def main():
    src_path, out_dir, langs = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else None
    strings = json.load(open(src_path, encoding='utf-8'))
    if limit:
        strings = strings[:limit]
    torch.set_num_threads(int(os.environ.get('MT_THREADS', '8')))
    name = os.environ.get('MT_MODEL', 'facebook/nllb-200-distilled-1.3B')
    tok = AutoTokenizer.from_pretrained(name, src_lang='eng_Latn')
    model = AutoModelForSeq2SeqLM.from_pretrained(name).eval()

    def translate(batch, lang):
        enc = tok(batch, return_tensors='pt', padding=True, truncation=True, max_length=256)
        with torch.inference_mode():
            out = model.generate(**enc, forced_bos_token_id=tok.convert_tokens_to_ids(CODES[lang]),
                                 max_new_tokens=300, num_beams=int(os.environ.get('MT_BEAMS', '2')))
        return tok.batch_decode(out, skip_special_tokens=True)

    os.makedirs(out_dir, exist_ok=True)
    for lang in langs:
        path = os.path.join(out_dir, f'{lang}.json')
        done = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
        # MT_SHARD=i/n: this worker takes every n-th string and saves to its own file,
        # so several workers share one language; combine.py folds the shards back in.
        shard = os.environ.get('MT_SHARD')
        mine = strings
        if shard:
            i, n = map(int, shard.split('/'))
            mine = [s for k, s in enumerate(strings) if k % n == i]
            path = os.path.join(out_dir, f'{lang}.s{i}.json')
            if os.path.exists(path):
                done.update(json.load(open(path, encoding='utf-8')))
        todo = [s for s in mine if s not in done]
        t0 = time.time()
        for i in range(0, len(todo), 12):
            chunk = todo[i:i + 12]
            edges = [split_edges(s) for s in chunk]
            prot = [protect(e[1]) for e in edges]
            res = translate([p[0] for p in prot], lang)
            for s, (pre, core, post), (_, names), r in zip(chunk, edges, prot, res):
                done[s] = pre + tidy(core, restore(r, names)) + post
            json.dump(done, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
            print(lang, len(done), '/', len(mine), f'{time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()

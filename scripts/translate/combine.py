# Folds the shard files (<lang>.s<i>.json) written with MT_SHARD into <lang>.json.
# Usage: python combine.py out_dir
import glob, json, os, re, sys

out_dir = sys.argv[1]
for shard in sorted(glob.glob(os.path.join(out_dir, '*.s[0-9]*.json'))):
    lang = re.match(r'(.+)\.s\d+\.json$', os.path.basename(shard)).group(1)
    path = os.path.join(out_dir, f'{lang}.json')
    done = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    done.update(json.load(open(shard, encoding='utf-8')))
    json.dump(done, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    os.remove(shard)
    print(lang, len(done))

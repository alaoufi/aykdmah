#!/bin/bash
# Balanced pass (AYK-037): every worker takes a quarter of every remaining language,
# site texts first, then the second batch, so no worker sits idle at the end.
# Resumes from out/ and out2/; run combine.py on both folders afterwards.
set -e
docker exec mt-base sh -c 'for p in $(ls /proc | grep -E "^[0-9]+$"); do c=$(tr "\0" " " < /proc/$p/cmdline 2>/dev/null); case "$c" in python*) kill $p;; esac; done' || true
sleep 3
L=fil,ne,tr,am,ml,id
for i in 0 1 2 3; do
  docker exec -d -e MT_SHARD=$i/4 -e MT_THREADS=2 -e MT_BEAMS=1 -e MT_MODEL=facebook/nllb-200-distilled-600M -w /w mt-base \
    sh -c "python mt.py strings.json out $L > log-s$i.txt 2>&1 && python mt.py strings2.json out2 $L > log2-s$i.txt 2>&1 && touch done-s$i"
done

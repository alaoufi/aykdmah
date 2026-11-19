#!/bin/bash
# Faster pass (AYK-037): the 600M NLLB model with greedy decoding, four workers of two
# threads. Each worker finishes its site texts, then the second batch. Both resume
# from what is already saved in out/ and out2/.
set -e
docker exec mt-base sh -c 'for p in $(ls /proc | grep -E "^[0-9]+$"); do c=$(tr "\0" " " < /proc/$p/cmdline 2>/dev/null); case "$c" in python*) kill $p;; esac; done' || true
sleep 3
for g in 'ml,fil:ml' 'id,ne:id' 'am:am' 'tr:tr'; do
  L=${g%%:*}; F=${g##*:}
  docker exec -d -e MT_THREADS=2 -e MT_BEAMS=1 -e MT_MODEL=facebook/nllb-200-distilled-600M -w /w mt-base \
    sh -c "python mt.py strings.json out $L > log-$F.txt 2>&1 && python mt.py strings2.json out2 $L > log2-$F.txt 2>&1"
done

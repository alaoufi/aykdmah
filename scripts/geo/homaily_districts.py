"""Neighborhoods for every matched city from the Homaily dataset (GPL-2.0), pinned to
commit 7e322945fa9f6d696a54ba3e9038e0e750e9692d. The dataset is compiled from Saudi
National Address maps (2022); its district_id is kept as source_ref.

Inputs (working directory):
  hom_cities.json, hom_districts_lite.json, hom_regions_lite.json   (from the dataset)
  cities.psv     id|name_ar|latitude|longitude|region_id   (our cities)
  regions.psv    id|code                                   (our regions)
  existing.psv   city_id|name_ar                           (current districts)
Output: districts-homaily.json and covered-cities.json; summary on stdout.

A dataset city matches one of ours when the region is the same and the normalised
Arabic name is equal, or, failing that, its centre lies within 8 km of ours.
"""
import collections
import json
import math
import re


def normalise(name):
    s = re.sub('[ً-ْـ]', '', (name or '').strip())
    s = re.sub(r'^(حي|حى|حـي|مدينة|محافظة)\s+', '', s)
    for a, b in (('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ة', 'ه'), ('ى', 'ي')):
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s)


def km(lat1, lon1, lat2, lon2):
    r = math.radians
    h = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def rows(path):
    return [line.split('|') for line in open(path, encoding='utf-8').read().splitlines() if line]


def main():
    regions = {code: int(rid) for rid, code in rows('regions.psv')}
    hom_regions = {r['region_id']: r['code'] for r in json.load(open('hom_regions_lite.json', encoding='utf-8'))}
    hom_cities = json.load(open('hom_cities.json', encoding='utf-8'))
    hom_districts = json.load(open('hom_districts_lite.json', encoding='utf-8'))
    with_districts = {d['city_id'] for d in hom_districts}
    ours = [(int(i), n, float(a), float(o), int(r)) for i, n, a, o, r in rows('cities.psv')]
    seen = collections.defaultdict(set)
    for cid, name in rows('existing.psv'):
        seen[int(cid)].add(normalise(name))

    city_map, stats = {}, collections.Counter()
    for cid, name, lat, lon, region in ours:
        candidates = [c for c in hom_cities if c['city_id'] in with_districts
                      and regions.get(hom_regions.get(c['region_id'])) == region]
        exact = [c for c in candidates if normalise(c['name_ar']) == normalise(name)]
        if exact:
            city_map[exact[0]['city_id']] = cid
            stats['matched_by_name'] += 1
            continue
        near = [c for c in candidates if c.get('center') and km(lat, lon, c['center'][0], c['center'][1]) <= 8]
        if near:
            city_map[min(near, key=lambda c: km(lat, lon, c['center'][0], c['center'][1]))['city_id']] = cid
            stats['matched_by_distance'] += 1

    out = []
    for d in hom_districts:
        cid = city_map.get(d['city_id'])
        if not cid:
            continue
        key = normalise(d['name_ar'])
        if not key or key in seen[cid]:
            stats['duplicate'] += 1
            continue
        seen[cid].add(key)
        name_ar = re.sub(r'^(حي|حى)\s+', '', d['name_ar'].strip())
        name_en = re.sub(r'\s+Dist\.?$', '', (d.get('name_en') or '').strip()) or None
        out.append({'city_id': cid, 'name_ar': name_ar[:120], 'name_en': name_en and name_en[:120],
                    'lat': None, 'lon': None, 'source_ref': str(d['district_id'])})
        stats['added'] += 1

    json.dump(out, open('districts-homaily.json', 'w', encoding='utf-8'), ensure_ascii=False)
    # Cities whose list comes from this dataset (including ones imported earlier, such as
    # Al-Qassim). Cities with only a few seed districts stay open for OpenStreetMap.
    # Al-Qassim cities and Al Majmaah were imported earlier from this same dataset (migration 031).
    earlier = {cid for cid, name, _, _, region in ours if region == 4 or normalise(name) == normalise('المجمعة')}
    covered = sorted(set(city_map.values()) | earlier)
    json.dump(covered, open('covered-cities.json', 'w'))
    names = {c[0]: c[1] for c in ours}
    per = collections.Counter(o['city_id'] for o in out)
    print(dict(stats))
    print('cities gaining districts:', len(per), '| cities covered in total:', len(covered), 'of', len(ours))
    print([(names[c], n) for c, n in per.most_common(20)])


if __name__ == '__main__':
    main()

"""Build the neighborhood list for Saudi cities from an OpenStreetMap extract.

Inputs (working directory):
  places.geojsonseq   osmium export of place=suburb|neighbourhood|quarter
  sa-boundary.geojson osmium export of the Saudi national boundary (ISO3166-1=SA)
  cities.psv          id|name_ar|latitude|longitude|region_id   (from the database)
  existing.psv        city_id|name_ar                           (current districts)
  covered-cities.json optional: city ids that already have a source list (skipped here)
Output: districts-osm.json, and a summary on stdout.

Rules: keep places inside Saudi Arabia that have an Arabic name, attach each to the
nearest city centre within 40 km, and skip names already present in that city after
normalising spelling (diacritics, alef/ya/ta marbuta forms, a leading «حي»).
Nothing is invented: names and coordinates come from OpenStreetMap as-is.
"""
import collections
import json
import math
import re

MAX_KM = 40
ARABIC = re.compile('[؀-ۿ]')


def ring_contains(ring, x, y):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi:
            inside = not inside
        j = i
    return inside


def load_boundary(path):
    polygons = []
    for feature in json.load(open(path, encoding='utf-8'))['features']:
        geometry = feature['geometry']
        parts = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        polygons.extend(parts)
    return polygons


def in_polygons(polygons, x, y):
    return any(ring_contains(p[0], x, y) and not any(ring_contains(h, x, y) for h in p[1:]) for p in polygons)


def representative_point(geometry):
    if geometry['type'] == 'Point':
        return geometry['coordinates']
    if geometry['type'] == 'Polygon':
        points = geometry['coordinates'][0]
    elif geometry['type'] == 'MultiPolygon':
        points = [c for polygon in geometry['coordinates'] for c in polygon[0]]
    elif geometry['type'] == 'LineString':
        points = geometry['coordinates']
    else:  # MultiLineString
        points = [c for line in geometry['coordinates'] for c in line]
    return [sum(c[0] for c in points) / len(points), sum(c[1] for c in points) / len(points)]


def normalise(name):
    s = re.sub('[ً-ْـ]', '', name.strip())
    s = re.sub(r'^(حي|حى|حـي)\s+', '', s)
    for a, b in (('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ة', 'ه'), ('ى', 'ي')):
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s)


def km(lat1, lon1, lat2, lon2):
    r = math.radians
    h = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def main():
    polygons = load_boundary('sa-boundary.geojson')
    cities = []
    for line in open('cities.psv', encoding='utf-8').read().splitlines():
        if line:
            cid, name, lat, lon, _ = line.split('|')
            cities.append((int(cid), name, float(lat), float(lon)))
    import os
    covered = set(json.load(open('covered-cities.json'))) if os.path.exists('covered-cities.json') else set()
    seen = collections.defaultdict(set)
    for line in open('existing.psv', encoding='utf-8').read().splitlines():
        if line:
            cid, name = line.split('|', 1)
            seen[int(cid)].add(normalise(name))

    out, stats = [], collections.Counter()
    for line in open('places.geojsonseq', encoding='utf-8'):
        line = line.strip('\x1e\n ')
        if not line:
            continue
        feature = json.loads(line)
        tags, geometry = feature['properties'], feature['geometry']
        raw = tags.get('name', '')
        name = tags.get('name:ar') or (raw if ARABIC.search(raw) else None)
        if not name:
            stats['no_arabic_name'] += 1
            continue
        x, y = representative_point(geometry)
        if not in_polygons(polygons, x, y):
            stats['outside_saudi'] += 1
            continue
        city = min(cities, key=lambda c: km(y, x, c[2], c[3]))
        if km(y, x, city[2], city[3]) > MAX_KM:
            stats['far_from_any_city'] += 1
            continue
        if city[0] in covered:
            stats['city_has_source_list'] += 1
            continue
        key = normalise(name)
        if not key or key in seen[city[0]]:
            stats['duplicate'] += 1
            continue
        seen[city[0]].add(key)
        english = tags.get('name:en') or (raw if raw and not ARABIC.search(raw) else None)
        out.append({
            'city_id': city[0], 'name_ar': name.strip()[:120],
            'name_en': (english or '').strip()[:120] or None,
            'lat': round(y, 7), 'lon': round(x, 7), 'place': tags.get('place'),
        })
        stats['added'] += 1

    json.dump(out, open('districts-osm.json', 'w', encoding='utf-8'), ensure_ascii=False)
    per_city = collections.Counter(o['city_id'] for o in out)
    names = {c[0]: c[1] for c in cities}
    print(dict(stats))
    print('cities gaining districts:', len(per_city), 'of', len(cities))
    print([(names[c], n) for c, n in per_city.most_common(20)])


if __name__ == '__main__':
    main()

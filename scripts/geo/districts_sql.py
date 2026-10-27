"""Turn district lists into idempotent INSERT statements for a migration.

Usage: python districts_sql.py <source-name> <rows.json> [<source-name> <rows.json> ...] > inserts.sql
Each row: city_id, name_ar, name_en, lat, lon, optional source_ref. Rows are inserted
with is_verified=0 and skipped when the city is missing or the same Arabic name
already exists in that city.
"""
import json
import sys


def quote(value):
    if value is None:
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"


def number(value):
    return 'NULL' if value is None else repr(float(value))


def statements(source, rows):
    values = [f"({r['city_id']}, {quote(r['name_ar'])}, {quote(r.get('name_en'))}, {number(r.get('lat'))}, "
              f"{number(r.get('lon'))}, {quote(r.get('source_ref'))})" for r in rows]
    for start in range(0, len(values), 500):
        chunk = ',\n  '.join(values[start:start + 500])
        yield (
            'INSERT INTO districts (city_id, name_ar, name_en, latitude, longitude, is_active, source, source_ref, is_verified)\n'
            # Explicit casts: a chunk whose coordinates are all NULL would otherwise be typed as text.
            'SELECT v.city_id, v.name_ar, v.name_en, CAST(v.latitude AS DECIMAL(10,7)), '
            f'CAST(v.longitude AS DECIMAL(10,7)), 1, {quote(source)}, v.source_ref, 0\n'
            f'FROM (VALUES\n  {chunk}\n) AS v(city_id, name_ar, name_en, latitude, longitude, source_ref)\n'
            'WHERE EXISTS (SELECT 1 FROM cities c WHERE c.id = v.city_id)\n'
            '  AND NOT EXISTS (SELECT 1 FROM districts e WHERE e.city_id = v.city_id AND e.name_ar = v.name_ar);')


def main(args):
    out = []
    for source, path in zip(args[0::2], args[1::2]):
        out.extend(statements(source, json.load(open(path, encoding='utf-8'))))
    sys.stdout.write('\n\n'.join(out) + '\n')


if __name__ == '__main__':
    main(sys.argv[1:])

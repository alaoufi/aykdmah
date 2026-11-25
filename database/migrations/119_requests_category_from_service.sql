-- AYK-496 (filters audit): a request that carries only its service (older rows) belongs to the profession of that
-- service. New requests already get it when posted; this fills the old ones so the profession filters (home, board,
-- opportunities, statistics) find them. Only rows with no profession are touched; nothing is removed.
UPDATE requests SET category_id = (SELECT s.category_id FROM services s WHERE s.id = requests.service_id)
WHERE category_id IS NULL AND service_id IS NOT NULL;

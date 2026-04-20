-- Legacy seed shelf (id=1) has no user_id. When only one account exists, assign it so
-- ownership matches typical single-tenant setups. Multi-user DBs are unchanged here;
-- the API still allows mutations on id=1 while user_id IS NULL (see UserMayMutateCollectionContent).
UPDATE collections c
SET user_id = u.only_id
FROM (
    SELECT MIN(id) AS only_id, COUNT(*)::bigint AS n FROM users
) u
WHERE c.id = 1
  AND c.user_id IS NULL
  AND u.n = 1
  AND u.only_id IS NOT NULL;

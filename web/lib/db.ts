import postgres from "postgres";

// Même connection pooler Supavisor que côté ingestion Python (shared/db.py) --
// pas le SDK Supabase, pas la connexion directe (IPv6-only, cf. mémoire projet).
//
// `prepare: false` est obligatoire : le pooler Supavisor en mode "transaction"
// (port 6543) ne supporte pas les prepared statements au niveau session --
// sans ça, les requêtes échouent ou se comportent de façon incohérente sous charge.
//
// Singleton gardé via `globalThis` : en dev, chaque hot-reload réimporte ce
// module, et sans cette garde ça ouvrirait un nouveau pool à chaque édition
// de fichier sans jamais fermer l'ancien -- épuise les slots de connexion
// Supavisor au fil d'une session de dev.
declare global {
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

const sql =
  globalThis.__pgClient ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgClient = sql;
}

export default sql;

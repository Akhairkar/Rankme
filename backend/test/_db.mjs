import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export function makeDB(files = ["000_base.sql", "001_rate_limits.sql", "010_google.sql", "020_billing.sql", "040_rank.sql", "100_reviews_competitors.sql"]) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of files) sql.exec(readFileSync(fileURLToPath(new URL("../migrations/" + f, import.meta.url)), "utf8"));
  const norm = (a) => a.map((x) => (x === undefined ? null : x));
  return {
    sql,
    prepare(q) {
      return {
        bind(...a) {
          return {
            async first() { return sql.prepare(q).get(...norm(a)) || null; },
            async all() { return { results: sql.prepare(q).all(...norm(a)) }; },
            async run() { const r = sql.prepare(q).run(...norm(a)); return { meta: { changes: Number(r.changes) } }; },
          };
        },
      };
    },
  };
}

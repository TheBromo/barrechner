import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * A D1Database stand-in backed by Node's built-in SQLite, so data-layer tests run the real
 * migrations and SQL without workerd. Implements the subset of the D1 API the app uses.
 */
class Statement {
  constructor(private db: DatabaseSync, readonly sql: string, readonly params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }
  private values() {
    return this.params.map((value) => (value === undefined ? null : typeof value === "boolean" ? Number(value) : value)) as never[];
  }
  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.values()) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }
  async all<T>() {
    const rows = this.db.prepare(this.sql).all(...this.values()) as T[];
    return { results: rows.map((row) => ({ ...row })), success: true, meta: {} };
  }
  async run() {
    return this.execute();
  }
  execute() {
    const statement = this.db.prepare(this.sql);
    if (/\breturning\b/i.test(this.sql)) {
      const rows = statement.all(...this.values());
      return { results: rows.map((row) => ({ ...row })), success: true, meta: { changes: rows.length } };
    }
    const result = statement.run(...this.values());
    return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

export function createTestD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = join(import.meta.dirname, "..", "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(dir, file), "utf8"));
  }
  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return d1 as unknown as D1Database;
}

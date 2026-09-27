import type { Database, Profile } from "@/types/database";

type Tables = Database["public"]["Tables"];
type Table = keyof Tables;
type Row<T extends Table> = Tables[T]["Row"];
export type Actor = Pick<Profile, "user_id" | "role" | "status"> | null;
export type Executor = (sql: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
type Result<T> = { data: T | null; error: { message: string } | null };

const columns: Record<Table, string[]> = {
  profiles: "id user_id full_name email university nursing_year role status created_at updated_at".split(" "),
  subjects: "id name_ar name_en description status created_at".split(" "),
  conversations: "id user_id title subject_id created_at updated_at".split(" "),
  messages: "id conversation_id role content image_url tokens_input tokens_output model created_at".split(" "),
  message_feedback: "id message_id user_id is_positive reason comment created_at".split(" "),
  documents: "id title file_url file_name file_size subject_id source_type status vector_store_id file_id chunk_count error_message created_by created_at".split(" "),
  document_chunks: "id document_id subject_id content embedding chapter page_number chunk_index created_at".split(" "),
  usage_logs: "id user_id type model input_tokens output_tokens estimated_cost created_at".split(" "),
  settings: "key value updated_at".split(" "),
};

// Server-only data access: every non-system query gets an ownership predicate,
// independent of page/route checks. Values are always bound parameters.
export class Query<T extends Table> implements PromiseLike<Result<Row<T>[]>> {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private fields = "*";
  private filters: [string, string, unknown][] = [];
  private sorting: string[] = [];
  private cap?: number;
  private rows: Partial<Row<T>>[] = [];
  constructor(private table: T, private actor: Actor, private system: boolean, private execute: Executor) {
    if (!Object.hasOwn(columns, table)) throw new Error("Unknown table");
  }
  private column(name: string) {
    if (!columns[this.table].includes(name)) throw new Error("Unknown column");
    return `"${name}"`;
  }
  select(fields = "*") {
    this.fields = fields === "*" ? "*" : fields.split(",").map((f) => this.column(f.trim())).join(",");
    return this;
  }
  eq(field: string, value: unknown) { this.column(field); this.filters.push([field, "=", value]); return this; }
  gte(field: string, value: unknown) { this.column(field); this.filters.push([field, ">=", value]); return this; }
  order(field: string, options: { ascending: boolean }) { this.sorting.push(`${this.column(field)} ${options.ascending ? "ASC" : "DESC"}`); return this; }
  limit(count: number) { if (!Number.isInteger(count) || count < 0) throw new Error("Invalid limit"); this.cap = count; return this; }
  insert(rows: Partial<Row<T>> | Partial<Row<T>>[]) { this.operation = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(row: Partial<Row<T>>) { this.operation = "update"; this.rows = [row]; return this; }
  delete() { this.operation = "delete"; return this; }
  async single(): Promise<Result<Row<T>>> {
    const result = await this.run();
    if (result.error) return { data: null, error: result.error };
    if (result.data?.length !== 1) return { data: null, error: { message: "Expected one row" } };
    return { data: result.data[0], error: null };
  }
  async maybeSingle(): Promise<Result<Row<T>>> {
    const result = await this.run();
    if ((result.data?.length ?? 0) > 1) return { data: null, error: { message: "Expected at most one row" } };
    return { data: result.data?.[0] ?? null, error: result.error };
  }
  then<A = Result<Row<T>[]>, B = never>(ok?: ((value: Result<Row<T>[]>) => A | PromiseLike<A>) | null, fail?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(ok, fail);
  }
  private async run(): Promise<Result<Row<T>[]>> {
    try {
      const values: unknown[] = [];
      const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
      const admin = this.actor?.role === "admin" && this.actor.status === "active";
      if (!this.system && (!this.actor || this.actor.status !== "active")) throw new Error("Unauthorized");
      const isRead = this.operation === "select";
      let scope = "TRUE";
      if (!this.system && !admin) {
        const uid = bind(this.actor!.user_id);
        switch (this.table) {
          case "profiles":
            if (!isRead && this.operation !== "update") throw new Error("Forbidden");
            if (this.operation === "update" && Object.keys(this.rows[0]).some((key) => !["full_name", "university", "nursing_year"].includes(key))) throw new Error("Forbidden");
            scope = `user_id = ${uid}`; break;
          case "conversations":
            scope = `user_id = ${uid}`;
            if (this.operation === "insert" && this.rows.some((r) => (r as Record<string, unknown>).user_id !== this.actor!.user_id)) throw new Error("Forbidden");
            if (this.operation === "update" && Object.keys(this.rows[0]).some((key) => !["title", "updated_at"].includes(key))) throw new Error("Forbidden");
            break;
          case "messages":
            if (!isRead && this.operation !== "insert") throw new Error("Forbidden");
            scope = `conversation_id IN (SELECT id FROM conversations WHERE user_id = ${uid})`;
            break;
          case "message_feedback":
            if (!isRead && this.operation !== "insert") throw new Error("Forbidden");
            scope = `user_id = ${uid} AND message_id IN (SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=${uid})`;
            break;
          case "subjects": case "settings":
            if (!isRead) throw new Error("Forbidden");
            scope = `${uid}::uuid IS NOT NULL`; break;
          case "documents":
            if (!isRead) throw new Error("Forbidden");
            scope = `status = 'ready' AND ${uid}::uuid IS NOT NULL`; break;
          case "usage_logs":
            if (!isRead) throw new Error("Forbidden");
            scope = `user_id = ${uid}`; break;
          default: throw new Error("Forbidden");
        }
      }
      const predicates = [scope, ...this.filters.map(([key, op, value]) => `${this.column(key)} ${op} ${bind(value)}`)];
      let sql: string;
      if (this.operation === "insert") {
        if (!this.rows.length) return { data: [], error: null };
        const keys = Object.keys(this.rows[0]);
        keys.forEach((key) => this.column(key));
        if (!keys.length) throw new Error("Empty insert");
        // Validate immutable conversation ownership before inserting references.
        if (!this.system && !admin && ["messages", "message_feedback"].includes(this.table)) {
          for (const row of this.rows) {
            const record = row as Record<string, unknown>;
            const own = this.table === "messages"
              ? await this.execute("SELECT id FROM conversations WHERE id=$1 AND user_id=$2", [record.conversation_id, this.actor!.user_id])
              : await this.execute("SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.user_id=$2", [record.message_id, this.actor!.user_id]);
            if (!own.rows.length || (this.table === "message_feedback" && record.user_id !== this.actor!.user_id)) throw new Error("Forbidden");
          }
        }
        // Insert has no WHERE; discard predicate parameters before constructing it.
        values.length = 0;
        const tuples = this.rows.map((row) => `(${keys.map((key) => {
          const value = (row as Record<string, unknown>)[key];
          return bind(key === "value" ? JSON.stringify(value) : value);
        }).join(",")})`);
        sql = `INSERT INTO "${this.table}" (${keys.map((key) => this.column(key)).join(",")}) VALUES ${tuples.join(",")} RETURNING ${this.fields}`;
      } else if (this.operation === "update") {
        const assignments = Object.entries(this.rows[0]).map(([key, value]) => `${this.column(key)}=${bind(key === "value" ? JSON.stringify(value) : value)}`);
        if (!assignments.length) throw new Error("Empty update");
        sql = `UPDATE "${this.table}" SET ${assignments.join(",")} WHERE ${predicates.join(" AND ")} RETURNING ${this.fields}`;
      } else if (this.operation === "delete") {
        sql = `DELETE FROM "${this.table}" WHERE ${predicates.join(" AND ")} RETURNING ${this.fields}`;
      } else {
        sql = `SELECT ${this.fields} FROM "${this.table}" WHERE ${predicates.join(" AND ")}`;
        if (this.sorting.length) sql += ` ORDER BY ${this.sorting.join(",")}`;
        if (this.cap !== undefined) sql += ` LIMIT ${bind(this.cap)}`;
      }
      const result = await this.execute(sql, values);
      return { data: result.rows as Row<T>[], error: null };
    } catch (error) {
      console.error("Database operation failed", error instanceof Error ? error.message : "Unknown error");
      return { data: null, error: { message: "تعذر تنفيذ العملية" } };
    }
  }
}

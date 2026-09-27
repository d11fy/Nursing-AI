import "server-only";
import { currentProfile } from "@/lib/auth/session";
import { getPool, transaction } from "./pool";
import { Query, type Actor } from "./query";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type Functions = Database["public"]["Functions"];
const functionArgs: Record<keyof Functions, string[]> = {
  is_admin: [], get_today_usage_count: ["p_user_id"],
  match_document_chunks: ["query_embedding", "match_subject_id", "match_count", "query_provider", "query_model"],
  match_lecture_chunks: ["query_embedding", "match_lecture_id", "match_user_id", "match_count", "query_provider", "query_model"],
  admin_dashboard_stats: [], admin_usage_last_7_days: [], admin_list_students: [],
};

export class DatabaseClient {
  constructor(readonly actor: Actor, readonly system = false) {}
  readonly auth = { getUser: async () => ({ data: { user: this.actor ? { id: this.actor.user_id } : null } }) };
  from<T extends keyof Tables>(table: T) {
    return new Query(table, this.actor, this.system, (sql, values) => getPool().query(sql, values));
  }
  async rpc<F extends keyof Functions>(name: F, args?: Functions[F]["Args"]): Promise<{ data: Functions[F]["Returns"] | null; error: { message: string } | null }> {
    try {
      if (!Object.hasOwn(functionArgs, name)) throw new Error("Unknown function");
      if (!this.system && (!this.actor || this.actor.status !== "active")) throw new Error("Unauthorized");
      if (name.startsWith("admin_") && this.actor?.role !== "admin") throw new Error("Forbidden");
      if (name === "get_today_usage_count" && !this.system && this.actor?.role !== "admin" && (args as { p_user_id: string }).p_user_id !== this.actor?.user_id) throw new Error("Forbidden");
      if (name === "match_lecture_chunks" && !this.system && this.actor?.role !== "admin" && (args as { match_user_id: string }).match_user_id !== this.actor?.user_id) throw new Error("Forbidden");
      const keys = functionArgs[name];
      const values = keys.map((key) => (args as Record<string, unknown>)?.[key]);
      const rows = await transaction(async (client) => {
        await client.query("SELECT set_config('app.user_id',$1,true)", [this.actor?.user_id ?? ""]);
        return (await client.query(`SELECT * FROM public.${name}(${keys.map((_, i) => `$${i + 1}`).join(",")})`, values)).rows;
      });
      const data = name === "is_admin" || name === "get_today_usage_count" ? rows[0]?.[name] : rows;
      return { data: data as Functions[F]["Returns"], error: null };
    } catch (error) {
      console.error("Database function failed", error instanceof Error ? error.message : "Unknown error");
      return { data: null, error: { message: "تعذر تنفيذ العملية" } };
    }
  }
}
export async function createClient() { return new DatabaseClient(await currentProfile()); }
// Only trusted server code (AI usage and document ingestion) uses this client.
export function createSystemClient() { return new DatabaseClient(null, true); }

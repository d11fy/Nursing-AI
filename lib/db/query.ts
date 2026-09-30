import type { Database, Profile } from "@/types/database";

type Tables = Database["public"]["Tables"];
type Table = keyof Tables;
type Row<T extends Table> = Tables[T]["Row"];
export type Actor = Pick<Profile, "user_id" | "role" | "status"> | null;
export type Executor = (sql: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
type Result<T> = { data: T | null; error: { message: string } | null };

const columns: Record<Table, string[]> = {
  profiles: "id user_id full_name email university nursing_year academic_year_id role status created_at updated_at".split(" "),
  subjects: "id name_ar name_en description description_ar description_en icon icon_theme status sort_order created_at updated_at archived_at".split(" "),
  conversations: "id user_id title subject_id lecture_id active_attachment_id active_attachment_section_index created_at updated_at".split(" "),
  messages: "id conversation_id role content image_url tokens_input tokens_output model answer_origin source_ids created_at".split(" "),
  conversation_attachments: "id conversation_id message_id user_id file_path file_type ordinal vision_extracted_text vision_structured_json subject_id lecture_id status provider model input_tokens output_tokens created_at".split(" "),
  message_ai_traces: "id message_id conversation_id user_id resolved_query detected_subject active_attachment_id attachment_ids retrieved_sources_json reranked_sources_json evidence_coverage selected_provider selected_model fallback_used final_source_ids_json refusal_reason diagnostics_json created_at".split(" "),
  message_feedback: "id message_id user_id is_positive reason comment subject_id answer_origin source_ids created_at".split(" "),
  documents: "id title file_url file_name file_size subject_id source_type source_priority status vector_store_id file_id chunk_count error_message created_by contribution_id created_at updated_at extraction_page_count ocr_page_count index_version academic_year_id semester exam_year doctor_name exam_type notes file_hash content_hash processing_version".split(" "),
  document_chunks: "id document_id subject_id content embedding embedding_provider embedding_model embedding_dimensions chapter page_number chunk_index created_at".split(" "),
  usage_logs: "id user_id type model input_tokens output_tokens cached_input_tokens reasoning_effort pricing_version estimated_cost lecture_id created_at provider feature fallback_used fallback_from fallback_reason latency_ms success error_code is_free_tier".split(" "),
  settings: "key value updated_at".split(" "),
  lectures: "id user_id subject_id title file_name original_file_name storage_path mime_type file_size_bytes file_hash status error_message uploaded_at processing_started_at processing_completed_at delete_after deleted_at contribution_status contribution_consent_at contribution_ownership_confirmed_at created_at updated_at".split(" "),
  lecture_chunks: "id lecture_id user_id subject_id content page_number chunk_index embedding embedding_provider embedding_model embedding_dimensions created_at".split(" "),
  generated_study_content: "id lecture_id user_id content_type content_json model input_tokens output_tokens created_at updated_at".split(" "),
  file_cleanup_logs: "id lecture_id storage_path attempted_at status error_message".split(" "),
  knowledge_contributions: "id lecture_id user_id subject_id classification classification_confidence privacy_flagged status reviewed_by reviewed_at approved_document_id created_at".split(" "),
  ai_provider_settings: "provider enabled role priority simple_enabled normal_enabled complex_enabled vision_enabled utility_enabled fallback_enabled status last_error last_error_at consecutive_failures cooldown_until updated_at".split(" "),
  exams: "id subject_id title exam_year semester exam_type doctor_name document_id status total_questions verified_questions needs_review_questions conflict_questions error_message created_at updated_at".split(" "),
  exam_questions: "id exam_id subject_id question_text question_type options_json correct_answer_json extracted_answer explanation topic subtopic difficulty difficulty_estimate status confidence page_number source_document_id question_number review_notes reviewed_by reviewed_at created_at updated_at".split(" "),
  question_sources: "id question_id document_id chunk_id page_number quote support_type source_priority created_at".split(" "),
  question_clusters: "id subject_id topic canonical_question cluster_summary occurrences_count exam_years_json created_at updated_at".split(" "),
  question_cluster_members: "id cluster_id question_id similarity created_at".split(" "),
  exam_topic_stats: "id subject_id topic exam_count total_exams question_count frequency common_question_types_json avg_difficulty updated_at".split(" "),
  summary_knowledge_points: "id document_id subject_id point_type topic content verification_status verified_by_chunk_id page_number created_at".split(" "),
  exam_audit_logs: "id subject_id exam_id question_id user_id event_type details_json created_at".split(" "),
  student_exam_attempts: "id user_id subject_id exam_id mode practice_type total_questions answered_questions correct_answers wrong_answers score_percentage completed_at created_at".split(" "),
  student_exam_attempt_answers: "id attempt_id question_id selected_answer is_correct topic created_at".split(" "),
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
            if (this.operation === "update" && Object.keys(this.rows[0]).some((key) => !["full_name", "university"].includes(key))) throw new Error("Forbidden");
            scope = `user_id = ${uid}`; break;
          case "conversations":
            scope = `user_id = ${uid} AND (subject_id IS NULL OR subject_id IN (
              SELECT sy.subject_id FROM subject_academic_years sy JOIN academic_years y ON y.id=sy.academic_year_id AND y.is_active=true JOIN profiles p ON p.academic_year_id=sy.academic_year_id
              JOIN subjects s ON s.id=sy.subject_id WHERE p.user_id=${uid} AND s.status='active' AND s.archived_at IS NULL))`;
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
          case "subjects":
            if (!isRead) throw new Error("Forbidden");
            scope = `status='active' AND archived_at IS NULL AND id IN (
              SELECT sy.subject_id FROM subject_academic_years sy JOIN academic_years y ON y.id=sy.academic_year_id AND y.is_active=true JOIN profiles p ON p.academic_year_id=sy.academic_year_id WHERE p.user_id=${uid})`; break;
          case "settings":
            if (!isRead) throw new Error("Forbidden");
            scope = `${uid}::uuid IS NOT NULL`; break;
          case "documents":
            if (!isRead) throw new Error("Forbidden");
            scope = `status = 'ready' AND subject_id IN (
              SELECT sy.subject_id FROM subject_academic_years sy JOIN academic_years y ON y.id=sy.academic_year_id AND y.is_active=true JOIN profiles p ON p.academic_year_id=sy.academic_year_id
              JOIN subjects s ON s.id=sy.subject_id WHERE p.user_id=${uid} AND s.status='active' AND s.archived_at IS NULL)`; break;
          case "usage_logs":
            if (!isRead) throw new Error("Forbidden");
            scope = `user_id = ${uid}`; break;
          case "lectures":
            if (!isRead && this.operation !== "insert") throw new Error("Forbidden");
            scope = `user_id = ${uid}`;
            if (this.operation === "insert" && this.rows.some((r) => (r as Record<string, unknown>).user_id !== this.actor!.user_id)) throw new Error("Forbidden");
            break;
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
        if (!this.system && !admin && this.table === "conversations") {
          for (const row of this.rows) {
            const record = row as Record<string, unknown>;
            if (record.subject_id) {
              const allowed = await this.execute(
                `SELECT 1 FROM profiles p JOIN academic_years y ON y.id=p.academic_year_id AND y.is_active=true JOIN subject_academic_years sy ON sy.academic_year_id=p.academic_year_id
                 JOIN subjects s ON s.id=sy.subject_id AND s.status='active' AND s.archived_at IS NULL
                 WHERE p.user_id=$1 AND s.id=$2`, [this.actor!.user_id, record.subject_id]);
              if (!allowed.rows.length) throw new Error("Forbidden");
            }
            if (record.lecture_id) {
              const owns = await this.execute("SELECT 1 FROM lectures WHERE id=$1 AND user_id=$2", [record.lecture_id, this.actor!.user_id]);
              if (!owns.rows.length) throw new Error("Forbidden");
            }
          }
        }
        if (!this.system && !admin && this.table === "lectures") {
          for (const row of this.rows) {
            const subjectId = (row as Record<string, unknown>).subject_id;
            const allowed = await this.execute(
              `SELECT 1 FROM profiles p JOIN academic_years y ON y.id=p.academic_year_id AND y.is_active=true JOIN subject_academic_years sy ON sy.academic_year_id=p.academic_year_id
               JOIN subjects s ON s.id=sy.subject_id AND s.status='active' AND s.archived_at IS NULL
               WHERE p.user_id=$1 AND s.id=$2`, [this.actor!.user_id, subjectId]);
            if (!allowed.rows.length) throw new Error("Forbidden");
          }
        }
        // Insert has no WHERE; discard predicate parameters before constructing it.
        values.length = 0;
        const tuples = this.rows.map((row) => `(${keys.map((key) => {
          const value = (row as Record<string, unknown>)[key];
          return bind(key === "value" || key === "source_ids" || key.endsWith("_json") ? JSON.stringify(value) : value);
        }).join(",")})`);
        sql = `INSERT INTO "${this.table}" (${keys.map((key) => this.column(key)).join(",")}) VALUES ${tuples.join(",")} RETURNING ${this.fields}`;
      } else if (this.operation === "update") {
        const assignments = Object.entries(this.rows[0]).map(([key, value]) => `${this.column(key)}=${bind(key === "value" || key === "source_ids" || key.endsWith("_json") ? JSON.stringify(value) : value)}`);
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

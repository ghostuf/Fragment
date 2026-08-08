import { defineRelations, sql } from "drizzle-orm";
import { integer, sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  status: text("status", { enum: ["pending", "complete", "error"] })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const chunks = sqliteTable(
  "chunks",
  {
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    r2Key: text("r2_key").notNull(),
    size: integer("size").notNull(),
    status: text("status", { enum: ["pending", "done"] })
      .notNull()
      .default("pending"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fileId, table.chunkIndex] }),
  }),
);

export const relations = defineRelations({ files, chunks }, (t) => ({
  files: {
    chunks: t.many.chunks(),
  },
  chunks: {
    file: t.one.files({
      from: t.chunks.fileId,
      to: t.files.id,
    }),
  },
}));
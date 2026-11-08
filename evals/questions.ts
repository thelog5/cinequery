import { readFileSync } from "node:fs";
import { z } from "zod";

export const CATEGORIES = ["single_table", "joins", "aggregation", "name_ambiguity", "trends"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  single_table: "Single table",
  joins: "Joins",
  aggregation: "Aggregation",
  name_ambiguity: "Name ambiguity",
  trends: "Trends over time",
};

const QuestionSchema = z.object({
  id: z.string().regex(/^[a-z]\d{2}$/),
  category: z.enum(CATEGORIES),
  question: z.string().min(10),
  gold_sql: z.string().min(10),
  ordered: z.boolean(),
  /** true for the five example buttons on the ask page */
  example: z.boolean().optional(),
});

export type EvalQuestion = z.infer<typeof QuestionSchema>;

export const QUESTIONS_PATH = "evals/questions.jsonl";

export function loadQuestions(path = QUESTIONS_PATH): EvalQuestion[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const questions: EvalQuestion[] = [];
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`${path}:${i + 1} is not valid JSON`);
    }
    const q = QuestionSchema.parse(parsed);
    if (seen.has(q.id)) throw new Error(`${path}:${i + 1} duplicate id ${q.id}`);
    seen.add(q.id);
    questions.push(q);
  });
  return questions;
}

import { describe, expect, it } from "vitest";
import { EXAMPLE_QUESTIONS } from "../src/lib/examples";
import { loadQuestions } from "./questions";

describe("example buttons", () => {
  it("are exactly the eval questions marked example: true", () => {
    const fromEvals = loadQuestions()
      .filter((q) => q.example)
      .map((q) => q.question)
      .sort();
    expect(fromEvals).toEqual([...EXAMPLE_QUESTIONS].sort());
  });
});

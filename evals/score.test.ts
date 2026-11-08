import { describe, expect, it } from "vitest";
import { normalize, score } from "./score";

const s = (
  goldColumns: string[],
  goldRows: unknown[][],
  agentColumns: string[],
  agentRows: unknown[][],
  ordered = false,
) => score({ goldColumns, goldRows, agentColumns, agentRows, ordered });

describe("normalize", () => {
  it("treats numeric strings, decade labels, and case consistently", () => {
    expect(normalize("7.50")).toBe(7.5);
    expect(normalize("1,234")).toBe(1234);
    expect(normalize("1990s")).toBe(1990);
    expect(normalize("  The Dark Knight ")).toBe("the dark knight");
    expect(normalize(["Drama", "Crime"])).toBe(normalize(["Crime", "Drama"]));
    expect(normalize(null)).toBeNull();
  });
});

describe("score", () => {
  it("ignores column names", () => {
    expect(s(["title"], [["Heat"]], ["movie_title"], [["Heat"]]).pass).toBe(true);
  });

  it("allows extra agent columns", () => {
    const r = s(["title"], [["Heat"]], ["tconst", "title", "year"], [["tt0113277", "Heat", 1995]]);
    expect(r.pass).toBe(true);
    expect(r.mapping).toEqual([1]);
  });

  it("matches numbers within 0.01", () => {
    expect(s(["avg"], [[6.4567]], ["a"], [[6.46]]).pass).toBe(true);
    expect(s(["avg"], [[6.4567]], ["a"], [[6.5]]).pass).toBe(false);
  });

  it("requires equal row counts", () => {
    const r = s(["t"], [["A"]], ["t"], [["A"], ["B"]]);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/row count/);
  });

  it("ignores order when ordered is false", () => {
    expect(s(["t"], [["A"], ["B"]], ["t"], [["B"], ["A"]]).pass).toBe(true);
  });

  it("enforces order when ordered is true", () => {
    expect(s(["t"], [["A"], ["B"]], ["t"], [["B"], ["A"]], true).pass).toBe(false);
    expect(s(["t"], [["A"], ["B"]], ["t"], [["A"], ["B"]], true).pass).toBe(true);
  });

  it("keeps values paired within rows", () => {
    // Each column matches as a multiset, but the pairs are swapped.
    const r = s(["name", "n"], [["A", 1], ["B", 2]], ["name", "n"], [["A", 2], ["B", 1]]);
    expect(r.pass).toBe(false);
  });

  it("finds the right mapping when two agent columns look alike", () => {
    const r = s(
      ["decade", "avg"],
      [[1990, 6.1], [2000, 6.3]],
      ["decade", "movies", "avg_rating"],
      [["1990s", 6.1, 6.1], ["2000s", 9, 6.3]],
      true,
    );
    expect(r.pass).toBe(true);
    expect(r.mapping).toEqual([0, 2]);
  });

  it("fails when a gold column has no counterpart", () => {
    const r = s(["title", "votes"], [["Heat", 700000]], ["title"], [["Heat"]]);
    expect(r.pass).toBe(false);
  });

  it("passes when both results are empty", () => {
    expect(s(["t"], [], ["x"], []).pass).toBe(true);
  });
});

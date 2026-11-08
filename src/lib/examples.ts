/**
 * The five example buttons on the ask page (R4). Each one is also in the eval
 * set, marked "example": true in evals/questions.jsonl (j17, t01, j18, s20,
 * a05), so "all five return correct answers" is checked by the same scorer as
 * everything else. Keep the wording here identical to the eval questions.
 */
export const EXAMPLE_QUESTIONS = [
  "Which Christopher Nolan film has the highest IMDb rating?",
  "How has the average movie runtime changed by decade since 1950?",
  "Which directors have made at least 6 films rated 8.0 or higher with at least 25,000 votes?",
  "Which horror movies with at least 100,000 votes are rated 8.0 or higher?",
  "What is the average rating of each genre for movies with at least 100,000 votes?",
] as const;

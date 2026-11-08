/**
 * The five example buttons on the ask page (R4). Each one is also in the eval
 * set (ids ex1-ex5 in evals/questions.jsonl) so "all five return correct
 * answers" is checked by the same scorer as everything else.
 */
export const EXAMPLE_QUESTIONS = [
  "Which Christopher Nolan film has the highest IMDb rating?",
  "How has the average movie runtime changed by decade since 1950?",
  "Which 10 directors have the most films rated 8.0 or higher with at least 25,000 votes?",
  "What are the 10 highest-rated horror movies with at least 100,000 votes?",
  "Which actors have appeared in the most Martin Scorsese films?",
] as const;

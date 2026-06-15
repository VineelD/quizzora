export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startQuizJobWorker } = await import("./lib/quiz-job-worker.js");
  startQuizJobWorker();

  const { startQuestionBankWorker } = await import("./lib/question-bank-worker.js");
  startQuestionBankWorker();
}

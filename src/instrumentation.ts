// Runs once when the server starts. Starts the e-mail queue worker (it never blocks startup or requests).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMailWorker } = await import("./lib/mail/worker");
    startMailWorker();
  }
}

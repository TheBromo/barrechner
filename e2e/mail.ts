import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Without RESEND_API_KEY the Worker logs outgoing emails; `alchemy dev` writes those logs here. */
const LOG_DIR = process.env.E2E_WORKER_LOG_DIR ?? join(process.cwd(), ".alchemy/log/local/Website");

/** Wait for the newest logged email to `to` and return the link it contains. */
export async function emailLink(to: string, subject: RegExp, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lines = readdirSync(LOG_DIR).flatMap((file) => readFileSync(join(LOG_DIR, file), "latin1").split("\n"));
    for (const line of lines.reverse()) {
      const start = line.indexOf('{"level":"info","event":"email.not_sent"');
      if (start < 0) continue;
      const entry = JSON.parse(Buffer.from(line.slice(start), "latin1").toString("utf8")) as { to: string; subject: string; text: string };
      if (entry.to === to && subject.test(entry.subject)) return entry.text.match(/https?:\/\/\S+/)?.[0] ?? "";
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email to ${to} matching ${subject}`);
}

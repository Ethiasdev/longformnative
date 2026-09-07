import { executeRender } from "./render.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

try {
  const result = await executeRender(JSON.parse(await readStdin()));
  process.stdout.write(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  const structured = {
    ok: false,
    error: error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "UnknownError", message: String(error) },
  };
  process.stdout.write(JSON.stringify(structured));
  process.exitCode = 1;
}

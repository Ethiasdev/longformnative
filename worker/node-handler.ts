import { executeRender } from "./render.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function writeResultAndExit(value: unknown, exitCode: number): void {
  process.stdout.write(JSON.stringify(value), () => {
    process.stdout.end(() => process.exit(exitCode));
  });
}

try {
  const result = await executeRender(JSON.parse(await readStdin()));
  writeResultAndExit({ ok: true, ...result }, 0);
} catch (error) {
  const structured = {
    ok: false,
    error: error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "UnknownError", message: String(error) },
  };
  writeResultAndExit(structured, 1);
}

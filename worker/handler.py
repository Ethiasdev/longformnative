import json
import subprocess

import runpod


def handler(job):
    completed = subprocess.run(
        ["node", "worker/dist/worker/node-handler.js"],
        input=json.dumps(job.get("input", {})),
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.stderr:
        print(completed.stderr, flush=True)
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Node renderer returned invalid JSON: {completed.stdout[-1000:]}") from error
    if completed.returncode != 0 or not result.get("ok"):
        detail = result.get("error", {})
        raise RuntimeError(f"{detail.get('name', 'RenderError')}: {detail.get('message', 'Render failed')}")
    return result


runpod.serverless.start({"handler": handler})

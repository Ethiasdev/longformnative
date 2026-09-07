import json
import subprocess

import runpod

PROGRESS_PREFIX = "__STORYSCROLL_PROGRESS__"


def handler(job):
    process = subprocess.Popen(
        ["node", "worker/dist/worker/node-handler.js"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None
    process.stdin.write(json.dumps(job.get("input", {})))
    process.stdin.close()

    for line in process.stderr:
        message = line.rstrip()
        if message.startswith(PROGRESS_PREFIX):
            try:
                progress = json.loads(message[len(PROGRESS_PREFIX):])
                # The result must be returned immediately after the output upload.
                # A final progress_update can leave a queue request stuck at 99%
                # even though the renderer has already exited and the worker is idle.
                if progress.get("stage") != "finalizing":
                    runpod.serverless.progress_update(job, progress)
            except (json.JSONDecodeError, TypeError, ValueError) as error:
                print(f"Invalid renderer progress update: {error}", flush=True)
        elif message:
            print(message, flush=True)

    stdout = process.stdout.read()
    return_code = process.wait()
    try:
        result = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Node renderer returned invalid JSON: {stdout[-1000:]}") from error
    if return_code != 0 or not result.get("ok"):
        detail = result.get("error", {})
        raise RuntimeError(f"{detail.get('name', 'RenderError')}: {detail.get('message', 'Render failed')}")
    return result


runpod.serverless.start({"handler": handler})

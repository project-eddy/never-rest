import { err, ok, type Result } from 'neverthrow';

import {
  HOST_STATUSES,
  railError,
  respond,
  type RailError,
} from '@eddy-works/never-rest';
import {
  compilePath,
  matchPath,
  parseOutput,
  parseRouteSources,
  parseSchema,
  type RouteDef,
} from '@eddy-works/never-rest/contract';

import { eventSchema, jobEventsGate, uploadMeta } from './shapes.js';
import { createAsset, getJob, markJobDone } from './store.js';

const jobEventsPath = compilePath(jobEventsGate.path);

function statusMapFor(route: RouteDef): {
  readonly [code: string]: number;
} {
  return {
    ...route.errors,
    validation_error: HOST_STATUSES.validation_error,
    internal: HOST_STATUSES.internal,
  };
}

function declaredFor(route: RouteDef): readonly number[] {
  return [
    route.success ?? 200,
    ...Object.values(route.errors),
    HOST_STATUSES.validation_error,
    HOST_STATUSES.internal,
  ];
}

/** Example-local — not a library export. */
export function jsonFromResult(
  result: Result<unknown, RailError<string>>,
  route: RouteDef,
): Response {
  const mapped = respond(result, {
    success: route.success ?? 200,
    statuses: statusMapFor(route),
    declared: declaredFor(route),
    disclosure: 'public',
  });
  return new Response(JSON.stringify(mapped.body), {
    status: mapped.status,
    headers: { 'content-type': 'application/json' },
  });
}

function filePart(value: FormDataEntryValue | null): File | undefined {
  return value instanceof File ? value : undefined;
}

export async function handleUpload(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonFromResult(
      err(
        railError('validation_error', 'Validation failed', {
          issues: [{ path: ['body'], message: 'Could not read multipart body' }],
        }),
      ),
      uploadMeta,
    );
  }

  const meta = await parseRouteSources(uploadMeta, {
    body: { title: String(form.get('title') ?? '') },
  });
  if (meta.isErr()) {
    return jsonFromResult(err(meta.error), uploadMeta);
  }

  const file = filePart(form.get('file'));
  if (file === undefined) {
    return jsonFromResult(
      err(
        railError('validation_error', 'Validation failed', {
          issues: [{ path: ['body', 'file'], message: 'Missing file part' }],
        }),
      ),
      uploadMeta,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const record = createAsset({ title: meta.value.body.title, bytes });
  const output = await parseOutput(uploadMeta, record);
  if (output.isErr()) {
    return jsonFromResult(err(output.error), uploadMeta);
  }
  return jsonFromResult(ok(output.value), uploadMeta);
}

function encodeSse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function handleEvents(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const pathMatch = matchPath(jobEventsPath, pathname);
  if (pathMatch.kind !== 'match') {
    return jsonFromResult(
      err(railError('not_found', 'Job events path did not match')),
      jobEventsGate,
    );
  }

  const gate = await parseRouteSources(jobEventsGate, {
    params: pathMatch.params,
  });
  if (gate.isErr()) {
    return jsonFromResult(err(gate.error), jobEventsGate);
  }

  const job = getJob(gate.value.params.id);
  if (job === undefined) {
    return jsonFromResult(
      err(railError('not_found', `Job ${gate.value.params.id} not found`)),
      jobEventsGate,
    );
  }

  const events = [
    { type: 'progress' as const, progress: 50 },
    { type: 'done' as const },
  ];
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const event of events) {
    const parsed = await parseSchema(eventSchema, event);
    if (parsed.isErr()) {
      return jsonFromResult(
        err(railError('internal', 'An unexpected error occurred')),
        jobEventsGate,
      );
    }
    chunks.push(encoder.encode(encodeSse(parsed.value)));
  }

  markJobDone(job.id);

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    },
  });
}

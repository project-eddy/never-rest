import { MAX_CAUSE_DEPTH, type RailError, type RailIssue } from './error.js';

export type Disclosure = 'full' | 'internal' | 'public';

const DIAGNOSTIC_NEXT_STEP_PATTERNS = [
  /^\s*at\s+/m,
  /\.[tj]sx?:\d+/,
  /Error:\s/,
  /Exception:\s/,
  /stack trace/i,
];

/** Collect nested cause messages for leakage checks. */
function collectCauseMessages(error: RailError): string[] {
  const messages: string[] = [];
  const seen = new WeakSet<RailError>();
  let current = error.cause;
  let depth = 0;

  while (
    current !== undefined &&
    depth < MAX_CAUSE_DEPTH &&
    !seen.has(current)
  ) {
    seen.add(current);
    messages.push(current.message);
    current = current.cause;
    depth += 1;
  }

  return messages;
}

/** True when nextStep is actionable advice rather than diagnostic detail. */
function isAdvisoryNextStep(nextStep: string, causeMessages: string[]): boolean {
  for (const message of causeMessages) {
    if (message.length > 0 && nextStep.includes(message)) {
      return false;
    }
  }

  return !DIAGNOSTIC_NEXT_STEP_PATTERNS.some((pattern) => pattern.test(nextStep));
}

/** Strip issue paths on public surfaces so internal field names are not revealed. */
function publicIssues(issues: readonly RailIssue[]): readonly RailIssue[] {
  return issues.map((issue) => ({
    path: [],
    message: issue.message,
  }));
}

function discloseInternal<TCode extends string>(
  error: RailError<TCode>,
): RailError<TCode> {
  return {
    code: error.code,
    message: error.message,
    ...(error.issues !== undefined && { issues: error.issues }),
    ...(error.retryable !== undefined && { retryable: error.retryable }),
    ...(error.retryAfterMs !== undefined && { retryAfterMs: error.retryAfterMs }),
    ...(error.nextStep !== undefined && { nextStep: error.nextStep }),
    ...(error.ctx !== undefined && { ctx: error.ctx }),
  };
}

function disclosePublic<TCode extends string>(
  error: RailError<TCode>,
): RailError<TCode> {
  const causeMessages = collectCauseMessages(error);
  const advisoryNextStep =
    error.nextStep !== undefined &&
    isAdvisoryNextStep(error.nextStep, causeMessages)
      ? error.nextStep
      : undefined;

  return {
    code: error.code,
    message: error.message,
    ...(error.issues !== undefined && { issues: publicIssues(error.issues) }),
    ...(error.retryable !== undefined && { retryable: error.retryable }),
    ...(error.retryAfterMs !== undefined && { retryAfterMs: error.retryAfterMs }),
    ...(advisoryNextStep !== undefined && { nextStep: advisoryNextStep }),
  };
}

/**
 * Redact a rail error for the caller's trust level.
 * full — everything, including the cause chain, ctx, and nextStep.
 * internal — code, message, issues, ctx, nextStep; cause chain dropped.
 * public — code and message (public data), issue messages with paths stripped,
 * retryable, retryAfterMs; nextStep kept only when a heuristic says it is
 * advisory, not diagnostic; ctx always dropped because its keys are
 * caller-defined. The nextStep regex is a defensive check, not redaction of
 * `message`. Secrets belong in `cause` or `ctx`.
 */
export function disclose<TCode extends string>(
  error: RailError<TCode>,
  level: Disclosure,
): RailError<TCode> {
  if (level === 'full') {
    return error;
  }
  if (level === 'internal') {
    return discloseInternal(error);
  }
  return disclosePublic(error);
}

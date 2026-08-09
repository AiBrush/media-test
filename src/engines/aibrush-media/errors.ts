import type {
  ApplicabilityOperation,
  ConcreteOperationRequest,
  MediaInput,
  OperationConstraintEvidence,
} from '../../core/engine.ts';
import {
  createOperationConstraintUnsatisfiedError,
  createNotApplicableError,
  isBrowserNotSupportedError,
  isNotApplicableError,
  isOperationConstraintEvidence,
} from '../../core/engine.ts';
import { AIBRUSH_ENGINE_ID, aibrushTupleSummary } from './support.ts';

/** Exact public framework classes captured from the same module instance used for execution. */
export interface AibrushErrorClasses {
  CapabilityError: abstract new (...args: never[]) => Error & { readonly code: 'capability-miss'; readonly detail?: unknown };
  InputError: abstract new (...args: never[]) => Error & { readonly code: 'unsupported-input'; readonly detail?: unknown };
  ConstraintUnsatisfiedError?: abstract new (...args: never[]) => Error & {
    readonly code: 'constraint-unsatisfied';
    readonly detail: unknown;
  };
}

export type AibrushFrameworkClassification =
  | { kind: 'capability'; code: 'capability-miss'; reason: string }
  | { kind: 'input'; code: 'unsupported-input'; reason: string }
  | {
      kind: 'constraint';
      code: 'constraint-unsatisfied';
      reason: string;
      evidence: OperationConstraintEvidence;
    }
  | { kind: 'fault'; code?: string; reason: string };

/**
 * Classify only public framework classes and their exact discriminants. Message prose is deliberately
 * irrelevant: changing a diagnostic sentence cannot turn an engine miss into ERROR (or vice versa).
 */
export function classifyAibrushFrameworkError(
  value: unknown,
  classes: AibrushErrorClasses | undefined,
): AibrushFrameworkClassification {
  const reason = errorReason(value);
  if (classes !== undefined && value instanceof classes.CapabilityError) {
    return value.code === 'capability-miss'
      ? { kind: 'capability', code: 'capability-miss', reason }
      : { kind: 'fault', code: value.code, reason };
  }
  if (classes !== undefined && value instanceof classes.InputError) {
    return value.code === 'unsupported-input'
      ? { kind: 'input', code: 'unsupported-input', reason }
      : { kind: 'fault', code: value.code, reason };
  }
  if (
    classes?.ConstraintUnsatisfiedError !== undefined &&
    value instanceof classes.ConstraintUnsatisfiedError
  ) {
    return value.code === 'constraint-unsatisfied' && isOperationConstraintEvidence(value.detail)
      ? { kind: 'constraint', code: 'constraint-unsatisfied', reason, evidence: value.detail }
      : { kind: 'fault', code: value.code, reason };
  }
  const code = exactCode(value);
  return code === undefined ? { kind: 'fault', reason } : { kind: 'fault', code, reason };
}

export function translateAibrushFrameworkError(
  operation: ApplicabilityOperation,
  value: unknown,
  classes: AibrushErrorClasses | undefined,
  request: ConcreteOperationRequest | undefined,
  input: MediaInput | undefined,
  malformed: (input: MediaInput | undefined) => boolean,
  malformedError: (operation: ApplicabilityOperation, reason: string) => Error,
): never {
  if (isNotApplicableError(value) || isBrowserNotSupportedError(value)) throw value;
  const classified = classifyAibrushFrameworkError(value, classes);
  if (classified.kind === 'constraint') {
    if (operation !== 'transcode') throw value;
    throw createOperationConstraintUnsatisfiedError(
      AIBRUSH_ENGINE_ID,
      classified.reason,
      classified.evidence,
      value,
    );
  }
  if (classified.kind === 'capability') {
    if (malformed(input)) throw malformedError(operation, classified.reason);
    throw createNotApplicableError(
      AIBRUSH_ENGINE_ID,
      operation,
      classified.reason,
      request === undefined ? {} : aibrushTupleSummary(request),
      'AIBRUSH_FRAMEWORK_CAPABILITY_MISS',
      value,
    );
  }
  // An InputError is an expected malformed-input rejection only for an intentionally mutated corpus
  // input. For clean media it is a genuine adapter/framework failure and must stay on the fault path.
  if (classified.kind === 'input' && malformed(input)) {
    throw malformedError(operation, classified.reason);
  }
  throw value;
}

function exactCode(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function errorReason(value: unknown): string {
  if (value instanceof Error && value.message.trim().length > 0) return value.message;
  if (value !== null && typeof value === 'object') {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return String(value);
}

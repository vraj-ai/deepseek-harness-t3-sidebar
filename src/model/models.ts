/**
 * Ported from T3 Code, `packages/client-runtime/src/state/models.ts`
 * (MIT), commit 5307c233b1f0ae72b8894dd39d94019aaf9e7cb8.
 */
import type { RuntimeStatus, ThreadRuntimeSummary } from "./types.ts";

function threadRunStatusIsActive(status: RuntimeStatus): boolean {
  return (
    status === "preparing" ||
    status === "queued" ||
    status === "starting" ||
    status === "running" ||
    status === "waiting"
  );
}

export function threadRuntimeIsActive(
  runtime: ThreadRuntimeSummary | null | undefined,
): boolean {
  return runtime !== null && runtime !== undefined && threadRunStatusIsActive(runtime.status);
}

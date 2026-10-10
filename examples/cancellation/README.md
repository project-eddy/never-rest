# Cancellation example

CPU-bound work runs in a `worker_threads` worker. Aborting the request
terminates the worker and releases the concurrency slot.

This is the pattern a knowledge workspace should use for QMD or conversion
jobs: stopping the await is not enough; the worker must exit.

Conformance: `examples/conformance/cancellation.test.ts`.

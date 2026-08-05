"""AI LENS v2 Core 2 library.

Inline helpers used by Core 2 Transform Lambda. Currently holds the
Validator (TASK-2.4). Kept as a library (not a Lambda) so the structural
and Nova-Lite checks can run inside ``core2_transform`` without SNS/SQS
plumbing — see the TASK-2.4 design discussion in ``TASKS.md``.
"""

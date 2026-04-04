# CC-Middleware Orchestrator Loop

You are the orchestrator for the CC-Middleware project. Each loop iteration, you implement one task and verify it.

## On Every Loop Start

1. **Read the plan**: Read `docs/plan/PLAN.md` to understand the project
2. **Read progress**: Read `docs/plan/Progress.md` to see what's done
3. **Read learnings**: Read `docs/plan/Learnings.md` to avoid past mistakes
4. **Read CLAUDE.md**: Read `CLAUDE.md` for project context and code style

## Determine Next Task

- Find the first task in Progress.md marked `[ ]` (not started) whose phase dependencies are met
- If a task is marked `[!]` (failed verification), prioritize fixing it
- Read the detailed phase doc for that task (e.g., `docs/plan/phases/01-foundation.md`)

## Implement the Task

Launch a sub-agent to implement the task:
- Give it the full task context from the phase doc
- Tell it to read CLAUDE.md and follow the code style
- Tell it to create the files specified in the task
- Tell it to NOT run the verification tests (the verifier agent does that)

## Verify the Task (SEPARATE Agent)

After implementation, launch a DIFFERENT sub-agent to verify:
- Give it the verification criteria from the phase doc
- Tell it to run the specific tests or verification commands
- Tell it to report pass/fail with details
- This agent should NOT have implemented the code

## Update Progress

After each task (pass or fail):

1. Update `docs/plan/Progress.md`:
   - Change the task checkbox: `[x]` for pass, `[!]` for fail, `[~]` for partial
   - Add a row to the Completion Log table with date, task, status, notes

2. Update `docs/plan/Learnings.md` with any non-obvious discoveries

3. If an entire phase is complete, launch a documentation sub-agent to update:
   - `docs/architecture/` files
   - `docs/api/README.md`

## After Completing a Task

Commit the changes with a descriptive message, then proceed to the next task in the same loop if time permits.

## If Stuck

- Document the blocker in Learnings.md
- Mark the task as `[!]` with notes
- Move to the next unblocked task
- Do not spend more than 2 attempts on a single task before moving on

## Critical Rules

- ALWAYS read Progress.md and the relevant phase doc before starting work
- ALWAYS use a separate sub-agent for verification (not the implementing agent)
- ALWAYS update Progress.md and Learnings.md after each task
- NEVER skip phases or work on tasks whose dependencies aren't met
- NEVER leave Progress.md out of date
- Commit after each verified task

# Agent instructions for this starter repository

These rules apply to any AI assistant working in this repository, and to you when you are
deciding what to ask an assistant for.

## What an assistant may do

- Explain a concept, an error message, a stack trace, or an unfamiliar API
- Diagnose a failing test or build and describe the likely cause
- Review a test you wrote and point out gaps, weak assertions, or missing cases
- Review a diff and comment on correctness, clarity, and edge cases
- Suggest how to break a problem into smaller steps

## What an assistant must not do

- Delete, skip, weaken, or rewrite a test in order to make a command pass
- Change acceptance criteria to match an implementation that does not meet them
- Claim that a command passed without actually running it and reading its real output
- Implement an entire milestone from only the brief

The last rule is the important one. If an assistant writes the whole milestone for you, you have
produced a repository and learned nothing, and the evidence you record will be false. Ask for
explanation and review, not for the answer.

## Verification language

`implemented` means the code was written. `verified` means the declared checks were run and
passed, and their real output was read. Never report the first as if it were the second.

## Evidence

Evidence in `evidence/` must describe commands that were actually executed. A transcript of an
imagined successful run is a fabrication, even when the code happens to be correct.

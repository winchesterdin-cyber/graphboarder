# agents.md

#

# Guidelines for agents (and contributors) working on this repository.

# Primary goal: stability and correctness.

#

# ---

#

# ## Priorities

# 1. Keep existing behavior working.

# 2. Prefer small, safe changes over large rewrites.

# 3. Treat errors/warnings as failures unless explicitly justified.

# 4. Add tests for real behavior; fix failures immediately.

#

# ---

#

# ## Local development database (testing-friendly)

# - Use a local, disposable DB for development/testing (SQLite preferred, or an equivalent lightweight option).

# - Provide a simple way to reset it:

# - delete existing local DB

# - apply schema/migrations

# - load deterministic seed data

# - Keep production DB configuration unchanged.

#

# ---

#

# ## Required testing approach

# Run checks in a consistent order:

# 1. Formatting / lint / type checks (if applicable)

# 2. Unit tests

# 3. Integration tests (API + DB)

# 4. End-to-end tests (browser)

#

# Minimum expectations:

# - Tests cover core flows (not placeholder tests).

# - E2E tests must watch for:

# - terminal errors

# - browser console errors

# - failing network requests (unless expected)

#

# ---

#

# ## Failure protocol (mandatory)

# If anything fails (build, tests, runtime):

# 1. Reproduce locally.

# 2. Fix the root cause (not a workaround).

# 3. Add/adjust tests to prevent regression.

# 4. Refactor to reduce fragility when appropriate.

# 5. Re-run the full test sequence and verify logs.

#

# ---

#

# ## Logging rules

# - Terminal output must not contain unexpected errors or warnings.

# - Browser console must not contain errors in normal flows.

#

# ---

#

# ## Refactoring rules (stability-first)

# - Refactor only to improve reliability, clarity, and testability.

# - Avoid non-determinism in tests (real time, randomness, ordering assumptions).

# - Keep validation and error handling consistent.

#

# ---

#

# ## Definition of done

# A change is done only if:

# - App runs locally using the disposable dev DB.

# - Automated checks and tests pass.

# - No unexpected terminal errors/warnings.

# - No browser console errors in core usage paths.

# - Relevant behavior is covered by tests.

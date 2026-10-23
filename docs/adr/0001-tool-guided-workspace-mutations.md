# Make existing-file changes tool-guided and patch-first

The database workspace remains the only source of code, so the Agent searches its current revision through bounded database-backed tools instead of materializing the project merely to run shell `grep`. For existing files, the runtime enforces observation before mutation and makes a local patch the default; whole-file replacement is a guarded exception. This keeps model context proportional to the change and reduces unrelated structural regressions, at the cost of additional tool turns for large refactors.

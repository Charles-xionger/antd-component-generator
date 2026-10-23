# Prompt Web Workspace

Prompt Web turns an application request into a durable, versioned workspace that an Agent can inspect, modify, validate, preview, and publish.

## Language

**Workspace Agent**:
The coding agent that operates on the durable project workspace through constrained observation, mutation, and validation tools.
_Avoid_: One-shot generator, code generator

**Workspace Manifest**:
The authoritative list of files at one workspace revision, containing paths and metadata but not complete source contents.
_Avoid_: Project dump, full-code context

**Observation Tool**:
A non-mutating workspace operation that returns bounded evidence, such as search hits, a line range, or diagnostics.
_Avoid_: Context reload, full-project read

**Local Patch**:
A mutation that replaces one uniquely identified span in an existing file after the Agent has observed the relevant current-revision context.
_Avoid_: File rewrite, regeneration

**Guarded Rewrite**:
An exceptional whole-file replacement of an existing file that requires explicit runtime prerequisites and immediate validation.
_Avoid_: Normal write, default edit

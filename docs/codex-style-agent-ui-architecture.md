# Codex-style Agent UI Architecture

> Status: design proposal and implementation reference.
> Scope: agent interaction UI, streaming protocol, durable items, tool presentation, interruption recovery, and migration from the current XML-driven chat.

## 1. Executive conclusion

Codex-style interaction is not primarily implemented by extending assistant messages with more XML tags.

The mature pattern is:

```text
durable session and turn
  → typed items
  → live events update those items
  → a renderer registry displays each item type
  → tool calls operate in a real workspace
```

XML-like tags can be useful inside generated text as a lightweight artifact envelope, but they are a fragile foundation for UI state, background execution, interruption recovery, and tool orchestration.

The current project uses XML-like tags for both content and control:

- `<requirementSpec>` identifies a requirement card.
- `<appBlueprint>` and `<architectPlan>` identify planning output.
- `<boltArtifact>` and `<boltAction>` carry generated files.
- The browser infers stages with `content.includes(...)` and regular expressions.
- The server attempts to append `</boltArtifact>` when generation is truncated.

This explains much of the gap. The UI is reconstructing execution state from incomplete model text instead of receiving execution state directly from the runtime.

### 1.1 Evidence boundary

This document separates confirmed public behavior from our proposed implementation:

- OpenAI's public Codex app-server protocol confirms a `Thread → Turn → Item` model, JSON-RPC/JSONL transport, typed item lifecycles and deltas, plan updates, command output, file changes, approvals, interruption, and persisted thread reads. It does **not** describe an XML-based UI protocol. See the [Codex app-server protocol](https://learn.chatgpt.com/docs/app-server).
- The Responses API independently exposes typed output items, stable item IDs, sequence-numbered streaming events, function-call deltas, reasoning-summary deltas, and shell-output deltas. See [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events) and [Messages vs. Items](https://developers.openai.com/api/docs/guides/migrate-to-responses#messages-vs-items).
- The precise internal React component tree and private desktop implementation are not public contracts. The renderer registry, persistence schema, and normalized TypeScript types below are therefore our design proposal, shaped to match the public protocol rather than a claim about private source code.
- The Bolt.new observations refer to the public repository's 2024 example implementation, not necessarily the current commercial service.

So the direct answer is: **Codex-style UI is not based on extending one assistant string with XML tags.** Its public integration boundary is structured JSON messages plus typed events. XML may still appear inside user content or a legacy artifact format, but it is not responsible for command, plan, approval, or interruption lifecycle.

## 2. The mature interaction model

### 2.1 Resource hierarchy

Use four separate concepts:

```text
Thread (mapped to the current project Session/Chat)
  └─ Turn
      ├─ Item
      ├─ Item
      └─ Item

Events create and update Items while the Turn runs.
```

**Thread** is the durable conversation and workspace context. If the current database already calls this entity `Session`, keep that storage name and expose the same semantics.

**Turn** is one cycle of work started by user input. A turn can include multiple model calls, tool calls, repairs, and substeps.

**Item** is a durable semantic unit that can be restored later.

**Event** is a live incremental update. Events are optimized for streaming; items are optimized for persistence and reconstruction.

### 2.2 Item types

The initial item union should be:

```ts
type AgentItem =
  | UserMessageItem
  | AssistantMessageItem
  | ProgressItem
  | PlanItem
  | ToolCallItem
  | CommandExecutionItem
  | FileChangeItem
  | QuestionItem
  | ApprovalItem
  | DiagnosticItem
  | PreviewItem
  | FinalResultItem;
```

All items share:

```ts
interface ItemBase {
  id: string;
  threadId: string;
  turnId: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  parentItemId?: string;
  planStepId?: string;
}
```

This type is the UI contract. Assistant prose is only one item type; it is no longer the container for every kind of activity.

## 3. Think, progress, and reasoning

The UI must not expose or depend on private chain-of-thought. A Think section should contain:

1. Short model-authored progress summaries suitable for the user.
2. Runtime-authored facts such as reads, searches, commands, and diagnostics.

Example:

```text
I’ll inspect the existing project structure before deciding where to make the change.

▾ 8 files read
  Read package.json
  Read vite.config.ts
  Read src/App.tsx
```

The first sentence is a `ProgressItem`. Each read is a `ToolCallItem`. The UI may group consecutive compatible items without losing the original records.

```ts
interface ProgressItem extends ItemBase {
  type: "progress";
  title: string;
  summary?: string;
}

interface ToolCallItem extends ItemBase {
  type: "tool_call";
  toolName: string;
  arguments: unknown;
  resultSummary?: string;
  toolCallId: string;
}
```

Do not ask the model to manufacture strings such as `Read package.json`. Create those labels from the recorded tool name and arguments.

## 4. Plan representation

A plan is durable structured state, not Markdown parsed from an assistant response.

```ts
interface PlanItem extends ItemBase {
  type: "plan";
  title: string;
  summary?: string;
  version: number;
  steps: PlanStep[];
}

interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  evidenceItemIds: string[];
}
```

The agent creates and updates it through a tool:

```ts
update_plan({
  title: "Implement the storyboard prototype",
  steps: [
    { id: "theme", title: "Set up theme and base styles" },
    { id: "components", title: "Build shared components" },
    { id: "pages", title: "Implement application pages" },
    { id: "verify", title: "Build and verify" }
  ]
});
```

Tool and file items reference `planStepId`. The UI renders the relationship:

```text
● Set up theme and base styles
  └─ Wrote src/index.css
○ Build shared components
○ Implement application pages
○ Build and verify
```

Publishing a plan is not an automatic approval boundary. The agent proceeds unless it has a real unresolved decision or a policy requires approval.

## 5. Command and terminal presentation

Agent-run commands and the interactive terminal are related but different products.

### 5.1 Agent command item

```ts
interface CommandExecutionItem extends ItemBase {
  type: "command_execution";
  command: string;
  cwd: string;
  output: string;
  exitCode?: number;
  durationMs?: number;
}
```

The runtime emits output deltas while the process runs. The UI initially shows a compact row:

```text
✓ Ran pnpm build · 4.3s
```

Expanding it reveals stdout and stderr. Large output is retained in bounded storage and the item carries a truncation indicator.

### 5.2 Interactive terminal

An interactive terminal is implemented as:

```text
Xterm.js
  ↕ WebSocket
PTY service
  ↕
shell inside the workspace environment
```

Terminal bytes should not be modeled as chat messages. Persist command metadata and selected output for audit, while the live terminal uses its own bidirectional stream.

Both the terminal and agent commands operate on the same workspace filesystem used by the editor and preview server.

## 6. Questions and approvals

User questions should be function tools, not specially worded assistant messages.

```ts
request_user_input({
  questions: [{
    id: "layout",
    question: "Which layout should the first version use?",
    options: [
      {
        label: "Task workspace",
        description: "Prioritizes the main workflow",
        recommended: true
      },
      {
        label: "Data list",
        description: "Opens directly on records"
      }
    ],
    allowCustom: true
  }]
});
```

The tool call creates a `QuestionItem` and pauses the same turn. The submitted answer is recorded as the result for the original `toolCallId`, after which the same turn resumes from persisted state.

Approvals use the same interruption mechanism but remain a different item type. A question resolves missing product intent; an approval authorizes a sensitive side effect.

## 7. Streaming protocol

The concrete Codex reference uses bidirectional JSON-RPC 2.0 semantics over JSONL on stdio, with additional transport options. Its client starts or resumes a thread, starts a turn, and listens for `turn/*` and `item/*` notifications. The proposal below uses web-friendly event names, but should preserve that same lifecycle and identity model rather than translating it into XML.

### 7.1 Typed events

The minimum event set is:

```ts
type AgentEvent =
  | { type: "session.updated"; eventId: string; session: SessionSummary }
  | { type: "turn.started"; eventId: string; turnId: string }
  | { type: "item.created"; eventId: string; item: AgentItem }
  | { type: "item.updated"; eventId: string; item: AgentItem }
  | { type: "text.delta"; eventId: string; itemId: string; delta: string }
  | { type: "command.output.delta"; eventId: string; itemId: string; delta: string }
  | { type: "item.completed"; eventId: string; itemId: string }
  | { type: "item.failed"; eventId: string; itemId: string; error: Diagnostic }
  | { type: "turn.requires_input"; eventId: string; itemId: string }
  | { type: "turn.completed"; eventId: string; turnId: string }
  | { type: "turn.failed"; eventId: string; turnId: string; error: Diagnostic };
```

Every event has a stable ID or monotonically increasing sequence. Text deltas include `itemId` and content indices when an item has multiple content parts.

### 7.2 Interrupted generation

Typed events remove the XML-closing problem.

If generation stops after:

```text
"I’ll update the customer dashboard and then ..."
```

the system already has:

```json
{
  "id": "msg_17",
  "type": "assistant_message",
  "status": "running",
  "content": "I’ll update the customer dashboard and then ..."
}
```

The runtime changes the item to `failed` or `cancelled`. The partial content remains displayable. No closing tag is needed.

For commands and file changes, completion is based on the tool result, exit code, or workspace acknowledgement—not on the model completing a textual tag.

### 7.3 Reconnection

SSE is a live delivery channel, not the source of truth. On reconnect:

1. Open a new event stream and buffer incoming events.
2. Retrieve the session, active turn, required actions, and saved items.
3. Restore the UI keyed by `itemId`.
4. Apply buffered events that are newer than the restored item state.
5. Continue consuming live events.

Do not resend the user task merely because the stream disconnected.

## 8. Why XML-like protocols are fragile

An XML envelope works when all of the following are true:

- the model emits a small response;
- actions are complete-file writes;
- execution waits for a closing tag;
- a dropped response can simply be retried;
- the UI does not need durable per-action state.

It becomes fragile when:

- output is truncated;
- tag text is split across chunks;
- source code contains similar strings;
- multiple agents or tools interleave output;
- the browser reconnects halfway through;
- an action needs approval;
- a command keeps streaming after the model finishes;
- the product must distinguish failed, cancelled, and incomplete states.

The public Bolt example uses a hand-written streaming parser and waits for `</boltAction>` before executing an action. This is a lightweight implementation choice, not the general architecture used by durable agent products.

Attempting to repair an interrupted response by appending `</boltArtifact>` only fixes syntax superficially. It cannot prove that:

- the final file was complete;
- every intended action was generated;
- actions were applied atomically;
- the produced source compiles;
- the model had finished its plan.

Therefore the current automatic close-tag repair should not be used as a correctness mechanism.

## 9. Is XML an industry-standard approach?

No single wire format is universal, but mature implementations converge on these principles:

- JSON-schema or function-tool calls for model actions.
- Typed runtime events for streaming.
- Durable items for history and reconnection.
- Explicit lifecycle states instead of inferring state from prose.
- Stable call IDs linking requests and results.
- A separate binary/WebSocket stream for interactive terminals.
- Markdown only for human-facing prose.

XML-like tags remain common for simple prompt-controlled extraction because models usually follow them well and they are easy to prototype. They are appropriate as an internal transitional format or a content envelope, but not as the durable execution protocol of an IDE-like agent.

## 10. Current project gap

The current implementation has several strong foundations:

- LangGraph with PostgreSQL checkpoints.
- Versioned `ArtifactVersion` snapshots.
- Build jobs with leases and durable status.
- Go runtime contracts, migrations, and acceptance tests.
- Existing cards for requirements, blueprints, tools, and generation status.

The main gap is how these capabilities are connected:

```text
Current
model text
  → XML-like tags
  → frontend content inspection
  → inferred UI state
  → complete artifact parsing

Target
agent/tool runtime
  → durable typed items
  → typed live events
  → renderer registry
  → UI state restored from persisted records
```

Specific weaknesses to remove:

- Stage status is duplicated between LangGraph, SSE content, and client Zustand state.
- UI component selection depends on regex and `content.includes` checks.
- Tool activity is attached to whichever assistant message happens to be current.
- Plan state is not a durable entity with stable steps.
- Complete-file XML generation mixes source transport with orchestration.
- SSE interruption can leave the client unable to determine whether an action completed.

## 11. Recommended migration path

### Phase 1: introduce typed items alongside XML

- Create persisted Session/Turn/Item/Event representations.
- Emit typed stage, tool, command, question, and plan events from the existing graph.
- Add a renderer registry.
- Keep legacy assistant text and XML rendering unchanged.

### Phase 2: move UI state to items

- Replace tag-based stage detection with runtime events.
- Replace client-only generation status with server-backed turn status.
- Represent questions and plan steps as durable items.
- Implement reconnect from saved items and active required actions.

### Phase 3: replace XML execution with tools

- Give the agent workspace list/search/read/write/patch/delete tools.
- Record each tool call and result as an item.
- Stop requiring complete `boltArtifact` output for new runs.
- Continue parsing old artifacts for history compatibility.

### Phase 4: workspace, terminal, and browser loop

- Connect editor, agent tools, PTY terminal, and dev server to the same workspace.
- Add command output events, port/preview items, browser console inspection, and screenshot verification.
- Complete only after build and runtime evidence succeeds.

## 12. Renderer behavior

The chat surface should stay visually simple. Richness comes from item semantics and progressive disclosure, not from large decorative cards.

Recommended defaults:

- Assistant text: plain prose.
- Progress: one muted line.
- File reads/searches: grouped collapsed row.
- Plan: compact persistent checklist.
- File write: single indented child row under the active step.
- Command: one-line status; output collapsed unless failed.
- Question: inline choice form.
- Diagnostic: concise error with expandable raw details.
- Final result: plain summary plus changed files and verification evidence.

This produces the Codex-style feeling: the UI is calm, but every meaningful action is inspectable.

## 13. Design rule

The final boundary should be:

```text
Markdown/XML content describes something.
Typed events prove that something happened.
```

Never show “Read”, “Wrote”, “Ran”, “Built”, or “Verified” based solely on model text. Show those states only when the corresponding workspace or tool event exists.

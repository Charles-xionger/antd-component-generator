# Canvas Multi-Agent Coding System

A production-ready implementation of the Canvas code sandbox with multi-agent architecture as outlined in the [design document](docs/sandbox-implementation.md).

## 🎯 Key Features

### ✅ Implemented

- **Multi-Agent LangGraph System**: Architect → Coder → Reviewer workflow
- **Database Integration**: Prisma-based code versioning with Thread/Artifact/Version models
- **Context Injection**: AI can see and modify existing code
- **Streaming Interface**: Real-time code generation with optimistic updates
- **Clean Architecture**: Enforced separation of logic and UI components
- **PostgreSQL Persistence**: LangGraph checkpoints + business data storage
- **Version Management**: Browse and switch between different code versions
- **Real-time Sandbox**: Integrated iframe sandbox with live code preview

### 🔄 Architecture Overview

```mermaid
graph TD
    User --> Frontend[Canvas Chat UI]
    Frontend --> |Stream Request| API[/api/agent/stream]

    subgraph "Multi-Agent System (LangGraph)"
        Supervisor{Supervisor}
        ChatGraph[MCP Chat Subgraph]
        CodingGraph[Coding Subgraph]

        subgraph "Coding Workflow"
            Architect[Architect Agent]
            Coder[Coder Agent]
            Reviewer[Reviewer Agent]

            Architect --> |Plan| Coder
            Coder --> |Code XML| Reviewer
            Reviewer --> |REJECT| Coder
            Reviewer --> |APPROVE| End
        end

        Supervisor --> |Simple Chat| ChatGraph
        Supervisor --> |Code Request| CodingGraph
    end

    API --> |Context Injection| Prisma[(Database)]
    API --> |Save Artifacts| Prisma
    Frontend --> |Real-time Updates| Monaco[Monaco Editor]
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Environment variables configured

### Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Configure environment variables:**

```bash
# Database
DATABASE_URL="postgresql://username:password@host:port/database"

# AI Model (Aliyun/Alibaba Cloud)
ALIYUN_API_KEY="your-api-key"
ALIYUN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
NEXT_PUBLIC_ALIYUN_MODEL_NAME="qwen-plus"
```

3. **Setup database:**

```bash
npx prisma generate
npx prisma db push
```

4. **Start development server:**

```bash
npm run dev
```

## 📁 Project Structure

```
lib/agent/
├── index.ts          # Main graph creation with supervisor routing
├── state.ts          # LangGraph state definitions
├── prompts.ts        # Agent prompts (Architect, Coder, Reviewer)
├── nodes.ts          # Agent node implementations
└── utils.ts          # XML parsing and file management utilities

app/api/agent/
├── stream/route.ts   # Main streaming endpoint with context injection
└── history/[threadId]/route.ts   # Thread history and artifact retrieval

components/
└── canvas-chat.tsx   # Frontend chat interface

prisma/
└── schema.prisma     # Database schema (Thread → Artifact → Version → File)
```

## 🤖 Agent System Details

### Supervisor Agent

**Purpose**: Routes requests to appropriate subgraphs

- **Simple chat queries** → MCP Chat Subgraph (preserves existing functionality)
- **Code-related requests** → Coding Subgraph (new multi-agent system)

### Architect Agent

**Purpose**: Analyzes requirements and creates development plans

- Enforces **Headless Architecture** (logic/view separation)
- Outputs structured JSON with file paths and dependencies
- Considers browser sandbox limitations

### Coder Agent

**Purpose**: Generates code based on architect's plan

- Follows **Clean Architecture** principles
- Outputs **Bolt XML format** for file streaming
- Receives existing code context for modifications
- Creates separate Hook/Component files

### Reviewer Agent

**Purpose**: Quality assurance and compliance checking

- Validates runtime compatibility (no server-side code)
- Ensures architectural compliance (no logic in views)
- Can reject code back to Coder for refinement

## 🗄️ Database Schema

The system uses a hybrid approach:

- **LangGraph Checkpointer**: Stores conversation history in PostgreSQL
- **Prisma Business Models**: Manages code artifacts and versions

```sql
-- Core relationships
Thread (1) → Artifact (1) → ArtifactVersion (*) → File (*)

-- Example flow
Thread.id = "abc-123"  -- Links to LangGraph checkpoint
  └── Artifact
      ├── Version 1: "Initial counter app"
      │   ├── /hooks/useCounter.ts
      │   └── /components/Counter.tsx
      └── Version 2: "Added reset button"
          ├── /hooks/useCounter.ts (updated)
          └── /components/Counter.tsx (updated)
```

## 🔄 Request Flow

### New Project Creation

1. User: "Create a todo app"
2. **Supervisor** routes to coding subgraph
3. **Architect** plans Hook + Component structure
4. **Coder** generates XML with separated logic/view
5. **Reviewer** validates (may loop back to Coder)
6. **API** parses XML and creates Artifact Version 1
7. **Frontend** streams updates to Monaco Editor

### Project Modification

1. User: "Add a delete button"
2. **API** retrieves latest version from Prisma
3. **Context injection** sends existing code to Architect
4. **Coder** modifies only affected files
5. **File merging** preserves unchanged files
6. **API** creates Artifact Version 2

## 🎨 Frontend Features

### Canvas Chat Interface

- **Three-pane layout**: Chat, code preview, and live sandbox rendering
- **Real-time streaming**: See code appear as AI generates it
- **Session persistence**: Thread IDs maintain conversation context
- **Error handling**: Graceful fallbacks for network issues
- **Version Management**:
  - Browse complete version history
  - Switch between different code versions
  - Version comparison and selection
- **Sandbox Integration**:
  - Live code rendering in iframe
  - Automatic deployment after code completion
  - Error feedback from sandbox environment

### Streaming Protocol

```typescript
// Message types from /api/agent/stream
{ type: "content", content: "Generated text chunk" }
{ type: "saved", message: "Code has been saved" }
{ type: "tool_start", tool: "function_name" }
{ type: "tool_end", tool: "function_name", output: {...} }
{ type: "done", threadId: "abc-123" }
```

## 🧪 Testing the System

### Example Prompts for Testing

**Simple Counter:**

```

```

**Todo Application:**

```
Build a todo list where I can add, complete, and delete tasks
```

**Modify Existing:**

```
Add a "Clear All" button to remove all completed todos
```

## 🔧 Configuration

### Model Settings

Models are configured in `lib/agent/nodes.ts`:

- **Architect**: `temperature: 0.3` (structured output)
- **Coder**: `temperature: 0.1` (deterministic code)
- **Reviewer**: `temperature: 0.1` (consistent validation)

### Iteration Limits

- Maximum 3 iterations between Coder ↔ Reviewer
- Prevents infinite loops while allowing refinement

## 📝 Development Notes

### Key Implementation Details

1. **State Management**: Uses LangGraph Annotations with proper reducers
2. **Error Handling**: Graceful fallbacks in node functions
3. **XML Parsing**: Robust extraction of `<boltAction>` file contents
4. **File Merging**: Preserves unchanged files during updates
5. **TypeScript Safety**: Proper typing throughout the system

### Known Limitations

- Frontend is a basic proof-of-concept (no Monaco Editor integration yet)
- Sandbox runtime not implemented (focuses on AI system)
- No visual code preview (shows raw XML currently)

## 🎯 Next Steps

1. **Frontend Enhancement**: Integrate Monaco Editor with syntax highlighting
2. **Sandbox Runtime**: Implement browser-based React execution
3. **File Tree**: Add visual file explorer
4. **Version History**: UI for browsing past versions
5. **Error Display**: Show compilation errors from sandbox

---

This implementation provides a solid foundation for the Canvas-style coding assistant with proper multi-agent architecture and database persistence. The system is designed to be extensible and production-ready.

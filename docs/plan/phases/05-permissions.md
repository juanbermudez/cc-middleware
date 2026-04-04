# Phase 5: Permission Handling

**Status**: Not Started
**Depends On**: Phase 3 (Session Launching)
**Blocks**: Phase 7 (API Layer)

## Goal

Implement a permission policy engine and canUseTool handler that enables programmatic control over tool approvals and AskUserQuestion responses.

## SDK Permission Context (Authoritative)

The Agent SDK provides `canUseTool` callback:
```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;

type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };

type PermissionMode =
  | "default"            // Standard permission behavior
  | "acceptEdits"        // Auto-accept file edits
  | "bypassPermissions"  // Bypass all permission checks (requires allowDangerouslySkipPermissions)
  | "plan"               // Planning mode - no execution
  | "dontAsk"            // Don't prompt, deny if not pre-approved
  | "auto";              // Model classifier approves or denies each tool call
```

**Important SDK details**:
- `canUseTool` fires for tools NOT auto-approved by permission rules. `allowedTools` auto-approves; `disallowedTools` auto-denies (checked first, overrides everything including `bypassPermissions`)
- Hooks (`PreToolUse`, `PermissionRequest`) execute BEFORE `canUseTool` and can allow/deny/modify requests
- `PermissionUpdate` supports operations: `addRules`, `replaceRules`, `removeRules`, `setMode`, `addDirectories`, `removeDirectories` with destinations: `userSettings`, `projectSettings`, `localSettings`, `session`, `cliArg`

For `AskUserQuestion`, the tool appears as `toolName: "AskUserQuestion"` with input containing `questions` array. If you specify a `tools` array, you must include `"AskUserQuestion"` in it for Claude to be able to ask clarifying questions.

---

## Task 5.1: Permission Policy Engine

### Implementation: `src/permissions/policy.ts`

```typescript
export interface PermissionRule {
  id: string;
  toolName: string;   // Glob pattern: "Bash", "Edit|Write", "mcp__*"
  behavior: 'allow' | 'deny';
  condition?: string; // Bash(git *) syntax
  priority: number;   // Lower = higher priority
}

export interface PermissionPolicy {
  rules: PermissionRule[];
  defaultBehavior: 'allow' | 'deny' | 'ask'; // What to do when no rule matches
}

export class PolicyEngine {
  constructor(policy: PermissionPolicy)

  evaluate(toolName: string, input: Record<string, unknown>): {
    decision: 'allow' | 'deny' | 'ask';
    matchedRule?: PermissionRule;
  }

  addRule(rule: PermissionRule): void
  removeRule(id: string): void
  getRules(): PermissionRule[]
  setDefaultBehavior(behavior: 'allow' | 'deny' | 'ask'): void
}
```

**Behavior**:
- Evaluate rules in priority order
- Tool name matching uses regex (supports `|` alternation and `*` glob)
- `Bash(pattern)` condition matches against `input.command` for Bash tool
- First matching rule wins
- If no rule matches, use defaultBehavior

### Verification (Unit)

**`tests/unit/policy-engine.test.ts`**:
```typescript
// Test: Allow rule matches
// PolicyEngine with rule: { toolName: "Read", behavior: "allow" }
// evaluate("Read", {}) -> { decision: "allow" }

// Test: Deny rule matches
// PolicyEngine with rule: { toolName: "Bash", behavior: "deny", condition: "Bash(rm *)" }
// evaluate("Bash", { command: "rm -rf /" }) -> { decision: "deny" }
// evaluate("Bash", { command: "git status" }) -> defaultBehavior

// Test: Priority ordering
// Rule 1 (priority 1): deny Bash(rm *)
// Rule 2 (priority 2): allow Bash(*)
// evaluate("Bash", { command: "rm -rf /" }) -> deny (rule 1 wins)
// evaluate("Bash", { command: "git status" }) -> allow (rule 2)

// Test: Glob patterns
// Rule: { toolName: "Edit|Write" }
// evaluate("Edit", {}) -> matches
// evaluate("Write", {}) -> matches
// evaluate("Read", {}) -> no match

// Test: Default behavior
// No matching rules -> returns defaultBehavior
```

---

## Task 5.2: canUseTool Implementation

### Implementation: `src/permissions/handler.ts`

```typescript
export interface PermissionHandlerOptions {
  policyEngine: PolicyEngine;
  eventBus: HookEventBus;
  // Called when policy returns 'ask' and no event handler resolves it
  onPendingPermission?: (request: PendingPermission) => void;
  // Timeout for external approval (ms)
  approvalTimeout?: number;
}

export interface PendingPermission {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseID: string;
  agentID?: string;
  createdAt: number;
  resolve: (result: PermissionResult) => void;
}

export function createCanUseTool(
  options: PermissionHandlerOptions
): CanUseTool

// The canUseTool function:
// 1. Evaluate against policy engine
// 2. If allow -> return { behavior: "allow" }
// 3. If deny -> return { behavior: "deny", message: "Blocked by policy" }
// 4. If ask -> emit PermissionRequest event on event bus
//    - If event handler resolves -> return its result
//    - If no handler or timeout -> create PendingPermission
//    - Wait for external resolution (with timeout)
//    - If timeout -> deny with message

export class PermissionManager {
  getPendingPermissions(): PendingPermission[]
  resolvePermission(id: string, result: PermissionResult): void
  denyAllPending(message: string): void
}
```

### Verification (E2E)

**`tests/e2e/permission-handler.test.ts`**:
```typescript
// Test: Policy allow bypasses prompt
// 1. Create policy with rule: allow Read
// 2. Launch session with canUseTool from createCanUseTool
// 3. Prompt: "Read the file package.json"
// 4. Verify session completes without permission prompt

// Test: Policy deny blocks tool
// 1. Create policy with rule: deny Bash
// 2. Launch session with canUseTool
// 3. Prompt: "Run npm test"
// 4. Verify Bash tool was denied

// Test: 'ask' creates pending permission
// 1. Create policy with defaultBehavior: 'ask'
// 2. Register onPendingPermission handler
// 3. Launch session (in background)
// 4. Verify PendingPermission is created
// 5. Resolve it with allow
// 6. Verify session continues
```

---

## Task 5.3: AskUserQuestion Handling

### Implementation: `src/permissions/ask-user.ts`

```typescript
export interface QuestionHandler {
  (question: AskUserQuestionInput): Promise<AskUserQuestionResponse>;
}

// NOTE: The SDK's AskUserQuestionInput type has ALL fields required (not optional):
export interface AskUserQuestionInput {
  questions: Array<{
    question: string;       // Full question text
    header: string;         // Short label (max 12 characters) - REQUIRED
    options: Array<{        // 2-4 choices - REQUIRED
      label: string;
      description: string;  // REQUIRED
      preview?: string;     // Only present if toolConfig.askUserQuestion.previewFormat is set
    }>;
    multiSelect: boolean;   // REQUIRED (not optional)
  }>;
  // NOTE: toolUseID and sessionId are NOT part of AskUserQuestionInput per the SDK.
  // They come from the canUseTool callback's options parameter.
  // We add them to our wrapper for convenience:
  toolUseID: string;        // From canUseTool options
  sessionId: string;        // From message context
}

export interface AskUserQuestionResponse {
  behavior: 'allow';
  updatedInput: {
    questions: AskUserQuestionInput['questions'];
    answers: Record<string, string>;
  };
}

export class AskUserQuestionManager {
  // Register a handler for answering questions
  registerHandler(handler: QuestionHandler): () => void;

  // Set default answers (used when no handler registered)
  setDefaultAnswers(defaults: Record<string, string>): void;

  // Handle an AskUserQuestion tool call (called by canUseTool)
  handle(input: AskUserQuestionInput): Promise<PermissionResult>;

  // Get pending questions (for external resolution)
  getPendingQuestions(): PendingQuestion[];
  answerQuestion(id: string, answers: Record<string, string>): void;
}
```

**Behavior**:
- When `canUseTool` receives `AskUserQuestion`:
  1. Emit event on event bus
  2. If registered handler exists, call it
  3. If no handler, create pending question for external resolution
  4. If timeout, deny the tool call
- Support default answers for common questions
- Support async external resolution (for UI)

### Verification (E2E)

**`tests/e2e/ask-user.test.ts`**:
```typescript
// Test: AskUserQuestion with registered handler
// 1. Create AskUserQuestionManager
// 2. Register handler that always answers "yes"
// 3. Launch session where Claude will ask a question
//    (use system prompt: "Before doing anything, ask the user if they want to proceed")
// 4. Verify handler was called
// 5. Verify session continued after answer

// Test: Default answer
// 1. Set default answer
// 2. Launch session that triggers a question
// 3. Verify default answer was used
```

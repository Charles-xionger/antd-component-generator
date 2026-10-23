export class WorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: { requiredEvidence?: string[]; allowedNextActions?: string[] },
  ) {
    super(message);
  }
}

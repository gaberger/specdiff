// Secondary adapter: in-memory checklist persistence
// Imports only from ports

import type { ChecklistStoragePort } from "../../core/ports/index.js";

export class MemoryChecklistStorage implements ChecklistStoragePort {
  private store = new Map<string, Record<string, boolean>>();

  async save(guideKey: string, items: Record<string, boolean>): Promise<void> {
    this.store.set(guideKey, { ...items });
  }

  async load(guideKey: string): Promise<Record<string, boolean>> {
    return { ...(this.store.get(guideKey) ?? {}) };
  }
}

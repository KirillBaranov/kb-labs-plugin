/**
 * @module @kb-labs/plugin-runtime/snapshot
 * Snapshot system for debugging - saves execution state for replay
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ErrorEnvelope } from './types.js';

/**
 * Snapshot data structure
 */
export interface SnapshotData {
  /** Unique snapshot ID */
  id: string;
  /** Timestamp when snapshot was created */
  timestamp: string;
  /** Command that was executed */
  command: string;
  /** Plugin ID */
  pluginId: string;
  /** Plugin version */
  pluginVersion: string;
  /** Input flags/arguments */
  input: Record<string, unknown>;
  /** Execution context */
  context: {
    cwd: string;
    workdir: string;
    outdir?: string;
    user?: string;
  };
  /** Environment variables (whitelisted) */
  env: Record<string, string>;
  /** Execution result */
  result: 'success' | 'error';
  /** Error details (if result is error) - using ErrorEnvelope structure */
  error?: {
    code: string;
    message: string;
    stack?: string;
    details?: Record<string, unknown>;
  };
  /** Logs from execution */
  logs?: string[];
  /** Execution metrics */
  metrics?: {
    timeMs: number;
    cpuMs?: number;
    memMb?: number;
  };
}

/**
 * Get debug directory path (.kb/debug)
 */
export function getDebugDir(repoRoot: string = process.cwd()): string {
  return path.join(repoRoot, '.kb', 'debug');
}

/**
 * Get snapshots directory path
 */
export function getSnapshotsDir(repoRoot: string = process.cwd()): string {
  return path.join(getDebugDir(repoRoot), 'tmp', 'snapshots');
}

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Generate snapshot ID from timestamp
 */
function generateSnapshotId(command: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const commandSlug = command.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `${timestamp}-${commandSlug}`;
}

/**
 * Save snapshot to disk
 */
export async function saveSnapshot(
  data: Omit<SnapshotData, 'id' | 'timestamp'>,
  repoRoot: string = process.cwd()
): Promise<string> {
  const snapshotsDir = getSnapshotsDir(repoRoot);
  await ensureDir(snapshotsDir);

  const id = generateSnapshotId(data.command);
  const timestamp = new Date().toISOString();

  const snapshot: SnapshotData = {
    id,
    timestamp,
    ...data,
  };

  const filePath = path.join(snapshotsDir, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf8');

  return filePath;
}

/**
 * Load snapshot by ID
 */
export async function loadSnapshot(
  snapshotId: string,
  repoRoot: string = process.cwd()
): Promise<SnapshotData | null> {
  const snapshotsDir = getSnapshotsDir(repoRoot);
  
  // Try with .json extension
  let filePath = path.join(snapshotsDir, `${snapshotId}.json`);
  
  // If not found, try without extension
  if (!await fileExists(filePath)) {
    filePath = path.join(snapshotsDir, snapshotId);
    if (!await fileExists(filePath)) {
      return null;
    }
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as SnapshotData;
  } catch (err) {
    return null;
  }
}

/**
 * List all snapshots
 */
export async function listSnapshots(
  repoRoot: string = process.cwd()
): Promise<SnapshotData[]> {
  const snapshotsDir = getSnapshotsDir(repoRoot);
  
  try {
    await ensureDir(snapshotsDir);
    const files = await fs.readdir(snapshotsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const snapshots: SnapshotData[] = [];
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(snapshotsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const snapshot = JSON.parse(content) as SnapshotData;
        snapshots.push(snapshot);
      } catch {
        // Skip invalid files
      }
    }
    
    // Sort by timestamp (newest first)
    snapshots.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return snapshots;
  } catch {
    return [];
  }
}

/**
 * Rotate snapshots - keep only last N snapshots
 */
export async function rotateSnapshots(
  maxCount: number = 30,
  repoRoot: string = process.cwd()
): Promise<void> {
  const snapshots = await listSnapshots(repoRoot);
  
  if (snapshots.length <= maxCount) {
    return;
  }
  
  // Keep newest maxCount snapshots
  const toKeep = snapshots.slice(0, maxCount);
  const toDelete = snapshots.slice(maxCount);
  
  const snapshotsDir = getSnapshotsDir(repoRoot);
  
  for (const snapshot of toDelete) {
    const filePath = path.join(snapshotsDir, `${snapshot.id}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compare two snapshots and return differences
 */
export async function diffSnapshots(
  snapshotId1: string,
  snapshotId2: string,
  repoRoot: string = process.cwd()
): Promise<{
  id1: string;
  id2: string;
  differences: Array<{
    field: string;
    value1: unknown;
    value2: unknown;
  }>;
}> {
  const snap1 = await loadSnapshot(snapshotId1, repoRoot);
  const snap2 = await loadSnapshot(snapshotId2, repoRoot);

  if (!snap1 || !snap2) {
    throw new Error('One or both snapshots not found');
  }

  const differences: Array<{ field: string; value1: unknown; value2: unknown }> = [];

  // Compare fields
  const fieldsToCompare: Array<keyof SnapshotData> = [
    'command',
    'pluginId',
    'pluginVersion',
    'input',
    'result',
    'error',
    'metrics',
  ];

  for (const field of fieldsToCompare) {
    const val1 = snap1[field];
    const val2 = snap2[field];
    if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      differences.push({ field, value1: val1, value2: val2 });
    }
  }

  return {
    id1: snapshotId1,
    id2: snapshotId2,
    differences,
  };
}

/**
 * Search snapshots by criteria
 */
export async function searchSnapshots(
  criteria: {
    pluginId?: string;
    command?: string;
    error?: boolean;
    after?: Date;
    before?: Date;
  },
  repoRoot: string = process.cwd()
): Promise<SnapshotData[]> {
  const allSnapshots = await listSnapshots(repoRoot);

  return allSnapshots.filter(snapshot => {
    if (criteria.pluginId && snapshot.pluginId !== criteria.pluginId) {
      return false;
    }
    if (criteria.command && snapshot.command !== criteria.command) {
      return false;
    }
    if (criteria.error !== undefined) {
      const hasError = snapshot.result === 'error';
      if (hasError !== criteria.error) {
        return false;
      }
    }
    if (criteria.after) {
      const snapshotDate = new Date(snapshot.timestamp);
      if (snapshotDate < criteria.after) {
        return false;
      }
    }
    if (criteria.before) {
      const snapshotDate = new Date(snapshot.timestamp);
      if (snapshotDate > criteria.before) {
        return false;
      }
    }
    return true;
  });
}


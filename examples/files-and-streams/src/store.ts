export type AssetRecord = {
  id: string;
  title: string;
  url: string;
  size: number;
  /** Stored only — `parseOutput` strips this before the wire. */
  bytes: Uint8Array;
};

export type JobRecord = {
  id: string;
  status: 'running' | 'done';
  progress: number;
};

const assets = new Map<string, AssetRecord>();
const jobs = new Map<string, JobRecord>();
let nextAsset = 1;
let nextJob = 1;

export function resetStore(): void {
  assets.clear();
  jobs.clear();
  nextAsset = 1;
  nextJob = 1;
}

export function listAssets(): AssetRecord[] {
  return [...assets.values()];
}

export function getAsset(id: string): AssetRecord | undefined {
  return assets.get(id);
}

export function createAsset(input: {
  title: string;
  bytes: Uint8Array;
}): AssetRecord {
  const id = `asset_${nextAsset}`;
  nextAsset += 1;
  const record: AssetRecord = {
    id,
    title: input.title,
    url: `memory://assets/${id}`,
    size: input.bytes.byteLength,
    bytes: input.bytes,
  };
  assets.set(id, record);
  return record;
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

export function createJob(): JobRecord {
  const id = `job_${nextJob}`;
  nextJob += 1;
  const record: JobRecord = { id, status: 'running', progress: 0 };
  jobs.set(id, record);
  return record;
}

export function markJobDone(id: string): void {
  const job = jobs.get(id);
  if (job === undefined) {
    return;
  }
  jobs.set(id, { ...job, status: 'done', progress: 100 });
}

// Job status with a coherent result. BullMQ stores the return value and moves the job to "completed" in one atomic step,
// so the state is read first and, once it is completed, the job is reloaded: the result read afterwards is never older
// than the state. (Reading returnvalue from the object loaded before the state could pair "completed" with null.)
export type JobLike = { data: { tenantId?: string; userId?: string }; returnvalue: unknown; getState(): Promise<string> };
export type JobSource = { getJob(id: string): Promise<JobLike | undefined | null> };
export async function jobStatus(queue: JobSource, id: string, owns: (job: JobLike) => boolean) {
  const job = await queue.getJob(id);
  if (!job || !owns(job)) return null;
  const state = await job.getState();
  if (state !== 'completed') return { state, result: null };
  const finished = await queue.getJob(id);
  // Removed between the two reads (retention): report as not found rather than "completed" without its result.
  if (!finished || !owns(finished)) return null;
  return { state, result: finished.returnvalue };
}

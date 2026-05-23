import cron from 'node-cron';
import { startRenewalCheck } from './renewalCheck';
import { startCleanupTempFiles } from './cleanupTempFiles';

let jobs: cron.ScheduledTask[] = [];

export function startAllCronJobs(): cron.ScheduledTask[] {
  if (jobs.length > 0) {
    console.log('[Cron] Jobs already running');
    return jobs;
  }

  console.log('[Cron] Starting all scheduled jobs...');

  const renewalJob = startRenewalCheck();
  jobs.push(renewalJob);
  console.log('[Cron] ✓ Renewal check (daily 2AM)');

  const cleanupJob = startCleanupTempFiles();
  jobs.push(cleanupJob);
  console.log('[Cron] ✓ Cleanup temp files (daily 3AM)');

  console.log(`[Cron] ${jobs.length} jobs started`);
  return jobs;
}

export function stopAllCronJobs(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];
  console.log('[Cron] All jobs stopped');
}

export function getCronJobStatus(): Array<{ name: string; running: boolean }> {
  return [
    { name: 'renewalCheck', running: jobs.length > 0 },
    { name: 'cleanupTempFiles', running: jobs.length > 0 },
  ];
}

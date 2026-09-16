/**
 * Lease de cron no Postgres (Edge Functions stateless — sem pg_advisory_lock entre round-trips).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const CRON_LEASE_JOB_REMINDER_D1 = "process-appointment-reminders";
export const CRON_LEASE_JOB_REMINDER_3H = "process-appointment-reminder-3h";

export async function tryAcquireCronJobLease(
  supabase: SupabaseClient,
  jobName: string,
  leaseSeconds = 900,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_acquire_cron_job_lease", {
    p_job_name: jobName,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    console.error(`tryAcquireCronJobLease(${jobName}):`, error.message);
    return false;
  }

  return data === true;
}

export async function releaseCronJobLease(
  supabase: SupabaseClient,
  jobName: string,
): Promise<void> {
  const { error } = await supabase.rpc("release_cron_job_lease", {
    p_job_name: jobName,
  });
  if (error) {
    console.error(`releaseCronJobLease(${jobName}):`, error.message);
  }
}

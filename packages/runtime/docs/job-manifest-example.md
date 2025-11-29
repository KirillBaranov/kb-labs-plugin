# JobBroker Manifest Configuration Examples

This document provides complete examples of plugin manifests that use JobBroker capabilities.

## Table of Contents

1. [Basic Background Jobs](#basic-background-jobs)
2. [Basic Scheduled Jobs](#basic-scheduled-jobs)
3. [Combined Jobs (Submit + Schedule)](#combined-jobs-submit--schedule)
4. [Advanced Configuration](#advanced-configuration)
5. [Real-World Examples](#real-world-examples)

---

## Basic Background Jobs

Minimal configuration for one-time background jobs.

### manifest.v2.ts

```typescript
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

export default {
  name: 'my-background-plugin',
  version: '1.0.0',
  description: 'Plugin with background job support',

  // Handlers that can be invoked
  handlers: [
    'handlers/process-data.ts',
    'handlers/batch-process.ts',
    'handlers/cleanup.ts'
  ],

  // Permissions for background jobs
  permissions: {
    jobs: {
      submit: {
        // Which handlers can be submitted as jobs
        handlers: [
          'handlers/process-*.ts',
          'handlers/batch-*.ts'
        ],

        // Quota limits
        quotas: {
          perMinute: 100,   // Max 100 jobs per minute
          perHour: 1000,    // Max 1000 jobs per hour
          perDay: 10000     // Max 10000 jobs per day
        },

        // Timeout constraints
        timeoutLimits: {
          min: 1000,        // Min 1 second
          max: 300000       // Max 5 minutes
        }
      }
    }
  }
} satisfies ManifestV2;
```

### handlers/process-data.ts

```typescript
import type { PluginContext } from '@kb-labs/plugin-runtime';

export default async function processData(ctx: PluginContext, input: any) {
  const { dataId } = input;

  // Submit background job
  const job = await ctx.jobs.submit({
    handler: 'handlers/batch-process.ts',
    input: { dataId },
    priority: 7,
    timeout: 120000,  // 2 minutes
    retries: 2,
    tags: ['data-processing']
  });

  return { jobId: job.id };
}
```

---

## Basic Scheduled Jobs

Minimal configuration for recurring cron jobs.

### manifest.v2.ts

```typescript
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

export default {
  name: 'my-scheduled-plugin',
  version: '1.0.0',
  description: 'Plugin with scheduled job support',

  handlers: [
    'handlers/daily-report.ts',
    'handlers/hourly-sync.ts',
    'handlers/weekly-cleanup.ts'
  ],

  permissions: {
    jobs: {
      schedule: {
        // Which handlers can be scheduled
        handlers: [
          'handlers/daily-*.ts',
          'handlers/hourly-*.ts',
          'handlers/weekly-*.ts'
        ],

        // Quota limits for schedule creation
        quotas: {
          perMinute: 10,    // Max 10 schedules per minute
          perHour: 100,     // Max 100 schedules per hour
          perDay: 500       // Max 500 schedules per day
        },

        // Interval constraints
        intervalLimits: {
          min: 60000,       // Min 1 minute between runs
          max: 86400000     // Max 1 day between runs
        }
      }
    }
  }
} satisfies ManifestV2;
```

### handlers/daily-report.ts

```typescript
import type { PluginContext } from '@kb-labs/plugin-runtime';

export default async function dailyReport(ctx: PluginContext, input: any) {
  const { reportType } = input;

  // Schedule daily job
  const schedule = await ctx.jobs.schedule({
    handler: 'handlers/daily-report.ts',
    schedule: '0 9 * * *',  // Every day at 9 AM
    input: { reportType },
    priority: 6,
    timeout: 300000  // 5 minutes
  });

  return { scheduleId: schedule.id };
}
```

---

## Combined Jobs (Submit + Schedule)

Full configuration with both background and scheduled jobs.

### manifest.v2.ts

```typescript
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

export default {
  name: 'my-full-plugin',
  version: '1.0.0',
  description: 'Plugin with both background and scheduled jobs',

  handlers: [
    'handlers/process-data.ts',
    'handlers/batch-process.ts',
    'handlers/daily-report.ts',
    'handlers/hourly-sync.ts',
    'handlers/cleanup.ts'
  ],

  permissions: {
    jobs: {
      // Background job permissions
      submit: {
        handlers: [
          'handlers/process-*.ts',
          'handlers/batch-*.ts',
          'handlers/cleanup.ts'
        ],
        quotas: {
          perMinute: 100,
          perHour: 1000,
          perDay: 10000
        },
        timeoutLimits: {
          min: 1000,
          max: 600000  // 10 minutes
        }
      },

      // Scheduled job permissions
      schedule: {
        handlers: [
          'handlers/daily-*.ts',
          'handlers/hourly-*.ts'
        ],
        quotas: {
          perMinute: 10,
          perHour: 100,
          perDay: 500
        },
        intervalLimits: {
          min: 60000,      // 1 minute
          max: 86400000    // 1 day
        }
      }
    }
  }
} satisfies ManifestV2;
```

### handlers/process-data.ts

```typescript
import type { PluginContext } from '@kb-labs/plugin-runtime';

export default async function processData(ctx: PluginContext, input: any) {
  // Check system health before submitting
  const health = await ctx.jobs.healthCheck();

  if (health.state === 'critical') {
    throw new Error('System overloaded, try again later');
  }

  // Submit background job
  const job = await ctx.jobs.submit({
    handler: 'handlers/batch-process.ts',
    input: { data: input.data },
    priority: 8,
    timeout: 120000,
    retries: 3,
    tags: ['batch', 'high-priority']
  });

  // Schedule daily cleanup
  const cleanup = await ctx.jobs.schedule({
    handler: 'handlers/daily-cleanup.ts',
    schedule: '0 2 * * *',  // Every day at 2 AM
    priority: 5,
    timeout: 300000
  });

  return {
    jobId: job.id,
    cleanupScheduleId: cleanup.id
  };
}
```

---

## Advanced Configuration

Production-ready configuration with strict limits and multiple handler patterns.

### manifest.v2.ts

```typescript
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

export default {
  name: 'production-plugin',
  version: '2.0.0',
  description: 'Production plugin with strict job controls',

  handlers: [
    // Background handlers
    'handlers/jobs/process-*.ts',
    'handlers/jobs/batch-*.ts',
    'handlers/jobs/import-*.ts',
    'handlers/jobs/export-*.ts',

    // Scheduled handlers
    'handlers/cron/daily-*.ts',
    'handlers/cron/hourly-*.ts',
    'handlers/cron/weekly-*.ts',

    // Utility handlers
    'handlers/utils/cleanup.ts',
    'handlers/utils/healthcheck.ts'
  ],

  permissions: {
    jobs: {
      submit: {
        // Separate patterns for different job types
        handlers: [
          'handlers/jobs/process-*.ts',   // Data processing
          'handlers/jobs/batch-*.ts',     // Batch operations
          'handlers/jobs/import-*.ts',    // Import jobs
          'handlers/jobs/export-*.ts',    // Export jobs
          'handlers/utils/cleanup.ts'     // Cleanup utility
        ],

        // Conservative quotas for production
        quotas: {
          perMinute: 50,     // 50 jobs/min = ~1 job/sec
          perHour: 2000,     // ~33 jobs/min average
          perDay: 20000      // ~14 jobs/min average
        },

        // Strict timeout limits
        timeoutLimits: {
          min: 5000,         // Min 5 seconds
          max: 600000        // Max 10 minutes
        }
      },

      schedule: {
        // Only cron handlers can be scheduled
        handlers: [
          'handlers/cron/daily-*.ts',
          'handlers/cron/hourly-*.ts',
          'handlers/cron/weekly-*.ts'
        ],

        // Very conservative schedule creation quotas
        quotas: {
          perMinute: 5,      // Max 5 new schedules per minute
          perHour: 50,       // Max 50 new schedules per hour
          perDay: 200        // Max 200 new schedules per day
        },

        // Prevent too-frequent schedules
        intervalLimits: {
          min: 300000,       // Min 5 minutes between runs
          max: 604800000     // Max 7 days between runs
        }
      }
    }
  }
} satisfies ManifestV2;
```

---

## Real-World Examples

### Example 1: Data Processing Pipeline

Plugin that processes uploaded files in batches.

```typescript
// manifest.v2.ts
export default {
  name: 'data-processor',
  version: '1.0.0',

  handlers: [
    'handlers/upload-handler.ts',
    'handlers/process-file.ts',
    'handlers/validate-data.ts',
    'handlers/index-data.ts'
  ],

  permissions: {
    jobs: {
      submit: {
        handlers: [
          'handlers/process-*.ts',
          'handlers/validate-*.ts',
          'handlers/index-*.ts'
        ],
        quotas: {
          perMinute: 200,    // High throughput
          perHour: 5000,
          perDay: 50000
        },
        timeoutLimits: {
          min: 1000,
          max: 300000        // 5 minutes per file
        }
      }
    }
  }
} satisfies ManifestV2;

// handlers/upload-handler.ts
export default async function handleUpload(ctx: PluginContext, input: any) {
  const { files } = input;

  // Submit a job for each file
  const jobs = await Promise.all(
    files.map((file: any) =>
      ctx.jobs.submit({
        handler: 'handlers/process-file.ts',
        input: { fileId: file.id },
        priority: file.urgent ? 9 : 5,
        timeout: 180000,  // 3 minutes
        retries: 2,
        tags: ['file-processing', file.type]
      })
    )
  );

  return { jobIds: jobs.map(j => j.id) };
}
```

### Example 2: Scheduled Reports

Plugin that generates and sends daily/weekly reports.

```typescript
// manifest.v2.ts
export default {
  name: 'report-generator',
  version: '1.0.0',

  handlers: [
    'handlers/setup-reports.ts',
    'handlers/daily-sales-report.ts',
    'handlers/weekly-analytics-report.ts',
    'handlers/monthly-summary.ts'
  ],

  permissions: {
    jobs: {
      schedule: {
        handlers: [
          'handlers/daily-*.ts',
          'handlers/weekly-*.ts',
          'handlers/monthly-*.ts'
        ],
        quotas: {
          perMinute: 10,
          perHour: 50,
          perDay: 200
        },
        intervalLimits: {
          min: 3600000,      // Min 1 hour
          max: 2592000000    // Max 30 days
        }
      }
    }
  }
} satisfies ManifestV2;

// handlers/setup-reports.ts
export default async function setupReports(ctx: PluginContext, input: any) {
  // Daily sales report at 9 AM
  const dailySales = await ctx.jobs.schedule({
    handler: 'handlers/daily-sales-report.ts',
    schedule: '0 9 * * *',
    input: { timezone: 'America/New_York' },
    priority: 7,
    timeout: 300000  // 5 minutes
  });

  // Weekly analytics every Monday at 8 AM
  const weeklyAnalytics = await ctx.jobs.schedule({
    handler: 'handlers/weekly-analytics-report.ts',
    schedule: '0 8 * * 1',
    input: { includeCharts: true },
    priority: 6,
    timeout: 600000  // 10 minutes
  });

  // Monthly summary on 1st of month at 6 AM
  const monthlySummary = await ctx.jobs.schedule({
    handler: 'handlers/monthly-summary.ts',
    schedule: '0 6 1 * *',
    input: { detailed: true },
    priority: 5,
    timeout: 900000  // 15 minutes
  });

  return {
    schedules: {
      dailySales: dailySales.id,
      weeklyAnalytics: weeklyAnalytics.id,
      monthlySummary: monthlySummary.id
    }
  };
}
```

### Example 3: Periodic Sync

Plugin that syncs data from external API every 5 minutes.

```typescript
// manifest.v2.ts
export default {
  name: 'api-sync',
  version: '1.0.0',

  handlers: [
    'handlers/setup-sync.ts',
    'handlers/sync-data.ts',
    'handlers/process-sync-result.ts'
  ],

  permissions: {
    jobs: {
      submit: {
        handlers: ['handlers/process-*.ts'],
        quotas: {
          perMinute: 50,
          perHour: 500,
          perDay: 5000
        },
        timeoutLimits: {
          min: 1000,
          max: 60000  // 1 minute
        }
      },

      schedule: {
        handlers: ['handlers/sync-*.ts'],
        quotas: {
          perMinute: 5,
          perHour: 20,
          perDay: 100
        },
        intervalLimits: {
          min: 60000,       // Min 1 minute
          max: 3600000      // Max 1 hour
        }
      }
    }
  }
} satisfies ManifestV2;

// handlers/setup-sync.ts
export default async function setupSync(ctx: PluginContext, input: any) {
  const { apiUrl, interval = '5m' } = input;

  // Schedule sync job every 5 minutes
  const sync = await ctx.jobs.schedule({
    handler: 'handlers/sync-data.ts',
    schedule: interval,  // Interval syntax: '5m'
    input: { apiUrl },
    priority: 8,
    timeout: 30000,  // 30 seconds
    retries: 2
  });

  return { syncScheduleId: sync.id };
}

// handlers/sync-data.ts
export default async function syncData(ctx: PluginContext, input: any) {
  const { apiUrl } = input;

  // Fetch data from API
  const response = await fetch(apiUrl);
  const data = await response.json();

  // Submit background job to process results
  const job = await ctx.jobs.submit({
    handler: 'handlers/process-sync-result.ts',
    input: { data },
    priority: 7,
    timeout: 60000,
    tags: ['sync', 'api']
  });

  return { processed: job.id };
}
```

---

## Permission Patterns

### Handler Pattern Matching

Use glob patterns to match handlers:

```typescript
permissions: {
  jobs: {
    submit: {
      handlers: [
        'handlers/*.ts',              // All handlers in handlers/
        'handlers/jobs/*.ts',         // All in handlers/jobs/
        'handlers/process-*.ts',      // All starting with process-
        'handlers/utils/cleanup.ts'   // Specific handler
      ]
    }
  }
}
```

### Quota Strategies

Different quota strategies for different use cases:

```typescript
// High-throughput (data processing)
quotas: {
  perMinute: 500,
  perHour: 10000,
  perDay: 100000
}

// Moderate (general background tasks)
quotas: {
  perMinute: 100,
  perHour: 1000,
  perDay: 10000
}

// Conservative (scheduled tasks)
quotas: {
  perMinute: 10,
  perHour: 50,
  perDay: 200
}

// Very restrictive (admin operations)
quotas: {
  perMinute: 5,
  perHour: 20,
  perDay: 50
}
```

### Timeout/Interval Limits

Choose limits based on operation characteristics:

```typescript
// Quick operations (< 1 minute)
timeoutLimits: {
  min: 1000,      // 1 second
  max: 60000      // 1 minute
}

// Medium operations (1-10 minutes)
timeoutLimits: {
  min: 5000,      // 5 seconds
  max: 600000     // 10 minutes
}

// Long operations (10-30 minutes)
timeoutLimits: {
  min: 60000,     // 1 minute
  max: 1800000    // 30 minutes
}

// Schedule intervals
intervalLimits: {
  min: 60000,     // 1 minute (high frequency)
  max: 86400000   // 1 day
}

intervalLimits: {
  min: 300000,    // 5 minutes (moderate)
  max: 604800000  // 7 days
}
```

---

## Best Practices

1. **Use specific handler patterns** - Don't use `'handlers/*'` unless necessary
2. **Set conservative quotas** - Start low, increase based on actual usage
3. **Set appropriate timeouts** - Match timeout to expected operation duration
4. **Use tags for monitoring** - Tag jobs for easier filtering and analytics
5. **Handle degradation** - Check `ctx.jobs.healthCheck()` before critical operations
6. **Use priority wisely** - Reserve high priority (8-10) for truly critical jobs
7. **Set maxRuns for schedules** - Prevent runaway schedules with `maxRuns`
8. **Use interval syntax for simplicity** - `'5m'` is clearer than `'*/5 * * * *'`

---

## See Also

- [JobBroker API Documentation](./jobs-api.md)
- [Architecture Decision Record](../../../kb-labs-mind/docs/adr/0034-job-broker-cron-scheduler.md)
- [Plugin Manifest Documentation](../../manifest/README.md)
- [Workflow Engine Documentation](../../../../kb-labs-workflow/packages/workflow-engine/README.md)

---

**Last Updated:** 2025-11-28
**Version:** 1.0.0

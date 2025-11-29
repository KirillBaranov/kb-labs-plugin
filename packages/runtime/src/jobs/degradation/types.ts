/**
 * @module @kb-labs/plugin-runtime/jobs/degradation/types
 * Adaptive throttling and degradation types
 */

/**
 * System degradation state
 */
export type DegradationState = 'normal' | 'degraded' | 'critical';

/**
 * System metrics
 */
export interface SystemMetrics {
  /** CPU usage percentage (0-100) */
  cpuUsage: number;

  /** Memory usage percentage (0-100) */
  memoryUsage: number;

  /** Queue depth (number of pending jobs) */
  queueDepth: number;

  /** Active job count */
  activeJobs: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Degradation thresholds
 */
export interface DegradationThresholds {
  /** CPU thresholds */
  cpu: {
    /** Enter degraded state (%) */
    degraded: number;
    /** Enter critical state (%) */
    critical: number;
    /** Return to normal (%) */
    normal: number;
  };

  /** Memory thresholds */
  memory: {
    /** Enter degraded state (%) */
    degraded: number;
    /** Enter critical state (%) */
    critical: number;
    /** Return to normal (%) */
    normal: number;
  };

  /** Queue depth thresholds */
  queueDepth: {
    /** Enter degraded state */
    degraded: number;
    /** Enter critical state */
    critical: number;
    /** Return to normal */
    normal: number;
  };
}

/**
 * Degradation actions
 */
export interface DegradationActions {
  /** Delay for new job submissions in degraded state (ms) */
  degradedDelay: number;

  /** Delay for new job submissions in critical state (ms) */
  criticalDelay: number;

  /** Reject new submissions in critical state */
  rejectOnCritical: boolean;

  /** Pause non-critical schedules in degraded state */
  pauseSchedulesOnDegraded: boolean;

  /** Pause all schedules in critical state */
  pauseSchedulesOnCritical: boolean;
}

/**
 * Degradation controller options
 */
export interface DegradationControllerOptions {
  /** Thresholds for state transitions */
  thresholds?: Partial<DegradationThresholds>;

  /** Actions for each state */
  actions?: Partial<DegradationActions>;

  /** Metrics collection interval (ms) */
  metricsIntervalMs?: number;

  /** State transition debounce time (ms) */
  debounceMs?: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'critical';

  /** Current degradation state */
  state: DegradationState;

  /** Current metrics */
  metrics: SystemMetrics;

  /** Active thresholds */
  thresholds: DegradationThresholds;

  /** Recommendations */
  recommendations: string[];

  /** Timestamp */
  timestamp: number;
}

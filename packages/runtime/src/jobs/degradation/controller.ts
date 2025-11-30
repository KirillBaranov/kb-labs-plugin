/**
 * @module @kb-labs/plugin-runtime/jobs/degradation/controller
 * Adaptive throttling controller with state machine
 */

import type { RedisClientFactoryResult } from '@kb-labs/workflow-engine';
import type {
  DegradationState,
  DegradationThresholds,
  DegradationActions,
  DegradationControllerOptions,
  SystemMetrics,
  HealthCheckResult,
} from './types';
import { SystemMetricsCollector } from './metrics';

const DEFAULT_THRESHOLDS: DegradationThresholds = {
  cpu: {
    degraded: 70,
    critical: 90,
    normal: 50,
  },
  memory: {
    degraded: 75,
    critical: 90,
    normal: 60,
  },
  queueDepth: {
    degraded: 100,
    critical: 500,
    normal: 50,
  },
};

const DEFAULT_ACTIONS: DegradationActions = {
  degradedDelay: 1000, // 1s delay in degraded
  criticalDelay: 5000, // 5s delay in critical
  rejectOnCritical: true,
  pauseSchedulesOnDegraded: false,
  pauseSchedulesOnCritical: true,
};

/**
 * DegradationController manages adaptive throttling based on system metrics
 *
 * State Machine:
 * - normal → degraded (when any metric exceeds degraded threshold)
 * - degraded → critical (when any metric exceeds critical threshold)
 * - degraded → normal (when all metrics below normal threshold)
 * - critical → degraded (when all metrics below degraded threshold)
 */
export class DegradationController {
  private state: DegradationState = 'normal';
  private lastStateChange: number = Date.now();
  private metricsCollector: SystemMetricsCollector;
  private currentMetrics: SystemMetrics | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  private readonly thresholds: DegradationThresholds;
  private readonly actions: DegradationActions;
  private readonly metricsIntervalMs: number;
  private readonly debounceMs: number;

  constructor(
    private readonly redis: RedisClientFactoryResult,
    options: DegradationControllerOptions = {}
  ) {
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...options.thresholds,
      cpu: { ...DEFAULT_THRESHOLDS.cpu, ...options.thresholds?.cpu },
      memory: { ...DEFAULT_THRESHOLDS.memory, ...options.thresholds?.memory },
      queueDepth: { ...DEFAULT_THRESHOLDS.queueDepth, ...options.thresholds?.queueDepth },
    };

    this.actions = {
      ...DEFAULT_ACTIONS,
      ...options.actions,
    };

    this.metricsIntervalMs = options.metricsIntervalMs ?? 10000; // 10s default
    this.debounceMs = options.debounceMs ?? 30000; // 30s debounce

    this.metricsCollector = new SystemMetricsCollector(redis);
  }

  /**
   * Start metrics collection
   */
  start(): void {
    if (this.metricsInterval) {
      return;
    }

    // Collect immediately
    this.collectAndUpdateState().catch(err => {
      console.error('[DegradationController] Failed to collect metrics:', err);
    });

    // Then collect periodically
    this.metricsInterval = setInterval(() => {
      this.collectAndUpdateState().catch(err => {
        console.error('[DegradationController] Failed to collect metrics:', err);
      });
    }, this.metricsIntervalMs);
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  /**
   * Get current degradation state
   */
  getState(): DegradationState {
    return this.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): SystemMetrics | null {
    return this.currentMetrics;
  }

  /**
   * Get delay for job submission based on current state
   */
  getSubmitDelay(): number {
    switch (this.state) {
      case 'degraded':
        return this.actions.degradedDelay;
      case 'critical':
        return this.actions.criticalDelay;
      default:
        return 0;
    }
  }

  /**
   * Check if job submission should be rejected
   */
  shouldRejectSubmit(): boolean {
    return this.state === 'critical' && this.actions.rejectOnCritical;
  }

  /**
   * Check if schedules should be paused
   */
  shouldPauseSchedules(): boolean {
    if (this.state === 'critical' && this.actions.pauseSchedulesOnCritical) {
      return true;
    }
    if (this.state === 'degraded' && this.actions.pauseSchedulesOnDegraded) {
      return true;
    }
    return false;
  }

  /**
   * Get health check result
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const metrics = this.currentMetrics ?? await this.metricsCollector.collect();
    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (metrics.cpuUsage > this.thresholds.cpu.degraded) {
      recommendations.push(`High CPU usage (${metrics.cpuUsage.toFixed(1)}%). Consider scaling horizontally.`);
    }
    if (metrics.memoryUsage > this.thresholds.memory.degraded) {
      recommendations.push(`High memory usage (${metrics.memoryUsage.toFixed(1)}%). Check for memory leaks.`);
    }
    if (metrics.queueDepth > this.thresholds.queueDepth.degraded) {
      recommendations.push(`High queue depth (${metrics.queueDepth}). Increase worker capacity.`);
    }

    if (this.state === 'critical') {
      recommendations.push('System in CRITICAL state. New job submissions may be rejected.');
    } else if (this.state === 'degraded') {
      recommendations.push('System in DEGRADED state. Job submissions are delayed.');
    }

    return {
      status: this.state === 'normal' ? 'healthy' : this.state,
      state: this.state,
      metrics,
      thresholds: this.thresholds,
      recommendations,
      timestamp: Date.now(),
    };
  }

  /**
   * Collect metrics and update state
   */
  private async collectAndUpdateState(): Promise<void> {
    const metrics = await this.metricsCollector.collect();
    this.currentMetrics = metrics;

    const newState = this.determineState(metrics);

    // Apply debounce for state transitions
    const timeSinceLastChange = Date.now() - this.lastStateChange;
    if (newState !== this.state && timeSinceLastChange > this.debounceMs) {
      await this.transitionState(newState);
    }
  }

  /**
   * Determine target state based on metrics
   */
  private determineState(metrics: SystemMetrics): DegradationState {
    // Check critical thresholds
    if (
      metrics.cpuUsage > this.thresholds.cpu.critical ||
      metrics.memoryUsage > this.thresholds.memory.critical ||
      metrics.queueDepth > this.thresholds.queueDepth.critical
    ) {
      return 'critical';
    }

    // Check degraded thresholds
    if (
      metrics.cpuUsage > this.thresholds.cpu.degraded ||
      metrics.memoryUsage > this.thresholds.memory.degraded ||
      metrics.queueDepth > this.thresholds.queueDepth.degraded
    ) {
      return 'degraded';
    }

    // Check if we can return to normal
    if (
      metrics.cpuUsage < this.thresholds.cpu.normal &&
      metrics.memoryUsage < this.thresholds.memory.normal &&
      metrics.queueDepth < this.thresholds.queueDepth.normal
    ) {
      return 'normal';
    }

    // Stay in current state
    return this.state;
  }

  /**
   * Transition to new state
   */
  private async transitionState(newState: DegradationState): Promise<void> {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    console.log(`[DegradationController] State transition: ${oldState} → ${newState}`);

    // Emit event to Redis for monitoring
    await this.emitStateChange(oldState, newState);
  }

  /**
   * Emit state change event
   */
  private async emitStateChange(oldState: DegradationState, newState: DegradationState): Promise<void> {
    try {
      const event = {
        type: 'degradation.state_change',
        oldState,
        newState,
        metrics: this.currentMetrics,
        timestamp: Date.now(),
      };

      await this.redis.client.publish('kb:degradation:events', JSON.stringify(event));
    } catch (error) {
      console.error('[DegradationController] Failed to emit state change:', error);
    }
  }
}

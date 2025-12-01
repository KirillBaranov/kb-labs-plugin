/**
 * @module @kb-labs/plugin-runtime/context/capabilities
 * Capability flags describing host-provided services.
 */

export enum CapabilityFlag {
  PresenterMessage = 'presenter:message',
  PresenterProgress = 'presenter:progress',
  PresenterJson = 'presenter:json',
  PresenterError = 'presenter:error',
  EventsEmit = 'events:emit',
  EventsSchemaRegistration = 'events:schemas',
  AnalyticsEmit = 'analytics:emit',
  AnalyticsFlush = 'analytics:flush',
  ArtifactsRead = 'artifacts:read',
  ArtifactsWrite = 'artifacts:write',
  Invoke = 'invoke:call',
  ShellExec = 'shell:exec',
  JobsSubmit = 'jobs:submit',
  JobsSchedule = 'jobs:schedule',
  StructuredLogging = 'logging:structured',
  MultiTenant = 'tenant:supported',
}

export interface CapabilitySet {
  has(flag: CapabilityFlag): boolean;
  list(): CapabilityFlag[];
  extend(flags: Iterable<CapabilityFlag>): CapabilitySet;
}

class CapabilitySetImpl implements CapabilitySet {
  constructor(private readonly flags: Set<CapabilityFlag>) {}

  has(flag: CapabilityFlag): boolean {
    return this.flags.has(flag);
  }

  list(): CapabilityFlag[] {
    return [...this.flags];
  }

  extend(additional: Iterable<CapabilityFlag>): CapabilitySet {
    for (const flag of additional) {
      this.flags.add(flag);
    }
    return this;
  }
}

export function createCapabilitySet(flags?: Iterable<CapabilityFlag>): CapabilitySet {
  return new CapabilitySetImpl(new Set(flags));
}



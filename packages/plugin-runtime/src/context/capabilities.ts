/**
 * @module @kb-labs/plugin-runtime/context/capabilities
 * Capability flags describing host-provided services.
 */

export enum CapabilityFlag {
  // Presenter capabilities
  PresenterMessage = 'presenter:message',
  PresenterProgress = 'presenter:progress',
  PresenterJson = 'presenter:json',
  PresenterError = 'presenter:error',

  // Event capabilities
  EventsEmit = 'events:emit',
  EventsSchemaRegistration = 'events:schemas',

  // Analytics capabilities
  AnalyticsEmit = 'analytics:emit',
  AnalyticsFlush = 'analytics:flush',

  // Artifact capabilities
  ArtifactsRead = 'artifacts:read',
  ArtifactsWrite = 'artifacts:write',

  // Plugin invocation capabilities
  Invoke = 'invoke:call',
  ShellExec = 'shell:exec',

  // Job capabilities
  JobsSubmit = 'jobs:submit',
  JobsSchedule = 'jobs:schedule',

  // Other capabilities
  StructuredLogging = 'logging:structured',
  MultiTenant = 'tenant:supported',

  // Platform adapter capabilities (replaceable via kb.config.json)
  PlatformVectorStore = 'platform:vectorStore',
  PlatformLLM = 'platform:llm',
  PlatformEmbeddings = 'platform:embeddings',
  PlatformCache = 'platform:cache',
  PlatformStorage = 'platform:storage',
  PlatformLogger = 'platform:logger',

  // Platform core features (built-in, not replaceable)
  PlatformWorkflows = 'platform:workflows',
  PlatformJobs = 'platform:jobs',
  PlatformCron = 'platform:cron',
  PlatformResources = 'platform:resources',
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



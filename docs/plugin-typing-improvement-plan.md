# План улучшения типизации плагинов KB Labs

## Цель
Создать **опционально типизированную** систему плагинов с проверкой соответствия на этапе компиляции между contracts, manifest, commands и handlers.

## Философия: Opt-in Progressive Enhancement

**Все улучшения опционально, но мощно для тех, кто любит контроль!**

- ✅ **Level 0**: Работает как раньше (обратная совместимость)
- ✅ **Level 1**: +1 строка → runtime валидация
- ✅ **Level 2**: +contracts → автодополнение и проверки
- ✅ **Level 3**: +Zod schemas → полная типобезопасность
- ✅ **Level 4**: +custom validators → максимальный контроль

Каждый контрибьютор сам выбирает уровень типизации!

**См. полную документацию по уровням:** `docs/TYPING_LEVELS.md`

---

## Этап 1: Contracts как единый источник истины (Высокий приоритет)

### 1.1 Типизация Contracts с извлечением типов
**Проблема:** Contracts определены, но типы не извлекаются для использования в других местах.

**Решение:**
```typescript
// contracts/src/contract.ts
export const pluginContractsManifest = {
  artifacts: { ... },
  commands: { ... },
  workflows: { ... },
  api: { ... }
} as const satisfies PluginContracts;

// Извлекаем типы
export type PluginArtifactIds = keyof typeof pluginContractsManifest.artifacts;
export type PluginCommandIds = keyof typeof pluginContractsManifest.commands;
export type PluginWorkflowIds = keyof typeof pluginContractsManifest.workflows;
export type PluginRouteIds = keyof typeof pluginContractsManifest.api?.rest?.routes;
```

**Файлы:**
- `kb-labs-plugin-template/packages/contracts/src/contract.ts`
- `kb-labs-plugin-template/packages/contracts/src/types.ts`

---

## Этап 2: Manifest типизация с проверкой Contracts (Высокий приоритет)

### 2.1 Типизация artifact IDs в манифесте
**Проблема:** Artifact IDs в манифесте не проверяются против contracts.

**Решение:**
```typescript
// manifest.v2.ts
import type { PluginArtifactIds } from '@kb-labs/plugin-template-contracts';

export const manifest: ManifestV2 = {
  artifacts: [
    {
      id: 'template.hello.greeting' satisfies PluginArtifactIds,
      pathTemplate: '.kb/template/greeting.json'
    }
  ]
};
```

**Файлы:**
- `kb-labs-plugin-template/packages/plugin-cli/src/manifest.v2.ts`
- `kb-labs-plugin/packages/manifest/src/types.ts` (добавить helper типы)

### 2.2 Типизация command IDs в манифесте
**Проблема:** Command IDs в манифесте не проверяются против contracts.

**Решение:**
```typescript
import type { PluginCommandIds } from '@kb-labs/plugin-template-contracts';

export const manifest: ManifestV2 = {
  cli: {
    commands: [{
      id: 'template:hello' satisfies PluginCommandIds,
      // ...
    }]
  }
};
```

### 2.3 Типизация flag schemas в манифесте
**Проблема:** Flags в манифесте определены отдельно от типов в командах.

**Решение:** Создать helper функцию `defineCommandFlags()`:
```typescript
import { defineCommandFlags } from '@kb-labs/plugin-manifest';

const helloFlags = defineCommandFlags<TemplateHelloFlags>({
  name: { type: 'string', description: 'Name to greet' },
  json: { type: 'boolean', description: 'Emit JSON' }
});

// Использование в манифесте
export const manifest: ManifestV2 = {
  cli: {
    commands: [{
      flags: helloFlags, // Типизировано!
    }]
  }
};
```

**Файлы:**
- `kb-labs-plugin/packages/manifest/src/helpers.ts` (новый файл)
- `kb-labs-plugin-template/packages/plugin-cli/src/manifest.v2.ts`

---

## Этап 3: Command типизация с проверкой Contracts (Высокий приоритет)

### 3.1 Типизация command IDs в командах
**Проблема:** Command IDs в командах не проверяются против contracts.

**Решение:**
```typescript
// cli/commands/hello/run.ts
import type { PluginCommandIds } from '@kb-labs/plugin-template-contracts';

const COMMAND_ID = 'template:hello' satisfies PluginCommandIds;

export const run = defineCommand<TemplateHelloFlags, TemplateHelloResult>({
  name: COMMAND_ID, // Типизировано!
  // ...
});
```

**Файлы:**
- Все файлы команд в плагинах

### 3.2 Типизация result types против contract schemas
**Проблема:** Result типы команд не проверяются против contract output schemas.

**Решение:** Создать helper тип для извлечения типа из contract schema:
```typescript
import type { ExtractCommandOutput } from '@kb-labs/plugin-template-contracts';

type TemplateHelloResult = CommandResult & 
  ExtractCommandOutput<'template:hello'>; // Извлекает тип из contract
```

**Файлы:**
- `kb-labs-plugin-template/packages/contracts/src/types.ts`
- Все файлы команд

---

## Этап 4: Handler типизация (Средний приоритет)

### 4.1 Типизация handler paths
**Проблема:** Handler paths определены как строки без проверки существования.

**Решение:** Использовать const assertions и helper типы:
```typescript
const handlers = {
  hello: './cli/commands/hello/run#run' as const,
} as const;

export const manifest: ManifestV2 = {
  cli: {
    commands: [{
      handler: handlers.hello // Типизировано!
    }]
  }
};
```

**Файлы:**
- `kb-labs-plugin-template/packages/plugin-cli/src/manifest.v2.ts`

### 4.2 Типизация handler функций
**Проблема:** Handler функции не типизированы относительно манифеста.

**Решение:** Создать helper тип для типизации handler:
```typescript
import type { CommandHandler } from '@kb-labs/plugin-runtime';

export const run: CommandHandler<'template:hello', TemplateHelloFlags, TemplateHelloResult> = 
  async (ctx, argv, flags) => {
    // Типизировано!
  };
```

**Файлы:**
- `kb-labs-plugin/packages/runtime/src/types.ts`
- Все handler файлы

---

## Этап 5: Context типизация для адаптеров (Средний приоритет)

### 5.1 Generic типы для PluginContext
**Проблема:** `PluginContext` общий для всех адаптеров, нет специфичных типов.

**Решение:**
```typescript
// Текущий код
const ctx: PluginContext = createPluginContext('cli', {...});

// Улучшенный код
const ctx: PluginContext<'cli'> = createPluginContext('cli', {...});
// ctx имеет специфичные типы для CLI адаптера
```

**Файлы:**
- `kb-labs-plugin/packages/runtime/src/context/plugin-context.ts`

### 5.2 Типизация AdapterContext
**Проблема:** `AdapterContext` типизирован слабо.

**Решение:** Создать специфичные типы для каждого адаптера:
```typescript
type CliAdapterContext = AdapterContext<'cli'>;
type RestAdapterContext = AdapterContext<'rest'>;
```

**Файлы:**
- `kb-labs-plugin/packages/adapters/cli/src/handler.ts`
- `kb-labs-plugin/packages/adapters/rest/src/handler.ts`

---

## Этап 6: Artifact типизация (Средний приоритет)

### 6.1 Типизированные artifact ID
**Проблема:** Artifact IDs используются как строки без типизации.

**Решение:**
```typescript
import type { PluginArtifactIds } from '@kb-labs/plugin-template-contracts';

const artifactId: PluginArtifactIds = 'template.hello.greeting';
// Автодополнение работает!
```

**Файлы:**
- Все места использования artifact IDs

### 6.2 Типизация artifact paths
**Проблема:** Artifact paths определены как строки без связи с ID.

**Решение:** Создать helper функцию:
```typescript
import { getArtifactPath } from '@kb-labs/plugin-template-contracts';

const path = getArtifactPath('template.hello.greeting'); // Типизировано!
```

**Файлы:**
- `kb-labs-plugin-template/packages/contracts/src/helpers.ts` (новый файл)

---

## Этап 7: REST API типизация (Низкий приоритет)

### 7.1 Типизация REST routes
**Проблема:** REST routes не типизированы относительно contracts.

**Решение:**
```typescript
import type { PluginRouteIds } from '@kb-labs/plugin-template-contracts';

export const manifest: ManifestV2 = {
  rest: {
    routes: [{
      // Типизация route ID
    }]
  }
};
```

**Файлы:**
- `kb-labs-plugin-template/packages/plugin-cli/src/manifest.v2.ts`

---

## Этап 8: Helper функции и утилиты (Средний приоритет)

### 8.0 DX улучшения (КРИТИЧЕСКИ ВАЖНО!)
**Проблема:** Ошибки валидации и типизации должны быть понятными.

**Решение:** Улучшить Developer Experience на всех уровнях:

#### 8.0.1 Понятные error messages
```typescript
// kb-labs-plugin/packages/manifest/src/helpers.ts
export function createManifestV2<TContracts = unknown>(
  manifest: TypedManifestV2<TContracts>
): ManifestV2 {
  const result = manifestV2Schema.safeParse(manifest);
  if (!result.success) {
    // ✅ Форматированные ошибки вместо generic Zod errors
    const errors = result.error.errors.map(e => 
      `  ${e.path.join('.')}: ${e.message}`
    ).join('\n');
    throw new Error(`Invalid manifest:\n${errors}\n\nSee: https://docs.kb-labs.dev/plugins/manifest`);
  }
  return result.data;
}
```

#### 8.0.2 Type-safe helpers для contracts
```typescript
// kb-labs-plugin-template/packages/contracts/src/helpers.ts
import type { PluginArtifactIds, PluginCommandIds } from './contract';

export function getArtifactPath<T extends PluginArtifactIds>(id: T): string {
  const artifact = pluginContractsManifest.artifacts[id];
  return artifact.pathPattern;
}

export function getCommandId<T extends PluginCommandIds>(id: T): T {
  return id; // Type-safe identity function для проверки ID
}
```

#### 8.0.3 IntelliSense улучшения
```typescript
// Добавить JSDoc комментарии к contracts
export const pluginContractsManifest = {
  artifacts: {
    /** Machine-readable greeting payload (JSON) */
    'my.greeting': { /* ... */ }
  },
  commands: {
    /** Produce a greeting message */
    'my:command': { /* ... */ }
  }
} as const satisfies PluginContracts;
```

**Файлы:**
- `kb-labs-plugin/packages/manifest/src/helpers.ts`
- `kb-labs-plugin-template/packages/contracts/src/helpers.ts`
- `kb-labs-plugin/docs/TYPING_LEVELS.md` (новый файл)

### 8.1 createManifestV2() helper (КРИТИЧЕСКИ ВАЖНО!)
**Проблема:** Манифесты создаются вручную без проверки типов и contracts.

**Решение:** Создать `createManifestV2()` с опциональной типизацией contracts:
```typescript
import { createManifestV2 } from '@kb-labs/plugin-manifest';
import type { PluginContracts } from '@kb-labs/plugin-template-contracts';

// Вариант 1: Базовое использование (без contracts)
export const manifest = createManifestV2({
  schema: 'kb.plugin/2',
  id: '@kb-labs/plugin-template',
  // ... остальные поля
  // ✅ Runtime валидация через Zod
  // ✅ Лучшая инференция типов
});

// Вариант 2: С типизацией contracts (рекомендуется!)
export const manifest = createManifestV2<typeof pluginContractsManifest>({
  schema: 'kb.plugin/2',
  id: '@kb-labs/plugin-template',
  artifacts: [
    {
      id: 'template.hello.greeting', // ✅ Проверяется против contracts
      pathTemplate: '.kb/template/greeting.json'
    }
  ],
  cli: {
    commands: [{
      id: 'template:hello', // ✅ Проверяется против contracts
      flags: [
        // ✅ Типы flags проверяются против contract input schema
      ]
    }]
  }
});
```

**Преимущества:**
- ✅ Runtime валидация через Zod (автоматически)
- ✅ Типизация artifact/command IDs через generic
- ✅ Автодополнение для всех ID
- ✅ Проверка соответствия contracts на этапе компиляции
- ✅ Обратная совместимость (можно использовать и старый подход)
- ✅ Постепенная миграция (начинаем с базового варианта)

**Реализация:**
```typescript
// kb-labs-plugin/packages/manifest/src/helpers.ts

type ExtractArtifactIds<TContracts> = TContracts extends { artifacts: infer A }
  ? A extends Record<string, any> ? keyof A : never
  : string;

type ExtractCommandIds<TContracts> = TContracts extends { commands: infer C }
  ? C extends Record<string, any> ? keyof C : never
  : string;

type TypedManifestV2<TContracts = unknown> = Omit<ManifestV2, 'artifacts' | 'cli'> & {
  artifacts?: Array<Omit<ArtifactDecl, 'id'> & {
    id: TContracts extends PluginContracts ? ExtractArtifactIds<TContracts> : string;
  }>;
  cli?: {
    commands: Array<Omit<CliCommandDecl, 'id'> & {
      id: TContracts extends PluginContracts ? ExtractCommandIds<TContracts> : string;
    }>;
  };
} & Pick<ManifestV2, 'rest' | 'studio' | 'setup' | 'permissions' | 'capabilities'>;

export function createManifestV2<TContracts = unknown>(
  manifest: TypedManifestV2<TContracts>
): ManifestV2 {
  const result = manifestV2Schema.safeParse(manifest);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid manifest:\n${errors}`);
  }
  return result.data;
}
```

**Файлы:**
- `kb-labs-plugin/packages/manifest/src/helpers.ts` (новый файл)
- `kb-labs-plugin/packages/manifest/src/index.ts` (экспорт)
- `kb-labs-plugin-template/packages/plugin-cli/src/manifest.v2.ts` (миграция)

### 8.2 defineContracts() helper
**Проблема:** Contracts создаются вручную без проверки типов.

**Решение:**
```typescript
import { defineContracts } from '@kb-labs/plugin-manifest';

export const pluginContractsManifest = defineContracts({
  // Полная типизация с as const для извлечения типов
} as const satisfies PluginContracts);
```

**Файлы:**
- `kb-labs-plugin/packages/manifest/src/helpers.ts`

---

## Этап 9: Migration helpers и CLI команды (Низкий приоритет)

### 9.1 Migration helpers
**Проблема:** Контрибьюторам нужны инструменты для миграции между уровнями типизации.

**Решение:** Создать helper функции для миграции:

```typescript
// kb-labs-plugin/packages/manifest/src/migration-helpers.ts

/**
 * Migrate from plain manifest to createManifestV2 (Level 0 → Level 1)
 */
export function migrateToCreateManifest(manifest: ManifestV2): string {
  return `import { createManifestV2 } from '@kb-labs/plugin-manifest';\n\n` +
         `export const manifest = createManifestV2(${JSON.stringify(manifest, null, 2)});`;
}

/**
 * Extract contracts from manifest (Level 1 → Level 2)
 */
export function extractContractsFromManifest(manifest: ManifestV2): PluginContracts {
  return {
    schema: 'kb.plugin.contracts/1',
    pluginId: manifest.id,
    contractsVersion: manifest.version,
    artifacts: manifest.artifacts?.reduce((acc, artifact) => {
      acc[artifact.id] = {
        id: artifact.id,
        kind: 'json', // default
        pathPattern: artifact.pathTemplate || `artifacts/${artifact.id}.json`
      };
      return acc;
    }, {} as any) || {},
    commands: manifest.cli?.commands.reduce((acc, cmd) => {
      acc[cmd.id] = { id: cmd.id };
      return acc;
    }, {} as any) || {}
  };
}

/**
 * Generate Zod schemas from contracts (Level 2 → Level 3)
 */
export function generateZodSchemasFromContracts(contracts: PluginContracts): string {
  // Generate Zod schema templates for each command
  let output = `import { z } from 'zod';\n\n`;
  
  for (const [id, cmd] of Object.entries(contracts.commands || {})) {
    const name = id.replace(/[:-]/g, '_');
    output += `export const ${name}InputSchema = z.object({\n`;
    output += `  // TODO: Define input schema\n`;
    output += `});\n\n`;
    output += `export const ${name}OutputSchema = z.object({\n`;
    output += `  ok: z.boolean(),\n`;
    output += `  // TODO: Define output schema\n`;
    output += `});\n\n`;
  }
  
  return output;
}
```

**Файлы:**
- `kb-labs-plugin/packages/manifest/src/migration-helpers.ts` (новый файл)

### 9.2 CLI команды для валидации
**Проблема:** Нужны команды для проверки типизации плагинов.

**Решение:** Добавить CLI команды:

```bash
# Проверить manifest на соответствие Zod schema
kb plugin:validate manifest.v2.ts

# Проверить соответствие manifest и contracts
kb plugin:validate --contracts contracts/src/contract.ts manifest.v2.ts

# Сгенерировать contracts из manifest
kb plugin:generate contracts manifest.v2.ts > contracts/src/contract.ts

# Сгенерировать Zod schemas из contracts
kb plugin:generate schemas contracts/src/contract.ts > contracts/src/schema.ts

# Проверить типизацию всего плагина
kb plugin:typecheck
```

**Реализация:**
```typescript
// kb-labs-cli/packages/commands/src/commands/plugins/validate.ts
type PluginValidateFlags = {
  contracts: { type: 'string'; description?: string };
  fix: { type: 'boolean'; description?: string };
};

export const pluginValidate = defineSystemCommand<PluginValidateFlags, CommandResult>({
  name: 'plugin:validate',
  description: 'Validate plugin manifest and contracts',
  flags: {
    contracts: { 
      type: 'string', 
      description: 'Path to contracts file for cross-validation' 
    },
    fix: { 
      type: 'boolean', 
      description: 'Automatically fix common issues' 
    }
  },
  async handler(ctx, argv, flags) {
    // Validate manifest
    const manifestPath = argv[0];
    const manifest = await import(manifestPath);
    
    // Runtime validation
    const validationResult = validateManifestV2(manifest.default);
    
    if (!validationResult.valid) {
      ctx.output.error('Manifest validation failed:');
      for (const error of validationResult.errors) {
        ctx.output.write(`  - ${error.message}\n`);
      }
      return { ok: false };
    }
    
    // Cross-validation with contracts
    if (flags.contracts) {
      const contracts = await import(flags.contracts);
      const crossValidation = validateManifestAgainstContracts(
        manifest.default, 
        contracts.default
      );
      
      if (!crossValidation.ok) {
        ctx.output.error('Manifest does not match contracts:');
        for (const issue of crossValidation.issues) {
          ctx.output.write(`  - ${issue}\n`);
        }
        return { ok: false };
      }
    }
    
    ctx.output.success('✅ Manifest is valid!');
    return { ok: true };
  }
});
```

**Файлы:**
- `kb-labs-cli/packages/commands/src/commands/plugins/validate.ts` (новый файл)
- `kb-labs-cli/packages/commands/src/commands/plugins/generate.ts` (новый файл)
- `kb-labs-cli/packages/commands/src/commands/plugins/typecheck.ts` (новый файл)

---

## Этап 10: Testing utilities (Низкий приоритет)

### 10.1 Типизированные test helpers
**Проблема:** Тестирование плагинов требует много boilerplate кода.

**Решение:** Создать типизированные test utilities:

```typescript
// kb-labs-plugin/packages/testing/src/helpers.ts

import type { ManifestV2, PluginContracts } from '@kb-labs/plugin-manifest';
import type { EnhancedCliContext } from '@kb-labs/cli-command-kit';

/**
 * Create a typed mock context for testing
 */
export function createMockContext<TContracts extends PluginContracts>(
  contracts: TContracts,
  overrides?: Partial<EnhancedCliContext>
): EnhancedCliContext {
  return {
    logger: createMockLogger(),
    tracker: createMockTracker(),
    output: createMockOutput(),
    ...overrides
  };
}

/**
 * Test command with type safety
 */
export async function testCommand<TFlags, TResult>(
  command: CommandConfig<TFlags, TResult>,
  flags: InferFlags<TFlags>,
  ctx?: Partial<EnhancedCliContext>
): Promise<TResult> {
  const mockCtx = createMockContext(ctx);
  return await command.handler(mockCtx, [], flags);
}

/**
 * Assert command result matches contract
 */
export function assertCommandResult<TResult extends CommandResult>(
  result: TResult,
  schema: z.ZodSchema<TResult>
): asserts result is TResult {
  const validation = schema.safeParse(result);
  if (!validation.success) {
    throw new Error(`Command result does not match schema: ${validation.error.message}`);
  }
}

/**
 * Create typed test suite for a plugin
 */
export function createPluginTestSuite<TContracts extends PluginContracts>(
  contracts: TContracts,
  manifest: ManifestV2
) {
  return {
    testCommand: <TFlags, TResult>(
      commandId: keyof TContracts['commands'],
      flags: InferFlags<TFlags>
    ) => {
      // Find command in manifest
      const cmdDecl = manifest.cli?.commands.find(c => c.id === commandId);
      if (!cmdDecl) {
        throw new Error(`Command ${String(commandId)} not found in manifest`);
      }
      
      // Import and test command
      // ...
    },
    
    testManifest: () => {
      // Validate manifest against contracts
      return validateManifestAgainstContracts(manifest, contracts);
    },
    
    testArtifacts: async () => {
      // Test artifact generation
      // ...
    }
  };
}
```

**Использование:**
```typescript
// plugin-cli/tests/commands/hello.test.ts
import { describe, it, expect } from 'vitest';
import { createPluginTestSuite, assertCommandResult } from '@kb-labs/plugin-testing';
import { pluginContractsManifest } from '../contracts/contract';
import { manifest } from '../src/manifest.v2';
import { HelloCommandOutputSchema } from '../contracts/schema';
import { run } from '../src/commands/hello/run';

const suite = createPluginTestSuite(pluginContractsManifest, manifest);

describe('hello command', () => {
  it('should return valid greeting', async () => {
    const result = await testCommand(run, { name: 'World' });
    
    // ✅ Type-safe assertion
    assertCommandResult(result, HelloCommandOutputSchema);
    
    // ✅ Typed result
    expect(result.ok).toBe(true);
    expect(result.greeting).toBe('Hello, World!');
  });
  
  it('should validate against contracts', () => {
    const validation = suite.testManifest();
    expect(validation.ok).toBe(true);
  });
});
```

**Файлы:**
- `kb-labs-plugin/packages/testing/src/helpers.ts` (новый пакет!)
- `kb-labs-plugin/packages/testing/package.json`
- `kb-labs-plugin-template/packages/plugin-cli/tests/setup.ts`

---

## Приоритеты и порядок выполнения

### Фаза 1: Фундамент (Неделя 1-2)
**Цель:** Базовая типизация с минимальными усилиями (Level 0 → Level 1-2)

1. ✅ Этап 8.1: createManifestV2() helper (КРИТИЧЕСКИ ВАЖНО!)
   - Runtime валидация через Zod
   - Базовая типизация с generic для contracts
2. ✅ Этап 8.0: DX улучшения
   - Понятные error messages
   - Type-safe helpers
3. ✅ Этап 1: Contracts типизация
   - `as const satisfies PluginContracts`
   - Извлечение типов (PluginArtifactIds, PluginCommandIds)
4. ✅ Этап 2.1-2.2: Manifest artifact/command IDs (через createManifestV2<Contracts>)
5. ✅ Этап 3.1: Command IDs в командах

### Фаза 2: Интеграция (Неделя 3-4)
4. ✅ Этап 2.3: Flag schemas типизация
5. ✅ Этап 3.2: Result types против contracts
6. ✅ Этап 6.1-6.2: Artifact типизация

### Фаза 3: Расширение (Неделя 5-6)
7. ✅ Этап 4: Handler типизация
8. ✅ Этап 5: Context типизация
9. ✅ Этап 8: Helper функции

### Фаза 4: Оптимизация (Неделя 7+)
10. ✅ Этап 7: REST API типизация
11. ✅ Документация и примеры
12. ✅ Миграция существующих плагинов

---

## Метрики успеха

- ✅ 100% типизация artifact IDs
- ✅ 100% типизация command IDs
- ✅ Проверка соответствия manifest ↔ contracts на этапе компиляции
- ✅ Автодополнение для всех ID
- ✅ Отсутствие `any` типов в критических местах
- ✅ Документация с примерами

---

## Риски и митигация

**Риск 1:** Сложность внедрения в существующие плагины
- **Митигация:** Постепенная миграция, обратная совместимость

**Риск 2:** Производительность компиляции
- **Митигация:** Использование type-only imports, оптимизация типов

**Риск 3:** Сложность для новых разработчиков
- **Митигация:** Подробная документация, примеры, helper функции

---

## Дополнительные улучшения

### Этап 9: Workflow типизация (Низкий приоритет)
- Типизация workflow IDs
- Типизация workflow steps
- Проверка соответствия workflows ↔ contracts

### Этап 10: Schema типизация (Средний приоритет)
- Типизация Zod schemas в contracts
- Извлечение типов из schemas
- Проверка соответствия schemas ↔ types

### Этап 11: Permissions типизация (Низкий приоритет)
- Типизация permission specs
- Проверка соответствия permissions в манифесте

### Этап 12: Studio типизация (Низкий приоритет)
- Типизация widget IDs
- Типизация menu IDs
- Типизация layout IDs


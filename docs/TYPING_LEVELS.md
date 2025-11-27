# Уровни типизации плагинов (Type Safety Levels)

## Философия: Opt-in Progressive Enhancement

Каждый уровень опционален, но дает конкретные преимущества.
Контрибьютор сам выбирает, насколько глубоко погружаться в типизацию.

---

## Level 0: Базовое использование (Минимум усилий)

```typescript
// manifest.v2.ts
export const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/my-plugin',
  cli: {
    commands: [{
      id: 'my:command',
      handler: './commands/my-command.js'
    }]
  }
};

// commands/my-command.ts
export const run = defineCommand({
  name: 'my:command',
  handler(ctx, argv, flags) {
    // Нет типизации flags, нет валидации
  }
});
```

**Преимущества:**
- ✅ Быстрый старт
- ✅ Минимум кода
- ✅ Простота понимания

**Недостатки:**
- ❌ Нет автодополнения
- ❌ Нет проверки типов
- ❌ Нет runtime валидации

---

## Level 1: Runtime валидация (Минимум усилий + безопасность)

```typescript
// manifest.v2.ts
import { createManifestV2 } from '@kb-labs/plugin-manifest';

export const manifest = createManifestV2({
  schema: 'kb.plugin/2',
  id: '@kb-labs/my-plugin',
  cli: {
    commands: [{
      id: 'my:command',
      handler: './commands/my-command.js'
    }]
  }
});
// ✅ Zod валидация автоматически!
// ✅ Понятные ошибки при неправильной структуре

// commands/my-command.ts
export const run = defineCommand({
  name: 'my:command',
  flags: {
    name: { type: 'string', description: '...' }
  },
  handler(ctx, argv, flags) {
    // flags.name - string | undefined (инференция работает!)
  }
});
```

**Преимущества:**
- ✅ Runtime валидация манифеста
- ✅ Лучшая инференция типов для flags
- ✅ Понятные ошибки

**Изменения:** Одна строка! `createManifestV2(...)`

---

## Level 2: Базовая типизация (Автодополнение + контракты)

```typescript
// contracts/src/contract.ts
export const pluginContractsManifest = {
  artifacts: {
    'my.greeting': { id: 'my.greeting', kind: 'json' }
  },
  commands: {
    'my:command': { id: 'my:command' }
  }
} as const satisfies PluginContracts;

export type PluginArtifactIds = keyof typeof pluginContractsManifest.artifacts;
export type PluginCommandIds = keyof typeof pluginContractsManifest.commands;

// manifest.v2.ts
import { createManifestV2 } from '@kb-labs/plugin-manifest';
import type { PluginContracts } from './contracts';

export const manifest = createManifestV2<typeof pluginContractsManifest>({
  schema: 'kb.plugin/2',
  id: '@kb-labs/my-plugin',
  artifacts: [
    { id: 'my.greeting' } // ✅ Автодополнение! ✅ Проверка на этапе компиляции!
  ],
  cli: {
    commands: [{
      id: 'my:command', // ✅ Автодополнение! ✅ Проверка!
      handler: './commands/my-command.js'
    }]
  }
});

// commands/my-command.ts
type MyCommandFlags = {
  name: { type: 'string'; description?: string };
};

type MyCommandResult = CommandResult & {
  greeting?: string;
};

export const run = defineCommand<MyCommandFlags, MyCommandResult>({
  name: 'my:command' satisfies PluginCommandIds, // ✅ Проверка ID!
  flags: { name: { type: 'string' } },
  handler(ctx, argv, flags) {
    // flags.name - string | undefined (типизировано!)
    return { ok: true, greeting: `Hello, ${flags.name}!` };
  }
});
```

**Преимущества:**
- ✅ Автодополнение для всех ID
- ✅ Проверка соответствия contracts
- ✅ Типизация flags и results
- ✅ Единый источник истины (contracts)

**Изменения:**
- Создать `contracts/src/contract.ts`
- Добавить generic к `createManifestV2<Contracts>`
- Добавить types к `defineCommand<Flags, Result>`

---

## Level 3: Полная типизация (Максимальный контроль)

```typescript
// contracts/src/schema.ts
import { z } from 'zod';

export const HelloCommandInputSchema = z.object({
  name: z.string().optional()
});

export const HelloCommandOutputSchema = z.object({
  ok: z.boolean(),
  greeting: z.string()
});

export type HelloCommandInput = z.infer<typeof HelloCommandInputSchema>;
export type HelloCommandOutput = z.infer<typeof HelloCommandOutputSchema>;

// contracts/src/contract.ts
export const pluginContractsManifest = {
  commands: {
    'my:command': {
      id: 'my:command',
      input: {
        ref: '@kb-labs/my-plugin-contracts/schema#HelloCommandInput',
        format: 'zod'
      },
      output: {
        ref: '@kb-labs/my-plugin-contracts/schema#HelloCommandOutput',
        format: 'zod'
      }
    }
  }
} as const satisfies PluginContracts;

// commands/my-command.ts
import type { HelloCommandInput, HelloCommandOutput } from '../contracts/schema';

type MyCommandFlags = {
  name: { type: 'string'; description?: string };
};

export const run = defineCommand<MyCommandFlags, HelloCommandOutput>({
  name: 'my:command',
  flags: { name: { type: 'string' } },
  async handler(ctx, argv, flags): Promise<HelloCommandOutput> {
    // Валидация input через Zod
    const input = HelloCommandInputSchema.parse({ name: flags.name });
    
    const result: HelloCommandOutput = {
      ok: true,
      greeting: `Hello, ${input.name ?? 'World'}!`
    };
    
    // Валидация output через Zod
    return HelloCommandOutputSchema.parse(result);
  }
});
```

**Преимущества:**
- ✅ Полная типобезопасность
- ✅ Runtime валидация input/output
- ✅ Zod schemas как contracts
- ✅ Автодополнение везде
- ✅ Проверка на этапе компиляции и runtime

**Изменения:**
- Создать Zod schemas в contracts
- Добавить валидацию в handler
- Типизировать return type

---

## Level 4: Максимальный контроль (Для энтузиастов)

```typescript
// contracts/src/validators.ts
import { createValidator } from '@kb-labs/plugin-manifest';

export const validateGreeting = createValidator<HelloCommandOutput>(
  (output) => {
    if (!output.greeting.startsWith('Hello')) {
      return { ok: false, error: 'Greeting must start with "Hello"' };
    }
    return { ok: true };
  }
);

// commands/my-command.ts
export const run = defineCommand<MyCommandFlags, HelloCommandOutput>({
  name: 'my:command',
  flags: { name: { type: 'string' } },
  validators: {
    result: validateGreeting // ✅ Custom валидация!
  },
  async handler(ctx, argv, flags): Promise<HelloCommandOutput> {
    // Типизированный context
    const logger = ctx.logger<'my-plugin'>(); // ✅ Типизированный logger!
    const tracker = ctx.tracker<'my:command'>(); // ✅ Типизированный tracker!
    
    tracker.checkpoint('start');
    logger.info('Command started', { name: flags.name });
    
    const result: HelloCommandOutput = {
      ok: true,
      greeting: `Hello, ${flags.name ?? 'World'}!`
    };
    
    tracker.checkpoint('complete');
    logger.info('Command completed', { result });
    
    return result;
  }
});
```

**Преимущества:**
- ✅ Custom validators
- ✅ Типизированный context
- ✅ Типизированный logger/tracker
- ✅ Максимальный контроль

---

## Сравнительная таблица

| Уровень | Усилия | Типобезопасность | Автодополнение | Runtime валидация | Рекомендация |
|---------|--------|------------------|----------------|-------------------|--------------|
| Level 0 | ⭐ | ❌ | ❌ | ❌ | Быстрый прототип |
| Level 1 | ⭐⭐ | ✅ | ✅ | ✅ | **Минимум для production** |
| Level 2 | ⭐⭐⭐ | ✅✅ | ✅✅ | ✅ | **Рекомендуется** |
| Level 3 | ⭐⭐⭐⭐ | ✅✅✅ | ✅✅✅ | ✅✅✅ | Для критичных плагинов |
| Level 4 | ⭐⭐⭐⭐⭐ | ✅✅✅ | ✅✅✅ | ✅✅✅ | Для энтузиастов |

---

## Migration Path

```
Level 0 → Level 1: +1 строка (createManifestV2)
Level 1 → Level 2: +contracts file + generics
Level 2 → Level 3: +Zod schemas + validation
Level 3 → Level 4: +custom validators + typed context
```

Каждый уровень опционален, но каждый дает конкретные преимущества!

---

## Примеры в plugin-template

В `@kb-labs/plugin-template` будут примеры для каждого уровня:

- `examples/level-0-basic/` - минимальный пример
- `examples/level-1-validation/` - с runtime валидацией
- `examples/level-2-contracts/` - с типизацией через contracts
- `examples/level-3-full-typing/` - с Zod schemas
- `examples/level-4-advanced/` - с custom validators

Каждый пример можно скопировать и адаптировать под свой плагин!

---

## Developer Experience улучшения

### Лучшие error messages

```typescript
// Level 1+: понятные ошибки при валидации манифеста
❌ Invalid manifest:
   cli.commands.0.id: Expected string matching pattern ^[a-z0-9-]+:[a-z0-9-]+$
   artifacts.0.pathTemplate: Required field missing

✅ Вместо generic Zod errors
```

### Автодополнение везде

```typescript
// Level 2+: автодополнение для ID
manifest.artifacts[0].id = 'my.greeting'; // ✅ Подсказка: 'my.greeting' | 'my.log'
manifest.cli.commands[0].id = 'my:command'; // ✅ Подсказка: 'my:command'
```

### Type-safe helpers

```typescript
// Level 2+: типизированные helpers
import { getArtifactPath, getCommandId } from '@kb-labs/plugin-contracts';

const path = getArtifactPath('my.greeting'); // ✅ Типизировано!
const id = getCommandId('my:command'); // ✅ Типизировано!
```

### IntelliSense для contracts

```typescript
// Level 2+: IntelliSense показывает contract metadata
const artifact = pluginContractsManifest.artifacts['my.greeting'];
// Hover: { id: 'my.greeting', kind: 'json', description: '...', pathPattern: '...' }
```

---

## Рекомендации

### Для новых плагинов
Начните с **Level 1** (минимум для production), затем переходите к **Level 2** (рекомендуется).

### Для существующих плагинов
Мигрируйте постепенно:
1. Сначала добавьте `createManifestV2()` (Level 1)
2. Затем создайте contracts (Level 2)
3. Добавьте Zod schemas при необходимости (Level 3+)

### Для критичных плагинов
Используйте **Level 3** для полной типобезопасности и runtime валидации.

### Для энтузиастов
Экспериментируйте с **Level 4** для максимального контроля и custom validators.


---

## Инструменты для миграции

### CLI команды

```bash
# Проверить manifest
kb plugin:validate manifest.v2.ts

# Проверить соответствие contracts
kb plugin:validate --contracts contracts/src/contract.ts manifest.v2.ts

# Сгенерировать contracts из manifest
kb plugin:generate contracts manifest.v2.ts

# Сгенерировать Zod schemas из contracts
kb plugin:generate schemas contracts/src/contract.ts

# Проверить типизацию
kb plugin:typecheck
```

### Migration helpers

```typescript
import { 
  migrateToCreateManifest,
  extractContractsFromManifest,
  generateZodSchemasFromContracts
} from '@kb-labs/plugin-manifest/migration';

// Level 0 → Level 1
const code = migrateToCreateManifest(manifest);

// Level 1 → Level 2
const contracts = extractContractsFromManifest(manifest);

// Level 2 → Level 3
const schemas = generateZodSchemasFromContracts(contracts);
```

---

## Testing utilities

```typescript
import { createPluginTestSuite, testCommand, assertCommandResult } from '@kb-labs/plugin-testing';

// Создать test suite для плагина
const suite = createPluginTestSuite(pluginContractsManifest, manifest);

// Тестировать команду с типобезопасностью
const result = await testCommand(myCommand, { name: 'World' });
assertCommandResult(result, HelloCommandOutputSchema);

// Проверить manifest
const validation = suite.testManifest();
expect(validation.ok).toBe(true);
```


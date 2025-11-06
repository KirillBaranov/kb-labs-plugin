# Artifact System

Система артефактов позволяет плагинам обмениваться структурированными данными через файлы с версионированием, lifecycle статусами, TTL и permissions.

## Основные концепции

### URI схема

Артефакты адресуются через URI схему `artifact://plugin-id/path/to/artifact`:

```typescript
// Примеры URI
const uri1 = 'artifact://mind/pack/output.md';
const uri2 = 'artifact://self/query/results.json'; // 'self' = текущий плагин
```

### Версионирование

Артефакты могут иметь версии для контроля совместимости:

```typescript
interface ArtifactMeta {
  version?: string;        // Версия формата данных (например, "1.0.0")
  schemaVersion?: string;  // Версия схемы данных
}
```

Агенты могут проверять версии перед чтением:

```typescript
const meta = await ctx.extensions.artifacts?.getMeta({ uri: 'artifact://mind/pack/output.md' });
if (meta?.version && meta.version < '1.0.0') {
  // Несовместимая версия
}
```

### Lifecycle статусы

Артефакты проходят через следующие статусы:

- `pending` - начат процесс записи
- `ready` - готов к чтению
- `failed` - ошибка записи
- `expired` - истек TTL

### TTL и очистка

Артефакты могут иметь TTL (time-to-live) для автоматической очистки:

```typescript
// В манифесте
artifacts: [{
  id: 'pack-output',
  pathTemplate: '.kb/mind/pack/{runId}.md',
  ttl: 3600, // 1 час в секундах
}]

// Или при записи
await ctx.extensions.artifacts?.write({
  uri: 'artifact://mind/pack/output.md',
  data: markdown,
  ttl: 7200, // Переопределить TTL из манифеста
});
```

### Capabilities

Артефакты могут поддерживать расширенные возможности:

- `stream` - поддержка стриминга
- `watch` - поддержка наблюдения за изменениями
- `multipart` - поддержка multipart загрузки

```typescript
// В манифесте
artifacts: [{
  id: 'stream-output',
  pathTemplate: '.kb/stream/data.bin',
  capabilities: ['stream', 'watch'],
}]
```

## Использование

### Чтение артефактов

```typescript
// Чтение артефакта
const data = await ctx.extensions.artifacts?.read({
  uri: 'artifact://mind/pack/output.md',
  accept: ['text/markdown', 'application/json'],
});

// Получение метаданных без чтения файла
const meta = await ctx.extensions.artifacts?.getMeta({
  uri: 'artifact://mind/pack/output.md',
});

// Ожидание готовности артефакта
const meta = await ctx.extensions.artifacts?.waitForArtifact({
  uri: 'artifact://mind/pack/output.md',
}, 30000); // timeout 30 секунд
```

### Запись артефактов

```typescript
// Запись артефакта
const result = await ctx.extensions.artifacts?.write({
  uri: 'artifact://mind/pack/output.md',
  data: markdown,
  contentType: 'text/markdown',
  ttl: 3600, // 1 час
  mode: 'upsert', // или 'failIfExists'
});
```

### Discovery

```typescript
// Поиск артефактов по паттерну
const artifacts = await ctx.extensions.artifacts?.list({
  uri: 'artifact://mind/pack/**', // glob pattern
  status: ['ready'], // фильтр по статусу
  minVersion: '1.0.0', // минимальная версия
});

for (const artifact of artifacts) {
  console.log(`${artifact.uri}: ${artifact.meta.status}`);
}
```

## Permissions

Плагины должны объявить permissions в манифесте для доступа к артефактам:

```typescript
// Манифест плагина
permissions: {
  artifacts: {
    read: [
      {
        from: 'mind', // или 'self' для собственных артефактов
        paths: ['pack/**', 'query/**'],
        allowedTypes: ['text/markdown', 'application/json'],
      },
    ],
    write: [
      {
        to: 'self', // только свои артефакты
        paths: ['output/**'],
      },
    ],
  },
}
```

## Примеры цепочек агентов

### Пример 1: Простая цепочка

```typescript
// Агент A пишет результат
await ctx.extensions.artifacts?.write({
  uri: 'artifact://agent-a/result.json',
  data: { result: 'processed' },
  ttl: 3600,
});

// Агент B читает результат
const data = await ctx.extensions.artifacts?.read({
  uri: 'artifact://agent-a/result.json',
});
```

### Пример 2: Ожидание готовности

```typescript
// Агент A начинает писать (status: pending)
await ctx.extensions.artifacts?.write({
  uri: 'artifact://agent-a/result.json',
  data: heavyProcessing(),
});

// Агент B ждет готовности
try {
  const meta = await ctx.extensions.artifacts?.waitForArtifact({
    uri: 'artifact://agent-a/result.json',
  }, 60000); // ждать до 60 секунд
  
  if (meta.status === 'ready') {
    const data = await ctx.extensions.artifacts?.read({
      uri: 'artifact://agent-a/result.json',
    });
  }
} catch (error) {
  // Timeout или ошибка
}
```

### Пример 3: Discovery и фильтрация

```typescript
// Найти все готовые артефакты версии 1.0.0+
const artifacts = await ctx.extensions.artifacts?.list({
  uri: 'artifact://agent-a/**',
  status: ['ready'],
  minVersion: '1.0.0',
});

// Обработать каждый
for (const artifact of artifacts) {
  if (artifact.meta.expiresAt && artifact.meta.expiresAt < Date.now()) {
    // Артефакт истек, пропустить
    continue;
  }
  
  const data = await ctx.extensions.artifacts?.read({
    uri: artifact.uri,
  });
  // Обработать данные
}
```

## Типы

```typescript
// URI схема
type ArtifactURI = `artifact://${string}/${string}`;

// Статусы
type ArtifactStatus = 'pending' | 'ready' | 'failed' | 'expired';

// Capabilities
type ArtifactCapability = 'stream' | 'watch' | 'multipart';

// Запросы
interface ArtifactReadRequest {
  uri: string;
  accept?: string[];
}

interface ArtifactWriteRequest {
  uri: string;
  data: unknown;
  contentType?: string;
  mode?: 'upsert' | 'failIfExists';
  ttl?: number;
}

interface ArtifactListRequest {
  uri: string; // с glob pattern
  status?: ArtifactStatus[];
  minVersion?: string;
}

// Метаданные
interface ArtifactMeta {
  owner: string;
  size: number;
  sha256: string;
  contentType: string;
  encoding?: string;
  createdAt: number;
  updatedAt: number;
  version?: string;
  schemaVersion?: string;
  status: ArtifactStatus;
  expiresAt?: number;
  ttl?: number;
  capabilities?: ArtifactCapability[];
}
```

## Best Practices

1. **Всегда проверяйте статус** перед чтением критичных артефактов:
   ```typescript
   const meta = await ctx.extensions.artifacts?.getMeta({ uri });
   if (meta?.status !== 'ready') {
     // Ожидать или обработать ошибку
   }
   ```

2. **Используйте TTL** для временных данных:
   ```typescript
   await ctx.extensions.artifacts?.write({
     uri,
     data,
     ttl: 3600, // 1 час
   });
   ```

3. **Проверяйте версии** для совместимости:
   ```typescript
   const meta = await ctx.extensions.artifacts?.getMeta({ uri });
   if (meta?.version && meta.version < '1.0.0') {
     // Обработать несовместимость
   }
   ```

4. **Используйте waitForArtifact** для async цепочек:
   ```typescript
   const meta = await ctx.extensions.artifacts?.waitForArtifact({ uri }, timeout);
   ```

5. **Фильтруйте по статусу** при discovery:
   ```typescript
   const artifacts = await ctx.extensions.artifacts?.list({
     uri: 'artifact://plugin/**',
     status: ['ready'],
   });
   ```




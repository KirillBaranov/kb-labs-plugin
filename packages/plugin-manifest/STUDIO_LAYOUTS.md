# Создание страниц в Studio через Layouts

## Быстрый старт

Studio использует **layout-first подход**: вы создаете layout с виджетами, и Studio автоматически рендерит страницу.

### Шаг 1: Создайте виджеты

```typescript
studio: {
  widgets: [
    {
      id: 'analytics.overview-summary',
      kind: 'keyvalue',
      title: 'Summary',
      data: {
        source: {
          type: 'rest',
          routeId: '/metrics',
          method: 'GET',
        },
      },
    },
    {
      id: 'analytics.overview-timeline',
      kind: 'chart',
      title: 'Timeline',
      data: {
        source: {
          type: 'rest',
          routeId: '/events-timeline',
          method: 'GET',
        },
      },
      options: {
        chartType: 'line',
        height: 300,
      },
    },
  ],
}
```

### Шаг 2: Создайте layout с виджетами

```typescript
studio: {
  layouts: [
    {
      id: 'analytics.overview',  // ← ID layout
      kind: 'grid',
      title: 'Analytics Overview',
      description: 'Summary of key analytics data',
      config: {
        cols: { sm: 1, md: 2, lg: 3 },
        rowHeight: 10,
      },
      widgets: [  // ← Список виджетов для этой страницы
        'analytics.overview-summary',
        'analytics.overview-timeline',
      ],
    },
  ],
}
```

### Шаг 3: Создайте menu item

```typescript
studio: {
  menus: [
    {
      id: 'analytics-overview',
      label: 'Analytics · Overview',
      target: '/plugins/analytics/overview',  // ← URL страницы
      order: 0,
    },
  ],
}
```

**Конвенция**: URL `/plugins/{pluginId}/{pageName}` автоматически найдет layout `{pluginId}.{pageName}`

## Доступные виджеты (стандартные болванки)

Studio предоставляет готовые виджеты, которые можно использовать:

- `table` - Таблица данных
- `chart` - Графики (line, bar, pie)
- `keyvalue` - Ключ-значение (KPI метрики)
- `infopanel` - Информационная панель
- `metric` - Одна метрика
- `status` - Статусные бейджи
- `progress` - Прогресс-бар
- `logs` - Просмотр логов
- `json` - JSON viewer
- `diff` - Diff viewer

## Примеры

### Страница с таблицей и графиками

```typescript
widgets: [
  {
    id: 'analytics.events-table',
    kind: 'table',
    title: 'Events',
    data: { source: { type: 'rest', routeId: '/events', method: 'GET' } },
    options: { pageSize: 20, sortable: true },
  },
  {
    id: 'analytics.events-chart',
    kind: 'chart',
    title: 'Events Timeline',
    data: { source: { type: 'rest', routeId: '/events-timeline', method: 'GET' } },
    options: { chartType: 'line', height: 300 },
  },
],

layouts: [
  {
    id: 'analytics.events',
    kind: 'grid',
    title: 'Events Analytics',
    widgets: ['analytics.events-table', 'analytics.events-chart'],
    config: { cols: { sm: 1, md: 2, lg: 3 }, rowHeight: 10 },
  },
],

menus: [
  {
    id: 'analytics-events',
    label: 'Analytics · Events',
    target: '/plugins/analytics/events',  // → layout analytics.events
  },
]
```

### Страница с метриками (KPI)

```typescript
widgets: [
  {
    id: 'analytics.metrics-kpi',
    kind: 'keyvalue',
    title: 'Performance Metrics',
    data: { source: { type: 'rest', routeId: '/metrics', method: 'GET' } },
  },
],

layouts: [
  {
    id: 'analytics.performance',
    kind: 'grid',
    title: 'Performance',
    widgets: ['analytics.metrics-kpi'],
  },
],
```

## Best Practices

### 1. Именование

- **Виджеты**: `{pluginId}.{pageName}-{widgetName}`
  - Пример: `analytics.overview-summary`, `analytics.events-table`
- **Layouts**: `{pluginId}.{pageName}`
  - Пример: `analytics.overview`, `analytics.events`
- **Menu target**: `/plugins/{pluginId}/{pageName}`
  - Пример: `/plugins/analytics/overview`

### 2. Порядок виджетов

Виджеты рендерятся в том порядке, в котором указаны в `widgets`:

```typescript
widgets: [
  'analytics.overview-summary',    // ← Первый виджет
  'analytics.overview-timeline',   // ← Второй виджет
  'analytics.overview-metrics',   // ← Третий виджет
],
```

### 3. Grid конфигурация

```typescript
config: {
  cols: {
    sm: 1,   // Колонки на маленьких экранах
    md: 2,   // Колонки на средних экранах
    lg: 3,   // Колонки на больших экранах
  },
  rowHeight: 10,  // Высота строки в единицах (умножается на 8px)
}
```

### 4. Layout hints для виджетов

Можно указать размер виджета в grid:

```typescript
widgets: [
  {
    id: 'analytics.overview-summary',
    kind: 'keyvalue',
    layoutHint: {
      w: 2,  // Ширина в колонках
      h: 2,  // Высота в строках
    },
  },
]
```

## Troubleshooting

### Виджет не найден

**Ошибка**: "Widget analytics.overview-summary not found"

**Решение**:
1. Проверьте, что виджет определен в `widgets`
2. Проверьте ID виджета в `layout.widgets` - должна быть точная копия
3. Studio покажет список доступных виджетов при ошибке

### Layout не найден

**Ошибка**: "Layout analytics.overview not found"

**Решение**:
1. Проверьте конвенцию именования: URL `/plugins/analytics/overview` → layout `analytics.overview`
2. Убедитесь, что layout определен в `layouts`
3. Проверьте, что `layout.widgets` не пустой

### Виджеты не рендерятся

**Проблема**: Страница загружается, но виджеты пустые

**Решение**:
1. Проверьте REST API endpoint - он должен возвращать данные
2. Проверьте формат данных - должен соответствовать схеме виджета
3. Откройте DevTools → Network для проверки запросов

## FAQ

**Q: Можно ли использовать один виджет в нескольких layouts?**
A: Да, просто укажите его ID в `widgets` разных layouts.

**Q: Можно ли создать страницу без layout?**
A: Да, используйте старый подход: создайте виджет и укажите его в menu target напрямую.

**Q: Как добавить кнопки или действия?**
A: Пока используйте стандартные виджеты. Поддержка действий планируется в будущем.

**Q: Можно ли использовать custom компоненты?**
A: Пока нет - используйте только стандартные виджеты Studio.




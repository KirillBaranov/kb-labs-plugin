/**
 * @module @kb-labs/plugin-contracts/studio
 * Re-exports from @kb-labs/studio-contracts.
 *
 * This file re-exports all Studio types from the canonical source.
 * Existing code importing from plugin-contracts will continue to work.
 *
 * @example
 * ```typescript
 * // Preferred: Import directly from studio-contracts
 * import { StudioWidgetDecl, StudioConfig } from '@kb-labs/studio-contracts';
 *
 * // Still works: Import via plugin-contracts (re-export)
 * import { StudioWidgetDecl, StudioConfig } from '@kb-labs/plugin-contracts';
 * ```
 */

// Re-export everything from studio-contracts
export type {
  // Core types
  StudioWidgetKind,
  CompositeWidgetKind,
  LeafWidgetKind,
  WidgetCategory,
  StudioWidgetDecl,
  LeafWidgetDecl,
  CompositeWidgetDecl,
  LayoutHint,
  SchemaRef,
  WidgetData,
  StudioLayoutDecl,
  StudioMenuDecl,
  StudioConfig,
  LayoutKind,
  LayoutConfig,
  GridLayoutConfig,
  StackLayoutConfig,

  // Data sources
  DataSource,
  StaticDataSource,
  RestDataSource,
  MockDataSource,

  // Actions
  ActionHandler,
  ActionHandlerType,
  RestActionHandler,
  NavigateActionHandler,
  EmitActionHandler,
  WidgetAction,
  ActionConfirm,

  // Events
  WidgetEventConfig,
  WidgetEvent,
  StandardEventName,

  // Visibility / RBAC
  VisibilityRule,
  UserContext,

  // Registry
  StudioRegistry,
  StudioPluginEntry,
  FlattenedRegistry,

  // Widget Options (all 29)
  WidgetOptionsMap,
  MetricOptions,
  MetricGroupOptions,
  TableOptions,
  TableColumn,
  CardOptions,
  CardListOptions,
  ChartLineOptions,
  ChartBarOptions,
  ChartPieOptions,
  ChartAreaOptions,
  TimelineOptions,
  TreeOptions,
  JsonOptions,
  DiffOptions,
  LogsOptions,
  FormOptions,
  InputOptions,
  SelectOptions,
  CheckboxGroupOptions,
  SwitchOptions,
  DatePickerOptions,
  SectionOptions,
  GridOptions,
  StackOptions,
  TabsOptions,
  ModalOptions,
  BreadcrumbOptions,
  StepperOptions,
  MenuOptions,
  AlertOptions,
  ConfirmOptions,

  // Widget Data Contracts (all 29)
  WidgetDataMap,
  MetricData,
  MetricGroupData,
  TableData,
  CardData,
  CardListData,
  ChartLineData,
  ChartBarData,
  ChartPieData,
  ChartAreaData,
  TimelineData,
  TreeData,
  JsonData,
  DiffData,
  LogsData,
  FormData,
  InputData,
  SelectData,
  CheckboxGroupData,
  SwitchData,
  DatePickerData,
  BreadcrumbData,
  StepperData,
  MenuData,
  AlertData,
  ModalData,
  ConfirmData,
} from '@kb-labs/studio-contracts';

// Re-export functions and constants
export {
  // Kind utilities
  WIDGET_CATEGORIES,
  COMPOSITE_WIDGET_KINDS,
  isCompositeKind,
  isCompositeWidget,
  isLeafWidget,

  // Layout utilities
  isGridConfig,
  isStackConfig,

  // Data source utilities
  isStaticDataSource,
  isRestDataSource,
  isMockDataSource,

  // Action utilities
  isRestActionHandler,
  isNavigateActionHandler,
  isEmitActionHandler,

  // Visibility
  matchesVisibility,

  // Registry
  STUDIO_SCHEMA_VERSION,
  STUDIO_SCHEMA_VERSION_NUMBER,
  createEmptyRegistry,
  flattenRegistry,
  validateSchemaVersion,
  needsMigration,

  // Events
  STANDARD_EVENTS,
} from '@kb-labs/studio-contracts';

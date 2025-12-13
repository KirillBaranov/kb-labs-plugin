/**
 * @module @kb-labs/plugin-runtime/presenter
 * Presenter façade exports.
 */

export {
  TTYPresenter,
  type TTYPresenterOptions,
  type TTYPresenterFormatter,
} from './tty-presenter';
export {
  JobRunnerPresenter,
  type JobRunnerPresenterOptions,
  type JobRunnerPresenterEvent,
} from './job-runner-presenter';
export {
  HttpPresenter,
  type HttpPresenterOptions,
} from './http-presenter';
export {
  createNoopPresenter,
  createNoopUI,
  type PresenterFacade,
  type PresenterMessageLevel,
  type PresenterMessageOptions,
  type PresenterProgressPayload,
  type PresenterEventPayload,
  type ConfirmOptions,
  // UI Facade types
  type UIFacade,
  type UIColors,
  type UISymbols,
  type ColorFn,
  type BoxOptions,
  type TableRow,
  type KeyValueOptions,
  type SideBoxOptions,
  type Spinner,
} from './presenter-facade';
export {
  CliUIFacade,
  type CliUIFacadeOptions,
} from './cli-ui-facade';
// Note: IPC UI removed - use stdout piping instead (ADR-0013)



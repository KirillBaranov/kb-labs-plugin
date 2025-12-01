/**
 * @module @kb-labs/plugin-runtime/sandbox/child/guards
 * Process guards - disable dangerous operations
 */

/**
 * Install process guards to prevent dangerous operations
 */
export function installGuards(): void {
  // Disable chdir
  const originalChdir = process.chdir;
  process.chdir = () => {
    throw new Error('process.chdir is disabled in sandbox');
  };

  // Patch console to send logs via IPC
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  const sendLog = (level: string, ...args: unknown[]) => {
    if (process.send) {
      process.send({
        type: 'LOG',
        payload: {
          level,
          message: args.map((a) => String(a)).join(' '),
          timestamp: Date.now(),
        },
      });
    }
  };

  console.log = (...args: unknown[]) => {
    sendLog('info', ...args);
    originalLog(...args);
  };

  console.error = (...args: unknown[]) => {
    sendLog('error', ...args);
    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    sendLog('warn', ...args);
    originalWarn(...args);
  };

  console.info = (...args: unknown[]) => {
    sendLog('info', ...args);
    originalInfo(...args);
  };

  console.debug = (...args: unknown[]) => {
    sendLog('debug', ...args);
    originalDebug(...args);
  };
}


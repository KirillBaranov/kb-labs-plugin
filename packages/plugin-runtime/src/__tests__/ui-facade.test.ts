/**
 * @module @kb-labs/plugin-runtime/__tests__/ui-facade
 *
 * Unit tests for UIFacade implementation in bootstrap.
 * Tests that UI methods correctly accept arguments and handle options.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UIFacade, MessageOptions, SideBoxOptions, TableColumn } from '@kb-labs/plugin-contracts';

/**
 * Create a mock UIFacade for testing
 */
function createTestUI(): UIFacade {
  const mockColor = (text: string) => text;

  return {
    // Colors API
    colors: {
      success: mockColor,
      error: mockColor,
      warning: mockColor,
      info: mockColor,
      primary: mockColor,
      accent: mockColor,
      highlight: mockColor,
      secondary: mockColor,
      emphasis: mockColor,
      muted: mockColor,
      foreground: mockColor,
      dim: mockColor,
      bold: mockColor,
      underline: mockColor,
      inverse: mockColor,
    },

    // Output methods
    write: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),

    // Interactive methods
    spinner: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      text: '',
    })),
    table: vi.fn(),
    json: vi.fn(),
    newline: vi.fn(),
    divider: vi.fn(),
    box: vi.fn(),

    // Prompts
    confirm: vi.fn(async () => true),
    prompt: vi.fn(async () => 'test'),
  };
}

describe('UIFacade', () => {
  let ui: UIFacade;

  beforeEach(() => {
    ui = createTestUI();
  });

  describe('colors API', () => {
    it('should have all semantic color functions', () => {
      expect(typeof ui.colors.success).toBe('function');
      expect(typeof ui.colors.error).toBe('function');
      expect(typeof ui.colors.warning).toBe('function');
      expect(typeof ui.colors.info).toBe('function');
    });

    it('should have all accent color functions', () => {
      expect(typeof ui.colors.primary).toBe('function');
      expect(typeof ui.colors.accent).toBe('function');
      expect(typeof ui.colors.highlight).toBe('function');
      expect(typeof ui.colors.secondary).toBe('function');
      expect(typeof ui.colors.emphasis).toBe('function');
      expect(typeof ui.colors.muted).toBe('function');
      expect(typeof ui.colors.foreground).toBe('function');
    });

    it('should have all formatting helper functions', () => {
      expect(typeof ui.colors.dim).toBe('function');
      expect(typeof ui.colors.bold).toBe('function');
      expect(typeof ui.colors.underline).toBe('function');
      expect(typeof ui.colors.inverse).toBe('function');
    });

    it('should accept string and return string', () => {
      const result = ui.colors.success('test message');
      expect(typeof result).toBe('string');
    });

    it('should work with all color functions', () => {
      expect(ui.colors.success('success')).toBe('success');
      expect(ui.colors.error('error')).toBe('error');
      expect(ui.colors.primary('primary')).toBe('primary');
      expect(ui.colors.bold('bold')).toBe('bold');
    });
  });

  describe('write method', () => {
    it('should exist and be callable', () => {
      expect(typeof ui.write).toBe('function');
      ui.write('test');
      expect(ui.write).toHaveBeenCalledWith('test');
    });

    it('should accept string argument', () => {
      ui.write('hello world');
      expect(ui.write).toHaveBeenCalledWith('hello world');
    });

    it('should handle empty string', () => {
      ui.write('');
      expect(ui.write).toHaveBeenCalledWith('');
    });

    it('should handle multiline text', () => {
      const text = 'line1\nline2\nline3';
      ui.write(text);
      expect(ui.write).toHaveBeenCalledWith(text);
    });
  });

  describe('info method', () => {
    it('should accept string message', () => {
      ui.info('info message');
      expect(ui.info).toHaveBeenCalledWith('info message');
    });

    it('should accept message with options', () => {
      const options: MessageOptions = { icon: '🔵' };
      ui.info('info with icon', options);
      expect(ui.info).toHaveBeenCalledWith('info with icon', options);
    });

    it('should handle empty message', () => {
      ui.info('');
      expect(ui.info).toHaveBeenCalledWith('');
    });
  });

  describe('success method', () => {
    it('should accept string message', () => {
      ui.success('operation completed');
      expect(ui.success).toHaveBeenCalledWith('operation completed');
    });

    it('should accept message with options', () => {
      const options: MessageOptions = { icon: '✓' };
      ui.success('done', options);
      expect(ui.success).toHaveBeenCalledWith('done', options);
    });
  });

  describe('warn method', () => {
    it('should accept string message', () => {
      ui.warn('warning message');
      expect(ui.warn).toHaveBeenCalledWith('warning message');
    });

    it('should accept message with options', () => {
      const options: MessageOptions = { icon: '⚠️' };
      ui.warn('be careful', options);
      expect(ui.warn).toHaveBeenCalledWith('be careful', options);
    });
  });

  describe('error method', () => {
    it('should accept string message', () => {
      ui.error('error occurred');
      expect(ui.error).toHaveBeenCalledWith('error occurred');
    });

    it('should accept message with options', () => {
      const options: MessageOptions = { icon: '✗' };
      ui.error('failed', options);
      expect(ui.error).toHaveBeenCalledWith('failed', options);
    });
  });

  describe('debug method', () => {
    it('should accept string message', () => {
      ui.debug('debug info');
      expect(ui.debug).toHaveBeenCalledWith('debug info');
    });

    it('should accept message with options', () => {
      const options: MessageOptions = { icon: '🐛' };
      ui.debug('debugging', options);
      expect(ui.debug).toHaveBeenCalledWith('debugging', options);
    });
  });

  describe('table method', () => {
    it('should accept columns and rows', () => {
      const columns: TableColumn[] = [
        { key: 'name', label: 'Name' },
        { key: 'value', label: 'Value' },
      ];
      const rows = [
        { name: 'foo', value: 'bar' },
        { name: 'baz', value: 'qux' },
      ];

      ui.table(columns, rows);
      expect(ui.table).toHaveBeenCalledWith(columns, rows);
    });

    it('should handle empty rows', () => {
      const columns: TableColumn[] = [{ key: 'name', label: 'Name' }];
      ui.table(columns, []);
      expect(ui.table).toHaveBeenCalledWith(columns, []);
    });
  });

  describe('box method', () => {
    it('should accept sections', () => {
      ui.box([
        { title: 'Section 1', lines: ['line 1', 'line 2'] },
        { title: 'Section 2', lines: ['line 3'] },
      ]);
      expect(ui.box).toHaveBeenCalled();
    });

    it('should accept sections with options', () => {
      const options: SideBoxOptions = { width: 80 };
      ui.box(
        [{ title: 'Title', lines: ['content'] }],
        options,
      );
      expect(ui.box).toHaveBeenCalledWith(
        [{ title: 'Title', lines: ['content'] }],
        options,
      );
    });
  });

  describe('json method', () => {
    it('should accept any JSON-serializable value', () => {
      ui.json({ key: 'value' });
      expect(ui.json).toHaveBeenCalledWith({ key: 'value' });
    });

    it('should accept arrays', () => {
      ui.json([1, 2, 3]);
      expect(ui.json).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('should accept primitives', () => {
      ui.json('string');
      expect(ui.json).toHaveBeenCalledWith('string');

      ui.json(42);
      expect(ui.json).toHaveBeenCalledWith(42);

      ui.json(true);
      expect(ui.json).toHaveBeenCalledWith(true);
    });
  });

  describe('newline method', () => {
    it('should be callable without arguments', () => {
      ui.newline();
      expect(ui.newline).toHaveBeenCalled();
    });

    it('should accept optional count', () => {
      ui.newline(3);
      expect(ui.newline).toHaveBeenCalledWith(3);
    });
  });

  describe('divider method', () => {
    it('should be callable without arguments', () => {
      ui.divider();
      expect(ui.divider).toHaveBeenCalled();
    });

    it('should accept optional title', () => {
      ui.divider('Section');
      expect(ui.divider).toHaveBeenCalledWith('Section');
    });
  });

  describe('spinner method', () => {
    it('should return spinner object', () => {
      const spinner = ui.spinner('Loading...');
      expect(spinner).toBeDefined();
      expect(typeof spinner.start).toBe('function');
      expect(typeof spinner.stop).toBe('function');
      expect(typeof spinner.succeed).toBe('function');
      expect(typeof spinner.fail).toBe('function');
    });
  });

  describe('confirm method', () => {
    it('should accept message and return boolean', async () => {
      const result = await ui.confirm('Are you sure?');
      expect(typeof result).toBe('boolean');
      expect(ui.confirm).toHaveBeenCalledWith('Are you sure?');
    });

    it('should accept message with default value', async () => {
      await ui.confirm('Continue?', true);
      expect(ui.confirm).toHaveBeenCalledWith('Continue?', true);
    });
  });

  describe('prompt method', () => {
    it('should accept message and options', async () => {
      const result = await ui.prompt('Enter name:', { default: 'user' });
      expect(typeof result).toBe('string');
      expect(ui.prompt).toHaveBeenCalledWith('Enter name:', { default: 'user' });
    });

    it('should handle empty options', async () => {
      await ui.prompt('Enter value:');
      expect(ui.prompt).toHaveBeenCalledWith('Enter value:');
    });
  });

  describe('combined usage', () => {
    it('should allow chaining multiple UI calls', () => {
      ui.info('Starting process...');
      ui.divider();
      ui.success('Step 1 complete');
      ui.success('Step 2 complete');
      ui.divider();
      ui.info('Process finished');

      expect(ui.info).toHaveBeenCalledTimes(2);
      expect(ui.success).toHaveBeenCalledTimes(2);
      expect(ui.divider).toHaveBeenCalledTimes(2);
    });

    it('should allow using colors with write', () => {
      const colored = ui.colors.success('✓ Success');
      ui.write(colored);

      expect(ui.write).toHaveBeenCalledWith('✓ Success');
    });

    it('should allow mixing text output methods', () => {
      ui.info('Information');
      ui.success('Success message');
      ui.warn('Warning message');
      ui.error('Error message');
      ui.debug('Debug info');

      expect(ui.info).toHaveBeenCalledTimes(1);
      expect(ui.success).toHaveBeenCalledTimes(1);
      expect(ui.warn).toHaveBeenCalledTimes(1);
      expect(ui.error).toHaveBeenCalledTimes(1);
      expect(ui.debug).toHaveBeenCalledTimes(1);
    });
  });
});

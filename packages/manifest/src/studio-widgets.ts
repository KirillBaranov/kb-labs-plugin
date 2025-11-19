/**
 * @module @kb-labs/plugin-manifest/studio-widgets
 * Studio widget data contracts - shared between handlers and Studio widgets
 */

/**
 * Card data for CardList widget
 */
export interface CardData {
  title: string;
  content: string;
  status?: 'ok' | 'warn' | 'error' | 'info';
  icon?: string;
  meta?: Record<string, unknown>;
}

/**
 * CardList widget data format
 */
export interface CardListData {
  cards: CardData[];
}

/**
 * InfoPanel section data
 */
export interface InfoPanelSection {
  title: string;
  data: unknown;
  format?: 'json' | 'text' | 'keyvalue';
  collapsible?: boolean;
}

/**
 * InfoPanel widget data format
 */
export interface InfoPanelData {
  sections: InfoPanelSection[];
}

/**
 * KeyValue item data
 */
export interface KeyValueItem {
  key: string;
  value: string | number | boolean;
  type?: 'string' | 'number' | 'boolean' | 'badge';
}

/**
 * KeyValue widget data format
 */
export interface KeyValueData {
  items: KeyValueItem[];
}



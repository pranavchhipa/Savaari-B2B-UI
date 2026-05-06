import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Markup configuration for each trip type.
 * Agents set their profit margin on top of Savaari's base price.
 */
export interface MarkupConfig {
  type: 'percent' | 'fixed';
  value: number; // percentage (e.g. 10) or fixed amount in INR (e.g. 200)
}

export interface MarkupSettings {
  airport: MarkupConfig;
  local: MarkupConfig;
  outstation: MarkupConfig;
  oneWay: MarkupConfig;
}

const DEFAULT_MARKUP: MarkupSettings = {
  airport:    { type: 'percent', value: 0 },
  local:      { type: 'fixed',   value: 15 },
  outstation: { type: 'percent', value: 10 },
  oneWay:     { type: 'percent', value: 0 },
};

/**
 * Client-side markup service.
 *
 * Markup is a B2B portal concept -- it's the agent's profit margin
 * added on top of Savaari's base fare. The Savaari API knows nothing
 * about markup; it's calculated and displayed entirely on the client.
 */
@Injectable({ providedIn: 'root' })
export class MarkupService {
  private readonly STORAGE_KEY = 'savaari_b2b_markup';

  private settingsSubject = new BehaviorSubject<MarkupSettings>(this.loadSettings());
  public readonly settings$ = this.settingsSubject.asObservable();

  /** Get current markup settings. */
  getSettings(): MarkupSettings {
    return this.settingsSubject.value;
  }

  /** Update markup settings and persist to localStorage. */
  updateSettings(settings: MarkupSettings): void {
    this.settingsSubject.next(settings);
    this.saveSettings(settings);
  }

  /** Reset to default markup values. */
  resetToDefaults(): void {
    this.updateSettings({ ...DEFAULT_MARKUP });
  }

  /**
   * Apply markup to a base fare for a given trip type.
   * Returns the final price the agent's customer sees.
   */
  applyMarkup(baseFare: number, tripType: string): number {
    const settings = this.getSettings();
    let config: MarkupConfig;

    switch (tripType.toLowerCase()) {
      case 'airport':     config = settings.airport; break;
      case 'local':       config = settings.local; break;
      case 'outstation':  config = settings.outstation; break;
      case 'oneway':
      case 'one way':     config = settings.oneWay; break;
      default:            config = settings.outstation; break;
    }

    if (config.type === 'percent') {
      return Math.round(baseFare * (1 + config.value / 100));
    }
    return Math.round(baseFare + config.value);
  }

  /**
   * Get just the markup amount (not the total).
   */
  getMarkupAmount(baseFare: number, tripType: string): number {
    return this.applyMarkup(baseFare, tripType) - baseFare;
  }

  private loadSettings(): MarkupSettings {
    if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_MARKUP };
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : { ...DEFAULT_MARKUP };
    } catch {
      return { ...DEFAULT_MARKUP };
    }
  }

  private saveSettings(settings: MarkupSettings): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        console.error('[MarkupService] Failed to save settings:', e);
      }
    }
  }
}

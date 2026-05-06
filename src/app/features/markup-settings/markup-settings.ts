import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';
import { MarkupService } from '../../core/services/markup.service';
import { CommissionService } from '../../core/services/commission.service';
import { CommissionData } from '../../core/models';

type MarkupType = 'percent' | 'fixed';

interface ServiceMarkup {
  type: MarkupType;
  percentValue: number | null;
  fixedValue: number | null;
}

@Component({
  selector: 'app-markup-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, FooterComponent],
  templateUrl: './markup-settings.html',
  styleUrl: './markup-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarkupSettingsComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private markupService = inject(MarkupService);
  private commissionService = inject(CommissionService);

  activeSection: 'markup' | 'commission' | 'preferences' = 'markup';

  // Commission data from API
  commissionData: CommissionData | null = null;
  commissionLoading = false;
  commissionError = '';
  savedSuccess = false;
  saving = false;
  saveError = '';
  isLocked = false; // disable_commission_update flag from backend

  services: { key: string; label: string; description: string; icon: string; iconBg: string; iconColor: string; markup: ServiceMarkup }[] = [
    {
      key: 'airport',
      label: 'Airport Transfers',
      description: 'Pickups & drops to/from airport',
      icon: 'plane',
      iconBg: 'bg-blue-100 dark:bg-blue-900/50',
      iconColor: 'text-primary',
      markup: { type: 'percent', percentValue: 0, fixedValue: null }
    },
    {
      key: 'local',
      label: 'Local Rentals',
      description: 'Hourly rental packages within city',
      icon: 'car',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      iconColor: 'text-emerald-600',
      markup: { type: 'percent', percentValue: 0, fixedValue: null }
    },
    {
      key: 'outstation',
      label: 'Outstation',
      description: 'Inter-city travel pricing',
      icon: 'route',
      iconBg: 'bg-purple-100 dark:bg-purple-900/50',
      iconColor: 'text-purple-600',
      markup: { type: 'percent', percentValue: 0, fixedValue: null }
    }
  ];

  ngOnInit() {
    this.loadCommission();
  }

  /**
   * Load commission data from API and populate markup fields.
   * rate_bump_up = percentage markup (stored as decimal, e.g. 0.05 = 5%)
   * rate_bump_up_amt = flat markup amount in ₹
   */
  loadCommission() {
    this.commissionLoading = true;
    this.commissionError = '';
    this.cdr.markForCheck();

    // Clear cache to get fresh data
    this.commissionService.clearCache();

    this.commissionService.getCommission().subscribe({
      next: (data: CommissionData) => {
        this.commissionData = data;
        this.commissionLoading = false;
        this.isLocked = data.disable_commission_update === '1';
        this.populateMarkupFromApi(data);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.commissionLoading = false;
        this.commissionError = err?.message || 'Failed to load commission data.';
        // Fallback to localStorage
        this.loadFromLocalStorage();
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Populate the markup UI fields from API commission data.
   * API stores percentage as decimal (0.05 = 5%), we display as whole number (5).
   * If flat amount > 0, use fixed type; otherwise use percent type.
   */
  private populateMarkupFromApi(data: CommissionData) {
    this.services.forEach(s => {
      const bumpUpPercent = parseFloat(data[`${s.key}_rate_bump_up`] || '0');
      const bumpUpAmt = parseFloat(data[`${s.key}_rate_bump_up_amt`] || '0');

      if (bumpUpAmt > 0) {
        // Flat markup is set
        s.markup.type = 'fixed';
        s.markup.fixedValue = bumpUpAmt;
        s.markup.percentValue = null;
      } else {
        // Percentage markup (convert decimal to display %)
        s.markup.type = 'percent';
        // API stores as decimal (0.05 = 5%), convert to display value
        // Negative means discount, positive means markup
        s.markup.percentValue = Math.round(bumpUpPercent * 100 * 100) / 100; // e.g. -0.05 → -5
        s.markup.fixedValue = null;
      }
    });

    // Also sync to localStorage for MarkupService.applyMarkup() to use
    this.syncToLocalStorage();
  }

  /**
   * Fallback: load from localStorage if API fails.
   */
  private loadFromLocalStorage() {
    const saved = this.markupService.getSettings();
    if (saved) {
      const keyMap: Record<string, string> = {
        airport: 'airport', local: 'local', outstation: 'outstation',
      };
      this.services.forEach(s => {
        const settingsKey = keyMap[s.key] || s.key;
        const setting = (saved as any)[settingsKey];
        if (setting) {
          s.markup.type = setting.type;
          s.markup.percentValue = setting.type === 'percent' ? setting.value : null;
          s.markup.fixedValue = setting.type === 'fixed' ? setting.value : null;
        }
      });
    }
  }

  /**
   * Sync current markup settings to localStorage (for MarkupService.applyMarkup).
   */
  private syncToLocalStorage() {
    const keyMap: Record<string, string> = {
      airport: 'airport', local: 'local', outstation: 'outstation',
    };
    const mapped: Record<string, { type: MarkupType; value: number }> = {};
    this.services.forEach(s => {
      const settingsKey = keyMap[s.key] || s.key;
      mapped[settingsKey] = {
        type: s.markup.type,
        value: s.markup.type === 'percent'
          ? (s.markup.percentValue ?? 0)
          : (s.markup.fixedValue ?? 0),
      };
    });
    // Also add oneWay = outstation (same markup for both)
    mapped['oneWay'] = mapped['outstation'];
    this.markupService.updateSettings(mapped as any);
  }

  /** Helper to parse commission percentage (API uses "commision" typo) */
  getCommPercent(type: string): string {
    if (!this.commissionData) return '0';
    const val = parseFloat(this.commissionData[`${type}_commision`] || '0');
    return val.toFixed(val % 1 === 0 ? 0 : 2);
  }

  /** Helper to parse commission fixed amount */
  getCommAmount(type: string): string {
    if (!this.commissionData) return '0';
    const val = parseFloat(this.commissionData[`${type}_commission_amount`] || '0');
    return val.toFixed(val % 1 === 0 ? 0 : 2);
  }

  /** Helper to parse rate bump-up percentage */
  getRateBumpUp(type: string): string {
    if (!this.commissionData) return '0';
    const val = parseFloat(this.commissionData[`${type}_rate_bump_up`] || '0');
    return val.toFixed(val % 1 === 0 ? 0 : 2);
  }

  /** Helper to get rate bump-up fixed amount */
  getRateBumpUpAmt(type: string): string {
    if (!this.commissionData) return '0';
    const val = parseFloat(this.commissionData[`${type}_rate_bump_up_amt`] || '0');
    return val.toFixed(val % 1 === 0 ? 0 : 2);
  }

  /** Check if trip type is enabled */
  isTripTypeEnabled(type: string): boolean {
    if (!this.commissionData) return true;
    const field = `enable_${type}`;
    return this.commissionData[field] === '1';
  }

  setType(service: typeof this.services[0], type: MarkupType) {
    if (this.isLocked) return;
    service.markup.type = type;
  }

  resetToDefault() {
    if (this.isLocked) return;
    this.services.forEach(s => {
      s.markup.type = 'percent';
      s.markup.percentValue = 0;
      s.markup.fixedValue = null;
    });
  }

  /**
   * Save markup settings to backend API (update-commission) + localStorage.
   *
   * Converts UI values to API format:
   * - Percentage: divide by 100 to get decimal (5% → 0.05)
   * - Fixed amount: send as-is
   */
  saveSettings() {
    if (this.isLocked) return;

    this.saving = true;
    this.saveError = '';
    this.savedSuccess = false;
    this.cdr.markForCheck();

    // Build the update payload
    const updates: Record<string, string | number> = {};

    this.services.forEach(s => {
      if (s.markup.type === 'percent') {
        // Convert display % to decimal (5 → 0.05)
        const pctDecimal = (s.markup.percentValue ?? 0) / 100;
        updates[`${s.key}_rate_bump_up`] = pctDecimal.toFixed(4);
        updates[`${s.key}_rate_bump_up_amt`] = '0';
      } else {
        // Fixed amount
        updates[`${s.key}_rate_bump_up`] = '0';
        updates[`${s.key}_rate_bump_up_amt`] = String(s.markup.fixedValue ?? 0);
      }
    });

    this.commissionService.updateCommission(updates).subscribe({
      next: (resp) => {
        this.saving = false;
        if (resp.statusCode === 200) {
          this.savedSuccess = true;
          // Sync to localStorage for MarkupService.applyMarkup
          this.syncToLocalStorage();
        } else {
          this.saveError = resp.message || 'Failed to save settings.';
        }
        this.cdr.markForCheck();
        if (this.savedSuccess) {
          setTimeout(() => { this.savedSuccess = false; this.cdr.markForCheck(); }, 3000);
        }
      },
      error: (err) => {
        this.saving = false;
        this.saveError = err?.message || 'Failed to save settings. Please try again.';
        // Still save to localStorage as fallback
        this.syncToLocalStorage();
        this.cdr.markForCheck();
      }
    });
  }
}

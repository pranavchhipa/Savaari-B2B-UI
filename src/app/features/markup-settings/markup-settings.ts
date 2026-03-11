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
      markup: { type: 'fixed', percentValue: null, fixedValue: 15 }
    },
    {
      key: 'outstation',
      label: 'Outstation',
      description: 'Inter-city travel pricing',
      icon: 'route',
      iconBg: 'bg-purple-100 dark:bg-purple-900/50',
      iconColor: 'text-purple-600',
      markup: { type: 'percent', percentValue: 10, fixedValue: null }
    },
    {
      key: 'oneway',
      label: 'One Way',
      description: 'Point-to-point outstation trips',
      icon: 'arrow-right',
      iconBg: 'bg-orange-100 dark:bg-orange-900/50',
      iconColor: 'text-orange-500',
      markup: { type: 'percent', percentValue: 0, fixedValue: null }
    }
  ];

  ngOnInit() {
    // Load saved markup settings from MarkupService
    this.loadSavedMarkup();
    // Pre-load commission data
    this.loadCommission();
  }

  private loadSavedMarkup() {
    const saved = this.markupService.getSettings();
    if (saved) {
      // Map component keys to MarkupSettings keys
      const keyMap: Record<string, string> = {
        airport: 'airport', local: 'local', outstation: 'outstation', oneway: 'oneWay',
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

  loadCommission() {
    this.commissionLoading = true;
    this.commissionError = '';
    this.cdr.markForCheck();

    this.commissionService.getCommission().subscribe({
      next: (data: CommissionData) => {
        this.commissionData = data;
        this.commissionLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.commissionLoading = false;
        this.commissionError = err?.message || 'Failed to load commission data.';
        this.cdr.markForCheck();
      }
    });
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
    // Show as positive for display (negative means discount for agent)
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
    service.markup.type = type;
  }

  resetToDefault() {
    this.services.forEach(s => {
      s.markup.type = 'percent';
      s.markup.percentValue = 0;
      s.markup.fixedValue = null;
    });
  }

  saveSettings() {
    // Save to MarkupService (client-side localStorage)
    // Map component keys to MarkupSettings keys (oneway → oneWay)
    const keyMap: Record<string, string> = {
      airport: 'airport', local: 'local', outstation: 'outstation', oneway: 'oneWay',
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
    this.markupService.updateSettings(mapped as any);
    this.savedSuccess = true;
    this.cdr.markForCheck();
    setTimeout(() => { this.savedSuccess = false; this.cdr.markForCheck(); }, 3000);
  }
}

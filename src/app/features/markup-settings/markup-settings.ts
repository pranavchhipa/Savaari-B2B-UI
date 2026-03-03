import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';

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
export class MarkupSettingsComponent {
  activeSection: 'markup' | 'commission' | 'preferences' = 'markup';

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
      icon: 'arrow-right-circle',
      iconBg: 'bg-orange-100 dark:bg-orange-900/50',
      iconColor: 'text-orange-500',
      markup: { type: 'percent', percentValue: 0, fixedValue: null }
    }
  ];

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
    // TODO: connect to API
    console.log('Saving markup settings:', this.services.map(s => ({ key: s.key, ...s.markup })));
    alert('Markup settings saved successfully!');
  }
}

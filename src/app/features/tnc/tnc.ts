import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';
import { TNC_DATA, TncPage } from './tnc-data';

@Component({
  selector: 'app-tnc',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, FooterComponent],
  templateUrl: './tnc.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TncComponent implements OnInit {
  private route = inject(ActivatedRoute);
  pageData: TncPage | null = null;
  slug = '';
  today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  ngOnInit() {
    this.slug = this.route.snapshot.params['slug'] || '';
    this.pageData = TNC_DATA[this.slug] || null;
  }
}

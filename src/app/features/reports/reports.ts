import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';

interface TripReport {
  id: string;
  date: string;
  passengerName: string;
  pickupCity: string;
  dropCity: string;
  tripType: string;
  status: 'Completed' | 'Cancelled' | 'Ongoing';
  fare: number;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, FooterComponent],
  templateUrl: './reports.html',
  styleUrl: './reports.css'
})
export class ReportsComponent {
  // Native date input uses YYYY-MM-DD strings
  startDateStr: string = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  endDateStr: string = new Date().toISOString().slice(0, 10);
  hasViewed = false;
  isLoading = false;

  // Mock trip data
  trips: TripReport[] = [
    { id: 'S1225-9589756', date: '12 Feb 2026', passengerName: 'Rahul Sharma', pickupCity: 'Bengaluru', dropCity: 'Bengaluru Airport', tripType: 'Airport Transfer', status: 'Completed', fare: 950 },
    { id: 'S1225-9292589', date: '10 Feb 2026', passengerName: 'Priya Nair', pickupCity: 'Bengaluru', dropCity: 'Mysore', tripType: 'Outstation', status: 'Completed', fare: 2800 },
    { id: 'S1225-9304173', date: '10 Feb 2026', passengerName: 'Anil Kumar', pickupCity: 'Banaswadi', dropCity: 'Whitefield', tripType: 'Local Rental', status: 'Cancelled', fare: 0 },
    { id: 'S1225-8812047', date: '08 Feb 2026', passengerName: 'Sunita Mehta', pickupCity: 'Delhi', dropCity: 'IGI Airport', tripType: 'Airport Transfer', status: 'Completed', fare: 1100 },
    { id: 'S1225-8765432', date: '05 Feb 2026', passengerName: 'Vikram Reddy', pickupCity: 'Hyderabad', dropCity: 'Hyderabad', tripType: 'Local Rental', status: 'Completed', fare: 650 },
    { id: 'S1225-8591023', date: '03 Feb 2026', passengerName: 'Deepa Iyer', pickupCity: 'Mumbai', dropCity: 'Pune', tripType: 'Outstation', status: 'Completed', fare: 3200 },
    { id: 'S1225-8320441', date: '01 Feb 2026', passengerName: 'Karthik Pillai', pickupCity: 'Chennai', dropCity: 'Chennai Airport', tripType: 'Airport Transfer', status: 'Cancelled', fare: 0 },
  ];

  get totalFare(): number {
    return this.trips.filter(t => t.status === 'Completed').reduce((acc, t) => acc + t.fare, 0);
  }

  get completedCount(): number {
    return this.trips.filter(t => t.status === 'Completed').length;
  }

  get cancelledCount(): number {
    return this.trips.filter(t => t.status === 'Cancelled').length;
  }

  viewReports() {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.hasViewed = true;
    }, 800);
  }

  downloadCSV() {
    const headers = ['Trip ID', 'Date', 'Passenger', 'Pickup City', 'Drop City', 'Trip Type', 'Status', 'Fare (₹)'];
    const rows = this.trips.map(t => [t.id, t.date, t.passengerName, t.pickupCity, t.dropCity, t.tripType, t.status, t.fare]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trip-report-${this.startDateStr}-to-${this.endDateStr}.csv`;
    a.click();
  }
}

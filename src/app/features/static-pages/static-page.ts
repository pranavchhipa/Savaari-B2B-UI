import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { LandingNavbarComponent } from '../landing/components/navbar/landing-navbar';
import { FooterComponent } from '../../components/layout/footer/footer';
import { environment } from '../../../environments/environment';

interface PageSection {
  heading?: string;
  content: string[];
  type?: 'text' | 'list' | 'address';
}

interface PageData {
  title: string;
  icon: string;
  sections: PageSection[];
}

@Component({
  selector: 'app-static-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, LandingNavbarComponent, FooterComponent],
  templateUrl: './static-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StaticPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  pageData: PageData | null = null;
  pageSlug = '';

  private pages: Record<string, PageData> = {
    'about-us': {
      title: 'About Us',
      icon: 'building-2',
      sections: [
        {
          heading: 'Who We Are',
          content: [
            'B2BCab is India\'s cab booking platform built just for travel agents. We connect you to a trusted fleet across 2,000+ cities — so you can focus on your clients, not your vendors.'
          ]
        },
        {
          heading: 'What We Do',
          content: [
            'We make cab booking simple for travel agents. You get the booking, we handle the ride. No cancellations, no follow-ups, no stress. Just confirmed cabs and commissions in your account.'
          ]
        },
        {
          heading: 'Why We Built This',
          content: [
            'Every travel agent in India has lost a client because a local cab operator let them down. We built B2BCab to fix that. One platform, one trusted network, zero drama.'
          ]
        },
        {
          heading: 'The Numbers',
          content: [
            '20+ years in the cab business',
            '2,000+ cities across India',
            '5,000+ travel agent partners',
            '0% cancellation rate'
          ],
          type: 'list'
        },
        {
          heading: 'Who Is Behind This',
          content: [
            'B2BCab is powered by Savaari Car Rentals — one of India\'s oldest and most trusted intercity cab companies. We have been on the road since 2006. We know what travel agents need because we have worked with thousands of them.'
          ]
        },
        {
          heading: 'Our Promise',
          content: [
            'Every cab you book through us will show up. Every invoice will be GST ready. Every commission will be paid on time. That is our promise to every agent who partners with us.'
          ]
        }
      ]
    },
    'privacy-policy': {
      title: 'Privacy Policy',
      icon: 'shield',
      sections: [
        {
          content: [
            'Last updated: March 2026'
          ]
        },
        {
          heading: 'What We Collect',
          content: [
            'When you register on B2BCab, we collect your name, mobile number, email address, and business details. We also collect booking information when you use our platform.'
          ]
        },
        {
          heading: 'Why We Collect It',
          content: [
            'We use your information to process bookings, send confirmations, calculate commissions, and provide customer support. We do not sell your data to anyone.'
          ]
        },
        {
          heading: 'How We Store It',
          content: [
            'Your data is stored securely on our servers. We follow standard security practices to keep your information safe.'
          ]
        },
        {
          heading: 'Sharing Your Data',
          content: [
            'We only share your data with our driver and fleet partners to fulfil your bookings. We do not share your personal information with any third party for marketing purposes.'
          ]
        },
        {
          heading: 'Cookies',
          content: [
            'Our website uses cookies to keep you logged in and improve your experience. You can turn off cookies in your browser settings at any time.'
          ]
        },
        {
          heading: 'Your Rights',
          content: [
            'You can ask us to update or delete your account information at any time. Write to us at privacy@b2bcab.in and we will respond within 7 working days.'
          ]
        },
        {
          heading: 'Changes to This Policy',
          content: [
            'We may update this policy from time to time. We will notify you by email if anything important changes.'
          ]
        },
        {
          heading: 'Contact Us',
          content: [
            `For any privacy questions, write to us at ${environment.supportEmail} or call ${environment.supportPhone}.`
          ]
        }
      ]
    },
    'terms-conditions': {
      title: 'Terms and Conditions',
      icon: 'file-text',
      sections: [
        {
          content: [
            'Last updated: March 2026'
          ]
        },
        {
          heading: '1. Who This Applies To',
          content: [
            'These terms apply to all travel agents and businesses registered on B2BCab.in. By signing up, you agree to these terms.'
          ]
        },
        {
          heading: '2. Your Account',
          content: [
            'You are responsible for keeping your login details safe. Do not share your account with anyone. All bookings made from your account are your responsibility.'
          ]
        },
        {
          heading: '3. Making Bookings',
          content: [
            'All bookings must be made through the B2BCab platform. Once a booking is confirmed, it is guaranteed. Do not book through other channels for the same trip.'
          ]
        },
        {
          heading: '4. Commissions',
          content: [
            'Commissions are calculated based on the trip type and distance. Payouts are processed as per the payout schedule shared with you at registration. B2BCab reserves the right to revise commission rates with 30 days notice.'
          ]
        },
        {
          heading: '5. Cancellations',
          content: [
            'We do not cancel confirmed bookings. If a cancellation is initiated by the agent after confirmation, standard cancellation charges will apply as per the booking policy.'
          ]
        },
        {
          heading: '6. Prohibited Use',
          content: [
            'You may not use B2BCab to book cabs for illegal purposes, share platform access with unauthorised users, or misrepresent your identity or business.'
          ]
        },
        {
          heading: '7. Liability',
          content: [
            'B2BCab is not liable for delays caused by traffic, weather, or events outside our control. We are committed to fulfilling every booking but cannot be held responsible for circumstances beyond our reasonable control.'
          ]
        },
        {
          heading: '8. Termination',
          content: [
            'We reserve the right to suspend or terminate any account that violates these terms, misuses the platform, or engages in fraudulent activity.'
          ]
        },
        {
          heading: '9. Governing Law',
          content: [
            'These terms are governed by the laws of India. Any disputes will be handled in the courts of Bengaluru, Karnataka.'
          ]
        },
        {
          heading: '10. Contact Us',
          content: [
            `For any questions about these terms, write to us at ${environment.supportEmail} or call ${environment.supportPhone}.`
          ]
        }
      ]
    },
    'contact-us': {
      title: `Contact ${environment.brandName} Car Rentals`,
      icon: 'phone',
      sections: [
        {
          heading: '1. Send us an email',
          content: [
            `If you are facing any issue/ or for feedback, write to us at ${environment.supportEmail}`
          ]
        },
        {
          heading: '2. Pick up the phone and call us 24*7',
          content: [
            `${environment.supportPhone} (standard STD/local charges apply)`
          ]
        },
        {
          heading: '3. Send snail mail to this address',
          content: [
            `${environment.companyName}`,
            '2nd, 3rd & 4th Floors, 1137, RG. Towers',
            '100Ft Road, Indiranagar,',
            'Bangalore - 560038'
          ],
          type: 'address'
        }
      ]
    }
  };

  ngOnInit() {
    this.pageSlug = this.route.snapshot.data['slug'] || '';
    this.pageData = this.pages[this.pageSlug] || null;
  }
}

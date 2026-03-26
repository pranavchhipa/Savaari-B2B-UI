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
      title: `About ${environment.brandName} Car Rentals`,
      icon: 'building-2',
      sections: [
        {
          content: [
            '2017 has been a great year for Team Savaari. We witnessed some important milestones including - completing 12 years of service, extending our footprint to 98 cities and covering over 265 million kilometers of road travel across India!',
            'In 2018, our focus will remain on continuously creating differentiated value for the inter-city traveler. We have several exciting offerings lined up, the most prominent being \'Package Offers\' to key tourist and business destinations. With your support, these initiatives will transform road travel into even more memorable and exciting journeys.'
          ]
        },
        {
          content: [
            'Gaurav Aggarwal',
            'CEO, Savaari Car Rentals'
          ],
          type: 'address'
        }
      ]
    },
    'privacy-policy': {
      title: 'Privacy Policy',
      icon: 'shield',
      sections: [
        {
          heading: 'Introduction',
          content: [
            `This privacy policy sets out how ${environment.brandName} uses and protects any information that you give ${environment.brandName} when you use this website.`,
            `${environment.brandName} is committed to ensuring that your privacy is protected. Should we ask you to provide certain information by which you can be identified when using this website, then you can be assured that it will only be used in accordance with this privacy statement.`,
            `${environment.brandName} may change this policy from time to time by updating this page. You should check this page from time to time to ensure that you are happy with any changes. This policy is effective from 31st July 2006.`
          ]
        },
        {
          heading: 'Information We Collect',
          content: [
            'We may collect the following information:'
          ]
        },
        {
          content: [
            'Name and job title',
            'Contact information including email address',
            'Demographic information such as postcode, preferences and interests',
            'Other information relevant to customer surveys and/or offers'
          ],
          type: 'list'
        },
        {
          content: [
            'We require this information to understand your needs and provide you with a better service, and in particular for the following reasons:'
          ]
        },
        {
          content: [
            'Internal record keeping.',
            'We may use the information to improve our products and services.',
            'We may periodically send promotional emails about new products, special offers or other information which we think you may find interesting using the email address which you have provided.',
            'From time to time, we may also use your information to contact you for market research purposes. We may contact you by email, phone, fax or mail. We may use the information to customize the website according to your interests.'
          ],
          type: 'list'
        },
        {
          heading: 'Security',
          content: [
            'We are committed to ensuring that your information is secure. In order to prevent unauthorized access or disclosure we have put in place suitable physical, electronic and managerial procedures to safeguard and secure the information we collect online.'
          ]
        },
        {
          heading: 'How We Use Cookies',
          content: [
            'A cookie is a small file which asks permission to be placed on your computer\'s hard drive. Once you agree, the file is added and the cookie helps analyze web traffic or lets you know when you visit a particular site. Cookies allow web applications to respond to you as an individual. The web application can tailor its operations to your needs, likes and dislikes by gathering and remembering information about your preferences.',
            'We use traffic log cookies to identify which pages are being used. This helps us analyze data about webpage traffic and improve our website in order to tailor it to customer needs. We only use this information for statistical analysis purposes and then the data is removed from the system.',
            'Overall, cookies help us provide you with a better website, by enabling us to monitor which pages you find useful and which you do not. A cookie in no way gives us access to your computer or any information about you, other than the data you choose to share with us.',
            'You can choose to accept or decline cookies. Most web browsers automatically accept cookies, but you can usually modify your browser setting to decline cookies if you prefer. This may prevent you from taking full advantage of the website.'
          ]
        },
        {
          heading: 'Links to Other Websites',
          content: [
            'Our website may contain links to other websites of interest. However, once you have used these links to leave our site, you should note that we do not have any control over that other website. Therefore, we cannot be responsible for the protection and privacy of any information which you provide whilst visiting such sites and such sites are not governed by this privacy statement. You should exercise caution and look at the privacy statement applicable to the website in question.',
            'We will not sell, distribute or lease your personal information to third parties unless we have your permission or are required by law to do so. We may use your personal information to send you promotional information about third parties which we think you may find interesting if you tell us that you wish this to happen.'
          ]
        },
        {
          heading: 'Contacting Us',
          content: [
            'If there are any questions regarding this privacy policy you may contact us using the information on the Contact Us page.'
          ]
        }
      ]
    },
    'terms-conditions': {
      title: 'Terms and Conditions',
      icon: 'file-text',
      sections: [
        {
          heading: 'Introduction',
          content: [
            `Welcome to our website. If you continue to browse and use this website, you are agreeing to comply with and be bound by the following terms and conditions of use, which together with our privacy policy govern ${environment.brandName}'s relationship with you in relation to this website. If you disagree with any part of these terms and conditions, please do not use our website.`
          ]
        },
        {
          heading: 'Ownership',
          content: [
            `The B2bcab.in is owned & powered by SAVAARI CAR RENTALS PRIVATE LIMITED. The term '${environment.brandName}' or 'us' or 'we' refers to the SAVAARI CAR RENTALS PRIVATE LIMITED whose registered office is '${environment.companyName}, ${environment.companyAddress}.' The term 'you' refers to the user or viewer of our website.`
          ]
        },
        {
          heading: 'Terms of Use',
          content: [
            'The use of this website is subject to the following terms of use:'
          ]
        },
        {
          content: [
            'The content of the pages of this website is for your general information and use only. It is subject to change without notice.',
            'This website uses cookies to monitor browsing preferences. If you do allow cookies to be used, the following personal information may be stored by us for use by third parties: IP Address, Location',
            'Neither we nor any third parties provide any warranty or guarantee as to the accuracy, timeliness, performance, completeness or suitability of the information and materials found or offered on this website for any particular purpose. You acknowledge that such information and materials may contain inaccuracies or errors and we expressly exclude liability for any such inaccuracies or errors to the fullest extent permitted by law.',
            'Your use of any information or materials on this website is entirely at your own risk, for which we shall not be liable. It shall be your own responsibility to ensure that any products, services or information available through this website meet your specific requirements.',
            'This website contains material which is owned by or licensed to us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is prohibited other than in accordance with the copyright notice, which forms part of these terms and conditions.',
            'All trademarks reproduced in this website which are not the property of, or licensed to, the operator are acknowledged on the website.',
            'Unauthorized use of this website may give rise to a claim for damages and/or be a criminal offence.',
            'From time to time this website may also include links to other websites. These links are provided for your convenience to provide further information. They do not signify that we endorse the website(s). We have no responsibility for the content of the linked website(s).',
            'Your use of this website and any dispute arising out of such use of the website is subject to the laws of India.',
            'Specific offers will have might have additional Terms & Conditions which the user has to comply with in case he chooses to avail that offer.'
          ],
          type: 'list'
        },
        {
          heading: 'Cancellation and Returns',
          content: [
            'You may cancel the booking 24 hour prior to the time of journey, without any cancellation charges for all services.',
            'In case cancellation or shorting of the trip is requested within 24 hours of the pick-up time, then following rules will apply:'
          ]
        },
        {
          content: [
            'Multi Day trip: The charge for the first day would be deducted from the total amount and refund will be issued to the user.',
            'Single Day trip/ Airport transfer: No Refund will be issued to the user.',
            'Airport transfer: No Cancellation Charges if Cancelled at least 2 hours prior of pickup time.'
          ],
          type: 'list'
        },
        {
          heading: 'Refunds',
          content: [
            'If you are eligible for refunds based on the "Cancellation and Returns" policy above, then the refund will be remitted back to you in 5-7 working days.',
            `In case of any issues, write to us at ${environment.supportEmail} or call us at ${environment.supportPhone}`
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

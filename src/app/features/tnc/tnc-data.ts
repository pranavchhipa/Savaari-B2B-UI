export interface TncSection {
  heading: string;
  icon: string;
  items: string[];
}

export interface TncPage {
  title: string;
  subtitle?: string;
  sections: TncSection[];
}

export const TNC_DATA: Record<string, TncPage> = {
  'outstation-trip': {
    title: 'Terms and Conditions \u2014 Outstation Trip',
    sections: [
      {
        heading: 'Tariff and Extra Charges',
        icon: 'banknote',
        items: [
          'Your trip has a KM limit and in some cases an hour limit. If your usage exceeds these limits, you will be charged for the excess KM/hours used. GST as applicable will be charged on the extra KM/hour charges.',
          'Driver will cooperate for checking the odometer at any point during the trip for transparency.',
          'Toll charges, parking charges, state taxes and entry charges (if applicable) are extra and need to be paid to the driver directly.',
          'Airport Entry/Parking charge, if applicable, is not included in the fare and will be charged extra.',
          'Multiple pickups and drops within the origin city are not included.',
          'Night allowance of \u20B9300 will be applicable from 9:45 PM to 6:00 AM for 4-seater vehicles, and \u20B9400 for 6-seater vehicles.',
          'Service will cover the itinerary cities only. Any detour will incur extra charges.',
          'KM is calculated from pickup point to pickup point (round trip back to origin).',
          'Route preference is at the driver\u2019s discretion unless specified.',
          'For hour-based packages, hours are calculated from pickup time to drop time.',
          'State tax changes during the trip will be charged additionally.',
          'If your trip has hill climbs, cab AC may be switched off during such climbs.',
          'Calendar day calculation \u2014 return must be by 23:59 of the last day.',
          'Any damage caused to the vehicle by passengers will be charged.',
          'Bill discrepancies must be raised within 24 hours of trip completion.',
          'B2B Cab commits to the car type (e.g., Sedan, SUV), not specific car model.'
        ]
      },
      {
        heading: 'Cancellations and Changes to Itinerary',
        icon: 'x-circle',
        items: [
          'Cancellations must be made at least 24 hours in advance.',
          'Cancellations can only be made by calling 090 4545 0000.',
          'Changes to itinerary are subject to availability.',
          'No-show or cancellation within 6 hours may result in up to 100% fare deduction.',
          'B2B Cab may cancel with 4 hours notice due to force majeure.'
        ]
      },
      {
        heading: 'Breakdown Policy',
        icon: 'wrench',
        items: [
          'An alternate vehicle will be provided within 1 hour.',
          'If breakdown occurs within 100 KM of trip start, no extra charge applies.',
          'If breakdown occurs after 100 KM, a 50% discount on the total fare will be given.',
          'AC failure: \u20B91/KM discount on the total distance.'
        ]
      },
      {
        heading: 'Dos and Don\u2019ts',
        icon: 'check-circle',
        items: [
          'Check your belongings before and after the trip.',
          'Driver needs tea/meal breaks during long trips.',
          'For multi-day trips, please arrange hotel washroom access for the driver.',
          'Collect extra cash from the driver yourself after the trip if applicable.',
          'No drinking or smoking inside the vehicle.'
        ]
      }
    ]
  },

  'oneway-outstation-trip': {
    title: 'Terms and Conditions \u2014 One-way Outstation Trip',
    sections: [
      {
        heading: 'Tariff and Extra Charges',
        icon: 'banknote',
        items: [
          'Your trip has a KM limit. If your usage exceeds this limit, you will be charged for the excess KM used. GST as applicable will be charged on extra charges.',
          'Driver will cooperate for checking the odometer at any point during the trip.',
          'One pickup in source city and one drop in destination city only. No within-city travel in either city.',
          'Price includes toll and state taxes. Any difference due to route changes will be charged.',
          'Airport Entry/Parking charge, if applicable, is not included and will be charged extra.',
          'Night allowance of \u20B9300 (4-seater) / \u20B9400 (6-seater) from 9:45 PM to 6:00 AM.',
          'If your trip has hill climbs, cab AC may be switched off.',
          'Route preference is at driver\u2019s discretion.',
          'Driver waits a maximum of 45 minutes. After that, the trip may be cancelled without refund.',
          'Mutual waiting charges: \u20B9200/hr (4-seater) / \u20B9300/hr (6-seater), max 2 hours.',
          'Any damage to the vehicle by passengers will be charged.',
          'Bill discrepancies must be raised within 24 hours.',
          'B2B Cab commits to car type, not specific model.'
        ]
      },
      {
        heading: 'Cancellations and Changes to Itinerary',
        icon: 'x-circle',
        items: [
          'Cancel at least 24 hours in advance by calling 090 4545 0000.',
          'Changes subject to availability.',
          'No-show: up to 100% fare deduction, advance forfeited.',
          'B2B Cab may cancel with 4 hours notice.'
        ]
      },
      {
        heading: 'Breakdown Policy',
        icon: 'wrench',
        items: [
          'Alternate vehicle within 1 hour.',
          'Within 100 KM: no extra charge.',
          'After 100 KM: 50% discount on total fare.',
          'AC failure: \u20B91/KM discount.'
        ]
      },
      {
        heading: 'Dos and Don\u2019ts',
        icon: 'check-circle',
        items: [
          'Check belongings before and after the trip.',
          'Driver needs tea/meal breaks.',
          'No drinking or smoking inside the vehicle.'
        ]
      }
    ]
  },

  'local-trip-metros': {
    title: 'Terms and Conditions \u2014 Local Trip (Metro Cities)',
    subtitle: '8hr/80km and 12hr/120km packages',
    sections: [
      {
        heading: 'Tariff and Extra Charges',
        icon: 'banknote',
        items: [
          'Your trip has both KM and hour limits. Excess usage will be charged with applicable GST.',
          'Driver will cooperate for odometer checks.',
          'KM and hours are calculated from pickup point back to pickup point. Drop-to-pickup distance is added.',
          'For luxury cars (Honda City, Accord, Camry, Mercedes), KM is calculated from garage to garage.',
          'Toll charges, parking charges, and state taxes are extra.',
          'Airport Entry/Parking charge, if applicable, will be charged extra.',
          'Service is for use ONLY within city limits. Outstation rates may apply if city limits are exceeded.',
          'Night allowance of \u20B9300 (4-seater) / \u20B9400 (6-seater) from 9:45 PM to 6:00 AM.',
          'If your trip has hill climbs, cab AC may be switched off.',
          'Any damage to the vehicle will be charged.',
          'Bill discrepancies must be raised within 24 hours.',
          'B2B Cab commits to car type, not specific model.',
          'Services cannot be used for weddings, conferences, or shuttle services.'
        ]
      },
      {
        heading: 'Cancellations and Changes to Itinerary',
        icon: 'x-circle',
        items: [
          'Cancel at least 24 hours in advance.',
          'Cancel by calling 090 4545 0000 or email from registered email.',
          'No-show: up to 100% fare deduction.',
          'B2B Cab may cancel with 4 hours notice.'
        ]
      },
      {
        heading: 'Breakdown Policy',
        icon: 'wrench',
        items: [
          'Alternate vehicle within 30 minutes.',
          'Within 40 KM: no extra charge.',
          'After 40 KM: charged only for 40 KM portion.',
          'AC failure: \u20B91/KM discount.'
        ]
      },
      {
        heading: 'Dos and Don\u2019ts',
        icon: 'check-circle',
        items: [
          'Check belongings before and after the trip.',
          'Driver needs tea/meal breaks.',
          'No drinking or smoking inside the vehicle.'
        ]
      }
    ]
  },

  'local-trip': {
    title: 'Terms and Conditions \u2014 Local Trip (Non-Metro Cities)',
    subtitle: '8hr/80km and 12hr/120km packages',
    sections: [
      {
        heading: 'Tariff and Extra Charges',
        icon: 'banknote',
        items: [
          'Your trip has both KM and hour limits. Excess usage will be charged with applicable GST.',
          'Driver will cooperate for odometer checks.',
          'KM and hours are calculated from garage to garage for ALL vehicles.',
          'Toll charges, parking charges, and state taxes are extra.',
          'Airport Entry/Parking charge will be charged extra if applicable.',
          'Service is for use ONLY within city limits. Outstation rates may apply if limits exceeded.',
          'Night allowance of \u20B9300 (4-seater) / \u20B9400 (6-seater) from 9:45 PM to 6:00 AM.',
          'If your trip has hill climbs, AC may be switched off.',
          'Any damage to the vehicle will be charged.',
          'Bill discrepancies within 24 hours.',
          'B2B Cab commits to car type, not model.',
          'Services cannot be used for weddings, conferences, or shuttle services.'
        ]
      },
      {
        heading: 'Cancellations and Changes to Itinerary',
        icon: 'x-circle',
        items: [
          'Cancel at least 24 hours in advance.',
          'Cancel by calling 090 4545 0000 or email from registered email.',
          'No-show: up to 100% fare deduction.',
          'B2B Cab may cancel with 4 hours notice.'
        ]
      },
      {
        heading: 'Breakdown Policy',
        icon: 'wrench',
        items: [
          'Alternate vehicle within 30 minutes.',
          'Within 40 KM: no extra charge.',
          'After 40 KM: charged only for 40 KM portion.',
          'AC failure: \u20B91/KM discount.'
        ]
      },
      {
        heading: 'Dos and Don\u2019ts',
        icon: 'check-circle',
        items: [
          'Check belongings before and after the trip.',
          'Driver needs tea/meal breaks.',
          'No drinking or smoking inside the vehicle.'
        ]
      }
    ]
  },

  'airport-trip': {
    title: 'Terms and Conditions \u2014 Airport Transfer',
    sections: [
      {
        heading: 'Tariff and Extra Charges',
        icon: 'banknote',
        items: [
          'Your trip is a flat transfer rate. No additional toll, extra KM, or hour charges apply.',
          'Parking and interstate taxes are extra if applicable.',
          'Driver will wait near the airport for up to 30 minutes for pickup.',
          'One pickup or drop within city. Additional stops at driver\u2019s discretion with extra charges.',
          'Flight delay: 30 minutes free waiting, after which the trip may be cancelled without refund.',
          'Mutual waiting charges: \u20B9200/hr (4-seater) / \u20B9300/hr (6-seater), max 3 hours. After 3 hours, auto-cancelled as no-show.',
          'Airport parking charges are extra.',
          'Any damage to the vehicle will be charged.',
          'Bill discrepancies within 24 hours.',
          'B2B Cab commits to car type, not model.'
        ]
      },
      {
        heading: 'Cancellations and Changes to Itinerary',
        icon: 'x-circle',
        items: [
          'Cancel at least 24 hours in advance by calling 090 4545 0000.',
          'Changes subject to availability.',
          'No-show: up to 100% fare deduction.',
          'B2B Cab may cancel with 4 hours notice.'
        ]
      },
      {
        heading: 'Breakdown Policy',
        icon: 'wrench',
        items: [
          'Alternate vehicle within 30 minutes.',
          'If no alternate available or customer doesn\u2019t wait: no charge + full advance refund.'
        ]
      },
      {
        heading: 'AC Failure',
        icon: 'shield',
        items: [
          'Flat 15% discount on final bill.'
        ]
      },
      {
        heading: 'Dos and Don\u2019ts',
        icon: 'check-circle',
        items: [
          'Check belongings before and after.',
          'No drinking or smoking inside the vehicle.'
        ]
      }
    ]
  },

  'bangalore-airport-trip': {
    title: 'Terms and Conditions \u2014 Bangalore Airport Transfer',
    sections: [
      {
        heading: 'Tariff and Extra Charges',
        icon: 'banknote',
        items: [
          'Toll fees, parking charges, and state taxes are charged extra (not included in the fare).',
          'Driver will wait near the airport for up to 30 minutes for pickup.',
          'One pickup or drop within city. Additional stops at driver\u2019s discretion with extra charges.',
          'Flight delay: 30 minutes free waiting, then may be cancelled without refund.',
          'Mutual waiting charges: \u20B9200/hr (4-seater) / \u20B9300/hr (6-seater), max 3 hours.',
          'Airport parking charges are extra.',
          'Any damage to the vehicle will be charged.',
          'Bill discrepancies within 24 hours.',
          'B2B Cab commits to car type, not model.'
        ]
      },
      {
        heading: 'Cancellations and Changes to Itinerary',
        icon: 'x-circle',
        items: [
          'Cancel at least 24 hours in advance by calling 090 4545 0000.',
          'Changes subject to availability.',
          'No-show: up to 100% fare deduction.',
          'B2B Cab may cancel with 4 hours notice.'
        ]
      },
      {
        heading: 'Breakdown Policy',
        icon: 'wrench',
        items: [
          'Alternate vehicle within 30 minutes.',
          'If no alternate available or customer doesn\u2019t wait: no charge + full advance refund.'
        ]
      },
      {
        heading: 'AC Failure',
        icon: 'shield',
        items: [
          'Flat 15% discount on final bill.'
        ]
      },
      {
        heading: 'Dos and Don\u2019ts',
        icon: 'check-circle',
        items: [
          'Check belongings before and after.',
          'No drinking or smoking inside the vehicle.'
        ]
      }
    ]
  }
};

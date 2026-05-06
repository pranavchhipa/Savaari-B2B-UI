import { TestBed } from '@angular/core/testing';

import { BookingState } from './booking-state';

describe('BookingState', () => {
  let service: BookingState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BookingState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

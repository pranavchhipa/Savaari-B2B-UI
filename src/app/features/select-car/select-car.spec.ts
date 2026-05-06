import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectCarComponent } from './select-car';

describe('SelectCarComponent', () => {
  let component: SelectCarComponent;
  let fixture: ComponentFixture<SelectCarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectCarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectCarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

# Zero Wallet Balance for Testing

**Date:** 2026-03-05
**Purpose:** Set wallet balance to ₹0 so the team can test the insufficient balance and booking flow.

## Changes

**File:** `src/app/core/services/wallet.service.ts`

1. **Initial balance:** Change from ₹25,000 to ₹0
2. **Mock transactions:** Remove the two pre-populated transactions (₹40K topup + ₹15K debit) so history starts empty
3. **localStorage:** Clear wallet localStorage keys on service init so returning users also start at ₹0

## What stays the same

- Top-up flow still works (testers can add funds to test full flow)
- Insufficient balance warning on booking page renders as-is
- `hasSufficientWalletBalance()` blocks booking at ₹0
- All wallet UI (header, dashboard, booking sidebar) unchanged

## Reverting

Revert the commit to restore ₹25,000 default when testing is complete.

## Deployment

Push to `main` for live deployment.

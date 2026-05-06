"""Hit the real Savaari autocomplete + place_id API directly through alpha's proxy to see what's returned for the user's addresses."""
import requests

# Bypass Vercel and hit alpha's proxy directly (no VPN needed for alpha)
BASE = 'https://b2bcab.alphasavaari.com'

# Step 1: autocomplete for "Ikea Nagasandra Bengaluru" (pickup in booking 2362928 from screenshot)
print('='*80)
print('STEP 1: Autocomplete for pickup "Ikea Nagasandra Bengaluru"')
print('='*80)
# alpha doesn't have /address-api route yet — check
r = requests.get(f'{BASE}/address-api/autocomplete', params={
    'input': 'Ikea Nagasandra Bengaluru',
    'request': 'from',
    'city': 'Bangalore',
    'rsource': 'b2b',
}, verify=False, timeout=15)
print(f'Status: {r.status_code}, CT: {r.headers.get("content-type")}')
print(f'Body (first 600 chars): {r.text[:600]}')
print()

# If above fails, try beta route (which may need VPN)
print('='*80)
print('STEP 2: autocomplete via beta')
print('='*80)
r2 = requests.get('https://apiext.betasavaari.com/autocomplete', params={
    'input': 'Ikea Nagasandra Bengaluru',
    'request': 'from',
    'city': 'Bangalore',
    'rsource': 'b2b',
}, verify=False, timeout=15)
print(f'Status: {r2.status_code}, CT: {r2.headers.get("content-type")}')
print(f'Body (first 600 chars): {r2.text[:600]}')

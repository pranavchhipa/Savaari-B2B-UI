"""Verify the logo files on alpha match the new ones (not old cached copies)."""
import paramiko
import hashlib
import os

HOST = '35.200.239.56'
PORT = 2212
USER = 'alphab2bcab'
PASSWD = 'TjZxLWR6>8fdK@9X'
REMOTE_ROOT = '/home/alphab2bcab/public_html'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)
sftp = ssh.open_sftp()

files = [
    ('assets/logos/b2b-cab-logo-white.webp', 'public/assets/logos/b2b-cab-logo-white.webp'),
    ('assets/logos/b2b-cab-logo.png',        'public/assets/logos/b2b-cab-logo.png'),
    ('index.html',                           'dist/savaari-b2b-scratch/browser/index.html'),
]

print(f"{'file':55s} {'alpha size':>12} {'alpha md5':>34}  {'local size':>12} {'local md5':>34}  MATCH?")
for remote_rel, local_rel in files:
    remote_path = f'{REMOTE_ROOT}/{remote_rel}'
    local_path = local_rel

    try:
        rst = sftp.stat(remote_path)
        with sftp.open(remote_path, 'rb') as f:
            rdata = f.read()
        rmd5 = hashlib.md5(rdata).hexdigest()
    except Exception as e:
        print(f'  {remote_rel:55s} ERROR reading remote: {e}')
        continue

    try:
        with open(local_path, 'rb') as f:
            ldata = f.read()
        lmd5 = hashlib.md5(ldata).hexdigest()
        lsize = len(ldata)
    except Exception as e:
        print(f'  {remote_rel:55s} ERROR reading local: {e}')
        continue

    match = 'YES' if rmd5 == lmd5 else 'NO  <-- MISMATCH'
    print(f'  {remote_rel:55s} {rst.st_size:>12} {rmd5}  {lsize:>12} {lmd5}  {match}')

# Also list what's actually on alpha under /assets/logos
print('\n=== Alpha /assets/logos/ listing ===')
stdin, stdout, stderr = ssh.exec_command(f"ls -la {REMOTE_ROOT}/assets/logos/")
print(stdout.read().decode('utf-8', errors='replace'))

sftp.close()
ssh.close()

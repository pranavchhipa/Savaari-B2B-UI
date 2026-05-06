"""Inspect alpha server's routing files before deploy.

Pulls current state of:
  - .htaccess
  - proxy.php         (server-managed — we NEVER overwrite)
  - reg-proxy.php     (we manage — safe to overwrite)
  - directory listing of public_html root

Saves each into alpha_inspect/ so we can diff against local before deploy.
"""
import paramiko
import os

HOST = '35.200.239.56'
PORT = 2212
USER = 'alphab2bcab'
PASSWD = 'TjZxLWR6>8fdK@9X'
REMOTE_ROOT = '/home/alphab2bcab/public_html'

FILES_TO_FETCH = ['.htaccess', 'proxy.php', 'reg-proxy.php']

OUT_DIR = 'alpha_inspect'
os.makedirs(OUT_DIR, exist_ok=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f'Connecting to {USER}@{HOST}:{PORT}...')
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)
sftp = ssh.open_sftp()

print(f'\n=== Remote dir: {REMOTE_ROOT} ===')
stdin, stdout, stderr = ssh.exec_command(
    f"ls -la {REMOTE_ROOT} | grep -E '(proxy|htaccess|\\.php)' | head -30"
)
listing = stdout.read().decode('utf-8', errors='replace')
print(listing)
with open(f'{OUT_DIR}/listing.txt', 'w', encoding='utf-8') as f:
    f.write(listing)

for name in FILES_TO_FETCH:
    remote_path = f'{REMOTE_ROOT}/{name}'
    local_path = f'{OUT_DIR}/{name}'
    try:
        st = sftp.stat(remote_path)
        with sftp.open(remote_path, 'r') as rf:
            content = rf.read().decode('utf-8', errors='replace')
        with open(local_path, 'w', encoding='utf-8') as lf:
            lf.write(content)
        print(f'  [OK]   {name:20s}  {st.st_size:>8} bytes  mtime={st.st_mtime}')
    except FileNotFoundError:
        print(f'  [MISS] {name:20s}  NOT FOUND on server')
    except Exception as e:
        print(f'  [ERR]  {name:20s}  {e}')

# Also check apache error log tail if present
print('\n=== Last 20 lines of error_log (if any) ===')
stdin, stdout, stderr = ssh.exec_command(
    f"tail -n 20 {REMOTE_ROOT}/error_log 2>/dev/null || echo 'no error_log'"
)
err_tail = stdout.read().decode('utf-8', errors='replace')
print(err_tail)
with open(f'{OUT_DIR}/error_log_tail.txt', 'w', encoding='utf-8') as f:
    f.write(err_tail)

sftp.close()
ssh.close()
print(f'\nAll files saved under ./{OUT_DIR}/')

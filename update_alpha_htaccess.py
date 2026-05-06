"""
Surgical add-only update to alpha's .htaccess.

Adds 'settlement-api' to the existing RewriteCond pattern so requests
to /settlement-api/* are routed through proxy.php.

Idempotent — re-running is safe.
"""
import paramiko
import sys
from datetime import datetime

HOST = '35.200.239.56'
PORT = 2212
USER = 'alphab2bcab'
PASSWD = 'TjZxLWR6>8fdK@9X'
REMOTE_HTACCESS = '/home/alphab2bcab/public_html/.htaccess'

OLD_PATTERN = '^/(partner-api|b2b-api|wallet-api|address-api|payment-api|system-bookings-api)/'
NEW_PATTERN = '^/(partner-api|b2b-api|wallet-api|address-api|payment-api|system-bookings-api|settlement-api)/'

def run(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    return code, out, err

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f'Connecting to {USER}@{HOST}:{PORT}...')
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

    sftp = ssh.open_sftp()

    print(f'Reading {REMOTE_HTACCESS}...')
    with sftp.open(REMOTE_HTACCESS, 'r') as f:
        original = f.read().decode('utf-8')
    print(f'  original size: {len(original)} bytes')

    # Idempotency check
    if 'settlement-api' in original:
        print('\nABORT: settlement-api already present in alpha .htaccess.')
        print('Nothing to do. (idempotent)')
        sftp.close()
        ssh.close()
        return 0

    if OLD_PATTERN not in original:
        print('ABORT: expected RewriteCond pattern not found in alpha .htaccess.')
        print('Aborting to avoid clobbering. Manual review needed.')
        with open('alpha_htaccess_actual.txt', 'w', encoding='utf-8') as f:
            f.write(original)
        print('Saved actual content to alpha_htaccess_actual.txt')
        sftp.close()
        ssh.close()
        return 2

    modified = original.replace(OLD_PATTERN, NEW_PATTERN)
    if modified == original:
        print('ABORT: replacement produced no change.')
        sftp.close()
        ssh.close()
        return 3

    # Backup
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup_path = f'{REMOTE_HTACCESS}.backup-{ts}'
    print(f'Creating backup: {backup_path}')
    code, out, err = run(ssh, f"cp '{REMOTE_HTACCESS}' '{backup_path}'")
    if code != 0:
        print(f'ABORT: backup failed.\nstderr: {err}')
        sftp.close()
        ssh.close()
        return 4

    print('Writing modified .htaccess...')
    with sftp.open(REMOTE_HTACCESS, 'w') as f:
        f.write(modified)

    # Show diff
    print('\n--- diff ---')
    code, out, err = run(ssh, f"diff '{backup_path}' '{REMOTE_HTACCESS}'")
    print(out or '(no output)')
    print('--- end diff ---\n')

    # grep verify
    code, out, err = run(ssh, f"grep -n 'settlement-api' '{REMOTE_HTACCESS}'")
    print(f'grep verification:\n{out.strip()}')

    sftp.close()
    ssh.close()
    print(f'\n[OK] .htaccess update complete.')
    print(f'     Backup at: {backup_path}')
    return 0

if __name__ == '__main__':
    sys.exit(main())

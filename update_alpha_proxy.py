"""
Surgical add-only update to alpha's server-side proxy.php.

Adds ONLY the new /settlement-api/ route block. Does NOT modify or replace
any existing routes (especially payment-api which carries alpha's razorpay key).

Steps:
  1. Connect via SSH/SFTP.
  2. Download alpha's current proxy.php to local temp.
  3. Take a timestamped backup on alpha (cp proxy.php proxy.php.backup-<ts>).
  4. Abort if /settlement-api/ already present (idempotent).
  5. Insert new block just before the final `} else {` clause.
  6. Run `php -l` on alpha to verify syntax — abort + restore if invalid.
  7. Print final diff for review.
"""
import paramiko
import io
import re
import sys
from datetime import datetime

HOST = '35.200.239.56'
PORT = 2212
USER = 'alphab2bcab'
PASSWD = 'TjZxLWR6>8fdK@9X'
REMOTE_PROXY = '/home/alphab2bcab/public_html/proxy.php'

NEW_BLOCK = """} elseif (preg_match('#^/settlement-api/(.*)$#', $uri, $m)) {
    // Settlement endpoint routes to alpha partner_api (added 2026-04-15).
    $target = 'https://api.alphasavaari.com/partner_api/public/' . $m[1];
"""

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

    # 1. Read current proxy.php
    print(f'Reading {REMOTE_PROXY}...')
    with sftp.open(REMOTE_PROXY, 'r') as f:
        original = f.read().decode('utf-8')
    print(f'  original size: {len(original)} bytes, {original.count(chr(10))} lines')

    # 2. Idempotency check
    if '/settlement-api/' in original or 'settlement-api' in original:
        print('\nABORT: /settlement-api/ block already present in alpha proxy.php.')
        print('Nothing to do. (idempotent — re-running is safe)')
        sftp.close()
        ssh.close()
        return 0

    # 3. Locate insertion point: just before final `} else {`
    # Match either `} else {` or `}else{` with possible whitespace
    pattern = re.compile(r'(\n)([ \t]*)\}\s*else\s*\{', re.MULTILINE)
    matches = list(pattern.finditer(original))
    if not matches:
        print('ABORT: could not locate `} else {` clause in alpha proxy.php.')
        print('Manual review needed. First 20 lines:')
        print('\n'.join(original.splitlines()[:20]))
        sftp.close()
        ssh.close()
        return 2

    # Use the LAST `} else {` (in case there are multiple — usually only one)
    m = matches[-1]
    insert_pos = m.start(2)  # position of indentation before `}`
    indent = m.group(2)
    print(f'  insertion point at offset {insert_pos} (indent: {len(indent)} chars)')

    # 4. Build modified content
    block_lines = NEW_BLOCK.splitlines(keepends=True)
    indented_block = ''.join(indent + line for line in block_lines)
    modified = original[:insert_pos] + indented_block + original[insert_pos:]

    # 5. Backup the existing file on alpha
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup_path = f'{REMOTE_PROXY}.backup-{ts}'
    print(f'Creating backup: {backup_path}')
    code, out, err = run(ssh, f"cp '{REMOTE_PROXY}' '{backup_path}'")
    if code != 0:
        print(f'ABORT: backup failed.\nstderr: {err}')
        sftp.close()
        ssh.close()
        return 3

    # 6. Write modified content
    print('Writing modified proxy.php...')
    with sftp.open(REMOTE_PROXY, 'w') as f:
        f.write(modified)

    # 7. Verify PHP syntax
    print('Verifying PHP syntax with php -l ...')
    code, out, err = run(ssh, f"php -l '{REMOTE_PROXY}'")
    print(f'  php -l output: {out.strip()}')
    if code != 0:
        print(f'ABORT: php -l reported syntax error. Restoring backup...')
        print(f'  stderr: {err}')
        run(ssh, f"cp '{backup_path}' '{REMOTE_PROXY}'")
        print('  Backup restored.')
        sftp.close()
        ssh.close()
        return 4

    # 8. Show diff for review
    print('\n--- diff (original vs modified) ---')
    code, out, err = run(ssh, f"diff '{backup_path}' '{REMOTE_PROXY}'")
    print(out or '(no output)')
    print('--- end diff ---\n')

    # 9. Confirm settlement-api block present
    code, out, err = run(ssh, f"grep -n 'settlement-api' '{REMOTE_PROXY}'")
    print(f'grep verification:\n{out.strip()}')

    sftp.close()
    ssh.close()
    print(f'\n[OK] Surgical update complete.')
    print(f'     Backup retained at: {backup_path}')
    return 0

if __name__ == '__main__':
    sys.exit(main())

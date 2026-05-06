"""One-off deploy — skips BOTH proxy.php and reg-proxy.php per per-message
user instruction "dont push proxy files" (plural).

Identical to deploy_alpha.py except SKIP_FILES is widened to include
reg-proxy.php for this run only. deploy_alpha.py itself is untouched
so the permanent guard rail stays exactly as documented.
"""
import paramiko, os

HOST = '35.200.239.56'
PORT = 2212
USER = 'alphab2bcab'
PASSWD = 'TjZxLWR6>8fdK@9X'
LOCAL_DIR = os.path.join('dist', 'savaari-b2b-scratch', 'browser')
REMOTE_DIR = '/home/alphab2bcab/public_html'

SKIP_FILES = {
    'proxy.php',      # server-managed — permanent guard rail
    'reg-proxy.php',  # skipped this run per per-message user instruction
}

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)
sftp = ssh.open_sftp()

skipped = []
uploaded = 0

def upload_dir(local, remote):
    global uploaded
    for item in os.listdir(local):
        lp = os.path.join(local, item)
        rp = remote + '/' + item
        if os.path.isdir(lp):
            try:
                sftp.stat(rp)
            except FileNotFoundError:
                sftp.mkdir(rp)
            upload_dir(lp, rp)
        else:
            if item.lower() in SKIP_FILES:
                skipped.append(item)
                print(f'  [SKIPPED - guard rail] {item}')
                continue
            sftp.put(lp, rp)
            uploaded += 1
            print(f'  {item}')

print('Uploading to alpha server...')
upload_dir(LOCAL_DIR, REMOTE_DIR)
sftp.close()
ssh.close()
print(f'\nDeploy complete! Uploaded {uploaded} files.')
if skipped:
    print(f'Guard rail skipped {len(skipped)} file(s) (NEVER uploaded): {", ".join(skipped)}')

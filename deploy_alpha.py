"""Deploy built Angular app to alpha server via SFTP (paramiko).

============================================================================
STRICT GUARD RAIL — DO NOT REMOVE
============================================================================
NEVER upload `proxy.php` or `.htaccess` to alpha. The alpha server has its
OWN proxy.php and .htaccess configs that route APIs to the correct backend.

If our local proxy.php gets uploaded, it overwrites the server's config
and breaks razorpay — orders end up created on the wrong backend with a
mismatched secret, causing "BAD_REQUEST_ERROR: The id provided does not
exist" 400 errors on razorpay's /v2/standard_checkout/preferences endpoint.

If our local .htaccess gets uploaded, it overwrites the server's rewrite
rules and can break all API routing on alpha.

If you need to update alpha's proxy.php or .htaccess, do it on the server
directly via SSH — NEVER push them from this repo.
============================================================================
"""
import paramiko, os

HOST = '35.200.239.56'
PORT = 2212
USER = 'alphab2bcab'
PASSWD = 'TjZxLWR6>8fdK@9X'
LOCAL_DIR = os.path.join('dist', 'savaari-b2b-scratch', 'browser')
REMOTE_DIR = '/home/alphab2bcab/public_html'

# === STRICT GUARD RAIL — files that must NEVER be uploaded to alpha ===
# Lowercase comparison so 'Proxy.php', 'PROXY.PHP' etc. are also blocked.
SKIP_FILES = {
    'proxy.php',     # alpha has its own routing config — NEVER overwrite
    '.htaccess',     # alpha has its own rewrite rules — NEVER overwrite
}

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)
sftp = ssh.open_sftp()

skipped = []

def upload_dir(local, remote):
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
            # === STRICT GUARD RAIL CHECK ===
            if item.lower() in SKIP_FILES:
                skipped.append(item)
                print(f'  [SKIPPED — guard rail] {item}')
                continue
            sftp.put(lp, rp)
            print(f'  {item}')

print('Uploading to alpha server...')
upload_dir(LOCAL_DIR, REMOTE_DIR)
sftp.close()
ssh.close()
print('Deploy complete!')
if skipped:
    print(f'\nGuard rail skipped {len(skipped)} file(s) (NEVER uploaded): {", ".join(skipped)}')

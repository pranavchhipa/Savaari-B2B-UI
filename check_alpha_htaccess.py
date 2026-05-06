"""Read alpha's .htaccess to see rewrite rules."""
import paramiko

HOST = '35.200.239.56'
PORT = 2212
USER = 'alphab2bcab'
PASSWD = 'TjZxLWR6>8fdK@9X'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

sftp = ssh.open_sftp()
with sftp.open('/home/alphab2bcab/public_html/.htaccess', 'r') as f:
    content = f.read().decode('utf-8')

# Save locally to avoid encoding issues
with open('alpha_htaccess.txt', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Saved alpha .htaccess ({len(content)} bytes) to alpha_htaccess.txt')

# Also list relevant proxy files
stdin, stdout, stderr = ssh.exec_command("ls -la /home/alphab2bcab/public_html/ | grep -E '(proxy|htaccess)'")
listing = stdout.read().decode('utf-8')
with open('alpha_htaccess_listing.txt', 'w', encoding='utf-8') as f:
    f.write(listing)
print('Saved listing to alpha_htaccess_listing.txt')

sftp.close()
ssh.close()

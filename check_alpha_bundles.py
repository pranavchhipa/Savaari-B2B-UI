"""List all files on alpha public_html to spot stale Angular 4 bundles."""
import paramiko

HOST = '35.200.239.56'; PORT = 2212; USER = 'alphab2bcab'; PASSWD = 'TjZxLWR6>8fdK@9X'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

# List ALL .js and .html files in public_html
commands = [
    "ls -la /home/alphab2bcab/public_html/ | head -80",
    "find /home/alphab2bcab/public_html/ -maxdepth 2 -name '*.bundle.js' -o -name '*.chunk.js' 2>/dev/null | head -30",
    "grep -l 'razor_sign\\|merchant_order_id\\|user_checkboxtype' /home/alphab2bcab/public_html/*.js /home/alphab2bcab/public_html/*.html /home/alphab2bcab/public_html/*.php 2>/dev/null | head -20",
    "ls /home/alphab2bcab/public_html/*.php 2>/dev/null",
]
for cmd in commands:
    print(f'\n>>> {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    out_file = f'alpha_probe_{hash(cmd) & 0xffff:04x}.txt'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f'CMD: {cmd}\nSTDOUT:\n{out}\nSTDERR:\n{err}')
    print(f'   saved to {out_file}')

ssh.close()

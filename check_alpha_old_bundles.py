"""Check if old Angular 4 bundles contain the mystery field names."""
import paramiko

HOST = '35.200.239.56'; PORT = 2212; USER = 'alphab2bcab'; PASSWD = 'TjZxLWR6>8fdK@9X'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

commands = [
    # Grep in Nov2-live for the mystery field names
    "grep -l 'razor_sign' /home/alphab2bcab/public_html/Nov2-live/*.js 2>/dev/null | head -5",
    "grep -l 'merchant_order_id' /home/alphab2bcab/public_html/Nov2-live/*.js 2>/dev/null | head -5",
    "grep -l 'user_checkboxtype' /home/alphab2bcab/public_html/Nov2-live/*.js 2>/dev/null | head -5",
    "grep -l 'payment_status_param_analytics' /home/alphab2bcab/public_html/Nov2-live/*.js 2>/dev/null | head -5",
    # Check beta-code_nov3 src
    "grep -r 'razor_sign' /home/alphab2bcab/public_html/beta-code_nov3/src 2>/dev/null | head -10",
    "grep -r 'merchant_order_id' /home/alphab2bcab/public_html/beta-code_nov3/src 2>/dev/null | head -10",
    "grep -r 'user_checkboxtype' /home/alphab2bcab/public_html/beta-code_nov3/src 2>/dev/null | head -10",
    # Get RAZOR key from webconfig
    "grep 'RAZOR_KEY_ID\\|RAZOR_KEY_SECRET' /home/alphab2bcab/public_html/payment_confirmation/required/webconfig.php 2>/dev/null",
    # See if Nov2-live has payment code
    "ls /home/alphab2bcab/public_html/Nov2-live/*.js 2>/dev/null | head -10",
    # Check index.html that's being served - does it reference Nov2-live chunks?
    "grep -o 'Nov2-live\\|chunk-\\|main-' /home/alphab2bcab/public_html/index.html 2>/dev/null | head -10",
    # Today's log full to see pay_QB pattern
    "grep 'pay_QB' /home/alphab2bcab/public_html/phonepelogs/razor_*.txt 2>/dev/null | head -10",
]
for i, cmd in enumerate(commands):
    print(f'\n>>> [{i}] {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    out_file = f'alpha_bundle_{i:02d}.txt'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f'CMD: {cmd}\nSTDOUT:\n{out}\nSTDERR:\n{err}')
    print(f'   saved to {out_file} ({len(out)} bytes)')

ssh.close()

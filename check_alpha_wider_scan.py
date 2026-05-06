"""Broader scan — check ENTIRE alpha public_html for the mystery field names + payment ID pattern."""
import paramiko

HOST = '35.200.239.56'; PORT = 2212; USER = 'alphab2bcab'; PASSWD = 'TjZxLWR6>8fdK@9X'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

commands = [
    # Recursive grep for mystery field names across ALL of public_html
    "grep -r -l 'razor_sign' /home/alphab2bcab/public_html 2>/dev/null | head -20",
    "grep -r -l 'merchant_order_id' /home/alphab2bcab/public_html 2>/dev/null | head -20",
    "grep -r -l 'user_checkboxtype' /home/alphab2bcab/public_html 2>/dev/null | head -20",
    "grep -r -l 'payment_status_param_analytics' /home/alphab2bcab/public_html 2>/dev/null | head -20",
    "grep -r -l 'razor_payment_id' /home/alphab2bcab/public_html 2>/dev/null | head -20",
    # Any PHP file at top level
    "ls /home/alphab2bcab/public_html/*.php 2>/dev/null",
    # What does the current index.html actually reference
    "cat /home/alphab2bcab/public_html/index.html 2>/dev/null | head -100",
    # Check confirmation.php that is the success handler
    "ls -la /home/alphab2bcab/public_html/*confirmation* /home/alphab2bcab/public_html/payment_confirmation/ 2>/dev/null",
    "cat /home/alphab2bcab/public_html/confirmation.php 2>/dev/null | head -100",
    # Any other top-level directories (could be a different bundle loading)
    "ls -la /home/alphab2bcab/public_html/ 2>/dev/null",
]
for i, cmd in enumerate(commands):
    print(f'\n>>> [{i}] {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    out_file = f'alpha_wider_{i:02d}.txt'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f'CMD: {cmd}\nSTDOUT:\n{out}\nSTDERR:\n{err}')
    print(f'   saved to {out_file} ({len(out)} bytes stdout)')

ssh.close()

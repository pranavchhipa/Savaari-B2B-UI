"""Pull recent razor_checkhash payment logs from alpha to see what's actually being sent."""
import paramiko

HOST = '35.200.239.56'; PORT = 2212; USER = 'alphab2bcab'; PASSWD = 'TjZxLWR6>8fdK@9X'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

commands = [
    "ls -lat /home/alphab2bcab/public_html/phonepelogs/ 2>/dev/null | head -20",
    # Most recent log  file(s) — last 100 lines
    "ls -t /home/alphab2bcab/public_html/phonepelogs/razor_*.txt 2>/dev/null | head -2",
    "tail -200 /home/alphab2bcab/public_html/phonepelogs/razor_2026_04_15.txt 2>/dev/null",
    "tail -200 /home/alphab2bcab/public_html/phonepelogs/razor_2026_04_14.txt 2>/dev/null",
    # Also grep index.php to see if alpha has a fallback index.php
    "head -40 /home/alphab2bcab/public_html/index.php 2>/dev/null",
    # Check razor_createorder.php
    "cat /home/alphab2bcab/public_html/razor_createorder.php 2>/dev/null",
    # Look at the RAZORPAY KEY in alpha's webconfig
    "cat /home/alphab2bcab/public_html/payment_confirmation/required/webconfig.php 2>/dev/null | grep -i 'RAZOR_KEY\\|key' | head -5",
]
for i, cmd in enumerate(commands):
    print(f'\n>>> [{i}] {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    out_file = f'alpha_log_{i:02d}.txt'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f'CMD: {cmd}\nSTDOUT:\n{out}\nSTDERR:\n{err}')
    print(f'   saved to {out_file} ({len(out)} bytes stdout)')

ssh.close()

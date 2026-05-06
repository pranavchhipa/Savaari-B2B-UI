"""Deep probe: find where those mystery field names live on alpha."""
import paramiko

HOST = '35.200.239.56'; PORT = 2212; USER = 'alphab2bcab'; PASSWD = 'TjZxLWR6>8fdK@9X'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

commands = [
    # Deep recursive grep across all files
    "grep -rl 'merchant_order_id' /home/alphab2bcab/public_html/ 2>/dev/null | head -20",
    "grep -rl 'razor_sign' /home/alphab2bcab/public_html/ 2>/dev/null | head -20",
    "grep -rl 'user_checkboxtype' /home/alphab2bcab/public_html/ 2>/dev/null | head -20",
    # Look at alpha's razor_checkhash.php content
    "cat /home/alphab2bcab/public_html/razor_checkhash.php 2>/dev/null",
    # Look at alpha's proxy.php current state
    "cat /home/alphab2bcab/public_html/proxy.php 2>/dev/null",
    # Look at beta-code_nov3 structure
    "ls -la /home/alphab2bcab/public_html/beta-code_nov3/ 2>/dev/null | head -30",
    # Check if Razorpay log file exists (sometimes backend writes payment attempts)
    "ls -la /home/alphab2bcab/public_html/logs/ 2>/dev/null",
    "ls -la /home/alphab2bcab/public_html/*.log 2>/dev/null",
]
for cmd in commands:
    print(f'\n>>> {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    safe_hash = hash(cmd) & 0xffff
    out_file = f'alpha_deep_{safe_hash:04x}.txt'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f'CMD: {cmd}\nSTDOUT:\n{out}\nSTDERR:\n{err}')
    print(f'   saved to {out_file} ({len(out)} bytes stdout)')

ssh.close()

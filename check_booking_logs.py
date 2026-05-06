"""Find what was actually sent in the booking 2362928 request (alias_source_city_id, alias_dest_city_id, extraDestinations)."""
import paramiko

HOST = '35.200.239.56'; PORT = 2212; USER = 'alphab2bcab'; PASSWD = 'TjZxLWR6>8fdK@9X'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

commands = [
    # Any booking-related logs on alpha?
    "ls /home/alphab2bcab/public_html/*.log /home/alphab2bcab/public_html/*logs*/ /home/alphab2bcab/public_html/payment_confirmation/logs/ 2>/dev/null | head -20",
    # Search all logs for 2362928 (the booking from screenshot)
    "grep -r -l '2362928' /home/alphab2bcab/public_html/ 2>/dev/null | head -10",
    # Search phonepelogs for 2362928
    "grep -r '2362928' /home/alphab2bcab/public_html/phonepelogs/ 2>/dev/null | head -20",
    # Search payment_confirmation/logs for 2362928
    "grep -r '2362928' /home/alphab2bcab/public_html/payment_confirmation/logs/ 2>/dev/null | head -30",
    # Most interesting: what's the B2B_RAZORPAY booking data — find input for 2362928
    "grep -A 2 '2362928' $(ls -t /home/alphab2bcab/public_html/payment_confirmation/logs/*.txt 2>/dev/null | head -5) 2>/dev/null | head -40",
    # Raw curl locally — what does confirmation.php return for 2362928?
    # (Not invoking this, just looking at current log files)
    # List all log folders on public_html
    "find /home/alphab2bcab/public_html -name '*.log' -mtime -1 2>/dev/null | head -20",
    "find /home/alphab2bcab/public_html -name '*log*' -type d 2>/dev/null | head -20",
    # See if confirmation.php logs anywhere
    "grep -n 'fopen\\|file_put_contents\\|write_log\\|error_log' /home/alphab2bcab/public_html/payment_confirmation/confirmation.php 2>/dev/null | head -20",
]
for i, cmd in enumerate(commands):
    print(f'\n>>> [{i}] {cmd[:120]}')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    out_file = f'booking_log_{i:02d}.txt'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f'CMD: {cmd}\nSTDOUT:\n{out}\nSTDERR:\n{err}')
    print(f'   saved to {out_file} ({len(out)} bytes stdout)')

ssh.close()

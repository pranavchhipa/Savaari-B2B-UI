"""Verify /payment-api/ still routes correctly, and inspect recent confirmation logs."""
import paramiko

HOST = '35.200.239.56'; PORT = 2212; USER = 'alphab2bcab'; PASSWD = 'TjZxLWR6>8fdK@9X'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWD)

commands = [
    # Full current proxy.php content
    "cat /home/alphab2bcab/public_html/proxy.php",
    # Full current .htaccess
    "cat /home/alphab2bcab/public_html/.htaccess",
    # Server-side test: POST /payment-api/razor_checkhash.php and show what PHP returns
    # Use curl to hit localhost with Host header to bypass DNS, and see response headers+body
    "curl -sS -o /tmp/hash_body.txt -w 'HTTP %{http_code}\\nCT %{content_type}\\n' "
    "-X POST 'https://b2bcab.alphasavaari.com/payment-api/razor_checkhash.php' "
    "-d 'razorpay_order_id=test&razorpay_payment_id=test&razorpay_signature=test&savaari_pay_id=test&selectedAmount=1' "
    "-k 2>&1; echo '---BODY---'; head -50 /tmp/hash_body.txt",
    # List logs/ files inside payment_confirmation/
    "ls -lat /home/alphab2bcab/public_html/payment_confirmation/logs/ 2>/dev/null | head -15",
    # Show very latest confirmation.php log file content
    "ls -t /home/alphab2bcab/public_html/payment_confirmation/logs/*.txt 2>/dev/null | head -3",
    "tail -100 $(ls -t /home/alphab2bcab/public_html/payment_confirmation/logs/*.txt 2>/dev/null | head -1)",
    # Same thing for phonepelogs (just razor*)
    "ls -t /home/alphab2bcab/public_html/phonepelogs/razor_*.txt 2>/dev/null | head -3",
    # See which razor logs have data for today (2026-04-15) or recent
    "ls -lat /home/alphab2bcab/public_html/phonepelogs/razor_*.txt 2>/dev/null | head -10",
]
for i, cmd in enumerate(commands):
    print(f'\n>>> [{i}] {cmd[:120]}')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    out_file = f'alpha_proxy2_{i:02d}.txt'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f'CMD: {cmd}\nSTDOUT:\n{out}\nSTDERR:\n{err}')
    print(f'   saved to {out_file} ({len(out)} bytes stdout)')

ssh.close()

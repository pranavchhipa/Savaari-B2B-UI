import paramiko, os

host = '35.200.239.56'
port = 2212
user = 'alphab2bcab'
pwd = 'TjZxLWR6>8fdK@9X'
local_dir = 'C:/Users/Pranav/.gemini/antigravity/scratch/savaari-b2b-scratch/dist/savaari-b2b-scratch/browser'
remote_dir = '/home/alphab2bcab/public_html'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port=port, username=user, password=pwd, timeout=15)
sftp = ssh.open_sftp()

count = 0
def upload_dir(local, remote):
    global count
    for item in os.listdir(local):
        lpath = os.path.join(local, item).replace(chr(92), '/')
        rpath = remote + '/' + item
        if os.path.isdir(lpath):
            try:
                sftp.mkdir(rpath)
            except:
                pass
            upload_dir(lpath, rpath)
        else:
            sftp.put(lpath, rpath)
            count += 1

print('Uploading to alpha server...')
upload_dir(local_dir, remote_dir)
print(f'Done! {count} files uploaded.')
sftp.close()
ssh.close()

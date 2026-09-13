import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

file_long = r"d:\22050034_QuachThiThu\DO_AN_NGANH-QUACHTHITHU-22050034\DO_AN_NGANH\MEETING\WORDMAUTHAMKHAO\DATN_NGUYỄN HOÀNG LONG.txt"
file_pho = r"d:\22050034_QuachThiThu\DO_AN_NGANH-QUACHTHITHU-22050034\DO_AN_NGANH\MEETING\WORDMAUTHAMKHAO\21050044_Nguyễn Hợp Phố_v3.txt"
file_tri = r"d:\22050034_QuachThiThu\DO_AN_NGANH-QUACHTHITHU-22050034\DO_AN_NGANH\MEETING\WORDMAUTHAMKHAO\datn_trandangtri.txt"
file_user = r"d:\22050034_QuachThiThu\DO_AN_NGANH-QUACHTHITHU-22050034\DO_AN_NGANH\MEETING\fileword.txt"

def check_cloud_terms(file_path, name):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()
    
    print(f"=== {name} ===")
    cloud_keywords = ["cloud", "aws", "ec2", "cloudflare", "vercel", "heroku", "render", "vps", "firebase", "gcp", "azure"]
    matches = []
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        for kw in cloud_keywords:
            if re.search(r'\b' + kw + r'\b', line, re.IGNORECASE):
                matches.append((i, kw, line.strip()))
                break
    
    print(f"Found {len(matches)} mentions of cloud deployment terms:")
    for lno, kw, snippet in matches[:15]:
        print(f"  Line {lno:4d} [{kw}]: {snippet[:110]}")
    print()

check_cloud_terms(file_long, "LONG (Top 1)")
check_cloud_terms(file_pho, "PHỐ (Top 2)")
check_cloud_terms(file_tri, "TRỊ (Top 3)")
check_cloud_terms(file_user, "USER (Thu)")

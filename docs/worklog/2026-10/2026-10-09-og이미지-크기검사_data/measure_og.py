import re, struct, csv, sys, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

UA = {'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)'}
sm = open('sm.xml', encoding='utf-8').read()
urls = [u for u in re.findall(r'<loc>([^<]*)</loc>', sm) if re.search(r'/20\d\d/\d\d/\d\d/', u)]

def head_html(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25)
    buf = b''
    while b'</head>' not in buf and len(buf) < 400_000:
        c = r.read(16384)
        if not c:
            break
        buf += c
    r.close()
    return buf.decode('utf-8', 'ignore')

def dims(img):
    r = urllib.request.urlopen(urllib.request.Request(img, headers={**UA, 'Range': 'bytes=0-262143'}), timeout=25)
    d = r.read(262144)
    r.close()
    if d[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>II', d[16:24])
    if d[:4] == b'RIFF' and d[8:12] == b'WEBP':
        if d[12:16] == b'VP8X':
            return (int.from_bytes(d[24:27], 'little') + 1, int.from_bytes(d[27:30], 'little') + 1)
        if d[12:16] == b'VP8 ':
            return struct.unpack('<HH', d[26:30])[0] & 0x3fff, struct.unpack('<HH', d[26:30])[1] & 0x3fff
        return (None, None)
    i = 2
    while i < len(d) - 9:
        if d[i] != 0xFF:
            i += 1
            continue
        m = d[i + 1]
        if m in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack('>HH', d[i + 5:i + 9])
            return (w, h)
        i += 2 + struct.unpack('>H', d[i + 2:i + 4])[0]
    return (None, None)

cache = {}
def work(u):
    try:
        h = head_html(u)
        m = re.search(r'property="og:image" content="([^"]*)"', h)
        if not m:
            return [u, '', '', '', 'no-og-image']
        img = m.group(1).replace('&amp;', '&')
        if img not in cache:
            try:
                cache[img] = dims(img)
            except Exception as e:
                cache[img] = ('err', str(e)[:30])
        w, hh = cache[img]
        return [u, img, w, hh, 'ok']
    except Exception as e:
        return [u, '', '', '', 'fetch-err:' + str(e)[:30]]

with ThreadPoolExecutor(10) as ex:
    rows = list(ex.map(work, urls))
with open('og_sizes.csv', 'w', newline='', encoding='utf-8') as f:
    csv.writer(f).writerows([['url', 'og_image', 'w', 'h', 'status']] + rows)
print('done', len(rows))

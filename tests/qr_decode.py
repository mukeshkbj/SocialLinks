# Decodes (with either OpenCV detector) every generated QR matrix with OpenCV and checks the text round-trips.
import json, sys, numpy as np, cv2
cases = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/qr/cases.json'))
dets = [cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()]; bad = 0
for c in cases:
    m = np.array([[0 if ch == '1' else 255 for ch in row] for row in c['m']], dtype=np.uint8)
    m = np.pad(m, 4, constant_values=255); img = cv2.resize(m, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
    ok = any(d.detectAndDecode(img)[0] == c['text'] for d in dets); txt = ''; bad += not ok
    print(('PASS' if ok else 'FAIL'), f"v{c['version']:>2} {c['ecl']} len={len(c['text'].encode())}", '' if ok else repr(txt[:40]))
print('failures:', bad); sys.exit(1 if bad else 0)

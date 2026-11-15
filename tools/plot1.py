# 트랙 하나의 평면도: 높이·장치·AI 주행선
import json, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
D = [d for d in json.load(open('tools/out/check.json')) if d['id'] == sys.argv[1]][0]
fig, ax = plt.subplots(figsize=(9, 9), facecolor='#12141c')
c = np.array(D['center']); x, z, y, hw, nx, nz = c.T; n = len(x)
P = lambda i, lat: (-(x[i % n] + nx[i % n]*lat), z[i % n] + nz[i % n]*lat)
ymax = max(1, y.max())
for i in range(n):
    j = (i+1) % n
    a, b, cc, d = P(i, hw[i]), P(j, hw[j]), P(j, -hw[j]), P(i, -hw[i])
    ax.fill([a[0], b[0], cc[0], d[0]], [a[1], b[1], cc[1], d[1]], color=plt.cm.viridis(y[i]/ymax*0.85), lw=0, zorder=1+y[i]*0.1)
col = {'water': '#3aa0ff', 'ice': '#d8f4ff', 'tunnel': '#8a5a3a', 'cliff': '#c0703a'}
for i0, cnt, kind in D['zones']:
    for q in range(0, cnt+1):
        i = i0 + q; a, b = P(i, hw[i % n]+1.5), P(i, -hw[i % n]-1.5)
        ax.plot([a[0], b[0]], [a[1], b[1]], color=col.get(kind, 'w'), lw=2.2, alpha=0.8, zorder=20)
for i0, cnt in D['jumps']:
    for q in range(cnt+1):
        i = i0 + q; a, b = P(i, hw[i % n]), P(i, -hw[i % n])
        ax.plot([a[0], b[0]], [a[1], b[1]], color='#ffd21e', lw=2.5, zorder=21)
for i, lat, r, kind in D['obs']:
    px, pz = P(i, lat); ax.add_patch(plt.Circle((px, pz), r, color={'hay': '#f1c75a', 'island': '#55c040', 'rock': '#a5653a'}.get(kind, '#ff8a3c'), zorder=25))
for i, lat in D['pads']:
    px, pz = P(i, lat); ax.scatter([px], [pz], marker='^', c='#ff8a00', s=80, zorder=26)
p = np.array(D['path'])
cols = np.where(p[:, 3] == 1, '#ff5a3c', np.where(p[:, 2] == 1, '#ffd23c', '#ffffff'))
ax.scatter(-p[:, 0], p[:, 1], c=cols, s=4, zorder=30)
sx, sz = P(0, 0); ax.scatter([sx], [sz], marker='s', c='#00e0ff', s=90, zorder=40)
ax.set_aspect('equal'); ax.axis('off')
r = [r for r in D['runs'] if not r['inf'] and r['skill'] > 0.9][0]
ax.set_title(f"{D['name']}  {D['length']}m   AI lap {r['laps'][1]}s", color='w', fontsize=15)
fig.text(0.5, 0.03, 'yellow band=jump  blue=water  light=ice  brown=tunnel  orange circle=obstacle  triangle=pad  line: white grip / yellow drift / red boost', color='#aab', ha='center', fontsize=9)
plt.tight_layout(); plt.savefig(f"tools/out/plan_{sys.argv[1]}.png", dpi=80)

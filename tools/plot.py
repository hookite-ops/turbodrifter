import json, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np
D = json.load(open('tools/out/check.json'))
fig, axs = plt.subplots(1, 4, figsize=(22, 6.2), facecolor='#12141c')
for ax, d in zip(axs, D):
    c = np.array(d['center']); x, z, y, hw, nx, nz = c.T
    L = np.c_[x + nx*hw, z + nz*hw]; R = np.c_[x - nx*hw, z - nz*hw]
    order = np.argsort(y, kind='stable')
    for i in range(len(x)):
        j = (i+1) % len(x)
        col = plt.cm.viridis(min(1, y[i]/10)) if y.max() > 0 else (0.35,0.37,0.42,1)
        ax.fill([-L[i,0], -L[j,0], -R[j,0], -R[i,0]], [L[i,1], L[j,1], R[j,1], R[i,1]], color=col, lw=0, zorder=1+y[i])
    p = np.array(d['path'])
    cols = np.where(p[:,3]==1, '#ff5a3c', np.where(p[:,2]==1, '#ffd23c', '#ffffff'))
    ax.scatter(-p[:,0], p[:,1], c=cols, s=5, zorder=30)
    ax.scatter([-x[0]], [z[0]], marker='s', c='#00e0ff', s=90, zorder=40)
    for pi in d['pads']: ax.scatter([-x[pi]], [z[pi]], marker='^', c='#ff8a00', s=70, zorder=41)
    ax.set_aspect('equal'); ax.axis('off')
    r = [r for r in d['runs'] if not r['inf'] and r['skill']>0.9][0]
    ax.set_title(f"{d['id']}  {d['length']}m  minR {d['minR']}m\nAI lap {r['laps'][1]}s  drifts/lap {r['drifts']//3}  boosts {r['boosts']}", color='w', fontsize=13)
fig.text(0.5, 0.02, 'white=grip  yellow=drift  red=booster   square=start  triangle=boost pad   color=height', color='#aab', ha='center', fontsize=12)
plt.tight_layout(); plt.savefig('tools/out/tracks.png', dpi=70)

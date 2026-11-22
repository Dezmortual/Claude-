"""Synthesises the 35s music + SFX bed for the Manywright ad (no samples, all generated)."""
import numpy as np, wave, sys
SR=44100; T=35; n=SR*T; t=np.arange(n)/SR
out=np.zeros(n); rng=np.random.default_rng(3)
def env(at,dur,a=.005,r=None):
    e=np.zeros(n); i0=int(at*SR); L=int(dur*SR); x=np.arange(L)/SR
    shape=np.minimum(1,x/a)*np.exp(-x/(r or dur/4)); e[i0:i0+L]=shape[:max(0,min(L,n-i0))]; return e
def tone(f,at,dur,vol,r=None): global out; out+=vol*env(at,dur,r=r)*np.sin(2*np.pi*f*t)
def noise(at,dur,vol,lp=0.2,r=None):
    global out; x=rng.standard_normal(n); y=np.zeros(n); a=lp
    i0=int(at*SR); i1=min(n,i0+int(dur*SR)); acc=0
    for i in range(i0,i1): acc+=a*(x[i]-acc); y[i]=acc
    out+=vol*env(at,dur,r=r)*y
# pad: tense (A minor) 0-20s, warm (A major add9) 20-35s, swell 17-20
def pad(freqs,a,b,vol):
    m=np.clip((t-a)/1.5,0,1)*np.clip((b-t)/1.5,0,1)
    for f in freqs: out[:]+=vol*m*np.sin(2*np.pi*f*t)*(0.8+0.2*np.sin(2*np.pi*0.2*t))
pad([110,130.81,164.81],0,21,.05); pad([110,138.59,164.81,246.94],19.5,35,.06)
sw=np.clip((t-17)/3,0,1)*np.clip((21-t)/1,0,1); out+=0.05*sw*np.sin(2*np.pi*(220+sw*110)*t)
for k in range(40): tone(1800,k*.5,.04,.05,r=.008)            # ticking 0-20s
for at in [5,10,15,20,25,30]: noise(at,.45,.25,lp=.08,r=.15)     # sheet slides
for k in range(4): a=21.55+k*.45; noise(a,.12,.6,lp=.5,r=.02); tone(90,a,.25,.35,r=.06)   # plate clacks
tone(70,22.9,.5,.5,r=.12)                                         # final lock
for f in (1318.5,1760,2637): tone(f,23.05,2.2,.09,r=.6)           # teal chime
for i in range(5): tone(2093,25.75+i*.42,.4,.07,r=.12)            # checkmarks
tone(60,32.8,.5,.6,r=.1); noise(32.8,.2,.5,lp=.3,r=.04)           # stamp
for f in (880,1108.7,1318.5): tone(f,33.6,1.4,.05,r=.5)
out=np.tanh(out*1.2)*0.5
with wave.open(sys.argv[1],'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out*32767).astype(np.int16).tobytes())

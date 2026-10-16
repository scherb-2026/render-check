"""Writes reference EXR files with the OpenEXR library (every codec the viewer supports, plus layers, mixed types, grey and the
unsupported lossy codecs) and the exact pixel values they must decode to. Needs: pip install OpenEXR numpy."""
import os, json
import numpy as np
import OpenEXR
HERE = os.path.dirname(os.path.abspath(__file__)); os.makedirs(os.path.join(HERE, 'cases'), exist_ok=True)
rng = np.random.default_rng(1)
H,W = 203,301
yy,xx = np.mgrid[0:H,0:W].astype(np.float32)
R = xx/W; G = yy/H; B = 0.5+0.5*np.sin(xx/9)*np.cos(yy/7)
A = np.clip(1-np.hypot(xx-W/2,yy-H/2)/(0.6*W),0,1)
for ch in (R,G,B): ch += rng.normal(0,0.02,(H,W)).astype(np.float32)
R[40:90,60:140] = 0.0; G[40:90,60:140] = 0.0; B[40:90,60:140] = 0.25      # flat area
R[120:150,200:260] = 4.0                                                    # HDR highlight
Z = (xx*0.1+yy*0.05).astype(np.float32)
C = OpenEXR
COMP = dict(NO=C.NO_COMPRESSION, RLE=C.RLE_COMPRESSION, ZIPS=C.ZIPS_COMPRESSION, ZIP=C.ZIP_COMPRESSION, PIZ=C.PIZ_COMPRESSION, PXR24=C.PXR24_COMPRESSION,
            B44=C.B44_COMPRESSION, DWAA=C.DWAA_COMPRESSION)
manifest=[]
def save(name, chans, comp, expect, extra=None, note=''):
    hdr = {'compression': COMP[comp], 'type': C.scanlineimage}
    if extra: hdr.update(extra)
    with C.File(hdr, chans) as f: f.write(os.path.join(HERE, 'cases', f'{name}.exr'))
    e = np.stack(expect,-1).astype(np.float32); e.tofile(os.path.join(HERE, 'cases', f'{name}.f32'))
    manifest.append(dict(name=name, w=expect[0].shape[1], h=expect[0].shape[0], comp=comp, note=note))
def half(a): return a.astype(np.float16)
for comp in ('NO','RLE','ZIPS','ZIP','PIZ','PXR24'):
    ch = {'R':half(R),'G':half(G),'B':half(B),'A':half(A)}
    save(f'rgba_half_{comp}', ch, comp, [ch[k].astype(np.float32) for k in 'RGBA'])
for comp in ('NO','ZIP','PIZ','PXR24'):
    ch = {'R':R,'G':G,'B':B,'A':A}
    save(f'rgba_float_{comp}', ch, comp, [R,G,B,A], note='lossy24' if comp=='PXR24' else '')
ch = {'R':half(R),'G':half(G),'B':half(B)}
save('rgb_half_ZIP', ch, 'ZIP', [ch[k].astype(np.float32) for k in 'RGB']+[np.ones_like(R)])
for comp in ('ZIP','PIZ','PXR24'):                                            # Blender-like: half colour + float depth
    ch = {'R':half(R),'G':half(G),'B':half(B),'A':half(A),'Z':Z}
    save(f'mixed_half_float_{comp}', ch, comp, [ch[k].astype(np.float32) for k in 'RGBA'])
ch = {'ViewLayer.Combined.R':half(R),'ViewLayer.Combined.G':half(G),'ViewLayer.Combined.B':half(B),'ViewLayer.Combined.A':half(A),
      'ViewLayer.Depth.Z':Z,'ViewLayer.Normal.X':half(R),'ViewLayer.Normal.Y':half(G),'ViewLayer.Normal.Z':half(B)}
save('layered_ZIP', ch, 'ZIP', [ch['ViewLayer.Combined.'+k].astype(np.float32) for k in 'RGBA'], note='layer')
ch = {'Y':half(R)}
save('grey_ZIP', ch, 'ZIP', [ch['Y'].astype(np.float32)]*3+[np.ones_like(R)])
for comp in ('B44','DWAA'):
    ch = {'R':half(R),'G':half(G),'B':half(B)}
    save(f'rgb_half_{comp}', ch, comp, [ch[k].astype(np.float32) for k in 'RGB']+[np.ones_like(R)], note='unsupported')
json.dump(manifest, open(os.path.join(HERE, 'cases', 'manifest.json'),'w'), indent=1); print(len(manifest),'files')

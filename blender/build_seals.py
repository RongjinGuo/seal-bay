"""Build an original, editable seal family and export its lightweight game assets.

Run: Blender --background --python blender/build_seals.py
Blender uses Z up / -Y forward; the glTF exporter converts to Y up / +Z forward.
"""
import bpy
import math
import json
import random
import struct
import re
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils import noise

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(7193)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

SPECS = [
    dict(id='harbor-pup', name='团团', species='港海豹', age='幼崽', color='#b9afa0', base=(.53,.49,.42), pattern='spots', head=(.62,.51,.54), head_z=1.43, body=(.68,.58,1.06), eye=.145, snout=.92, description='刚开始探索海湾的小幼崽。浅褐色的绒毛上，已经长出了细碎斑点。'),
    dict(id='harbor-adult', name='芝麻', species='港海豹', age='成体', color='#867e71', base=(.36,.34,.29), pattern='spots', head=(.59,.50,.53), head_z=1.46, body=(.77,.65,1.16), eye=.132, snout=1.02, description='沉稳的海湾常客。圆脑袋与斑驳的灰褐毛色，是港海豹的标志。'),
    dict(id='harp-pup', name='糯米', species='竖琴海豹', age='白衣幼崽', color='#eee9d7', base=(.91,.88,.77), pattern='white', head=(.65,.53,.55), head_z=1.45, body=(.67,.58,1.01), eye=.154, snout=.85, description='仍穿着奶白色幼毛的白衣宝宝，脸圆圆的，最喜欢把鼻子凑近食物。'),
    dict(id='harp-adult', name='月牙', species='竖琴海豹', age='成体', color='#c1c8c5', base=(.60,.64,.62), pattern='harp', head=(.55,.50,.53), head_z=1.48, body=(.74,.62,1.16), eye=.129, snout=1.02, description='银灰色身体与深色面罩相映。背部弯曲的暗纹，让人想起一架竖琴。'),
    dict(id='grey-juvenile', name='石头', species='灰海豹', age='少年', color='#adaea9', base=(.48,.51,.50), pattern='mottle', head=(.58,.55,.52), head_z=1.46, body=(.70,.62,1.11), eye=.136, snout=1.14, description='好奇的灰海豹少年。吻部开始变长，银灰色皮毛还带着年轻的柔和感。'),
    dict(id='grey-adult', name='礁岩', species='灰海豹', age='成体', color='#6d736d', base=(.29,.32,.30), pattern='mottle', head=(.57,.61,.54), head_z=1.45, body=(.83,.71,1.22), eye=.127, snout=1.3, description='家族里最厚实的一位。修长隆起的鼻梁与深灰斑纹，勾勒出成熟灰海豹的轮廓。'),
    dict(id='ringed-adult', name='涟漪', species='环斑海豹', age='成体', color='#889a9c', base=(.32,.40,.41), pattern='rings', head=(.58,.49,.53), head_z=1.47, body=(.67,.58,1.08), eye=.141, snout=.97, description='小巧灵活的环斑海豹。深色外衣上散落着浅色环纹，像水面一圈圈涟漪。'),
    dict(id='weddell-elder', name='阿沧', species='威德尔海豹', age='长者', color='#8c9690', base=(.37,.42,.40), pattern='elder', head=(.65,.54,.54), head_z=1.44, body=(.82,.69,1.19), eye=.126, snout=1.1, description='慢悠悠的海湾长者。宽阔的脑袋、银白眉毛和斑驳腹部，藏着许多海冰的故事。'),
]

def material(name, color, roughness=.45, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat

COAT = material('Short velvet fur - vertex painted', (.55,.55,.5), .59)
attr = COAT.node_tree.nodes.new('ShaderNodeVertexColor')
attr.layer_name = 'Coat'
COAT.node_tree.links.new(attr.outputs['Color'], COAT.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
COAT.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value = .035
EYES = material('Deep brown wet eyes', (.009,.012,.011), .10)
EYES.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = .42
NOSE = material('Soft charcoal nose', (.047,.055,.05), .32)
NOSTRIL = material('Nostrils and smile', (.007,.009,.009), .60)
LIGHT = material('Eye catchlights', (.95,.99,1), .13)
LIGHT.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (.7,.9,1,1)
LIGHT.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = .22
WHISKER = material('Ivory whiskers', (.53,.52,.44), .60)
RIDGES = material('Flipper creases', (.14,.17,.15), .68)

def soft_noise(size, gx, gy, rng):
    grid=rng.random((gy+1,gx+1));grid[:,-1]=grid[:,0]
    x=np.linspace(0,gx,size,endpoint=False);y=np.linspace(0,gy,size,endpoint=False)
    xi=x.astype(int);yi=y.astype(int);xf=x-xi;yf=y-yi
    xf=xf*xf*(3-2*xf);yf=yf*yf*(3-2*yf)
    top=grid[yi[:,None],xi[None,:]]*(1-xf)+grid[yi[:,None],xi[None,:]+1]*xf
    bot=grid[yi[:,None]+1,xi[None,:]]*(1-xf)+grid[yi[:,None]+1,xi[None,:]+1]*xf
    return top*(1-yf[:,None])+bot*yf[:,None]

def coat_material(spec,index):
    size=512;rng=np.random.default_rng(7193+index)
    u,v=np.meshgrid(np.linspace(0,1,size,endpoint=False),np.linspace(0,1,size,endpoint=False))
    coarse=soft_noise(size,12,10,rng)
    fine=soft_noise(size,95,90,rng)
    micro=soft_noise(size,350,170,rng)
    base=np.array(spec['base'])**(1/2.2)
    rgb=np.ones((size,size,3))*base
    rgb*= (.94+.07*coarse+.018*fine+.013*micro)[:,:,None]
    mode=spec['pattern']
    # Scattered soft-edged ellipses create organic coat markings without polygon artifacts.
    if mode in ('spots','rings'):
        markings=np.zeros((size,size))
        for j in range(165 if mode=='spots' else 74):
            cx,cy=rng.random(2);rx=rng.uniform(.009,.024);ry=rx*rng.uniform(.70,1.6)
            dx=np.minimum(abs(u-cx),1-abs(u-cx));dy=abs(v-cy)
            d=np.sqrt((dx/rx)**2+(dy/ry)**2)+(fine-.5)*.55
            mark=np.clip((1.05-d)*6,0,1) if mode=='spots' else np.clip(1-abs(d-1)/.22,0,1)
            markings=np.maximum(markings,mark)
        if mode=='spots': rgb*=1-markings[:,:,None]*(.36 if 'pup' in spec['id'] else .48)
        else: rgb+=markings[:,:,None]*.25
    elif mode in ('mottle','elder'):
        medium=soft_noise(size,32,26,rng)
        rgb+=((coarse-.5)*.24+(medium-.5)*.20+(fine-.5)*.045)[:,:,None]
        if mode=='elder': rgb+=np.clip((medium-.6)*1.2,0,.20)[:,:,None]
    elif mode=='white':
        rgb[:,:,2]*=.97
    elif mode=='harp':
        spread=.045+.095*np.sin(np.clip((v-.23)/.66,0,1)*math.pi)
        distance=np.minimum(abs(u-(.25-spread)),abs(u-(.25+spread)))
        mark=np.clip((.042-distance)*90,0,1)*np.clip((v-.23)*18,0,1)*np.clip((.88-v)*18,0,1)
        rgb*=1-mark[:,:,None]*.68
    rgba=np.ones((size,size,4),dtype=np.float32);rgba[:,:,:3]=np.clip(rgb,0,1)
    image=bpy.data.images.new(spec['id']+' painted short fur',size,size,alpha=True)
    image.pixels.foreach_set(rgba.ravel());image.pack()
    mat=material(spec['id']+' natural coat',(1,1,1),.66)
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
    mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    # A shared fine tangent-space nap adds surface detail while staying glTF-native.
    normal=np.ones((size,size,4),dtype=np.float32)
    dv,du=np.gradient(micro)
    normal[:,:,0]=.5-du*.32;normal[:,:,1]=.5-dv*.32;normal[:,:,2]=1
    normal_image=bpy.data.images.new(spec['id']+' fine fur normal',size,size,alpha=True)
    normal_image.colorspace_settings.name='Non-Color'
    normal_image.pixels.foreach_set(normal.ravel());normal_image.pack()
    normal_tex=mat.node_tree.nodes.new('ShaderNodeTexImage');normal_tex.image=normal_image
    normal_node=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal_node.inputs['Strength'].default_value=.40
    mat.node_tree.links.new(normal_tex.outputs['Color'],normal_node.inputs['Color'])
    mat.node_tree.links.new(normal_node.outputs['Normal'],mat.node_tree.nodes['Principled BSDF'].inputs['Normal'])
    spec['material']=mat

for i,spec in enumerate(SPECS): coat_material(spec,i)

def parametric_uv(obj,cols,rows):
    uv=obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        us=[(obj.data.loops[i].vertex_index%cols)/cols for i in face.loop_indices]
        crosses=max(us)-min(us)>.5
        for loop,u in zip(face.loop_indices,us):
            vi=obj.data.loops[loop].vertex_index
            if crosses and u<.5:u+=1
            uv.data[loop].uv=(u,1-(vi//cols)/rows)

def empty(name, parent=None, location=(0,0,0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if parent:
        obj.parent = parent
    return obj

def paint(obj, spec, part='body', tint=None):
    if tint is None:
        obj.data.materials.clear();obj.data.materials.append(spec['material'])
        return
    colors = obj.data.color_attributes.new(name='Coat', type='BYTE_COLOR', domain='POINT')
    for v, target in zip(obj.data.vertices, colors.data):
        p = obj.matrix_world @ v.co
        n = noise.noise(p * 5.6 + Vector((2.6, 7.2, 1.5)))
        grain = noise.noise(p * 38 + Vector((8,3,5))) * .025
        shade = .94 + .06 * noise.noise(p * 2.7) + grain
        c = list(tint or spec['base'])
        if tint is None:
            front = max(0, min(1, (-p.y + .12) * 1.8))
            belly = front * (1 - min(1, max(0,p.z-.45))) * .15
            c = [x + belly for x in c]
            mode = spec['pattern']
            if mode == 'spots':
                mark = max(0, min(1, (n - .20) * 15))
                if part == 'head': mark *= .64
                c = [x * (1 - .58 * mark) for x in c]
            elif mode in ('mottle','elder'):
                mark = noise.noise(p * 8.8 + Vector((9,1,4)))
                c = [x + .19 * mark + .07 * n for x in c]
                if mode == 'elder':
                    silver = max(0, min(1, (n + .12) * 5)) * .15
                    c = [x + silver for x in c]
            elif mode == 'rings':
                ring = max(0, 1 - abs(n - .14) / .085)
                c = [x + ring * .30 for x in c]
            elif mode == 'harp':
                face = part == 'head' and p.z < 1.75 and p.y < -.14
                harp = part == 'body' and p.y > .17 and .17 < p.z < 1.14 and abs(p.x) > .16
                if face or harp: c = [x * .27 for x in c]
            elif mode == 'white':
                c = [x + .025 * n for x in c]
        target.color = tuple(max(.01,min(.98,x * shade)) for x in c) + (1,)

def mesh(name, verts, faces, mat, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in data.polygons: poly.use_smooth = True
    if parent: obj.parent = parent
    return obj

def ellipsoid(name, center, scale, mat, parent=None, spec=None, part='head', tint=None, segments=48, rings=32):
    verts=[]; faces=[]
    for j in range(rings+1):
        phi = math.pi * j/rings
        for i in range(segments):
            theta = 2 * math.pi * i/segments
            x = math.sin(phi)*math.cos(theta)
            y = math.sin(phi)*math.sin(theta)
            z = math.cos(phi)
            verts.append((center[0]+scale[0]*x, center[1]+scale[1]*y, center[2]+scale[2]*z))
    for j in range(rings):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    obj=mesh(name,verts,faces,mat,parent)
    parametric_uv(obj,segments,rings)
    if spec: paint(obj,spec,part,tint)
    return obj

def tube(name, points, radius, mat, parent=None):
    data=bpy.data.curves.new(name,'CURVE')
    data.dimensions='3D'; data.resolution_u=10
    data.bevel_depth=radius; data.bevel_resolution=2
    spline=data.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for i,(point,co) in enumerate(zip(spline.bezier_points,points)):
        point.co=co; point.handle_left_type='AUTO'; point.handle_right_type='AUTO'
        point.radius=1-.65*(i/(len(points)-1))
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent: obj.parent=parent
    return obj

def join_group(objects, name, parent):
    if not objects: return
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        if obj.type=='CURVE': bpy.ops.object.convert(target='MESH')
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    objects[0].name=name
    objects[0].parent=parent
    return objects[0]

def make_fin(spec, root, side, rear=False):
    if rear:
        pivot=empty('RearFlipper_'+('L' if side<0 else 'R'),root,(side*.22,.62,-.43))
        start=Vector((0,0,0)); end=Vector((side*.40,.65,-.13)); width=.25
    else:
        pivot=empty('Flipper_'+('L' if side<0 else 'R'),root,(side*.57,.01,.82))
        start=Vector((0,0,0)); end=Vector((side*.35,-.10,-.55)); width=.155
    axis=(end-start).normalized()
    across=Vector((axis.z,0,-axis.x)).normalized()
    verts=[]; faces=[]; rows=22; cols=24
    for j in range(rows+1):
        t=j/rows
        center=start.lerp(end,t)
        center.y-=math.sin(t*math.pi)*.06
        w=width*(math.sin(math.pi*(.12+t*.88))**.7)
        thick=.115*(1-t)+.026
        if j==rows: w=.012; thick=.012
        for i in range(cols):
            a=i*2*math.pi/cols
            pos=center+across*(w*math.cos(a))+Vector((0,thick*math.sin(a),0))
            verts.append(tuple(pos))
    for j in range(rows):
        for i in range(cols):
            a=j*cols+i;b=j*cols+(i+1)%cols
            faces.append((a,b,b+cols,a+cols))
    obj=mesh('Webbed flipper',verts,faces,COAT,pivot)
    parametric_uv(obj,cols,rows)
    paint(obj,spec,'flipper')
    creases=[]
    for i in (-1,0,1):
        points=[]
        for t in (.52,.70,.88):
            co=start.lerp(end,t)+across*(i*width*.22)+Vector((0,-(.115*(1-t)+.027)-.05*math.sin(t*math.pi),0))
            points.append(tuple(co))
        creases.append(tube('Soft toe crease',points,.0025,RIDGES,pivot))
    join_group(creases,'Fine flipper creases',pivot)
    return pivot

def build(spec, index):
    collection=bpy.data.collections.new(spec['id'])
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[collection.name]
    root=empty('Seal')
    root['species']=spec['species'];root['age']=spec['age'];root['name']=spec['name']
    bx,by,bz=spec['body']
    # Continuous teardrop silhouette, leaning forward at the neck.
    verts=[]; faces=[]; rows=54; cols=72
    for j in range(rows+1):
        p=math.pi*j/rows
        h=math.cos(p); z=.39+bz*h
        width=math.sin(p)*(1-.22*h)
        cy=.12+.13*(1-h)
        for i in range(cols):
            a=2*math.pi*i/cols
            verts.append((bx*width*math.cos(a),cy+by*width*math.sin(a),z))
    for j in range(rows):
        for i in range(cols):
            a=j*cols+i;b=j*cols+(i+1)%cols
            faces.append((a,b,b+cols,a+cols))
    body=mesh('Plump seamless body',verts,faces,COAT,root)
    parametric_uv(body,cols,rows);paint(body,spec,'body')
    for side in (-1,1):
        make_fin(spec,root,side);make_fin(spec,root,side,True)
    head=empty('Head',root,(0,-.12,spec['head_z']-.16))
    hx,hy,hz=spec['head']; snout=spec['snout']
    if spec['age'] in ('成体','长者'):
        hx*=1.07;hz*=.94
    skin=ellipsoid('Rounded skull and cheeks',(0,-.045,.16),(hx,hy,hz),COAT,head,spec)
    if spec['pattern']=='harp':
        # The adult's dark facial mask is a soft convex face surface.
        skin.data.materials.clear();skin.data.materials.append(COAT)
        paint(skin,spec,tint=(.16,.19,.18))
    muzzle_tint=tuple(min(.92,x*.56+.37) for x in spec['base'])
    # Deform the skull itself so the longer grey-seal nose has a seamless transition.
    faceparts=[skin]
    if spec['id'].startswith('grey'):
        for vert in skin.data.vertices:
            x,y,z=vert.co
            strength=math.exp(-(x/.31)**2-((z-.13)/.38)**2)*max(0,-y/hy)
            vert.co.y-=.10*snout*strength
    for side in (-1,1):
        faceparts.append(ellipsoid('Whisker cushion',(side*.145,-hy*.93-.028,-.055),(.22,.14*snout,.155),COAT,head,spec,tint=muzzle_tint,segments=40,rings=24))
        # Subtle eyelid bed prevents the black eye from appearing pasted on.
        ex=side*hx*.51;ey=-hy*.79;ez=.30
        lid_color=(.11,.14,.13) if spec['pattern']=='harp' else tuple(x*.79 for x in spec['base'])
        faceparts.append(ellipsoid('Soft eyelid rim',(ex,ey+.024,ez),(.163,.097,.178 if spec['age']!='长者' else .151),COAT,head,spec,tint=lid_color,segments=36,rings=24))
        eye=empty('Eye_'+('L' if side<0 else 'R'),head,(ex,ey-.017,ez))
        eyeh=spec['eye']*(.88 if spec['age']=='长者' else 1.0)
        ellipsoid('Glossy eye',(0,0,0),(spec['eye'],.093,eyeh),EYES,eye,segments=40,rings=28)
        highlights=[ellipsoid('Large soft catchlight',(-.039,-.087,.05),(.025,.008,.023),LIGHT,eye,segments=20,rings=12),
                    ellipsoid('Pinpoint catchlight',(.042,-.089,-.018),(.008,.005,.008),LIGHT,eye,segments=16,rings=10)]
        join_group(highlights,'Eye reflections',eye)
        if spec['pattern']=='elder':
            brow=ellipsoid('Silver brow',(ex,ey+.004,ez+.147),(.19,.055,.045),COAT,head,spec,tint=(.68,.70,.64),segments=32,rings=16)
            faceparts.append(brow)
    join_group(faceparts,'Velvet head and muzzle',head)
    nose_y=-hy*.93-.142*snout
    nosebits=[]
    # Paired lobes and a tapered center produce a true seal's soft triangular nose.
    nosebits.append(ellipsoid('Nose center',(0,nose_y,.052),(.103,.052,.063),NOSE,head,segments=32,rings=22))
    for side in (-1,1):
        nosebits.append(ellipsoid('Nose lobe',(side*.055,nose_y-.010,.080),(.057,.050,.041),NOSE,head,segments=24,rings=16))
    join_group(nosebits,'Soft triangular nose',head)
    darkbits=[]
    for side in (-1,1):
        nostril=ellipsoid('Breathing nostril',(side*.047,nose_y-.055,.081),(.020,.009,.036),NOSTRIL,head,segments=20,rings=14)
        darkbits.append(nostril)
    darkbits.append(tube('Philtrum',[(0,nose_y-.019,.015),(0,nose_y-.03,-.041),(0,nose_y-.036,-.102)],.006,NOSTRIL,head))
    for side in (-1,1):
        darkbits.append(tube('Gentle mouth',[(0,nose_y-.036,-.105),(side*.08,nose_y-.038,-.135),(side*.16,nose_y-.017,-.120)],.0055,NOSTRIL,head))
    join_group(darkbits,'Nostrils and mouth',head)
    jaw=empty('Jaw',head,(0,-hy*.85,-.17))
    ellipsoid('Soft chin',(0,-.045,-.003),(.225,.142,.083),COAT,jaw,spec,tint=muzzle_tint,segments=32,rings=20)
    whiskers=[]; follicles=[]
    for side in (-1,1):
        for j in range(6):
            x=side*(.145+.019*(j%2)); z=-.040-.026*(j%3)
            y=nose_y+.028
            extension=.32+.045*(j%3)
            tip_z=z+(2.4-j)*.040
            whiskers.append(tube('Tapered sensory whisker',[(x,y,z),(x+side*.19,y-.008,z+.008),(x+side*extension,y+.05,tip_z),(x+side*(extension+.075),y+.07,tip_z-.01)],.0026 if spec['age']!='长者' else .0032,WHISKER,head))
            follicles.append(ellipsoid('Whisker follicle',(x,y+.008,z),(.009,.004,.008),NOSE,head,segments=10,rings=8))
    join_group(whiskers,'Twelve tapered whiskers',head)
    join_group(follicles,'Whisker follicles',head)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(OUT/f"seal-{spec['id']}.glb"),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
    # Blender object names are globally unique; each independent GLB exposes identical pivots.
    path=OUT/f"seal-{spec['id']}.glb"
    content=path.read_bytes();json_size=struct.unpack_from('<I',content,12)[0]
    doc=json.loads(content[20:20+json_size])
    for node in doc['nodes']:
        if 'name' in node: node['name']=re.sub(r'\.\d{3}$','',node['name'])
    packed=json.dumps(doc,separators=(',',':')).encode();packed+=b' '*((-len(packed))%4)
    remainder=content[20+json_size:]
    path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(packed)+len(remainder))+struct.pack('<I4s',len(packed),b'JSON')+packed+remainder)
    return root,collection

families=[]
for index,spec in enumerate(SPECS):
    print('Building',spec['id'],flush=True)
    families.append(build(spec,index))

manifest={'seals':[{k:s[k] for k in ('id','name','species','age','description','color')} | {'file':f"/models/seal-{s['id']}.glb",'portrait':f"/models/portrait-{s['id']}.png"} for s in SPECS]}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

# A studio environment is saved with the editable source and used for visual QA.
bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=480;scene.render.resolution_y=480;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.world.color=(.15,.18,.18)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.32,.43,.43,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.view_settings.view_transform='AgX'
backdrop=material('Lagoon portrait backdrop',(.092,.17,.17),.95)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.69))
floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(backdrop)

def area(name,position,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()

area('Large warm window',(-3,-4,6),650,5,(1,.89,.72))
area('Cool sky rim',(4,1,4),850,4,(.65,.88,1))
area('Soft face fill',(1,-4,2),100,3,(.80,.94,1))
camera_data=bpy.data.cameras.new('Portrait Camera');camera=bpy.data.objects.new('Portrait Camera',camera_data);scene.collection.objects.link(camera)
camera.location=(2.5,-7.7,2.7);camera.rotation_euler=(Vector((0,-.05,.96))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=3.20;scene.camera=camera
for index,(root,col) in enumerate(families):
    for _,other in families: other.hide_render=True
    col.hide_render=False
    scene.render.filepath=str(OUT/f"portrait-{SPECS[index]['id']}.png")
    bpy.ops.render.render(write_still=True)
sheet=np.ones((960,1920,4),dtype=np.float32)
for index,spec in enumerate(SPECS):
    portrait=bpy.data.images.load(str(OUT/f"portrait-{spec['id']}.png"),check_existing=False)
    pixels=np.empty(480*480*4,dtype=np.float32);portrait.pixels.foreach_get(pixels)
    row=1-index//4;col=index%4
    sheet[row*480:(row+1)*480,col*480:(col+1)*480,:]=pixels.reshape(480,480,4)
    bpy.data.images.remove(portrait)
contact=bpy.data.images.new('Seal family contact sheet',1920,960,alpha=True)
contact.pixels.foreach_set(sheet.ravel());contact.filepath_raw=str(BASE/'blender'/'seal-family-contact-sheet.png');contact.file_format='PNG';contact.save()
bpy.data.images.remove(contact)
for root,col in families:
    col.hide_render=False
    idx=families.index((root,col))
    root.location=((idx%4-1.5)*2.55,(idx//4)*3.6,0)
camera.location=(7.8,-17,12)
camera.rotation_euler=(Vector((0,1.55,.65))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.ortho_scale=12.4
scene.render.resolution_x=1600;scene.render.resolution_y=1000
scene.cycles.samples=48
scene.render.filepath='//seal-family-preview.png'
# Keep the editable scene portable, including saved file-browser locations.
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type=='FILE_BROWSER' and space.params:
                space.params.directory=b'//'
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'blender'/'seal-family.blend'),relative_remap=False)
bpy.ops.render.render(write_still=True)
print('Finished original seal family.',flush=True)

"""Build three original otter companions without touching the seal asset family.

Run: Blender --background --python blender/build_otters.py
Geometry helpers accept game coordinates: Y up, +Z toward the viewer.
"""
import bpy
import json
import math
import re
import struct
from pathlib import Path

import numpy as np
from mathutils import Vector

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / 'public' / 'otters'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

SPECS = [
    dict(id='sea-otter-adult', name='贝贝', species='海獭', age='成体', habitat='water',
         color='#7d6248', coat=(.105,.059,.029), face=(.37,.29,.195), size=1.0,
         description='仰躺在水面上的海獭，胸前抱着一枚小贝壳。银褐色的脸颊旁，长着细细的胡须。'),
    dict(id='sea-otter-pup', name='栗子', species='海獭', age='幼崽', habitat='water',
         color='#aa8055', coat=(.20,.112,.046), face=(.46,.34,.215), size=.79,
         description='蓬松的栗色小海獭，圆圆的脸还带着幼崽的稚气。抱紧小贝壳，随海浪轻轻摇晃。'),
    dict(id='river-otter', name='豆豆', species='水獭', age='少年', habitat='beach',
         color='#785338', coat=(.115,.062,.029), face=(.145,.082,.041), size=1.0,
         description='住在岸边的好奇水獭。四只灵巧的小爪、浅色下巴和一条渐渐收细的长尾巴，让它走起路来特别轻快。'),
]


def bpoint(point):
    x, y, z = point
    return (x, -z, y)


def game_point(point):
    return (point.x, point.z, -point.y)


def material(name, color, roughness=.65):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def color_image(name, rgb, linear=True):
    if linear:
        rgb = np.where(rgb <= .0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - .055)
    height, width, _ = rgb.shape
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    image = bpy.data.images.new(name, width, height, alpha=True)
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


def noise_field(size, gx, gy, rng):
    grid = rng.random((gy + 1, gx + 1))
    grid[:, -1] = grid[:, 0]
    x = np.linspace(0, gx, size, endpoint=False)
    y = np.linspace(0, gy, size, endpoint=False)
    xi, yi = x.astype(int), y.astype(int)
    xf, yf = x - xi, y - yi
    xf, yf = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    top = grid[yi[:, None], xi[None, :]] * (1 - xf) + grid[yi[:, None], xi[None, :] + 1] * xf
    bottom = grid[yi[:, None] + 1, xi[None, :]] * (1 - xf) + grid[yi[:, None] + 1, xi[None, :] + 1] * xf
    return top * (1 - yf[:, None]) + bottom * yf[:, None]


FUR_SIZE = 256
fur_rng = np.random.default_rng(9131)
nap = noise_field(FUR_SIZE, 175, 38, fur_rng)
micro = noise_field(FUR_SIZE, 200, 165, fur_rng)
dy, dx = np.gradient(nap * .65 + micro * .35)
normal_rgb = np.ones((FUR_SIZE, FUR_SIZE, 3), dtype=np.float32)
normal_rgb[:, :, 0] = .5 - dx * .75
normal_rgb[:, :, 1] = .5 - dy * .75
FUR_NORMAL = color_image('Otter dense underfur normal', normal_rgb, linear=False)
FUR_NORMAL.colorspace_settings.name = 'Non-Color'


def fur_material(name, color, seed, plush=False):
    rng = np.random.default_rng(seed)
    coarse = noise_field(FUR_SIZE, 12, 19, rng)
    fine = noise_field(FUR_SIZE, 50, 44, rng)
    intensity = .87 + .16 * coarse + .06 * fine + .055 * nap + .025 * micro
    rgb = np.array(color)[None, None, :] * intensity[:, :, None]
    mat = material(name, (1, 1, 1), .79 if plush else .67)
    bsdf = mat.node_tree.nodes['Principled BSDF']
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = color_image(name + ' painted fur', rgb)
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    normal_tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    normal_tex.image = FUR_NORMAL
    normal = mat.node_tree.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .38 if plush else .24
    mat.node_tree.links.new(normal_tex.outputs['Color'], normal.inputs['Color'])
    mat.node_tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


EYE = material('Otter warm iris and soft corneal light', (1, 1, 1), .34)
eye_bsdf = EYE.node_tree.nodes['Principled BSDF']
eye_bsdf.inputs['Coat Weight'].default_value = 0
eye_bsdf.inputs['Coat Roughness'].default_value = .30
eye_bsdf.inputs['Specular IOR Level'].default_value = .05
ex, ey = np.meshgrid(np.linspace(-1, 1, 256), np.linspace(-1, 1, 256))
radius = np.sqrt(ex ** 2 + ey ** 2)
angle = np.arctan2(ey, ex)
pupil = np.sqrt((ex / .57) ** 2 + (ey / .62) ** 2)
blend = np.clip((pupil - .93) / .13, 0, 1)
blend = blend * blend * (3 - 2 * blend)
iris = np.array((.019,.010,.005)) + np.clip((1 - radius) * 2, 0, 1)[:, :, None] * np.array((.038,.019,.007))
iris *= (1 + .035 * np.sin(angle * 89 + radius * 14))[:, :, None]
eye_rgb = np.array((.0035,.0038,.0032)) * (1 - blend[:, :, None]) + iris * blend[:, :, None]
glint = np.exp(-2 * (((ex + .27) / .14) ** 2 + ((ey - .30) / .14) ** 2))
eye_rgb = eye_rgb * (1 - glint[:, :, None]) + np.array((.57,.63,.60)) * glint[:, :, None]
for name, rgb, socket in (
    ('Otter iris pupil and reflection', eye_rgb, 'Base Color'),
    ('Otter restrained catchlight', glint[:, :, None] * np.array((.42,.48,.45)), 'Emission Color'),
):
    tex = EYE.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = color_image(name, rgb)
    EYE.node_tree.links.new(tex.outputs['Color'], eye_bsdf.inputs[socket])
eye_bsdf.inputs['Emission Strength'].default_value = .20
NOSE = material('Otter soft charcoal nose and pads', (.028,.021,.017), .43)
CREASE = material('Otter small mouth and paw creases', (.018,.012,.009), .65)
WHISKER = material('Otter soft ivory whiskers', (.52,.44,.31), .58)
INNER_EAR = material('Otter velvet inner ears', (.10,.057,.032), .8)
SHELL = material('Warm ivory scallop shell', (.57,.38,.22), .52)
SHELL_RIDGE = material('Scallop shell growth ridges', (.43,.25,.13), .62)


def empty(name, parent=None, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = bpoint(position)
    obj.parent = parent
    return obj


def mesh(name, vertices, faces, mat, parent=None, uvs=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([bpoint(v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(mat)
    for face in data.polygons:
        face.use_smooth = True
    if uvs:
        uv = data.uv_layers.new(name='UVMap')
        for loop in data.loops:
            uv.data[loop.index].uv = uvs[loop.vertex_index]
    return obj


def ellipsoid(name, center, scale, mat, parent, deform=None, cols=48, rows=32):
    vertices, faces, uvs = [], [], []
    for j in range(rows + 1):
        phi = math.pi * j / rows
        for i in range(cols + 1):
            theta = 2 * math.pi * i / cols
            unit = (math.sin(phi) * math.cos(theta), math.cos(phi), math.sin(phi) * math.sin(theta))
            point = tuple(center[k] + scale[k] * unit[k] for k in range(3))
            vertices.append(deform(point) if deform else point)
            uvs.append((i / cols, 1 - j / rows))
    for j in range(rows):
        for i in range(cols):
            a = j * (cols + 1) + i
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    return mesh(name, vertices, faces, mat, parent, uvs)


def tube(name, points, radius, mat, parent, taper=.85):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 5
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for i, (point, co) in enumerate(zip(spline.bezier_points, points)):
        point.co = bpoint(co)
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
        point.radius = 1 - taper * i / (len(points) - 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    curve.materials.append(mat)
    return obj


def join_group(objects, name, parent):
    if not objects:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if obj.type == 'CURVE':
            bpy.ops.object.convert(target='MESH')
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    objects[0].parent = parent
    return objects[0]


def sweep(name, controls, widths, depths, mat, parent, rows=30, cols=24):
    controls = [Vector(p) for p in controls]
    vertices, faces, uvs = [], [], []
    for j in range(rows + 1):
        t = j / rows
        center = (1-t)**3 * controls[0] + 3*(1-t)**2*t*controls[1] + 3*(1-t)*t*t*controls[2] + t**3*controls[3]
        tangent = 3*(1-t)**2*(controls[1]-controls[0]) + 6*(1-t)*t*(controls[2]-controls[1]) + 3*t*t*(controls[3]-controls[2])
        tangent.normalize()
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < .1:
            across = tangent.cross(Vector((0, 0, 1)))
        across.normalize()
        above = across.cross(tangent).normalized()
        width = widths[0] * (1-t) + widths[1] * t
        depth = depths[0] * (1-t) + depths[1] * t
        for i in range(cols + 1):
            a = i * 2 * math.pi / cols
            p = center + across * math.cos(a) * width + above * math.sin(a) * depth
            vertices.append(tuple(p))
            uvs.append((i / cols, t))
    for j in range(rows):
        for i in range(cols):
            a = j * (cols+1) + i
            faces.append((a, a+cols+1, a+cols+2, a+1))
    faces.append(tuple(range(cols, -1, -1)))
    faces.append(tuple(rows*(cols+1)+i for i in range(cols+1)))
    return mesh(name, vertices, faces, mat, parent, uvs)


def eye_surface(parent, width, height, surface):
    vertices, faces, uvs = [], [], []
    rows, cols = 16, 40
    for j in range(rows+1):
        radial = math.sin(math.pi*j/rows)
        for i in range(cols+1):
            angle = 2*math.pi*i/cols
            x, y = width*radial*math.cos(angle), height*radial*math.sin(angle)
            vertices.append((x, y, surface(x, y)+.011*math.cos(math.pi*j/rows)-.002))
            uvs.append((.5+x/(2*width), .5+y/(2*height)))
    for j in range(rows):
        for i in range(cols):
            a = j*(cols+1)+i
            faces.append((a, a+cols+1, a+cols+2, a+1))
    return mesh('Small recessed corneal eye', vertices, faces, EYE, parent, uvs)


def make_head(spec, root, coat, face):
    sea = spec['habitat'] == 'water'
    pup = spec['age'] == '幼崽'
    pivot_pos = (0,.035,-.98*spec['size']) if sea else (0,.51,.79)
    head = empty('Head', root, pivot_pos)
    if sea:
        head.rotation_euler.x = -.82
    hx, hy, hz = (.445,.375,.36) if pup else ((.43,.35,.345) if sea else (.355,.285,.34))
    cy = .28 if sea else .20
    eye_y = cy+.075
    eye_x = hx*.46
    eye_width = .073 if sea else .061
    eye_height = eye_width*(1.04 if pup else .95)

    def sculpt(point):
        x, y, z = point
        forward = max(0, z/hz)
        muzzle = math.exp(-(x/(hx*.70))**4-((y-(cy-.13))/.17)**2)
        z += (.115 if sea else .14)*muzzle*forward
        cheeks = math.exp(-((abs(x)-hx*.53)/.16)**2-((y-cy+.10)/.19)**2)
        z += .022*cheeks*forward
        orbit = ((abs(x)-eye_x)/(eye_width*1.25))**2+((y-eye_y)/(eye_height*1.25))**2
        z -= .009*max(0,1-orbit)**1.2*forward
        return (x, y, z)

    skin = ellipsoid('Continuous furry skull and muzzle', (0,cy,0), (hx,hy,hz), face, head, sculpt, cols=64, rows=40)
    bpy.context.view_layer.update()

    def surface(x, y):
        hit, point, _, _ = skin.ray_cast(Vector(bpoint((x,y,2))), Vector(bpoint((0,0,-1))))
        return -point.y if hit else hz*.75

    parts = [skin]
    muzzle_mat = fur_material(spec['id']+' soft muzzle', tuple(min(.65, c*1.08+.025) for c in (spec['face'] if sea else (.32,.235,.145))), 880, pup)
    # A conformal nap patch lightens the whisker muzzle without a separate ball shape.
    vertices, faces, uvs = [(0,cy-.14,surface(0,cy-.14)+.0015)], [], [(.5,.5)]
    cols, rows = 48, 10
    for j in range(1, rows+1):
        radius = j/rows
        for i in range(cols):
            a = i*2*math.pi/cols
            x = hx*.68*radius*math.cos(a)
            y = cy-.14+.125*radius*math.sin(a)
            vertices.append((x,y,surface(x,y)+.0015))
            uvs.append((.5+.5*radius*math.cos(a),.5+.5*radius*math.sin(a)))
    for i in range(cols):
        faces.append((0,1+i,1+(i+1)%cols))
    for j in range(rows-1):
        for i in range(cols):
            a=1+j*cols+i; b=1+j*cols+(i+1)%cols
            faces.append((a,b,b+cols,a+cols))
    parts.append(mesh('Soft continuous whisker muzzle',vertices,faces,muzzle_mat,head,uvs))
    for side in (-1,1):
        x = side*eye_x
        z = surface(x,eye_y)
        eye = empty('Eye_'+('L' if side<0 else 'R'),head,(x,eye_y,z))
        eye_surface(eye,eye_width,eye_height,lambda dx,dy:surface(x+dx,eye_y+dy)-z)
        for upper in (True,False):
            points=[]
            for j in range(17):
                a=math.pi*j/16+(0 if upper else math.pi)
                dx=eye_width*math.cos(a);dy=eye_height*math.sin(a)
                points.append((x+dx,eye_y+dy,surface(x+dx,eye_y+dy)+.001))
            parts.append(tube('Soft furry eyelid' if upper else 'Fine tearline',points,.004 if upper else .002,face if upper else NOSE,head,taper=0))
        ear_x = side*hx*.87
        ear_y = cy+hy*.43
        parts.append(ellipsoid('Small rounded furry ear',(ear_x,ear_y,-.060),(.080,.094,.065),face if sea else coat,head,cols=28,rows=20))
        parts.append(ellipsoid('Recessed velvet ear cup',(ear_x,ear_y,.001),(.046,.057,.010),INNER_EAR,head,cols=20,rows=14))
    nose_y = cy-.098
    nose_z = surface(0,nose_y)+.025

    def nose_shape(point):
        x,y,z=point
        return (x*(.75+.25*max(0,(y-nose_y)/.045)),y,z)

    parts.append(ellipsoid('Broad soft otter nose',(0,nose_y,nose_z),(.108 if sea else .086,.058,.045),NOSE,head,nose_shape,cols=36,rows=24))
    for side in (-1,1):
        parts.append(ellipsoid('Tiny nostril',(side*.047,nose_y+.004,nose_z+.039),(.018,.009,.004),CREASE,head,cols=16,rows=10))
    mouth_y=cy-.194
    points=[(0,nose_y-.035,surface(0,nose_y-.035)+.015),(0,mouth_y,surface(0,mouth_y)+.007)]
    parts.append(tube('Otter short philtrum',points,.0035,CREASE,head,taper=0))
    for side in (-1,1):
        points=[(0,mouth_y,surface(0,mouth_y)+.007),(side*.060,mouth_y-.014,surface(side*.06,mouth_y-.014)+.007),(side*.115,mouth_y+.008,surface(side*.115,mouth_y+.008)+.007)]
        parts.append(tube('Little curved mouth',points,.003,CREASE,head,taper=.3))
        for j in range(9):
            row,col=divmod(j,3)
            x=side*(.087+.039*col);y=cy-.115-row*.034
            z=surface(x,y)+.009
            end_y=y+(.9-row)*.055+(1-col)*.025
            parts.append(tube('Tapered sensory whisker',[(x,y,z),(x+side*.08,y+.01,z+.016),(x+side*(.18+col*.035),end_y,z+.02),(x+side*(.25+col*.028),end_y+.015,z-.01)],.0018 if sea else .0015,WHISKER,head,taper=.95))
    join_group(parts,'Furry face ears and sensory whiskers',head)
    return head


def make_paw(root, name, shoulder, controls, end, coat, sea=False, hind=False):
    pivot=empty(name,root,shoulder)
    local=lambda p:tuple(p[k]-shoulder[k] for k in range(3))
    radius=.14 if hind else .11
    parts=[sweep('Smooth tapered otter limb',[local(p) for p in controls],(radius,.075 if not hind else .105),(radius,.062 if not hind else .08),coat,pivot)]
    if sea and hind:
        scale=(.205,.075,.28)
        parts.append(ellipsoid('Broad webbed hind paw',local(end),scale,coat,pivot,cols=36,rows=24))
        for j in range(5):
            toe=(end[0]+(j-2)*.073,end[1]+.005,end[2]+.17+.048*math.sin(j*.65))
            parts.append(ellipsoid('Five rounded hind toes',local(toe),(.045,.067,.105),coat,pivot,cols=20,rows=12))
            if j<4:
                x=toe[0]+.037
                parts.append(tube('Hind toe crease',[local((x,end[1]+.073,end[2]+.08)),local((x,end[1]+.067,end[2]+.24))],.0025,CREASE,pivot,taper=.5))
    elif sea:
        parts.append(ellipsoid('Curled furry forepaw',local(end),(.107,.073,.123),coat,pivot,cols=36,rows=24))
        side=-1 if end[0]<0 else 1
        for j in range(5):
            z=end[2]-.070+j*.035
            points=[local((end[0],end[1]+.049,z)),local((end[0]-side*.07,end[1]+.06,z+.01)),local((end[0]-side*.09,end[1]+.025,z+.019))]
            parts.append(tube('Five gently curled fingers',points,.022,coat,pivot,taper=.26))
    else:
        parts.append(ellipsoid('Grounded furry paw',local(end),(.122,.055,.173),coat,pivot,cols=32,rows=24))
        for j in range(5):
            toe=(end[0]+(j-2)*.044,.043,end[2]+.115+.018*math.cos((j-2)*.6))
            parts.append(ellipsoid('Five little walking toes',local(toe),(.028,.040,.073),coat,pivot,cols=20,rows=14))
    join_group(parts,name+' furry limb and five toes',pivot)
    return pivot


def make_shell(root, size):
    pivot=empty('Shell',root,(0,.424*size,-.25*size))
    vertices,faces,uvs=[],[],[]
    rows,cols=20,40
    for layer in (0,1):
        for j in range(rows+1):
            r=j/rows
            for i in range(cols+1):
                angle=-1.25+i/cols*2.5
                edge=1+.025*math.cos(angle*12)
                x=.285*r*math.sin(angle)*edge*size
                z=(.31*r*math.cos(angle)-.09)*size
                y=(.045*math.sin(math.pi*r)+.006*math.cos(angle*12)*r)*size
                y+=.008 if layer==0 else -.008
                vertices.append((x,y,z));uvs.append((i/cols,r))
    layer_size=(rows+1)*(cols+1)
    for layer in (0,1):
        for j in range(rows):
            for i in range(cols):
                a=layer*layer_size+j*(cols+1)+i
                face=(a,a+1,a+cols+2,a+cols+1)
                faces.append(tuple(reversed(face)) if layer==0 else face)
    shell=mesh('Scallop fan with sculpted radial ribs',vertices,faces,SHELL,pivot,uvs)
    parts=[shell]
    for i in range(13):
        a=-1.2+i*.2
        points=[]
        for r in (.18,.42,.72,.98):
            points.append((.285*r*math.sin(a)*size,(.045*math.sin(math.pi*r)+.014)*size,(.31*r*math.cos(a)-.09)*size))
        parts.append(tube('Fine scallop ridge',points,.0025*size,SHELL_RIDGE,pivot,taper=.4))
    join_group(parts,'Held scallop shell',pivot)
    return pivot


def build(spec,index):
    collection=bpy.data.collections.new(spec['id'])
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[collection.name]
    root=empty('Otter')
    for key in ('id','name','species','age','habitat'):
        root[key]=spec[key]
    sea=spec['habitat']=='water'; size=spec['size']; pup=spec['age']=='幼崽'
    coat=fur_material(spec['id']+' dense body fur',spec['coat'],9132+index,pup)
    face=fur_material(spec['id']+' facial fur',spec['face'],9150+index,pup)
    body=empty('Body',root,(0,0 if sea else .40,-.03 if sea else -.12))
    if sea:
        def sculpt_body(p):
            x,y,z=p
            neck=1-.15*max(0,-z/(.96*size))
            return (x*neck,y+.025*math.cos(z*2),z)
        ellipsoid('Continuous sea otter torso',(0,0,0),(.46*size,.355*size,1.05*size),coat,body,sculpt_body,cols=56,rows=40)
        for side in (-1,1):
            shoulder=(side*.36*size,.15*size,-.57*size)
            end=(side*.205*size,.425*size,-.19*size)
            controls=[shoulder,(side*.48*size,.27*size,-.45*size),(side*.30*size,.39*size,-.25*size),end]
            make_paw(root,'Forepaw_'+('L' if side<0 else 'R'),shoulder,controls,end,coat,sea=True)
            hip=(side*.25*size,-.06*size,.70*size)
            end=(side*.38*size,.035*size,1.17*size)
            controls=[hip,(side*.32*size,-.015*size,.86*size),(side*.36*size,.02*size,1.04*size),end]
            make_paw(root,'Hindpaw_'+('L' if side<0 else 'R'),hip,controls,end,coat,sea=True,hind=True)
        tail=empty('Tail',root,(0,-.14*size,.80*size))
        sweep('Short tapered sea otter tail',[(0,0,0),(.03,-.005,.24*size),(.08,.015,.51*size),(.13,.035,.67*size)],(.13*size,.009),(.085*size,.006),coat,tail,cols=28)
        make_shell(root,size)
    else:
        def sculpt_body(p):
            x,y,z=p
            taper=1-.12*max(0,z/.96)
            return (x*taper,y+.045*math.cos((z+.15)*1.9),z)
        ellipsoid('Long smooth river otter torso',(0,0,0),(.355,.315,.94),coat,body,sculpt_body,cols=56,rows=40)
        for side in (-1,1):
            for hind in (False,True):
                z=-.68 if hind else .52
                shoulder=(side*(.275 if hind else .25),.38,z)
                end=(side*(.34 if hind else .29),.055,z+.045)
                controls=[shoulder,(side*.36,.28,z-.06),(side*.32,.14,z+.01),end]
                make_paw(root,('Hindpaw_' if hind else 'Forepaw_')+('L' if side<0 else 'R'),shoulder,controls,end,coat,hind=hind)
        tail=empty('Tail',root,(0,.34,-.91))
        sweep('Long muscular tapered river tail',[(0,0,0),(.05,-.045,-.38),(.20,-.24,-.94),(.27,-.29,-1.38)],(.195,.010),(.16,.007),coat,tail,rows=38,cols=28)
    make_head(spec,root,coat,face)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    path=OUT/(spec['id']+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
    content=path.read_bytes();length=struct.unpack_from('<I',content,12)[0]
    doc=json.loads(content[20:20+length])
    for node in doc['nodes']:
        if 'name' in node:
            node['name']=re.sub(r'\.\d{3}$','',node['name'])
    packed=json.dumps(doc,separators=(',',':')).encode();packed+=b' '*((-len(packed))%4)
    remainder=content[20+length:]
    path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(packed)+len(remainder))+struct.pack('<I4s',len(packed),b'JSON')+packed+remainder)
    required=['Body','Head','Eye_L','Eye_R','Forepaw_L','Forepaw_R','Hindpaw_L','Hindpaw_R','Tail']+(['Shell'] if sea else [])
    nodes={node.get('name'):node for node in doc['nodes']}
    assert set(required).issubset(nodes)
    assert not doc.get('skins') and all('bufferView' in image for image in doc.get('images',[]))
    points=np.array([game_point(obj.matrix_world@v.co) for obj in collection.objects if obj.type=='MESH' for v in obj.data.vertices])
    report=dict(id=spec['id'],bytes=path.stat().st_size,drawCalls=sum(len(m['primitives']) for m in doc['meshes']),
                bounds=dict(min=points.min(axis=0).tolist(),max=points.max(axis=0).tolist()),
                requiredPivots=required,embeddedTextures=len(doc.get('images',[])),
                pivots={name:{key:nodes[name][key] for key in ('translation','rotation','scale') if key in nodes[name]} for name in required})
    print('EXPORTED '+json.dumps(report),flush=True)
    return root,collection,report


families=[]
for index,spec in enumerate(SPECS):
    print('Building '+spec['id'],flush=True)
    families.append(build(spec,index))
manifest={'otters':[{key:spec[key] for key in ('id','name','species','age','description','color','habitat')} | {'file':'/otters/'+spec['id']+'.glb','portrait':'/otters/portrait-'+spec['id']+'.png'} for spec in SPECS]}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(BASE/'blender'/'otter-asset-verification.json').write_text(json.dumps([item[2] for item in families],indent=2)+'\n')

bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=40
scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.40,.48,.45,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.view_settings.view_transform='AgX'
backdrop=material('Otter studio lagoon',(.11,.205,.19),.95)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.39))
floor=bpy.context.object;floor.name='Otter studio floor';floor.data.materials.append(backdrop)


def area(name,position,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=bpoint(position)
    obj.rotation_euler=(Vector(bpoint((0,.1,0)))-obj.location).to_track_quat('-Z','Y').to_euler()


area('Otter warm window',(-3,6,4),600,5,(1,.9,.77))
area('Otter cool sky rim',(4,4,-2),650,4,(.72,.91,1))
area('Otter soft face fill',(0,3,5),130,3,(1,.96,.88))
camera_data=bpy.data.cameras.new('Otter Portrait Camera')
camera=bpy.data.objects.new('Otter Portrait Camera',camera_data)
scene.collection.objects.link(camera);scene.camera=camera
camera_data.type='ORTHO'


def aim_camera(position,target,scale):
    camera.location=bpoint(position)
    camera.rotation_euler=(Vector(bpoint(target))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.ortho_scale=scale


for index,(root,col,_) in enumerate(families):
    for _,other,_ in families:
        other.hide_render=True
    col.hide_render=False
    river=SPECS[index]['habitat']=='beach'
    floor.location.z=-.004 if river else -.39
    aim_camera((3.1,3.2,5.5) if river else (2.3,5.6,4.1),(0,.40,-.35) if river else (0,.10,-.08),3.35 if river else 3.55)
    scene.render.filepath=str(OUT/('portrait-'+SPECS[index]['id']+'.png'))
    bpy.ops.render.render(write_still=True)
sheet=np.ones((640,1920,4),dtype=np.float32)
for index,spec in enumerate(SPECS):
    portrait=bpy.data.images.load(str(OUT/('portrait-'+spec['id']+'.png')),check_existing=False)
    pixels=np.empty(640*640*4,dtype=np.float32);portrait.pixels.foreach_get(pixels)
    sheet[:,index*640:(index+1)*640,:]=pixels.reshape(640,640,4)
    bpy.data.images.remove(portrait)
contact=bpy.data.images.new('Otter family contact sheet',1920,640,alpha=True)
contact.pixels.foreach_set(sheet.ravel());contact.filepath_raw=str(BASE/'blender'/'otter-family-contact-sheet.png');contact.file_format='PNG';contact.save()
bpy.data.images.remove(contact)
for index,(root,col,_) in enumerate(families):
    col.hide_render=False
    root.location=bpoint(((index-1)*2.4,.38 if index<2 else 0,0))
floor.location.z=-.01
aim_camera((5.8,8,10),(0,.30,-.15),8.6)
scene.render.resolution_x=1500;scene.render.resolution_y=900
scene.render.filepath='//otter-family-preview.png'
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type=='FILE_BROWSER' and space.params:
                space.params.directory=b'//'
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'blender'/'otter-family.blend'),relative_remap=False)
bpy.ops.render.render(write_still=True)
print('Finished original otter companions.',flush=True)

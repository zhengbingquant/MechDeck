import * as THREE from 'three';
import type { V3 } from '../../../core/builder';
import type { Vf1Builder as Builder } from '../materials';
import { D } from '../dims';
import { GUN_AXIS_Z } from './gunpod';
import { bladeDisc, gear, lathe, move, rot } from '../../../core/geometry/shapes';
import { ANKLE_TO_AXIS_Z, SHIN_AXIS_Z } from './legs';
import { AIRBRAKE, INTAKE, NOZZLE } from '../surfaces';
import { BELLOWS } from '../airpath';
import { WING_ARM_HINGE, WING_ARM_PICKUPS } from '../poses';

/** A hydraulic ram between two bones; re-aimed every frame by the controller. */
export interface Piston {
  partId: string;
  a: THREE.Object3D;
  b: THREE.Object3D;
  barrel: THREE.Mesh;
  rod: THREE.Mesh;
  /** Intermediate tubes of a multi-stage telescopic ram, barrel side first (empty for a plain ram). */
  stages: THREE.Mesh[];
  /** Section length: every tube of a multi-stage ram is this long. */
  length: number;
  /** A rigid link (swing arm): its pivots stay exactly \`length\` apart. */
  rigid?: boolean;
}

const L = D.leg;

function anchor(b: Builder, boneId: string, pos: V3): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(...pos);
  b.bone(boneId).add(o);
  return o;
}

/**
 * Cylinder + chrome rod. Geometry points along +Y from its origin so the
 * controller only has to place and orient it.
 */
export function piston(
  b: Builder,
  partId: string,
  boneA: string,
  posA: V3,
  boneB: string,
  posB: V3,
  length: number,
  radius: number,
  o: { stages?: number; always?: boolean } = {},
): Piston {
  const sys = 'actuators' as const;
  const n = o.stages ?? 2;
  const tube = (r: number) => move(new THREE.CylinderGeometry(r, r, length, 12), 0, length / 2, 0);
  // Rams that show outside the armour are finished like real hardware (dark barrel, chrome rod);
  // hidden ones keep the actuator system's colour for the cutaway.
  const barrel = b.int(partId, 'torso', tube(radius), sys, o.always ? b.mats.casing : undefined, { always: o.always });
  // Multi-stage: each tube nests in the one behind it, down to the rod.
  const stages = Array.from({ length: n - 2 }, (_, i) => b.int(partId, 'torso', tube(radius * (1 - (0.5 * (i + 1)) / (n - 1))), sys, b.mats.casing, { always: o.always }));
  const rod = b.int(partId, 'torso', tube(radius * 0.5), sys, b.mats.chrome, { always: o.always });
  return { partId, a: anchor(b, boneA, posA), b: anchor(b, boneB, posB), barrel, rod, stages, length };
}

/**
 * A rigid link between pivots on two bones (a swing arm), re-aimed every frame like the rams: the
 * beam runs from the first pivot, and a clevis sits on the second (the rod slot).
 */
export function link(b: Builder, partId: string, boneA: string, posA: V3, boneB: string, posB: V3, len: number, radius: number): Piston {
  const beam = b.int(partId, 'torso', move(new THREE.CylinderGeometry(radius, radius, len, 12), 0, len / 2, 0), 'actuators', b.mats.casing, { always: true });
  const clevis = b.int(partId, 'torso', move(new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, 0.16, 12), 0, 0.08, 0), 'actuators', b.mats.chrome, { always: true });
  return { partId, a: anchor(b, boneA, posA), b: anchor(b, boneB, posB), barrel: beam, rod: clevis, stages: [], length: len, rigid: true };
}

/** A rotating group on a bone; the controller spins every group tagged with a rate (N1 fan / N2 core). */
function spinner(b: Builder, boneId: string, name: string, pos: V3, rate: number): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pos);
  g.userData.spin = rate;
  b.bone(boneId).add(g);
  return g;
}

/**
 * Joint gear set, visible in cutaway: a gear fixed to the moving (child) bone on
 * the hinge axis, and a pinion on the parent bone that the controller turns
 * with the joint angle times the gear ratio, so the two visibly mesh.
 */
export function gearset(
  b: Builder,
  partId: string,
  child: string,
  parent: string,
  hinge: V3,
  axis: 'x' | 'y' | 'z',
  sides: number[],
  gearR: number,
  pinionR: number,
  pinionDir: V3,
) {
  const sys = 'actuators' as const;
  const turn = (g: THREE.BufferGeometry) => (axis === 'x' ? rot(g, 0, 90, 0) : axis === 'y' ? rot(g, 90, 0, 0) : g);
  const teeth = Math.round(gearR * 140);
  const pTeeth = Math.max(8, Math.round(pinionR * 140));
  const d = gearR + pinionR - Math.min(gearR, pinionR) * 0.18;
  for (const off of sides) {
    const at: V3 = axis === 'x' ? [off, 0, 0] : axis === 'y' ? [0, off, 0] : [0, 0, off];
    b.int(partId, child, turn(gear(gearR, teeth, 0.05, gearR * 0.12, gearR * 0.35)), sys, b.mats.chrome, { pos: at });
    const p = b.int(partId, parent, turn(gear(pinionR, pTeeth, 0.06, pinionR * 0.25, pinionR * 0.3)), sys, b.mats.casing, {
      pos: [hinge[0] + at[0] + pinionDir[0] * d, hinge[1] + at[1] + pinionDir[1] * d, hinge[2] + at[2] + pinionDir[2] * d],
    });
    p.userData.gearFollow = { bone: child, axis, ratio: -gearR / pinionR };
  }
}

export function buildInternals(b: Builder): Piston[] {
  const m = b.mats;
  const pistons: Piston[] = [];

  for (const side of ['port', 'starboard'] as const) {
    const S = side === 'port' ? 'L' : 'R';
    const s = side === 'port' ? 1 : -1;

    /*
     * FF-2001 engine. Intake: inlet guide vanes, a two-stage fan on the N1 spool and
     * a spinner cone, deep in the box at the end of the inlet's diffuser. The first stage and
     * the guide vanes are seen through the open intake mouth, so they stay visible outside the
     * cutaway.
     */
    const legs = `legSlide${S}`;
    const fanY = INTAKE.fanY;
    for (let i = 0; i < 12; i++) {
      b.int(`fan-${side}`, legs, rot(move(new THREE.BoxGeometry(0.3, 0.05, 0.012), 0.3, 0, 0), 0, (i / 12) * 360 + 15, 0), 'engines', m.casing, { pos: [0, INTAKE.igvY, 0], always: true });
    }
    // The vanes stand between a fixed nose-bearing hub and a shroud ring on the duct's lip.
    b.int(`fan-${side}`, legs, new THREE.CylinderGeometry(0.17, 0.17, 0.1, 16), 'engines', m.casing, { pos: [0, INTAKE.igvY, 0], always: true });
    b.int(`fan-${side}`, legs, rot(new THREE.TorusGeometry(0.46, 0.035, 8, 32), 90, 0, 0), 'engines', m.casing, { pos: [0, INTAKE.igvY, 0], always: true });
    const n1 = spinner(b, legs, `fanSpin${S}`, [0, fanY, 0], 1);
    n1.add(b.int(`fan-${side}`, legs, bladeDisc(0.46, 0.14, 18, 0.1), 'engines', m.casing, { always: true }));
    n1.add(b.int(`fan-${side}`, legs, move(bladeDisc(0.42, 0.15, 22, 0.08, -34), 0, -0.2, 0), 'engines'));
    n1.add(b.int(`fan-${side}`, legs, lathe([[0.14, 0], [0.12, 0.06], [0.07, 0.12], [0.001, 0.16]], 14), 'engines', m.chrome, { always: true }));
    // Air duct, unbroken from the fan to the compressor: down the intake to a ball swivel on the
    // hip-swing pivot (the pivot lies on the duct's axis), along the thigh, then a bellows that
    // bends about the knee hinge (posed by the controller) into the shin's inlet cone.
    const duct = `intake-duct-${side}`;
    const R = BELLOWS.ductRadius;
    b.int(duct, legs, lathe([[0.47, INTAKE.frameY + 0.01], [0.45, INTAKE.fanY - 0.3], [0.38, 0.6], [R, 0.0], [R, -L.thighPivot + 0.02]], 16), 'engines', m.sys.engines, { edges: false });
    // Intake ramp rams, in the bay between the upper wall and the ramps.
    pistons.push(piston(b, `ramp-actuator-${side}`, legs, [0, 2.06, -0.54], `ramp1${S}`, [0, -0.22, -0.04], 0.14, 0.03, { always: true }));
    pistons.push(piston(b, `ramp-actuator-${side}`, legs, [0, 1.44, -0.54], `ramp2${S}`, [0, 0.2, -0.04], 0.14, 0.03, { always: true }));
    b.int(duct, `thighSwing${S}`, new THREE.SphereGeometry(R + 0.015, 20, 14), 'engines', m.casing);
    // (the stretch below the thigh casing, the bellows and the shin's inlet show outside the
    // cutaway: the air visibly runs round the folded knee into the engine)
    b.int(duct, `thighSwing${S}`, move(new THREE.CylinderGeometry(R, R, L.thighLen - L.thighPivot - 0.04, 16, 1, true), 0, -(L.thighLen - L.thighPivot) / 2 - 0.02, 0), 'engines', m.casing, { edges: false, always: true });
    b.int(duct, `knee${S}`, lathe([[R + 0.008, 0.04], [R + 0.008, 0], [0.42, -0.44]], 16), 'engines', m.casing, { pos: [0, 0, SHIN_AXIS_Z], edges: false, always: true });
    for (let i = 0; i < BELLOWS.segments; i++) {
      const sleeve = b.int(`duct-bellows-${side}`, `thighExt${S}`, new THREE.CylinderGeometry(R, R, 1, 16, 1, true), 'engines', m.casing, { edges: false, always: true });
      sleeve.userData.bellows = { S, i, ring: false };
      const ring = b.int(`duct-bellows-${side}`, `thighExt${S}`, rot(new THREE.TorusGeometry(R + 0.012, 0.022, 6, 20), 90, 0, 0), 'engines', m.chrome, { edges: false, always: true });
      ring.userData.bellows = { S, i, ring: true };
    }

    // Core (shin): 5-stage compressor and 3-stage turbine on the N2 spool, the reaction chamber between them.
    const knee = `knee${S}`;
    const n2 = spinner(b, knee, `coreSpin${S}`, [0, 0, SHIN_AXIS_Z], 1.6);
    const compressor: [number, number][] = [[-0.5, 0.36], [-0.7, 0.42], [-0.9, 0.45], [-1.1, 0.46], [-1.3, 0.46]];
    compressor.forEach(([y, r], i) => {
      n2.add(b.int(`compressor-${side}`, knee, move(bladeDisc(r, 0.17 + i * 0.015, 22 + i * 3, 0.07, 30), 0, y, 0), 'engines'));
    });
    const turbine: [number, number][] = [[-2.75, 0.48], [-3.0, 0.47], [-3.25, 0.45]];
    turbine.forEach(([y, r]) => {
      n2.add(b.int(`turbine-${side}`, knee, move(bladeDisc(r, 0.2, 28, 0.09, -38), 0, y, 0), 'engines', m.glowHot));
    });
    n2.add(b.int(`turbine-${side}`, knee, move(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 10), 0, -1.9, 0), 'engines', m.chrome));
    // Thermonuclear reaction chamber: fusion-heated annulus instead of a combustor (glows with throttle).
    for (const y of [-1.75, -2.0, -2.25]) {
      b.int(`reaction-chamber-${side}`, knee, rot(new THREE.TorusGeometry(0.36, 0.08, 10, 28), 90, 0, 0), 'engines', m.glowHot, { pos: [0, y, SHIN_AXIS_Z] });
    }
    b.int(`reaction-chamber-${side}`, knee, move(new THREE.CylinderGeometry(0.17, 0.17, 0.72, 18, 1, true), 0, -2.0, 0), 'engines', m.glowCore, { pos: [0, 0, SHIN_AXIS_Z] });
    // Exhaust duct: from the turbine casing down to the ankle's ball joint, easing back onto the
    // nozzle axis at the bottom of the shin, so the hot stream runs unbroken into the nozzle.
    {
      const top = new THREE.Vector3(0, -3.34, SHIN_AXIS_Z);
      const bot = new THREE.Vector3(0, -L.shinLen + 0.1, L.ankleBack);
      const len = top.distanceTo(bot);
      const pipe = b.int(`exhaust-duct-${side}`, knee, new THREE.CylinderGeometry(0.5, 0.29, len, 18, 1, true).translate(0, -len / 2, 0), 'engines', m.casing);
      pipe.position.copy(top);
      pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), bot.clone().sub(top).normalize());
      pipe.updateMatrix();
    }
    // Open casing: rings and three rails, so the spinning stages show in cutaway.
    for (const [y, r] of [[-0.42, 0.5], [-1.45, 0.52], [-2.5, 0.53], [-3.4, 0.52]] as const) {
      b.int(`turbine-${side}`, knee, rot(new THREE.TorusGeometry(r, 0.035, 8, 32), 90, 0, 0), 'engines', m.casing, { pos: [0, y, SHIN_AXIS_Z] });
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      b.int(`turbine-${side}`, knee, new THREE.BoxGeometry(0.04, 3.0, 0.04), 'engines', m.casing, { pos: [Math.cos(a) * 0.52, -1.9, SHIN_AXIS_Z + Math.sin(a) * 0.52] });
    }

    /* joint gear sets (the pinion turns with the joint) */
    gearset(b, `knee-gearbox-${side}`, knee, `thighExt${S}`, [0, 0, L.kneeFront], 'x', [0.3, -0.3], 0.15, 0.06, [0, 1, 0]);
    // Ankle pitch drive on the gimbal's trunnions, outboard of the ball.
    gearset(b, `ankle-gearbox-${side}`, `ankle${S}`, `shinExt${S}`, [0, 0, 0], 'x', [0.53, -0.53], 0.14, 0.06, [0, 1, 0]);
    gearset(b, `elbow-gearbox-${side}`, `elbow${S}`, `upperArm${S}`, [0, -D.arm.upperLen, 0], 'x', [0.2, -0.2], 0.12, 0.05, [0, 1, 0]);
    gearset(b, `wing-pivot-drive-${side}`, `wing${S}`, `wingRoot${S}`, [0, 0, 0], 'z', [0], 0.26, 0.08, [-s, 0, 0]);

    /* split nozzle internals: the round gimbal duct flares into the rectangular convergent
       section, whose petals squeeze the flow into the throat slot at the body end (the toe and
       heel flaps outside are the divergent section) */
    const F = L.foot;
    b.int(`nozzle-${side}`, `foot${S}`, lathe([[0.25, -0.3], [0.33, -0.4], [0.4, -0.5]], 16), 'nozzles', m.casing);
    for (const k of [-1, 1]) {
      b.int(`nozzle-${side}`, `foot${S}`, new THREE.BoxGeometry(F.bodyWidth - 0.26, 0.5, 0.05), 'nozzles', undefined, { pos: [0, -0.7, k * 0.265], rot: [k * 30, 0, 0] });
    }
    b.int(`nozzle-${side}`, `foot${S}`, move(new THREE.BoxGeometry(F.bodyWidth - 0.3, 0.06, 2 * NOZZLE.slot - 0.02), 0, F.bodyEnd + 0.05, 0), 'nozzles', m.glowHot);
    // Flap rams from inside the body to each flap's inner web, and the ankle rams that tilt the
    // nozzle on its ball joint (pitch in front, roll behind): exposed between the ankle collar's
    // underside and the nozzle body's shoulder, outboard of the ball and its gimbal ring (inside
    // the shin they would cross its skin and the turbine casing).
    pistons.push(piston(b, `toe-actuator-${side}`, `foot${S}`, [s * 0.38, F.bodyEnd + 0.3, 0.3], `toe${S}`, [s * 0.38, -0.3, 0], 0.46, 0.05));
    pistons.push(piston(b, `heel-actuator-${side}`, `foot${S}`, [-s * 0.38, F.bodyEnd + 0.3, -0.3], `heel${S}`, [-s * 0.38, -0.3, 0], 0.46, 0.05));
    pistons.push(piston(b, `ankle-actuator-${side}`, `shinExt${S}`, [s * 0.5, 0.14, 0.2], `foot${S}`, [s * 0.5, -0.46, 0.28], 0.4, 0.055, { always: true }));
    pistons.push(piston(b, `ankle-actuator-${side}`, `shinExt${S}`, [-s * 0.5, 0.14, -0.2], `foot${S}`, [-s * 0.5, -0.46, -0.28], 0.4, 0.055, { always: true }));

    /* actuators */
    // Knee ram along the front of the joint, from the knee housing (below the thigh casing, which
    // it would otherwise pierce) down inside the shin: four stages, from the Battroid knee bent
    // forward (0.73 m) through the GERWALK fold (1.4 m) to the Battroid flex back (1.9 m).
    pistons.push(piston(b, `knee-actuator-${side}`, `thighExt${S}`, [s * 0.42, -0.06, 0.3], `knee${S}`, [s * 0.42, -0.95, -0.28], 0.7, 0.08, { stages: 4 }));
    // Elbow ram behind the hinge, beside the arm frame: bending forward stretches it (0.6–0.9 m
    // over the whole range; in front of the hinge it crossed over the pivot).
    pistons.push(piston(b, `elbow-actuator-${side}`, `upperArm${S}`, [s * 0.17, -0.55, -0.24], `elbow${S}`, [s * 0.17, -0.3, -0.24], 0.5, 0.06));
    // Sweep screw-jack on the wing-root carriage (it travels with the pivot), from the carriage's
    // inboard end to the wing box at the root, ahead of the Fowler flap. Its stroke (1.1–1.55 m)
    // covers 20° to the Battroid stowage.
    pistons.push(piston(b, `wing-actuator-${side}`, `wingRoot${S}`, [-s * 1.3, -0.6, 0], `wing${S}`, [s * 0.2, -0.45, 0], 0.9, 0.09));
    // Wing-root swing arm: a parallel pair of links from the hinge in the glove to the carriage,
    // so the carriage (and wing) keep their attitude through the swing onto the back.
    const hinge: V3 = [s * WING_ARM_HINGE[0], WING_ARM_HINGE[1], WING_ARM_HINGE[2]];
    const armLen = Math.hypot(D.wing.pivot[0] - WING_ARM_HINGE[0], D.wing.pivot[1] - WING_ARM_HINGE[1], D.wing.pivot[2] - WING_ARM_HINGE[2]);
    WING_ARM_PICKUPS.forEach(([ox, oy, oz], i) => {
      const o: V3 = [s * ox, oy, oz];
      pistons.push(link(b, `wing-swing-arm-${side}`, 'torso', [hinge[0] + o[0], hinge[1] + o[1], hinge[2] + o[2]], `wingRoot${S}`, o, armLen, i ? 0.045 : 0.07));
    });
    // The arm's hinge shafts (drive on the main one), across the swing plane, and the carriage's
    // yoke above the wing pivot that the links pick up.
    const swingYaw = (Math.atan2(D.wing.stow[1] - D.wing.pivot[1], D.wing.stow[0] - D.wing.pivot[0]) * 180) / Math.PI;
    const [p1, p2] = WING_ARM_PICKUPS;
    const mid: V3 = [(s * (p1[0] + p2[0])) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
    for (const [x, y, z, r] of [[s * p1[0], p1[1], p1[2], 0.09], [s * p2[0], p2[1], p2[2], 0.06]] as const) {
      b.int(`wing-swing-arm-${side}`, 'torso', rot(new THREE.CylinderGeometry(r, r, 0.26, 14), 0, 0, 90), 'actuators', m.casing, { pos: [hinge[0] + x, hinge[1] + y, hinge[2] + z], rot: [0, 0, s * (swingYaw - 90)], always: true });
    }
    b.int(`wing-swing-arm-${side}`, `wingRoot${S}`, new THREE.BoxGeometry(0.26, 0.36, 0.16), 'actuators', m.casing, { pos: [mid[0], 0.28 + 0.18, mid[2] + 0.01], rot: [0, 0, s * (swingYaw - 90)], always: true });
    // The carriage's axle, standing through the wing's sweep bearing (and the ring gear's bore),
    // tied to the yoke by a bar over the bearing.
    b.int(`wing-swing-arm-${side}`, `wingRoot${S}`, new THREE.BoxGeometry(0.1, 0.32, 0.04), 'actuators', m.casing, { pos: [0, 0.16, -0.11], always: true });
    b.int(`wing-swing-arm-${side}`, `wingRoot${S}`, new THREE.CylinderGeometry(0.07, 0.07, 0.23, 12).rotateX(Math.PI / 2).translate(0, 0, -0.015), 'actuators', m.casing, { always: true });

    /* frame */
    b.int(`leg-frame-${side}`, `knee${S}`, move(new THREE.BoxGeometry(0.16, 3.4, 0.16), 0, -2.1, SHIN_AXIS_Z - 0.46), 'frame');
    b.int(`leg-frame-${side}`, `legSlide${S}`, move(new THREE.BoxGeometry(0.16, 1.05, 0.16), 0, 0.825, -0.45), 'frame');
    b.int(`leg-frame-${side}`, `shinExt${S}`, move(new THREE.BoxGeometry(0.14, 0.8, 0.14), 0, 0.45, ANKLE_TO_AXIS_Z - 0.46), 'frame');
    b.int(`arm-frame-${side}`, `elbow${S}`, move(new THREE.BoxGeometry(0.16, 1.9, 0.16), 0, -1.05, -0.24), 'frame');
    b.int(`arm-frame-${side}`, `upperArm${S}`, move(new THREE.BoxGeometry(0.14, 0.5, 0.14), 0, -0.6, -0.22), 'frame');

    /* power conduits up the waist toward each leg */
    b.int('power-conduits', 'torso', move(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), 0, 0.85, 0), 'power', undefined, { pos: [s * 0.28, 0.05, -0.62] });
  }

  /* torso-mounted actuators */
  for (const s of [1, -1]) {
    pistons.push(piston(b, 'nose-fold-actuator', 'torso', [s * 0.835, 3.6, -0.1], 'nose', [s * 0.8, 0.55, -0.45], 0.74, 0.08, { stages: 3 }));
  }
  // Backpack support ram on the centre line (the toys' diecast support arm), ahead of the antenna
  // boom's stowage; in Battroid it passes between the stowed wings. Three stages: it carries the
  // module through the whole lift-and-flip (1.2–2.3 m), and it shows whenever the module is off
  // the waist keel it lies in.
  pistons.push(piston(b, 'tail-fold-actuator', 'torso', [0, 1.3, -0.66], 'tailModule', [0, -0.9, 0.25], 0.9, 0.11, { stages: 3, always: true }));
  // Its clevis on the module: a lug hanging from the channel roof, with the ram's pin through it.
  b.int('tail-fold-actuator', 'tailModule', new THREE.BoxGeometry(0.16, 0.24, 0.27), 'actuators', m.casing, { pos: [0, -0.9, 0.185], always: true });
  b.int('tail-fold-actuator', 'tailModule', rot(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 12), 0, 0, 90), 'actuators', m.chrome, { pos: [0, -0.9, 0.25], always: true });
  // Neck lift: a three-stage column from the keel slab up through the head bay's floor into the
  // neck post, on the head's turn axis. It raises the head out of its bay for Battroid.
  pistons.push(piston(b, 'neck-lift', 'torso', [0, 2.0, -0.55], 'head', [0, -0.05, 0], 0.8, 0.12, { stages: 3, always: true }));
  // Airbrake drive: the canopy shield stows right under the brake panel, so there is no room for a
  // strut; rotary actuators either side of the stowed hoods turn a torque shaft in the hinge line.
  {
    const [, hy, hz] = AIRBRAKE.pivot;
    for (const s of [1, -1]) {
      b.ext('airbrake', 'nose', rot(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 14), 0, 0, 90), 'gunmetal', { pos: [s * 0.64, hy, hz + 0.04], edges: false, joint: 'airbrake' });
    }
    for (const s of [1, -1]) {
      b.ext('airbrake', 'airbrake', rot(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 10), 0, 0, 90), 'navy', { pos: [s * 0.52, 0, 0.04], edges: false, joint: 'nose' });
    }
  }

  /* avionics */
  b.int('radar-array', 'radome', rot(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20), 0, 0, 0), 'avionics', undefined, { pos: [0, 0.35, -0.44] });
  b.int('radar-array', 'radome', new THREE.CylinderGeometry(0.1, 0.14, 0.34, 10), 'avionics', m.casing, { pos: [0, 0.14, -0.44] });
  for (let i = 0; i < 3; i++) {
    b.int('avionics-bay', 'nose', new THREE.BoxGeometry(1.4, 0.3, 0.62), 'avionics', undefined, { pos: [0, 0.45 + i * 0.36, -0.5] });
  }
  b.int('avionics-bay', 'nose', new THREE.BoxGeometry(1.2, 1.1, 0.08), 'avionics', m.casing, { pos: [0, 0.8, -0.95] });
  b.int('head-sensor-cluster', 'head', new THREE.BoxGeometry(0.7, 0.3, 0.4), 'avionics', undefined, { pos: [0, 0.76, 0.22] });
  for (const x of [-0.18, 0.18]) {
    b.int('head-sensor-cluster', 'head', rot(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 12), 90, 0, 0), 'avionics', m.glowCore, { pos: [x, 0.76, 0.34] });
  }

  /* cockpit: capsule tub (cutaway) + seat, pilot and HUD (always visible through the canopy) */
  // Tub above the nose-gear bay.
  b.int('cockpit-capsule', 'cockpit', move(new THREE.BoxGeometry(0.86, 2.1, 0.46), 0, 1.15, -0.59), 'cockpit');
  b.int('ejection-seat', 'cockpit', new THREE.BoxGeometry(0.52, 0.16, 0.9), 'cockpit', undefined, { pos: [0, 0.55, -0.88], rot: [-14, 0, 0], always: true });
  b.int('ejection-seat', 'cockpit', new THREE.BoxGeometry(0.5, 0.62, 0.14), 'cockpit', undefined, { pos: [0, 0.88, -0.72], always: true });
  b.int('ejection-seat', 'cockpit', new THREE.BoxGeometry(0.36, 0.28, 0.5), 'cockpit', m.pilot, { pos: [0, 0.82, -1.02], always: true });
  b.int('ejection-seat', 'cockpit', new THREE.SphereGeometry(0.15, 14, 10), 'cockpit', m.pilot, { pos: [0, 0.8, -1.32], always: true });
  b.int('ejection-seat', 'cockpit', new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), 'cockpit', b.mats.ext.red, { pos: [0, 0.8, -1.32], rot: [-90, 0, 0], always: true });
  b.int('hud-console', 'cockpit', new THREE.BoxGeometry(0.7, 0.3, 0.34), 'cockpit', m.casing, { pos: [0, 1.62, -0.95], always: true });
  b.int('hud-console', 'cockpit', new THREE.BoxGeometry(0.34, 0.03, 0.26), 'cockpit', b.mats.ext.visor, { pos: [0, 1.72, -1.2], rot: [-35, 0, 0], always: true });

  /* power */
  b.int('power-core', 'torso', rot(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 20), 0, 0, 90), 'power', m.glowCore, { pos: [0, 2.2, -0.67] });
  for (const x of [-0.5, 0, 0.5]) {
    b.int('power-core', 'torso', rot(new THREE.TorusGeometry(0.18, 0.03, 8, 20), 0, 90, 0), 'power', undefined, { pos: [x, 2.2, -0.67] });
  }
  for (const s of [1, -1]) {
    // In the keel's front end, below the chest's sloping sides.
    b.int('capacitor-bank', 'nose', new THREE.BoxGeometry(0.4, 0.22, 0.5), 'power', undefined, { pos: [s * 0.45, 0.14, -0.45] });
  }

  /* frame: spine */
  b.int('spine-keel', 'torso', new THREE.BoxGeometry(0.2, 2.6, 0.2), 'frame', undefined, { pos: [0, 1.4, -0.72] });
  for (const s of [1, -1]) {
    b.int('spine-keel', 'torso', new THREE.BoxGeometry(0.2, 2.5, 0.2), 'frame', undefined, { pos: [s * 1.05, 2.9, -0.76] });
  }
  b.int('spine-keel', 'torso', new THREE.BoxGeometry(0.7, 0.14, 0.16), 'frame', undefined, { pos: [0, 0.8, -0.7] });
  b.int('spine-keel', 'torso', new THREE.BoxGeometry(2.2, 0.14, 0.16), 'frame', undefined, { pos: [0, 2.6, -0.76] });
  for (const s of [1, -1]) {
    for (const y of [3.3, 4.0]) {
      b.int('spine-keel', 'torso', new THREE.BoxGeometry(0.5, 0.14, 0.16), 'frame', undefined, { pos: [s * 1.1, y, -0.76] });
    }
  }

  /* weapons */
  b.int('weapon-bay', 'torso', new THREE.BoxGeometry(1.2, 0.28, 0.34), 'weapons', undefined, { pos: [0, 1.66, -0.66] });
  b.int('weapon-bay', 'torso', new THREE.BoxGeometry(0.3, 0.3, 0.3), 'weapons', m.casing, { pos: [0, 1.66, -0.66] });
  const z = GUN_AXIS_Z;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.int('gun-barrels', 'gunPod', move(new THREE.CylinderGeometry(0.07, 0.07, 2.9, 8), 0, -0.95, 0), 'weapons', m.chrome, { pos: [Math.cos(a) * 0.13, 0, z + Math.sin(a) * 0.13] });
  }
  b.int('gun-barrels', 'gunPod', new THREE.CylinderGeometry(0.24, 0.24, 0.4, 12), 'weapons', m.casing, { pos: [0, 0.35, z] });
  b.int('ammo-drum', 'gunPod', rot(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 18), 0, 0, 90), 'weapons', undefined, { pos: [0, 0.75, z] });
  for (let i = 0; i < 4; i++) {
    b.int('ammo-feed', 'gunPod', new THREE.BoxGeometry(0.16, 0.2, 0.16), 'weapons', m.casing, { pos: [0.22, 0.5 - i * 0.14, z - 0.2 + i * 0.05] });
  }
  b.int('laser-emitters', 'head', new THREE.BoxGeometry(0.6, 0.22, 0.3), 'weapons', m.casing, { pos: [0, 1.05, -0.2] });
  for (const x of [-0.42, 0.42]) {
    b.int('laser-emitters', 'head', rot(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 10), 90, 0, 0), 'weapons', undefined, { pos: [x, 1.05, -0.2] });
  }

  return pistons;
}

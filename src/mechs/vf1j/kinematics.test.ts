import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createMecha, type Mecha } from './build';
import { MechaController } from './controller';
import { SPECS } from './config';
import { D } from './dims';

let mecha: Mecha;
let ctl: MechaController;

beforeAll(() => {
  mecha = createMecha();
  ctl = new MechaController(mecha);
});

const SOLES = [
  'soleL_toeIn', 'soleL_toeOut', 'soleL_heelIn', 'soleL_heelOut',
  'soleR_toeIn', 'soleR_toeOut', 'soleR_heelIn', 'soleR_heelOut',
] as const;

function at(t: number) {
  ctl.setProgress(t);
  return {
    box: ctl.exteriorBox(),
    m: (id: string) => ctl.markerWorld(id),
  };
}

function size(box: THREE.Box3) {
  return box.getSize(new THREE.Vector3());
}

/** Height of the exterior skin under (x, z), seen from above (null where nothing is hit). */
function skinTop(x: number, z: number): number | null {
  mecha.root.updateMatrixWorld(true);
  const meshes = [...mecha.parts.values()].flat().filter((m) => m.userData.kind === 'exterior' && m.visible);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.point.y : null;
}

/** A part's exterior bounds in one bone's frame: the rigid part's own shape, whatever the pose. */
function localBox(part: string, bone: string) {
  mecha.root.updateMatrixWorld(true);
  const inv = mecha.bones[bone].matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const mesh of mecha.parts.get(part) ?? []) {
    if (mesh.userData.kind !== 'exterior') continue;
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv));
  }
  return box;
}

describe('rig', () => {
  it('is a real THREE.Bone hierarchy with the named joints', () => {
    const required = [
      'torso', 'nose', 'cockpit', 'radome', 'head',
      'hipRailL', 'hipL', 'kneeL', 'ankleL', 'footL',
      'hipRailR', 'hipR', 'kneeR', 'ankleR', 'footR',
      'shoulderL', 'upperArmL', 'elbowL', 'wristL',
      'shoulderR', 'upperArmR', 'elbowR', 'wristR',
      'tailModule', 'finL', 'finR', 'wingL', 'wingR', 'gunPod',
    ];
    for (const id of required) {
      expect(mecha.bones[id], `bone ${id}`).toBeInstanceOf(THREE.Bone);
    }
    // Every bone except the root hangs off another bone.
    for (const [id, bone] of Object.entries(mecha.bones)) {
      if (id === 'torso') continue;
      expect((bone.parent as THREE.Bone | null)?.isBone, `parent of ${id}`).toBe(true);
    }
  });
});

describe('Fighter mode (progress 0) matches the published VF-1 dimensions', () => {
  it(`is ${SPECS.fighter.length} m long, ${SPECS.fighter.span} m span, ${SPECS.fighter.height} m tall`, () => {
    const { box } = at(0);
    const s = size(box);
    expect(s.z).toBeGreaterThan(SPECS.fighter.length - 0.5);
    expect(s.z).toBeLessThan(SPECS.fighter.length + 0.5);
    expect(s.x).toBeGreaterThan(SPECS.fighter.span - 0.5);
    expect(s.x).toBeLessThan(SPECS.fighter.span + 0.5);
    expect(s.y).toBeGreaterThan(SPECS.fighter.height - 0.5);
    expect(s.y).toBeLessThan(SPECS.fighter.height + 0.5);
  });

  it('points the radome forward and the nozzles aft', () => {
    const { box, m } = at(0);
    expect(m('noseTip').z).toBeGreaterThan(box.max.z - 0.05);
    // The throat exit, with the divergent flaps (toe / heel) closed behind it to the tail.
    expect(m('nozzleL').z).toBeLessThan(box.min.z + D.leg.foot.flapLen + 0.1);
    expect(m('nozzleR').z).toBeLessThan(box.min.z + D.leg.foot.flapLen + 0.1);
  });

  it('stands on its landing gear (five-view), head retracted into its bay', () => {
    const { box, m } = at(0);
    for (const id of ['wheelNose', 'wheelL', 'wheelR']) expect(Math.abs(m(id).y), id).toBeLessThan(0.03);
    expect(box.min.y).toBeGreaterThan(-0.03);
    // Everything else clears the floor: the slung GU-11 and the leg fins under the nacelles.
    expect(ctl.partBox('gun-pod').min.y).toBeGreaterThan(0.05);
    expect(ctl.partBox('shin-port').min.y).toBeGreaterThan(0.3);
    const head = mecha.bones.torso.worldToLocal(m('headTop'));
    expect(head.y).toBeLessThan(D.torso.top);
  });

  it('runs the dorsal line smoothly aft from the canopy, with no step behind the chest (five-view side)', () => {
    at(0);
    // Spine height along the centre line every 5 cm, from the canopy's crown to the tail module.
    const zFront = ctl.partBox('canopy').max.z - 1.2;
    const zTail = ctl.partBox('tail-module').max.z;
    const step = 0.05;
    const heights: number[] = [];
    for (let z = zFront; z > zTail + 0.1; z -= step) {
      heights.push(Math.max(...[-0.25, 0, 0.25].map((x) => skinTop(x, z) ?? -1)));
    }
    expect(heights.length).toBeGreaterThan(60);
    for (let i = 1; i < heights.length; i++) {
      // No cliff and no notch: the canopy runs into the spine, the spine ramps down to the skin.
      expect(heights[i - 1] - heights[i], `drop at ${i}`).toBeLessThan(0.1);
      expect(heights[i] - heights[i - 1], `rise at ${i}`).toBeLessThan(0.05);
      // A ramp of up to ~50° is allowed (the canopy slides 1 m under the chest in Battroid,
      // so the spine can only descend over the chest's last 0.6 m).
      if (i >= 5) expect(heights[i - 5] - heights[i], `drop over 0.25 m at ${i}`).toBeLessThan(0.3);
    }
  });

  it('keeps the chest sides over the intakes low beside the spine (five-view front and top views)', () => {
    at(0);
    const canopyTop = ctl.partBox('canopy').max.y;
    const box = ctl.partBox('chest-plate');
    for (const x of [1.2, -1.2, 1.6, -1.6]) {
      const y = skinTop(x, box.min.z + 0.3);
      expect(y, `x ${x}`).not.toBeNull();
      expect(y!, `x ${x}`).toBeLessThan(canopyTop - 0.35);
    }
  });

  it('shows a continuous nacelle side from the intake back to the shin (no gaps at the thigh joints)', () => {
    at(0);
    mecha.root.updateMatrixWorld(true);
    const meshes = mecha.exterior.filter((m) => m.visible);
    const skin = /^(intake|thigh|shin)-port$/;
    const z0 = ctl.partBox('intake-port').min.z - 0.03;
    const z1 = ctl.markerWorld('kneeL').z - 0.05;
    const axisY = ctl.markerWorld('intakeTopL').y;
    for (let z = z0; z > z1; z -= 0.05) {
      for (const dy of [-0.35, -0.15, 0.05, 0.25, 0.45]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(8, axisY + dy, z), new THREE.Vector3(-1, 0, 0));
        const hit = ray.intersectObjects(meshes, false)[0];
        const seen = hit ? (hit.object.userData.partId as string) : 'nothing (a gap right through)';
        expect(seen, `z ${z.toFixed(2)}, ${dy} m off the axis`).toMatch(skin);
      }
    }
  });

  it('folds the gear into its bays for flight', () => {
    ctl.setProgress(0);
    ctl.setGear(0);
    const belly = ctl.partBox('forward-fuselage').min.y;
    expect(ctl.markerWorld('wheelNose').y).toBeGreaterThan(belly - 0.02);
    for (const S of ['L', 'R']) {
      const nacelle = ctl.partBox(S === 'L' ? 'shin-port' : 'shin-starboard').min.y;
      expect(ctl.markerWorld(`wheel${S}`).y, S).toBeGreaterThan(nacelle - 0.02);
    }
    ctl.setGear(1);
  });
});

describe('GERWALK mode (progress 0.5), as in the official line art', () => {
  // No official GERWALK dimensions exist (Macross Compendium lists Fighter and Battroid only),
  // so the mode is checked against the drawings' configuration instead.
  it('is more compact than the Fighter and lower than the Battroid', () => {
    const { box } = at(0.5);
    const s = size(box);
    // (1 m shorter at least; the fins folded flat on the raised back block trail aft of it.)
    expect(s.z).toBeLessThan(SPECS.fighter.length - 1);
    expect(s.y).toBeLessThan(SPECS.battroid.height - 1);
  });

  it('keeps the thighs level along the fuselage and drops the shins at the knees', () => {
    const { m } = at(0.5);
    for (const side of ['L', 'R']) {
      // Leg axis through the intake and thigh (the knee hinge itself sits on the front face).
      const axis = (id: string) => mecha.bones[`${id}${side}`].getWorldPosition(new THREE.Vector3());
      const thigh = axis('thighExt').sub(axis('legSlide'));
      const thighPitch = THREE.MathUtils.radToDeg(Math.asin(Math.abs(thigh.y) / thigh.length()));
      expect(thighPitch, `thigh ${side}`).toBeLessThan(15);
      const knee = m(`knee${side}`);
      const heel = m(`sole${side}_heelIn`);
      expect(knee.y - heel.y, `shin drop ${side}`).toBeGreaterThan(D.leg.shinLen);
    }
  });

  it('stands the back block on the back leaning forward, belly up and aft, antenna whip up and fins folded flat', () => {
    // Transformation sheet (fins fold, then the whole back block rises past vertical as an
    // airbrake), the GERWALK line art (MAHQ) and the VF-1J GERWALK kit: the block stands on the
    // back behind the canopy leaning forward, its aft vent grille facing forward, red disc and
    // verniers facing up and aft, fins flat at its base.
    const { m } = at(0.5);
    const belly = new THREE.Vector3(0, 0, 1).transformDirection(mecha.bones.tailModule.matrixWorld);
    expect(belly.y, 'belly faces up').toBeGreaterThan(0.7);
    expect(belly.z, '…and aft').toBeLessThan(-0.3);
    expect(m('tailEnd').z - m('finRootL').z, 'aft face turned forward').toBeGreaterThan(1.5);
    const rise = m('tailEnd').y - m('finRootL').y;
    expect(rise, 'leans forward: neither flat nor upright').toBeGreaterThan(0.8);
    expect(rise).toBeLessThan(1.8);
    expect(m('mastTip').y).toBeGreaterThan(m('tailEnd').y + 1.5);
    for (const S of ['L', 'R']) {
      const span = m(`finTip${S}`).sub(m(`finRoot${S}`));
      expect(Math.abs(span.y) / span.length(), `fin ${S} flat`).toBeLessThan(0.3);
    }
  });

  it('holds the GU-11 forward in the right fist', () => {
    const { m } = at(0.5);
    expect(m('gunMuzzle').x).toBeLessThan(-1.5);
    expect(m('gunMuzzle').z - m('gunStock').z).toBeGreaterThan(3.5);
    expect(m('gunMuzzle').distanceTo(m('handR'))).toBeLessThan(4);
  });

  it('stands with both soles flat on the ground', () => {
    const { m } = at(0.5);
    for (const id of SOLES) expect(Math.abs(m(id).y), id).toBeLessThan(0.06);
  });

  it('keeps the wings spread for lift', () => {
    const { m } = at(0.5);
    expect(m('wingTipL').distanceTo(m('wingTipR'))).toBeGreaterThan(13);
  });

  it('has the torso only beginning to rotate upright, head still stowed', () => {
    const { m } = at(0.5);
    const up = m('torsoTop').sub(m('torsoBase')).normalize();
    const pitchDeg = THREE.MathUtils.radToDeg(Math.asin(up.y));
    expect(pitchDeg).toBeGreaterThan(2);
    expect(pitchDeg).toBeLessThan(35);
    expect(mecha.bones.torso.worldToLocal(m('headTop')).y).toBeLessThan(D.torso.top);
  });
});

describe('Battroid mode (progress 1)', () => {
  it(`stands ${SPECS.battroid.height} m to the top of the head`, () => {
    const { m } = at(1);
    expect(m('headTop').y).toBeGreaterThan(SPECS.battroid.height - 0.35);
    expect(m('headTop').y).toBeLessThan(SPECS.battroid.height + 0.35);
  });

  it(`is about ${SPECS.battroid.width} m wide and ${SPECS.battroid.depth} m deep`, () => {
    const { box } = at(1);
    const s = size(box);
    expect(s.x).toBeGreaterThan(SPECS.battroid.width - 0.7);
    expect(s.x).toBeLessThan(SPECS.battroid.width + 0.7);
    expect(s.y).toBeLessThan(SPECS.battroid.height + 1.2);
    // The published depth is the standing body; the display pose holds the
    // GU-11 forward, so arms and the hand-held pod are excluded from depth.
    const body = size(ctl.exteriorBox(undefined, (id) => !/^(upper-arm|forearm|hand|gun-pod)/.test(id)));
    expect(body.z).toBeGreaterThan(SPECS.battroid.depth - 0.8);
    expect(body.z).toBeLessThan(SPECS.battroid.depth + 0.8);
  });

  it('stands on flat soles', () => {
    const { m } = at(1);
    for (const id of SOLES) expect(Math.abs(m(id).y), id).toBeLessThan(0.06);
  });

  it('has the head up with the canopy on the chest facing forward', () => {
    const { m } = at(1);
    expect(m('headTop').y).toBeGreaterThan(m('headBase').y + 0.5);
    const canopyNormal = m('canopyOut').sub(m('canopyIn')).normalize();
    expect(canopyNormal.z).toBeGreaterThan(0.8);
  });

  it('has the schematic calves: ~1.6 m wide, bulging mostly outboard', () => {
    // Battroid front schematic (67.4 px/m): calf outer edge 2.6 m off the centre line.
    const { m } = at(1);
    for (const [S, s] of [['L', 1], ['R', -1]] as const) {
      const outer = m(`calfOut${S}`);
      const inner = m(`calfIn${S}`);
      const knee = m(`knee${S}`);
      expect(s * (outer.x - inner.x), `calf width ${S}`).toBeGreaterThan(1.6);
      expect(s * outer.x, `calf outer edge ${S}`).toBeGreaterThan(2.5);
      expect(s * (outer.x - knee.x), `outboard bulge ${S}`).toBeGreaterThan(s * (knee.x - inner.x));
    }
  });

  it('has the schematic forearms: outer shields widening them and rising past the elbows', () => {
    // Schematic: forearm + shield ~1.4 m wide, the shield's point well above the elbow.
    at(1);
    for (const [S, side] of [['L', 'port'], ['R', 'starboard']] as const) {
      const box = localBox(`forearm-${side}`, `elbow${S}`);
      expect(box.max.x - box.min.x, `forearm width ${S}`).toBeGreaterThan(1.2);
      expect(box.max.y, `shield above the elbow ${S}`).toBeGreaterThan(0.8);
    }
  });

  it('points the nose cone down between the thighs', () => {
    const { m } = at(1);
    const dir = m('noseTip').sub(m('noseBase')).normalize();
    expect(dir.y).toBeLessThan(-0.8);
    expect(Math.abs(m('noseTip').x)).toBeLessThan(0.3);
    expect(m('noseTip').y).toBeLessThan(m('hipJointL').y);
    expect(m('noseTip').y).toBeGreaterThan(m('kneeL').y);
  });

  it('stows the wings pointing down behind the body and the fins pointing up', () => {
    const { m } = at(1);
    for (const side of ['L', 'R']) {
      const tip = m(`wingTip${side}`);
      const root = m(`wingRoot${side}`);
      expect(tip.y).toBeLessThan(root.y - 4);
      expect(tip.z).toBeLessThan(m('torsoBase').z);
      expect(m(`finTip${side}`).y).toBeGreaterThan(m(`finRoot${side}`).y + 1);
    }
  });
});

describe('transformation', () => {
  it('is path-independent: any mode reached from any other gives the same pose', () => {
    const fresh = new MechaController(createMecha());
    const used = new MechaController(createMecha());
    for (const t of [0, 0.5, 1]) {
      fresh.setProgress(t);
      for (const from of [1, 0.3, 0.77, 0]) {
        used.setProgress(from);
        used.setProgress(t);
        for (const id of fresh.markerIds()) {
          expect(used.markerWorld(id).distanceTo(fresh.markerWorld(id)), `${id} @${t} after ${from}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('never jumps: every marker moves < 0.25 m per 0.1% of progress', () => {
    const ids = ctl.markerIds();
    expect(ids.length).toBeGreaterThan(20);
    ctl.setProgress(0);
    let prev = ids.map((id) => ctl.markerWorld(id));
    let worst = 0;
    let worstAt = '';
    for (let i = 1; i <= 1000; i++) {
      ctl.setProgress(i / 1000);
      const cur = ids.map((id) => ctl.markerWorld(id));
      cur.forEach((p, k) => {
        const d = p.distanceTo(prev[k]);
        if (d > worst) {
          worst = d;
          worstAt = `${ids[k]} @ ${i / 10}%`;
        }
      });
      prev = cur;
    }
    expect(worst, worstAt).toBeLessThan(0.25);
  });

  it('never sinks below the ground', () => {
    for (let i = 0; i <= 100; i++) {
      ctl.setProgress(i / 100);
      for (const id of ctl.markerIds()) {
        expect(ctl.markerWorld(id).y, `${id} @ ${i}%`).toBeGreaterThan(-0.05);
      }
    }
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      ctl.setProgress(t);
      expect(ctl.exteriorBox().min.y, `box @ ${t}`).toBeGreaterThan(-0.05);
    }
  });
});

describe('feet = split 2-D nozzles (Macross Compendium; the toys spread the nozzle halves into toe and heel)', () => {
  /** Nozzle axis: from the ankle pivot to the exhaust exit. */
  const axis = (S: string) => ctl.markerWorld(`nozzle${S}`).sub(ctl.markerWorld(`ankle${S}`)).normalize();

  it('closes the toe and heel halves into the exhaust nozzle in flight, in line with the nacelle', () => {
    const { box, m } = at(0);
    for (const S of ['L', 'R']) {
      expect(axis(S).z, `nozzle axis aft ${S}`).toBeLessThan(-0.98);
      // The closed flaps are the aft end of the nacelle, a slot apart (the five-view's "<").
      for (const c of ['toeIn', 'heelIn']) expect(m(`sole${S}_${c}`).z, `${c} ${S}`).toBeLessThan(box.min.z + 0.1);
      expect(m(`sole${S}_toeIn`).distanceTo(m(`sole${S}_heelIn`)), `closed flaps ${S}`).toBeLessThan(0.4);
    }
  });

  for (const [mode, t] of [['GERWALK', 0.5], ['Battroid', 1]] as const) {
    it(`fires the exhaust straight down through the middle of the foot (${mode})`, () => {
      const { m } = at(t);
      for (const S of ['L', 'R']) {
        expect(axis(S).y, `nozzle points down ${S}`).toBeLessThan(-0.97);
        const exit = m(`nozzle${S}`);
        const toe = m(`sole${S}_toeIn`);
        const heel = m(`sole${S}_heelIn`);
        // The toe runs forward and the heel back from the exhaust bay between them…
        const fwd = toe.clone().sub(heel).setY(0).normalize();
        expect(fwd.z, `toe ahead of heel ${S}`).toBeGreaterThan(0.9);
        const along = exit.clone().sub(heel).dot(fwd);
        expect(along, `exit ahead of the heel ${S}`).toBeGreaterThan(0.6);
        expect(along, `exit behind the toe ${S}`).toBeLessThan(toe.clone().sub(heel).dot(fwd) - 0.6);
        // …and the exit is raised clear of the ground.
        expect(exit.y, `exit above the ground ${S}`).toBeGreaterThan(0.03);
      }
    });
  }

  it('carries a counter-reverse vernier on the outer side of each intake and verniers in the aft nacelle', () => {
    at(1);
    for (const [side, s] of [['port', 1], ['starboard', -1]] as const) {
      const intake = ctl.partBox(`intake-${side}`);
      const vernier = ctl.partBox(`leg-vernier-${side}`);
      expect(s * vernier.getCenter(new THREE.Vector3()).x, `outboard ${side}`).toBeGreaterThan(s * intake.getCenter(new THREE.Vector3()).x + 0.4);
      expect(vernier.min.y, side).toBeGreaterThan(intake.min.y - 0.1);
      expect(vernier.max.y, side).toBeLessThan(intake.max.y + 0.1);
      // Aft-nacelle verniers low on the back of the calf (rear art: twin ports above the heel).
      const aft = ctl.partBox(`calf-vernier-${side}`);
      const shin = ctl.partBox(`shin-${side}`);
      expect(aft.min.z, side).toBeLessThan(shin.getCenter(new THREE.Vector3()).z);
      expect(aft.max.y, side).toBeLessThan(2.5);
    }
  });
});

describe('canopy shield (Compendium: "retractable shield for Battroid mode"; sheet: キャノピーカバーおりる)', () => {
  /** First exterior part hit by a ray from `from` toward `to`. */
  function firstHit(from: THREE.Vector3, to: THREE.Vector3): string | null {
    mecha.root.updateMatrixWorld(true);
    const meshes = [...mecha.parts.values()].flat().filter((m) => m.userData.kind === 'exterior' && m.visible);
    const dir = to.clone().sub(from).normalize();
    const hit = new THREE.Raycaster(from, dir).intersectObjects(meshes, false)[0];
    return hit ? (hit.object.userData.partId as string) : null;
  }

  it('covers the canopy with the armoured shield in Battroid', () => {
    const { m } = at(1);
    for (const along of [0.2, 0.9, 1.6]) {
      const target = mecha.bones.cockpit.localToWorld(new THREE.Vector3(0, 1.0 + along * 0.8, -1.3));
      const from = target.clone().add(new THREE.Vector3(0, 0, 6));
      expect(firstHit(from, target), `at ${along}`).toBe('canopy-shield');
    }
    expect(m('canopyOut').z).toBeGreaterThan(m('canopyIn').z);
  });

  it('keeps the glazing clear in Fighter and GERWALK, the shield stowed out of sight in the chest spine', () => {
    for (const t of [0, 0.5]) {
      at(t);
      const glass = mecha.bones.cockpit.localToWorld(new THREE.Vector3(0, 1.2, -1.3));
      const above = glass.clone().add(new THREE.Vector3(0, 6, 0));
      expect(firstHit(above, glass), `canopy @${t}`).toBe('canopy');
      for (const y of [-0.8, -0.5, -0.2]) {
        const stowed = mecha.bones.cockpit.localToWorld(new THREE.Vector3(0, y, -1.3));
        expect(firstHit(stowed.clone().add(new THREE.Vector3(0, 6, 0)), stowed), `stowed shield hidden @${t} y${y}`).not.toBe('canopy-shield');
      }
    }
  });
});

describe('knees (front hinge folds the shin forward for GERWALK; a rear pivot bends it back in Battroid)', () => {
  it('bends the Battroid knee back ~90° about its rear pivot, like the DX toy, with nothing touching', () => {
    const c = new MechaController(createMecha());
    c.setProgress(1);
    const r = c.setDof('kneeL.bend', 90);
    expect(r.value, r.blockedBy?.join(' / ')).toBeGreaterThan(80);
    // The shin swings back: its ankle ends up well behind the knee.
    expect(c.markerWorld('ankleL').z).toBeLessThan(c.markerWorld('kneeL').z - 2.5);
    c.resetDofs();
  });
});

describe('holding position (the craft transforms and poses in place)', () => {
  it('keeps the body exactly where it stands while joints are posed', () => {
    const c = new MechaController(createMecha());
    for (const t of [0.5, 1]) {
      c.setProgress(t);
      const waist = c.markerWorld('torsoBase');
      const head = c.markerWorld('headTop');
      c.setDof('upperArmL.swing', -60);
      c.setDof(t === 1 ? 'kneeR.bend' : 'wingL.sweep', 40);
      expect(c.markerWorld('torsoBase').distanceTo(waist), `waist @${t}`).toBeLessThan(1e-6);
      expect(c.markerWorld('headTop').distanceTo(head), `head @${t}`).toBeLessThan(1e-6);
      c.resetDofs();
    }
  });

  it('never pushes a planted foot into the ground: the guard stops at the floor', () => {
    const c = new MechaController(createMecha());
    c.setProgress(1);
    const r = c.setDof('ankleL.pitch', 30);
    expect(r.blockedBy?.[0]).toBe('ground');
    expect(r.value).toBeLessThan(30);
    for (const s of ['toeIn', 'toeOut', 'heelIn', 'heelOut']) expect(c.markerWorld(`soleL_${s}`).y, s).toBeGreaterThan(-0.03);
    c.resetDofs();
  });

  it('holds its place through Fighter → GERWALK (a VTOL lift while the legs unfold), feet never scraping', () => {
    const c = new MechaController(createMecha());
    c.setProgress(0);
    const w0 = c.markerWorld('torsoBase');
    let prev: THREE.Vector3[] | null = null;
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * 0.5;
      c.setProgress(t);
      const w = c.markerWorld('torsoBase');
      expect(Math.hypot(w.x - w0.x, w.z - w0.z), `waist drift @${t.toFixed(3)}`).toBeLessThan(0.05);
      const soles = SOLES.map((id) => c.markerWorld(id));
      if (prev) {
        soles.forEach((p, k) => {
          // A sole on the ground in consecutive samples must not move along it.
          if (p.y < 0.01 && prev![k].y < 0.01) expect(Math.hypot(p.x - prev![k].x, p.z - prev![k].z), `${SOLES[k]} slides @${t.toFixed(3)}`).toBeLessThan(0.01);
        });
      }
      prev = soles;
    }
  });

  it('keeps the feet planted where they landed all the way to Battroid, then steps each out to the Battroid stance', () => {
    const c = new MechaController(createMecha());
    c.setProgress(1);
    const feet1 = SOLES.map((id) => c.markerWorld(id));
    c.setProgress(0.5);
    const feet0 = SOLES.map((id) => c.markerWorld(id));
    // Each foot leaves its spot only for its own step, left then right.
    const step = (id: string) => (id.startsWith('soleL') ? [0.86, 0.9] : [0.9, 0.94]);
    let lastZ = c.markerWorld('torsoBase').z;
    let dir = 0;
    let reversals = 0;
    for (let i = 1; i <= 100; i++) {
      const t = 0.5 + i / 200;
      c.setProgress(t);
      SOLES.forEach((id, k) => {
        const [a, b] = step(id);
        const p = c.markerWorld(id);
        if (t <= a) expect(p.distanceTo(feet0[k]), `${id} @${t}`).toBeLessThan(0.02);
        if (t >= b) expect(p.distanceTo(feet1[k]), `${id} @${t}`).toBeLessThan(0.02);
      });
      const z = c.markerWorld('torsoBase').z;
      const d = Math.sign(Math.round((z - lastZ) * 1000));
      if (d && dir && d !== dir) reversals++;
      if (d) dir = d;
      lastZ = z;
    }
    expect(reversals, 'waist back-and-forth').toBeLessThanOrEqual(1);
    // Mid-step the stepping boot is clear of the ground while the other stands on it.
    for (const [t, up, down] of [[0.88, 'L', 'R'], [0.92, 'R', 'L']] as const) {
      c.setProgress(t);
      const low = (S: string) => Math.min(...SOLES.filter((id) => id.startsWith(`sole${S}`)).map((id) => c.markerWorld(id).y));
      expect(low(up), `${up} lifted @${t}`).toBeGreaterThan(0.15);
      expect(low(down), `${down} planted @${t}`).toBeLessThan(0.02);
    }
  });
});

import * as THREE from 'three';
import type { Vf1Builder as Builder } from './materials';
import { chordY, halfThickness } from '../../core/geometry/wing';
import { WING } from './surfaces';
import { D } from './dims';
import { PALETTE } from './config';
import { ANKLE_TO_AXIS_Z, CALF_FLARE, SHIN_AXIS_Z, shinAt } from './parts/legs';

/**
 * VF-1J markings drawn at runtime on canvases (no image assets):
 * U.N. Spacy roundels, U.N.SPACY lettering, fin numbers and ⊖ stencils.
 * Browser-only: skipped when there is no DOM (unit tests).
 */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Red disc with the white U.N. Spacy "kite". */
function roundel() {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = PALETTE.vermilion;
    g.beginPath();
    g.arc(128, 128, 122, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(128, 34);
    g.quadraticCurveTo(150, 120, 214, 196);
    g.lineTo(150, 170);
    g.lineTo(128, 214);
    g.lineTo(106, 170);
    g.lineTo(42, 196);
    g.quadraticCurveTo(106, 120, 128, 34);
    g.fill();
    g.fillStyle = PALETTE.vermilion;
    g.beginPath();
    g.moveTo(128, 104);
    g.lineTo(146, 160);
    g.lineTo(128, 150);
    g.lineTo(110, 160);
    g.closePath();
    g.fill();
  });
}

function lettering(text: string, color: string, w = 512, h = 96) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = color;
    g.font = `900 ${Math.round(h * 0.78)}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + h * 0.04, w * 0.96);
  });
}

/** Black ⊖ maintenance stencil that dots the VF-1 line art. */
function stencil() {
  return canvasTexture(128, 128, (g) => {
    g.strokeStyle = PALETTE.black;
    g.lineWidth = 14;
    g.beginPath();
    g.arc(64, 64, 50, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = PALETTE.black;
    g.fillRect(22, 56, 84, 16);
  });
}

function material(map: THREE.Texture, set: Builder['mats']) {
  const m = new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    roughness: 0.55,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  set.decals.push(m);
  return m;
}

export function addDecals(b: Builder) {
  if (typeof document === 'undefined') return;
  const mRoundel = material(roundel(), b.mats);
  const mSpacyDark = material(lettering('U.N.SPACY', PALETTE.black), b.mats);
  const mSpacyLight = material(lettering('U.N.SPACY', '#f2f2f2'), b.mats);
  const mFin = material(lettering('101', PALETTE.black, 256, 128), b.mats);
  const mVF = material(lettering('VF', PALETTE.black, 256, 128), b.mats);
  const mStencil = material(stencil(), b.mats);

  for (const s of [1, -1]) {
    const side = s > 0 ? 'port' : 'starboard';
    const S = s > 0 ? 'L' : 'R';

    // Roundel on the cockpit-side stripe (follows the 4.1° taper).
    const y = 1.25;
    const hw = (yy: number) => D.nose.cockpitHalfWidth0 + ((D.nose.cockpitHalfWidth1 - D.nose.cockpitHalfWidth0) * yy) / D.nose.cockpitLen;
    const slope = (D.nose.cockpitHalfWidth0 - D.nose.cockpitHalfWidth1) / D.nose.cockpitLen;
    b.decal('forward-fuselage', 'cockpit', mRoundel, 0.56, 0.56, [s * (hw(y) + 0.035), y, -0.51], [s, slope, 0], [0, 0, -1]);
    b.decal('forward-fuselage', 'cockpit', mStencil, 0.24, 0.24, [s * (hw(2.95) + 0.03), 2.95, -0.55], [s, slope, 0], [0, 0, -1]);
    // Wing-top roundels near the tips, on the fixed wing box (clear of the slats and spoilers).
    const rx = 4.3;
    b.decal(`wing-${side}`, `wing${S}`, mRoundel, 0.44, 0.44, [s * rx, chordY(WING, rx, 0.33), -halfThickness(WING, rx, 0.3) - 0.006], [0, 0, -1], [0, 1, 0]);
    // Glove stencils near the sweep pivot.
    b.decal(`glove-${side}`, 'torso', mStencil, 0.34, 0.34, [s * 2.25, 2.55, D.glove.z - D.glove.thickness / 2 - 0.004], [0, 0, -1], [0, 1, 0]);
    // U.N.SPACY lettering on the flaring upper calf (reads nose-to-tail, upright in flight).
    b.decal(`shin-${side}`, `knee${S}`, mSpacyDark, 1.7, 0.3, [s * (shinAt(-1.5).xout + 0.012), -1.5, SHIN_AXIS_Z + 0.12], [s, CALF_FLARE, 0], [0, 0, -1]);
    b.decal(`thigh-${side}`, `thighSwing${S}`, mStencil, 0.28, 0.28, [s * 0.652, -0.62, 0.25], [s, 0, 0], [0, 0, -1]);
    // "VF" on the lower shin front (Battroid line art), on the upright face above the ankle bevel.
    const vfY = -3.5;
    b.decal(`shin-${side}`, `shinExt${S}`, mVF, 0.5, 0.25, [0, vfY + D.leg.shinLen, ANKLE_TO_AXIS_Z + shinAt(vfY).d / 2 + 0.012], [0, 0, 1], [0, 1, 0]);
    // Shoulder stencil.
    b.decal(`shoulder-${side}`, `shoulder${S}`, mStencil, 0.3, 0.3, [s * (D.arm.blockWidth / 2 + 0.012), -0.2, 0.2], [s, 0, 0], [0, 1, 0]);
    // Fin numbers on both faces of each fin.
    const fin = `fin${S}`;
    // (ahead of the rudder hinge line)
    b.decal(`tail-fin-${side}`, fin, mFin, 0.5, 0.25, [0.085, -2.1, -0.75], [1, 0, 0], [0, 0, -1]);
    b.decal(`tail-fin-${side}`, fin, mFin, 0.5, 0.25, [-0.085, -2.1, -0.75], [-1, 0, 0], [0, 0, -1]);
    // Gun-pod lettering, upright when carried in the fist (GERWALK and Battroid).
    b.decal('gun-pod', 'gunPod', mSpacyLight, 2.1, 0.32, [s * 0.358, -0.9, 0.55], [s, 0, 0], [0, 0, -1]);
  }
}

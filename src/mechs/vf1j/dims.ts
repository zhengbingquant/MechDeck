/**
 * Shared dimensions (metres) for the rig, geometry and markers.
 *
 * Frame: the torso bone "C" (centre fuselage). Origin at the waist, +Y toward
 * the shoulders (= fighter nose direction), +Z ventral (= Battroid chest side),
 * -Z dorsal (= fighter top / Battroid back), +X port (robot's left).
 *
 * Proportions are measured from the official line art: the VF-1A standard
 * five-view (標準五面図, 14.23 m; 74.1 px/m), the Battroid front schematic
 * (head top 12.68 m; 67.4 px/m) and the MAHQ TV line art of the VF-1J.
 * Key measurements (fighter, from the nose tip / the wing plane):
 *  - cockpit fuselage ~1.3 m wide, canopy top 0.72 m above the wing plane;
 *  - intake faces 4.6 m aft of the nose tip, centred ±1.2 m, 0.77 m below the wing plane;
 *  - nacelles ~1.2 m wide, 1.25 m deep; fins canted 22.5°, roots ±0.86 m;
 *  - fin root chord 10.1–12.45 m aft of the nose tip, tip chord 12.95–13.7 m;
 *  - tail module ends 12.5 m aft, its antenna boom 13.9 m; GU-11 muzzle 5.6 m.
 * Battroid: hips 6.75 m, knees 5.6 m, chest top 11.6 m (4.2 m wide), shoulder
 * blocks centred ±2.6 m, fists down to 5.8 m.
 */
export const D = {
  torso: {
    top: 4.2, // shoulder line / nose hinge
    back: -0.9, // dorsal skin
    front: 0.2, // ventral skin beside the head bay
    bayFront: -0.45, // recessed belly: the arm bay the arms fold into
    halfWidth: 1.4,
    /** Below this the torso narrows to the keel so the engine nacelles tuck under the gloves. */
    layerBottom: -0.57,
    keelHalfWidth: 0.9,
    waistHalfWidth: 0.4,
    waistTop: 1.45,
    slotHalfWidth: 0.77, // head bay
    slotBottom: 2.8,
    slotBack: -0.82,
    cheekBottom: 3.35, // below this the whole belly is open (arm bay)
  },
  nose: {
    hinge: [0, 4.2, 0.2] as const,
    rearLen: 1.6, // chest-plate / airbrake section
    rearHalfWidth0: 1.8,
    rearHalfWidth1: 0.67, // meets the cockpit section (1.34 m wide, five-view)
    depth: 1.65,
    /** The chest plate's lower half is a keel this wide, leaving room for the intakes beside it. */
    keelHalfWidth: 0.9,
    keelDepth: 0.78,
    cockpitLen: 3.3, // canopy + black band + nose barrel
    cockpitSlide: 1.0, // slides under the chest plate in Battroid
    radomeLen: 1.95,
    /** Cockpit fuselage half-width where it meets the chest plate, and its taper to the radome. */
    cockpitHalfWidth0: 0.67,
    cockpitHalfWidth1: 0.5,
    radomeSlide: 0.75, // telescopes over the nose barrel in Battroid (stops at the black band)
    /**
     * Canopy shield (Macross Compendium: "retractable shield for Battroid mode and atmospheric
     * reentry"; transformation sheet: the canopy cover comes down). Two nested armoured hoods,
     * deployed over the canopy (cockpit-frame spans), stowed in the chest spine behind it.
     */
    shield: {
      a: [0.98, 1.72] as const,
      b: [1.68, 2.42] as const,
      stowA: -1.98,
      stowB: -2.66,
      /** Arch feet level (cockpit frame) and wall thickness. */
      zBase: -0.93,
      wall: 0.015,
    },
  },
  head: {
    stowed: [0, 2.82, -0.32] as const, // upright in the head bay, visor flush with the belly
    battroid: [0, 4.08, -0.32] as const, // chin just below the chest top (schematic)
    height: 1.3,
  },
  wing: {
    // Wing plane 0.72 m below the canopy top (five-view); the pivot and panel
    // length reproduce both published spans (14.78 m at 20°, 8.25 m at 72°).
    pivot: [2.55, 2.6, -0.7] as const,
    length: 5.2, // pivot to tip along the span line
    rootLE: 0.62,
    rootTE: -1.38,
    tipLE: 0.12,
    tipTE: -0.88,
    thickness: 0.2,
    /**
     * Battroid stowage (Yamato 1/60 VF-1 manual, step 29; MAHQ and colour-guide rear views): the
     * wing-root carriages run up the back to shoulder height beside the backpack, and the wings
     * fold down past vertical into a narrow V behind the body, tips meeting near the crotch,
     * under the backpack.
     */
    stow: [1.6, 4.0, -1.2] as const,
    /** Past vertical: the V the stowed wings form (tips converge). */
    stowSweep: 96,
  },
  glove: {
    innerX: 0.9,
    z: -0.7,
    thickness: 0.24,
  },
  tail: {
    /** Fold hinge on the dorsal skin, 1 m up the back from the waist (the fin roots start here). */
    hinge: [0, 1.0, -0.9] as const,
    /** In Battroid the module rides this far up the back, between the shoulder blades… */
    battroidLift: 0.9,
    /** …and this far off the dorsal skin, over the stowed wings. */
    battroidOut: -0.53,
    length: 2.45,
    halfWidth: 0.84, // between the nacelles
    depth: 0.45,
    /** Front section is an open U-channel that straddles the waist keel in Fighter mode. */
    channelLen: 1.0,
    channelHalfWidth: 0.45,
    /** Fin span (root to tip along the fin) and cant (five-view front: 22.5°). */
    finHeight: 1.78,
    finCant: 22.5,
    /** Fin root leading edge / fold hinge on the module's side edge. */
    finRoot: [0.86, -0.05, -0.02] as const,
    /**
     * The two pop-out vernier nozzles in the belly's well (module frame, port one): flush in flight
     * and Battroid, they stand up out of the well, mouths turned toward the hinge end, in GERWALK
     * (the kit's two nozzles at the rear of the block's top).
     */
    vernier: [0.24, -1.2] as const,
    /** Antenna boom off the module's tail end, and the whip that extends from it in GERWALK. */
    mastLen: 1.4,
    whipLen: 1.3,
  },
  leg: {
    // Nacelles centred ±1.55 m in flight (±1.2 m in the five-view; the wider
    // stance leaves room for the stowed arms between them), ±1.6 m in Battroid.
    railBattroid: [1.6, -0.67, 0] as const,
    railFighter: [1.55, 6.45, 0.1] as const,
    /** The hip rail's telescoping lower section runs out this far (along y) below the fixed section for Battroid. */
    railExtRun: 2.45,
    intakeLen: 2.2, // also the hip slide: legs hang from the intake lip in flight
    /**
     * The hip pivot sits this far inboard of the leg's axis, in the slot between the rail and the
     * intake box's inboard face: the leg turns on a hub there, clear of the intake mouth and the
     * air duct (on the axis it put the hip hardware in front of the fan and through the duct).
     */
    hipIn: 0.62,
    thighLen: 1.15,
    /** Walking hip pivot at the top of the thigh, under the intake box (the intakes stay put). */
    thighPivot: 0.16,
    shinLen: 4.15,
    /**
     * Knee hinge on the leg's front face: the shin swings forward-down 90° to
     * hang below the horizontal thigh in GERWALK, and flexes back in Battroid.
     */
    kneeFront: 0.6,
    /** Ankle gimbal centre (on the nozzle axis at the bottom of the shin) relative to the knee hinge. */
    ankleBack: -0.85,
    width: 1.2,
    depth: 1.25,
    /**
     * Foot = the engine's split two-dimensional nozzle (Macross Compendium: 2-D vectored-thrust
     * nozzles that double as feet; the transformable toys spread the nozzle's halves into toe and
     * heel). A nozzle body in line with the shin on a two-axis ankle gimbal, and two clamshell flaps
     * pinned below its end: closed they are the divergent section (the five-view's "<"), opened 90°
     * they are the toe and heel, and the exhaust fires down through the slot between them. Standing,
     * they open 80° (not flat): the kit's "^" stance, with the sloping toe and heel tops of the line art.
     */
    foot: {
      /** Spherical ankle bearing round the gimbal centre, and the duct below it that the nozzle body fits over. */
      ball: 0.3,
      duct: 0.24,
      /** Body end / flap hinge line below the ankle gimbal centre, along the nozzle axis. */
      bodyEnd: -0.94,
      bodyWidth: 1.28,
      bodyDepth: 0.96,
      /**
       * Toe / heel flaps: length from the hinge, thickness at the root and at the tip. Each hinges at
       * mid-thickness on pins through the throat walls, this far below the body end, and its root is
       * rounded about the pin, so it turns in place at any angle (flight vectoring or folding flat).
       */
      flapLen: 1.0,
      flapRoot: 0.36,
      flapTip: 0.12,
      hingeDrop: 0.2,
      /** Fixed throat side walls (clevis plates carrying the flap pins) below the body end. */
      throatWall: 0.34,
    },
  },
  gun: {
    /**
     * GU-11 on the ventral mount (torso frame): hung grip-down below the stowed arms,
     * axis 1.64 m below the wing plane, muzzle ~5.6 m aft of the nose tip, the lowest
     * point of the fighter (five-view side view).
     */
    mount: [0, 2.12, 1.49] as const,
    /**
     * The ventral mount runs the pod forward until its stock clears the dropped knees and lowers it
     * clear of the intakes; its strut then swings it out into the right fist (grip offsets).
     */
    slide: 3.0,
    drop: 0.61,
    /**
     * Mount strut (starboard intake frame): base on the intake's underside, and the lug on the
     * pod's starboard flank (pod frame) it holds the pod by.
     */
    strutBase: [0.15, 0.95, 0.66] as const,
    strutLug: [-0.44, -2.3, 0.55] as const,
    /** Grip position in the (palm-down) right fist. */
    grip: [0, -0.42, 0.27] as const,
  },
  arm: {
    /** Battroid schematic: shoulder blocks ±2.3–3.3 m, their tops 11.9 m up. */
    shoulderBattroid: [2.8, 3.9, 0.0] as const,
    /** Stowed in the ventral bay between the nacelles, twisted 90° so the arm stands on edge. */
    shoulderFighter: [0.47, 1.5, 0.07] as const,
    blockWidth: 1.0,
    blockTop: 0.75,
    blockBottom: -0.9,
    blockDepth: 0.84,
    /** Shoulder lock saddle: how far it runs out of the block's back to clamp into the glove. */
    lockStroke: 0.55,
    /**
     * Hinge pin along the block's top-back edge (block frame): in GERWALK it sits in a clevis under
     * the glove and the block hangs from it, turned 90° down; for Battroid it turns back up on it.
     */
    hingePin: [0, 0.72, -0.38] as const,
    pivotDrop: 1.35, // exposed shoulder joint below the armour block (room to swing forward)
    upperLen: 1.0,
    foreLen: 2.2,
    foreWidth: 1.0,
    foreDepth: 0.84,
    handLen: 0.75,
    handRetract: 0.75,
  },
} as const;

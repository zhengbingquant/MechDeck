import type { CollisionRules } from '../../core/collisions';

/** Designed contacts on the VF-1J (everything else must never touch). */
export const VF1J_COLLISION_RULES: CollisionRules = {
  telescoping: [
    'legSlideL|thighSwingL', 'legSlideR|thighSwingR',
    'thighSwingL|thighExtL', 'thighSwingR|thighExtR',
    'kneeL|shinExtL', 'kneeR|shinExtR',
    'nose|cockpit', 'cockpit|radome',
    // Locks: the shoulder saddle runs out of its block into the glove; the swing-bar arm runs out
    // of its carriage and intake into the fuselage side.
    'shoulderL|shoulderLockL', 'shoulderR|shoulderLockR', 'torso|shoulderLockL', 'torso|shoulderLockR',
    'hipRailL|hipLockL', 'hipRailR|hipLockR',
    // The hip rail's lower section telescopes out of the fixed section.
    'torso|hipRailExtL', 'torso|hipRailExtR', 'hipL|hipLockL', 'hipR|hipLockR', 'legSlideL|hipLockL', 'legSlideR|hipLockR',
    'cockpit|hipLockL', 'cockpit|hipLockR', 'nose|hipLockL', 'nose|hipLockR',
    // The canopy shield's hoods stow inside the chest spine, the front one nested in the rear one.
    'nose|shieldA', 'nose|shieldB', 'shieldA|shieldB',
    'elbowL|wristL', 'elbowR|wristR',
    // The antenna boom retracts into the backpack; the whip telescopes out of the boom (and so
    // lies inside the backpack with it when both are in).
    'tailModule|mast', 'mast|whip', 'tailModule|whip',
    // Landing gear folds into its bays: the nose gear under the cockpit floor, the mains into the shins.
    'cockpit|noseGear', 'cockpit|noseDoorL', 'cockpit|noseDoorR', 'noseGear|noseDoorL', 'noseGear|noseDoorR',
    // (the folded nose gear shares the nose barrel with the radome's telescoping sleeve)
    'radome|noseGear',
    'kneeL|mainGearL', 'kneeR|mainGearR',
  ],
  nested: [
    // The GU-11 grip sits inside the right fist.
    [/^gun-pod$/, /^hand-starboard$/],
    // The swing-wing roots (with their inboard slat and flap) live inside the fixed gloves.
    [/^wing(-slat|-flap)?-port$/, /^glove-port$/],
    [/^wing(-slat|-flap)?-starboard$/, /^glove-starboard$/],
  ],
  internalAllow: {
    // Gear sets live inside their joint housings, so they share the housings' seats.
    'radar-array': ['noseGear'],
    // The main-gear bays are carved into the nacelles, beside the engine core.
    'compressor-port': ['mainGearL'],
    'compressor-starboard': ['mainGearR'],
    'reaction-chamber-port': ['mainGearL'],
    'reaction-chamber-starboard': ['mainGearR'],
    'turbine-port': ['mainGearL'],
    'turbine-starboard': ['mainGearR'],
    'leg-frame-port': ['mainGearL'],
    'leg-frame-starboard': ['mainGearR'],
    // The sweep ring gear rides inside the glove, including when the pivot runs back to stow the wing.
    'wing-pivot-drive-port': ['torso', 'wingL'],
    'wing-pivot-drive-starboard': ['torso', 'wingR'],
    // The engine duct runs through the hip swivel and round the knee: its pieces lap into each
    // other and into the shin's inlet as the joints bend.
    'exhaust-duct-port': ['shinExtL', 'ankleL'],
    'exhaust-duct-starboard': ['shinExtR', 'ankleR'],
    'intake-duct-port': ['kneeL', 'thighSwingL'],
    'intake-duct-starboard': ['kneeR', 'thighSwingR'],
    'duct-bellows-port': ['kneeL', 'thighSwingL'],
    'duct-bellows-starboard': ['kneeR', 'thighSwingR'],
    'knee-gearbox-port': ['thighSwingL', 'thighExtL'],
    'knee-gearbox-starboard': ['thighSwingR', 'thighExtR'],
    'ankle-gearbox-port': ['kneeL', 'shinExtL', 'footL'],
    'ankle-gearbox-starboard': ['kneeR', 'shinExtR', 'footR'],
    // Joint drives sit inside the joints they turn, seated in both sides of the joint.
    'shoulder-drive-port': ['shoulderL', 'upperArmL'],
    'shoulder-drive-starboard': ['shoulderR', 'upperArmR'],
    'wrist-drive-port': ['elbowL', 'wristL'],
    'wrist-drive-starboard': ['elbowR', 'wristR', 'gunPod'],
    'hip-drive-port': ['hipRailL', 'hipL', 'legSlideL', 'thighSwingL'],
    'hip-drive-starboard': ['hipRailR', 'hipR', 'legSlideR', 'thighSwingR'],
    'head-drives': ['torso', 'head', 'laserL', 'laserR'],
    // The backpack ram's clevis lug sits in the waist keel's ram slot while the module is down.
    'tail-fold-actuator': ['torso', 'tailModule'],
    // The wing-root swing arms' hinges are in the gloves; their links pick up the carriages' yokes.
    'wing-swing-arm-port': ['torso', 'wingRootL'],
    // The shoulder transfer arms grip their block's socket.
    'arm-transfer-port': ['torso', 'shoulderL'],
    // The gun-pod mount strut holds the pod's lug.
    'gun-mount-strut': ['gunPod'],
    'arm-transfer-starboard': ['torso', 'shoulderR'],
    'wing-swing-arm-starboard': ['torso', 'wingRootR'],
  },
};

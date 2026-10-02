import * as THREE from 'three';

/**
 * Subtle, texture-free surface variation for painted and metal parts: a
 * large-scale mottle plus fine grain in albedo and roughness, evaluated in
 * the part's own (model) space so it stays glued to the part while it
 * moves through a transformation.
 */
export function addSurfaceVariation(m: THREE.MeshStandardMaterial, amount = 1): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uVariation = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vObjPos;
        uniform float uVariation;
        float svHash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float svNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(svHash(i), svHash(i + vec3(1, 0, 0)), f.x), mix(svHash(i + vec3(0, 1, 0)), svHash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(svHash(i + vec3(0, 0, 1)), svHash(i + vec3(1, 0, 1)), f.x), mix(svHash(i + vec3(0, 1, 1)), svHash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float svMottle = svNoise(vObjPos * 1.7) * 0.6 + svNoise(vObjPos * 5.3) * 0.4;
        float svGrain = svNoise(vObjPos * 41.0);
        diffuseColor.rgb *= 1.0 + uVariation * ((svMottle - 0.5) * 0.07 + (svGrain - 0.5) * 0.025);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + uVariation * ((svMottle - 0.5) * 0.14 + (svGrain - 0.5) * 0.06), 0.04, 1.0);`,
      );
  };
  m.customProgramCacheKey = () => 'surface-variation';
  return m;
}

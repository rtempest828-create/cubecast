/**
 * Die Blendshapes des MediaPipe Face Landmarkers (ARKit-Namen, ohne `tongueOut`,
 * plus `_neutral`). Die Werte liegen intern als `Float32Array` in genau dieser
 * Reihenfolge vor; die Zuordnung erfolgt über den Namen, nicht über die Position.
 */
export const BLENDSHAPE_NAMES = [
  '_neutral',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight'
] as const

export type BlendshapeName = (typeof BLENDSHAPE_NAMES)[number]

export const BLENDSHAPE_COUNT = BLENDSHAPE_NAMES.length

const INDEX = new Map<string, number>(BLENDSHAPE_NAMES.map((name, i) => [name, i]))

export function blendshapeIndex(name: BlendshapeName): number {
  return INDEX.get(name)!
}

/** Überführt MediaPipe-Kategorien in ein Array fester Reihenfolge. Unbekannte Namen werden ignoriert. */
export function blendshapesFromCategories(categories: readonly { readonly categoryName: string; readonly score: number }[]): Float32Array {
  const values = new Float32Array(BLENDSHAPE_COUNT)
  for (const category of categories) {
    const index = INDEX.get(category.categoryName)
    if (index !== undefined) values[index] = Math.max(0, Math.min(1, category.score))
  }
  return values
}

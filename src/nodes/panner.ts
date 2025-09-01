import { GraphNodeSpec } from '../types.js';

export interface PannerParams {
  panningModel?: PanningModelType; // 'HRTF' | 'equalpower'
  distanceModel?: DistanceModelType; // 'linear' | 'inverse' | 'exponential'
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
  position?: [number, number, number];
  orientation?: [number, number, number];
}

export function createPanner(
  context: BaseAudioContext,
  spec: GraphNodeSpec
): PannerNode {
  const node = context.createPanner();
  const p = (spec.params || {}) as Partial<PannerParams>;

  if (p.panningModel) node.panningModel = p.panningModel;
  if (p.distanceModel) node.distanceModel = p.distanceModel as any;
  if (typeof p.refDistance === 'number') node.refDistance = p.refDistance;
  if (typeof p.maxDistance === 'number') node.maxDistance = p.maxDistance;
  if (typeof p.rolloffFactor === 'number') node.rolloffFactor = p.rolloffFactor;
  if (typeof p.coneInnerAngle === 'number') node.coneInnerAngle = p.coneInnerAngle;
  if (typeof p.coneOuterAngle === 'number') node.coneOuterAngle = p.coneOuterAngle;
  if (typeof p.coneOuterGain === 'number') node.coneOuterGain = p.coneOuterGain;
  const hasParams = (node as any).positionX && (node as any).orientationX;
  if (p.position) {
    if (hasParams) {
      (node as any).positionX.setValueAtTime(p.position[0], context.currentTime);
      (node as any).positionY.setValueAtTime(p.position[1], context.currentTime);
      (node as any).positionZ.setValueAtTime(p.position[2], context.currentTime);
    } else if ((node as any).setPosition) {
      (node as any).setPosition(p.position[0], p.position[1], p.position[2]);
    }
  }
  if (p.orientation) {
    if (hasParams) {
      (node as any).orientationX.setValueAtTime(p.orientation[0], context.currentTime);
      (node as any).orientationY.setValueAtTime(p.orientation[1], context.currentTime);
      (node as any).orientationZ.setValueAtTime(p.orientation[2], context.currentTime);
    } else if ((node as any).setOrientation) {
      (node as any).setOrientation(p.orientation[0], p.orientation[1], p.orientation[2]);
    }
  }
  return node;
}

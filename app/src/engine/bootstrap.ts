import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';

/** Height of the viewer's eyes above the floor, in metres. */
export const EYE_HEIGHT = 1.6;

export interface Stage {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  /** Camera used outside of XR. In XR the WebXR helper supplies its own. */
  previewCamera: FreeCamera;
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const engine = new Engine(
    canvas,
    true,
    {
      // MSAA matters more in VR than on a flat screen -- the viewer can lean in
      // and inspect any edge, and shimmer is much more noticeable stereoscopically.
      antialias: true,
      powerPreference: 'high-performance',
      // The XR compositor owns presentation, so we never read the buffer back.
      preserveDrawingBuffer: false,
      stencil: false,
      // Skips a per-frame full-screen composite step on mobile GPUs.
      premultipliedAlpha: false,
      // Standalone headsets throttle hard on heat; don't let the browser
      // silently hand us a software renderer if the GPU context is lost.
      failIfMajorPerformanceCaveat: false,
    },
    // adaptToDeviceRatio -- respects the headset's own resolution scaling.
    true,
  );

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.043, 0.039, 0.035, 1);

  // glTF is right-handed. Matching it here avoids the loader wrapping every
  // import in a mirrored root node, which otherwise flips normals and makes
  // anchor transforms read backwards from what the Blender script authored.
  scene.useRightHandedSystem = true;

  const previewCamera = new FreeCamera('preview-camera', new Vector3(0, EYE_HEIGHT, 0), scene);
  // Aim explicitly: in a right-handed scene the default camera orientation is
  // not the -Z you'd expect from the left-handed default, so relying on it
  // silently points the preview away from the staged vantage.
  previewCamera.setTarget(new Vector3(0, EYE_HEIGHT - 0.35, -1.4));
  previewCamera.minZ = 0.05; // viewer can bring objects close to their face
  previewCamera.maxZ = 60;   // single room; a long far plane just wastes depth precision
  previewCamera.fov = 1.1;
  scene.activeCamera = previewCamera;

  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  engine.runRenderLoop(() => {
    if (scene.activeCamera) scene.render();
  });

  return {
    engine,
    scene,
    canvas,
    previewCamera,
    dispose() {
      window.removeEventListener('resize', onResize);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}

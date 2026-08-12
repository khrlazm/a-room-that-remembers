// Side-effect imports. XR features register themselves with the features
// manager on load; asking for one that has not been imported fails the whole
// session with "feature not found - xr-near-interaction" and no XR at all.
// These must be imported here, where the session is created, rather than in the
// lazily-loaded grab module that uses them -- by then the session is long gone.
import '@babylonjs/core/XR/features/WebXRNearInteraction';
import '@babylonjs/core/XR/features/WebXRHandTracking';

import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {
  WebXRHandJoint,
  type WebXRHandTracking,
} from '@babylonjs/core/XR/features/WebXRHandTracking';
import { WebXRFeatureName } from '@babylonjs/core/XR/webXRFeaturesManager';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience';
import type { WebXRDefaultExperienceOptions } from '@babylonjs/core/XR/webXRDefaultExperience';

export interface XrSession {
  experience: WebXRDefaultExperience;
  enter(): Promise<void>;
  exit(): Promise<void>;
  readonly inSession: boolean;
}

export interface XrOptions {
  /** Camera whose position and heading define the viewer's authored vantage. */
  vantageFrom: FreeCamera;
  onEnter?: () => void;
  onExit?: () => void;
}

/**
 * Set up an immersive-vr session for a stationary experience.
 *
 * Almost everything WebXRDefaultExperience offers by default is turned off
 * here. The viewer never moves, never points at anything, and never needs a
 * controller ray -- the only input is where they look. Leaving teleportation
 * and pointer selection enabled would put laser pointers and a teleport arc in
 * a piece that has no use for either.
 */
export async function setupXR(scene: Scene, options: XrOptions): Promise<XrSession | null> {
  const config: WebXRDefaultExperienceOptions = {
    // We drive entry from our own landing page button, which is also the user
    // gesture WebXR requires.
    disableDefaultUI: true,
    // The viewer never moves, so there is nothing to teleport to, and the only
    // verbs are looking and -- in the codas -- reaching. A laser pointer would
    // be interface in a piece that is trying to be a room.
    disableTeleportation: true,
    disablePointerSelection: true,
    // Hands are the designed input for the codas: reaching out and closing your
    // fingers on something is the whole gesture, in a piece about a man who
    // worked with his. Controllers still work as a fallback for viewers who
    // have hand tracking switched off.
    disableHandTracking: false,
    disableNearInteraction: false,
    // 'local-floor' puts the origin on the physical floor, so the authored
    // eye height in Blender lines up with the viewer's real standing height
    // rather than being guessed.
    uiOptions: { sessionMode: 'immersive-vr', referenceSpaceType: 'local-floor' },
    // Requested explicitly rather than with `true`, which asks for everything
    // Babylon knows about. A session that fails because an unrelated optional
    // feature was refused would be a miserable thing to diagnose on a headset.
    optionalFeatures: ['hand-tracking'],
    handSupportOptions: {
      handMeshes: {
        // Babylon's default rigged hand is fetched from its asset CDN. Beyond
        // being an external dependency this project has spent real effort
        // avoiding, a partial load leaves the mesh sitting at the world origin
        // on the floor -- visible, wrong, and nothing to do with your hands.
        disableDefaultMeshes: true,
      },
      jointMeshes: {
        sourceMesh: makeJointMesh(scene),
        // Instances are scaled by each joint's tracked radius; this multiplies
        // that. 1 is life-size, which is what you want for something standing
        // in for your own fingers.
        scaleFactor: 1,
      },
    },
  };

  let experience: WebXRDefaultExperience;
  try {
    experience = await WebXRDefaultExperience.CreateAsync(scene, config);
  } catch (error) {
    console.warn('[xr] could not create the XR experience', error);
    return null;
  }

  if (!experience.baseExperience) return null;

  const base = experience.baseExperience;
  let inSession = false;

  base.onStateChangedObservable.add(() => {
    // 2 === IN_XR. Compared numerically to avoid importing the enum for one use.
    const entering = base.state === 2;
    if (entering === inSession) return;
    inSession = entering;
    if (entering) {
      tuneSession(base.sessionManager);
      watchHands(base);
      options.onEnter?.();
    } else {
      options.onExit?.();
    }
  });

  return {
    experience,
    get inSession() {
      return inSession;
    },
    async enter() {
      // Carry the authored vantage into the XR rig: this copies position and
      // heading from the preview camera, so where the viewer stands and which
      // way they face both come from the Blender anchors rather than from
      // wherever they happened to be standing when they put the headset on.
      base.camera.setTransformationFromNonVRCamera(options.vantageFrom, true);
      await base.enterXRAsync('immersive-vr', 'local-floor');
    },
    async exit() {
      await base.exitXRAsync();
    },
  };
}

/**
 * The joint marker: a small, dim bead.
 *
 * Deliberately understated. The piece is a dim room and the hands are the
 * viewer's, not a character's -- bright tracked spheres would read as equipment
 * floating in front of them. Low-poly because there are twenty-five of these
 * per hand and they are a couple of centimetres across.
 */
function makeJointMesh(scene: Scene): Mesh {
  const material = new StandardMaterial('joint-mat', scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(0.62, 0.58, 0.53);
  material.disableLighting = true;
  // Opaque. Transparency on hardware instances is unreliable and there is no
  // reason to pay for it on twenty-five beads per hand.

  // **Diameter one metre, deliberately.** Babylon's docs for `sourceMesh` say
  // it "should have the general size of a single unit, as the instances will be
  // scaled according to the provided radius" -- each joint instance is scaled
  // down by that joint's tracked radius, roughly a centimetre. An earlier
  // 12mm source therefore produced beads about a tenth of a millimetre across:
  // rendering correctly, and far too small to see.
  const mesh = CreateSphere('joint-source', { diameter: 1, segments: 6 }, scene);
  mesh.material = material;
  mesh.isPickable = false;
  // Hidden via isVisible, never setEnabled. Babylon builds each joint with
  // `sourceMesh.createInstance()`, and an InstancedMesh reports itself disabled
  // whenever its source is -- so disabling the template hides all fifty joints
  // and the hands vanish entirely. `isVisible` is exactly what Babylon sets on
  // the template itself, and it does so only once a session attaches, which
  // would otherwise leave this sphere sitting at the origin on desktop.
  mesh.isVisible = false;
  return mesh;
}

/**
 * Clear stale hand beads when a hand goes away.
 *
 * Picking up a controller ends hand tracking, but Babylon reuses rather than
 * destroys the joint meshes, so they are left hanging wherever the hand was
 * last seen and nothing else clears them. `onHandRemovedObservable` fires both
 * when a controller is picked up and when hands leave the tracking volume.
 */
function watchHands(base: WebXRDefaultExperience['baseExperience']): void {
  const handTracking = base.featuresManager.getEnabledFeature(
    WebXRFeatureName.HAND_TRACKING,
  ) as WebXRHandTracking | null;
  if (!handTracking) return;

  handTracking.onHandRemovedObservable.add((hand) => {
    for (const joint of Object.values(WebXRHandJoint)) {
      const mesh = hand.getJointMesh(joint);
      if (mesh) mesh.setEnabled(false);
    }
  });
  handTracking.onHandAddedObservable.add((hand) => {
    for (const joint of Object.values(WebXRHandJoint)) {
      const mesh = hand.getJointMesh(joint);
      if (mesh) mesh.setEnabled(true);
    }
  });
}

/** Apply the standalone-headset settings that are only valid inside a session. */
function tuneSession(sessionManager: WebXRDefaultExperience['baseExperience']['sessionManager']): void {
  // Fixed foveation drops shading rate toward the edges of the lens, where the
  // optics are soft anyway. On a mobile GPU this is close to free performance;
  // 1 is maximum foveation, which is safe here because the piece has no fine
  // text or detail in the periphery.
  if (sessionManager.isFixedFoveationSupported) {
    sessionManager.fixedFoveation = 1;
  }

  // Prefer 72Hz. Chasing 90 on a standalone headset costs 25% of the frame
  // budget for a difference most viewers do not notice in a slow, static piece
  // -- and dropping frames at 90 is far worse than holding 72.
  const rates = sessionManager.supportedFrameRates;
  if (rates && rates.length > 0) {
    const preferred = [72, 90, 80].find((rate) => Array.from(rates).includes(rate));
    if (preferred) {
      void sessionManager.updateTargetFrameRate(preferred).catch((error: unknown) => {
        console.warn('[xr] could not set frame rate', error);
      });
    }
  }

  console.info(
    `[xr] session started — foveation ${sessionManager.fixedFoveation ?? 'n/a'}, ` +
      `rates [${rates ? Array.from(rates).join(', ') : 'unknown'}]`,
  );
}

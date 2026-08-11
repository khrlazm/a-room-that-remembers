import type { Scene } from '@babylonjs/core/scene';
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
    disableTeleportation: true,
    disableNearInteraction: true,
    disablePointerSelection: true,
    disableHandTracking: true,
    // 'local-floor' puts the origin on the physical floor, so the authored
    // eye height in Blender lines up with the viewer's real standing height
    // rather than being guessed.
    uiOptions: { sessionMode: 'immersive-vr', referenceSpaceType: 'local-floor' },
    optionalFeatures: false,
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

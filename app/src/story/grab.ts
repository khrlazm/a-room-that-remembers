import '@babylonjs/core/Culling/ray';

import type { Scene } from '@babylonjs/core/scene';
import type { Nullable } from '@babylonjs/core/types';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { WebXRFeatureName } from '@babylonjs/core/XR/webXRFeaturesManager';
import {
  WebXRHandJoint,
  type WebXRHandTracking,
} from '@babylonjs/core/XR/features/WebXRHandTracking';
import type { WebXRInputSource } from '@babylonjs/core/XR/webXRInputSource';

import type { Grabbable, PhysicsWorld } from '../physics/world';
import type { XrSession } from '../engine/xr';

/**
 * Pinch thresholds, in metres between thumb tip and index tip.
 *
 * Two values, not one. A single threshold makes a hand held near the boundary
 * chatter between grabbed and released several times a second, which feels
 * broken in a way that is hard to describe and easy to experience.
 */
const PINCH_CLOSE = 0.022;
const PINCH_OPEN = 0.042;

/** How far from the pinch point an object may be and still be caught. */
const REACH = 0.20;

/** Fraction of hand velocity handed back on release. */
const THROW_SCALE = 0.35;
/** Hard ceiling on release speed, metres per second. */
const THROW_MAX = 0.9;

/** Window over which release velocity is averaged. */
const VELOCITY_WINDOW_MS = 90;

interface Sample {
  at: number;
  position: Vector3;
}

/** One input source, reduced to what grabbing actually needs. */
interface HandPose {
  id: string;
  position: Vector3;
  rotation: Quaternion;
  pinching: boolean;
  valid: boolean;
}

interface Held {
  grabbable: Grabbable;
  /** Object position in hand space at the moment of grabbing. */
  positionOffset: Vector3;
  /** Object orientation relative to the hand at the moment of grabbing. */
  rotationOffset: Quaternion;
  samples: Sample[];
}

function makePose(id: string): HandPose {
  return {
    id,
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    pinching: false,
    valid: false,
  };
}

/**
 * Catching and turning objects.
 *
 * Not built on Babylon's pointer selection, which stays disabled: a laser
 * pointer would put interface into a piece whose only verbs are looking and
 * reaching, and it would let the viewer act at a distance in a coda that is
 * about having something in your hands.
 *
 * Hands, controllers and the desktop mouse all reduce to the same `HandPose` --
 * a point, an orientation, and whether it is closed. Everything downstream is
 * written once. The desktop path exists because grab is otherwise untestable
 * without a headset, and this session has already shown what happens to code
 * only one environment ever exercises.
 */
export class GrabController {
  private readonly poses = new Map<string, HandPose>();
  private readonly held = new Map<string, Held>();
  private readonly controllers = new Map<string, WebXRInputSource>();
  private handTracking: WebXRHandTracking | null = null;
  private observer: Nullable<Observer<Scene>> = null;

  private readonly scratchPosition = new Vector3();
  private readonly scratchRotation = new Quaternion();
  private readonly inverse = new Quaternion();

  /** Desktop drag state: distance from camera to hold the object at. */
  private pointerDepth = 0;
  private pointerDown = false;

  constructor(
    private readonly scene: Scene,
    private readonly world: PhysicsWorld,
    xr: XrSession | null,
  ) {
    if (xr) this.attachXR(xr);
    this.attachPointer();
    this.observer = scene.onBeforeRenderObservable.add(() => this.update());
  }

  private attachXR(xr: XrSession): void {
    const base = xr.experience.baseExperience;

    // The feature only exists once a session has started, so this is read
    // lazily in update() rather than captured here.
    const readHandTracking = () => {
      if (this.handTracking) return;
      this.handTracking = base.featuresManager.getEnabledFeature(
        WebXRFeatureName.HAND_TRACKING,
      ) as WebXRHandTracking | null;
    };
    base.onStateChangedObservable.add(readHandTracking);

    xr.experience.input.onControllerAddedObservable.add((controller) => {
      this.controllers.set(controller.uniqueId, controller);
    });
    xr.experience.input.onControllerRemovedObservable.add((controller) => {
      this.release(controller.uniqueId);
      this.controllers.delete(controller.uniqueId);
      this.poses.delete(controller.uniqueId);
    });
  }

  private attachPointer(): void {
    this.scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERDOWN) {
        const pick = info.pickInfo;
        if (pick?.hit && pick.pickedMesh && this.isGrabbable(pick.pickedMesh.uniqueId)) {
          this.pointerDown = true;
          this.pointerDepth = pick.distance;
        }
      } else if (info.type === PointerEventTypes.POINTERUP) {
        this.pointerDown = false;
      }
    });
  }

  private isGrabbable(uniqueId: number): boolean {
    return this.world.grabbables.some((g) => g.mesh.uniqueId === uniqueId);
  }

  // --- Pose collection ------------------------------------------------------

  private pose(id: string): HandPose {
    let pose = this.poses.get(id);
    if (!pose) {
      pose = makePose(id);
      this.poses.set(id, pose);
    }
    return pose;
  }

  private collectHands(): void {
    if (!this.handTracking) return;

    for (const handedness of ['left', 'right'] as const) {
      const hand = this.handTracking.getHandByHandedness(handedness);
      const pose = this.pose(`hand-${handedness}`);
      if (!hand) {
        pose.valid = false;
        continue;
      }

      const thumb = hand.getJointMesh(WebXRHandJoint.THUMB_TIP);
      const index = hand.getJointMesh(WebXRHandJoint.INDEX_FINGER_TIP);
      const wrist = hand.getJointMesh(WebXRHandJoint.WRIST);
      if (!thumb || !index || !wrist) {
        pose.valid = false;
        continue;
      }

      const gap = Vector3.Distance(thumb.absolutePosition, index.absolutePosition);
      // Hysteresis: harder to start a pinch than to keep one.
      pose.pinching = pose.pinching ? gap < PINCH_OPEN : gap < PINCH_CLOSE;

      // The pinch point itself, not the palm -- that is where the viewer
      // believes their fingers are, and grabbing from anywhere else feels like
      // the object jumps.
      thumb.absolutePosition.addToRef(index.absolutePosition, pose.position);
      pose.position.scaleInPlace(0.5);
      // Two fingertips give a point but no usable orientation; the wrist does.
      pose.rotation.copyFrom(wrist.absoluteRotationQuaternion ?? Quaternion.Identity());
      pose.valid = true;
    }
  }

  private collectControllers(): void {
    for (const [id, controller] of this.controllers) {
      const pose = this.pose(id);
      const grip = controller.grip ?? controller.pointer;
      if (!grip) {
        pose.valid = false;
        continue;
      }

      const squeeze =
        controller.motionController?.getComponentOfType('squeeze') ??
        controller.motionController?.getComponentOfType('trigger');
      pose.pinching = squeeze?.pressed ?? false;
      pose.position.copyFrom(grip.absolutePosition);
      pose.rotation.copyFrom(grip.absoluteRotationQuaternion ?? Quaternion.Identity());
      pose.valid = true;
    }
  }

  private collectPointer(): void {
    const pose = this.pose('pointer');
    const camera = this.scene.activeCamera;
    if (!camera || !this.pointerDown) {
      pose.valid = this.pointerDown;
      pose.pinching = this.pointerDown;
      return;
    }

    const ray = this.scene.createPickingRay(
      this.scene.pointerX,
      this.scene.pointerY,
      null,
      camera,
    );
    ray.origin.addToRef(ray.direction.scale(this.pointerDepth), pose.position);
    pose.rotation.copyFrom(camera.absoluteRotation ?? Quaternion.Identity());
    pose.pinching = true;
    pose.valid = true;
  }

  // --- Grab / release -------------------------------------------------------

  private update(): void {
    // handTracking is populated by the XR state-change hook, which fires when a
    // session begins -- the feature does not exist before that.
    this.collectHands();
    this.collectControllers();
    this.collectPointer();

    const now = performance.now();

    for (const pose of this.poses.values()) {
      const holding = this.held.get(pose.id);

      if (!pose.valid) {
        if (holding) this.release(pose.id);
        continue;
      }

      if (pose.pinching && !holding) {
        this.grab(pose);
      } else if (!pose.pinching && holding) {
        this.release(pose.id);
      } else if (holding) {
        this.carry(pose, holding, now);
      }
    }
  }

  private grab(pose: HandPose): void {
    let nearest: Grabbable | null = null;
    let nearestDistance = REACH;

    for (const grabbable of this.world.grabbables) {
      // One hand per object: two hands fighting over one body reads as a bug.
      if ([...this.held.values()].some((h) => h.grabbable === grabbable)) continue;
      const distance = Vector3.Distance(grabbable.mesh.absolutePosition, pose.position);
      if (distance < nearestDistance) {
        nearest = grabbable;
        nearestDistance = distance;
      }
    }
    if (!nearest) return;

    const body = nearest.aggregate.body;
    // ANIMATED rather than STATIC: the object is being driven by something
    // outside the simulation but must still push other bodies out of its way.
    body.setMotionType(PhysicsMotionType.ANIMATED);

    // Preserve where the object sits in the hand, so it does not snap to the
    // pinch point the instant it is caught.
    Quaternion.InverseToRef(pose.rotation, this.inverse);
    const worldOffset = nearest.mesh.absolutePosition.subtract(pose.position);
    const positionOffset = Vector3.Zero();
    worldOffset.rotateByQuaternionToRef(this.inverse, positionOffset);

    const meshRotation = nearest.mesh.rotationQuaternion ?? Quaternion.Identity();
    const rotationOffset = this.inverse.multiply(meshRotation);

    this.held.set(pose.id, {
      grabbable: nearest,
      positionOffset,
      rotationOffset,
      samples: [{ at: performance.now(), position: pose.position.clone() }],
    });
  }

  private carry(pose: HandPose, holding: Held, now: number): void {
    const { grabbable, positionOffset, rotationOffset } = holding;

    positionOffset.rotateByQuaternionToRef(pose.rotation, this.scratchPosition);
    this.scratchPosition.addInPlace(pose.position);
    grabbable.mesh.setAbsolutePosition(this.scratchPosition);

    pose.rotation.multiplyToRef(rotationOffset, this.scratchRotation);
    if (!grabbable.mesh.rotationQuaternion) {
      grabbable.mesh.rotationQuaternion = this.scratchRotation.clone();
    } else {
      grabbable.mesh.rotationQuaternion.copyFrom(this.scratchRotation);
    }

    holding.samples.push({ at: now, position: pose.position.clone() });
    while (holding.samples.length > 2 && now - holding.samples[0].at > VELOCITY_WINDOW_MS) {
      holding.samples.shift();
    }
  }

  private release(id: string): void {
    const holding = this.held.get(id);
    if (!holding) return;
    this.held.delete(id);

    const body = holding.grabbable.aggregate.body;
    body.setMotionType(PhysicsMotionType.DYNAMIC);

    // Hand back a fraction of the hand's motion, hard-clamped. A flick should
    // set something turning slowly, never launch it at the viewer's face.
    const samples = holding.samples;
    if (samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const seconds = (last.at - first.at) / 1000;
      if (seconds > 0.001) {
        const velocity = last.position.subtract(first.position).scaleInPlace(THROW_SCALE / seconds);
        const speed = velocity.length();
        if (speed > THROW_MAX) velocity.scaleInPlace(THROW_MAX / speed);
        body.setLinearVelocity(velocity);
      }
    }
  }

  /** Whether anything is currently being held, for the perf readout. */
  get holdingCount(): number {
    return this.held.size;
  }

  dispose(): void {
    for (const id of [...this.held.keys()]) this.release(id);
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    this.poses.clear();
    this.controllers.clear();
  }
}

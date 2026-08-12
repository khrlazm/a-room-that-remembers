import HavokPhysics from '@babylonjs/havok';
// Vite emits the wasm as a hashed asset on our own origin and hands back its
// URL, honouring the deployed base path. This is the whole reason Havok is
// viable here where KTX2 was not: its transcoder lived only on Babylon's CDN,
// while this ships in the npm package as an explicit export.
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';

// Side-effect import. In Babylon's modular build `scene.enablePhysics` is an
// augmentation that only exists once this is loaded, and the call is otherwise
// a silent no-op whose failure surfaces later and elsewhere as "No Physics
// Engine available" from the first PhysicsAggregate. Same class of trap as the
// Culling/ray import the gaze system needs.
//
// It is the *joined* component, not `v2/physicsEngineComponent`, that carries
// `enablePhysics` -- the v2 module augments the body and shape types but leaves
// the Scene method to the shared one.
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';

import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import {
  PhysicsMotionType,
  PhysicsShapeType,
} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';

import { FrameClock } from '../engine/clock';

/**
 * Objects drift; they never fly. Damping is what separates a memory coming
 * apart from a box of toys tipped over.
 *
 * Tuned down from 1.6 in two passes, judged in the headset each time: at the
 * higher values a brushed object barely acknowledged the hand, which made the
 * objects feel like images again. Safety comes from MAX_SPEED rather than from
 * smothering every impulse, so this can afford to be responsive.
 */
const LINEAR_DAMPING = 1.0;
const ANGULAR_DAMPING = 0.75;

/** Metres from the vantage at which the gentle inward pull begins. */
const CONTAIN_SOFT = 1.15;
/** Absolute limit. Nothing is ever further from the viewer than this. */
const CONTAIN_HARD = 1.5;
/** Strength of the inward pull, in metres per second squared per metre over. */
const CONTAIN_PULL = 5.5;

/** Nothing may exceed this speed, whatever a viewer does with it. */
const MAX_SPEED = 1.4;

export interface Grabbable {
  id: string;
  mesh: AbstractMesh;
  aggregate: PhysicsAggregate;
}

/**
 * A hand or controller, present in the simulation as a solid.
 *
 * Without one, hands pass straight through everything until the moment they
 * pinch, which makes the objects feel like images rather than things. A small
 * kinematic sphere driven by the palm means brushing past a floating radio
 * actually sends it turning.
 */
export interface Toucher {
  moveTo(position: Vector3): void;
  setActive(active: boolean): void;
  dispose(): void;
}

export interface PhysicsWorld {
  readonly plugin: HavokPlugin;
  readonly grabbables: Grabbable[];
  /** Give a mesh a body and register it as catchable. */
  add(mesh: AbstractMesh, id: string, mass: number): Grabbable;
  /** A solid that follows a hand, so touching pushes things. */
  addToucher(id: string, radius?: number): Toucher;
  /** Bodies currently awake, for the perf readout. */
  activeCount(): number;
  dispose(): void;
}

/**
 * Zero-gravity physics for the codas.
 *
 * Loaded on demand -- this module is only ever reached through a dynamic
 * import, so the 2 MB wasm stays off the initial load entirely and is fetched
 * during the era that precedes the first coda.
 *
 * Containment is done in code rather than with a collider. An inside-out mesh
 * sphere would work, but mesh collision is the most expensive shape on a mobile
 * GPU and it gives no control over *how* an object comes back. A pull that
 * grows with the overshoot, plus a hard clamp, keeps everything within reach
 * and reads as the room still holding on to its things.
 */
export async function createPhysicsWorld(scene: Scene, centre: Vector3): Promise<PhysicsWorld> {
  const response = await fetch(havokWasmUrl);
  if (!response.ok) {
    throw new Error(`Havok wasm: ${response.status} ${response.statusText}`);
  }
  const havok = await HavokPhysics({ wasmBinary: await response.arrayBuffer() });

  const plugin = new HavokPlugin(true, havok);
  // Zero gravity is the premise: gravity has let go.
  scene.enablePhysics(Vector3.Zero(), plugin);

  const grabbables: Grabbable[] = [];
  const anchor = centre.clone();
  const offset = new Vector3();
  const velocity = new Vector3();

  const clock = new FrameClock();

  const observer = scene.onBeforeRenderObservable.add(() => {
    // Real elapsed time, not an assumed frame length: a headset runs at 72Hz
    // and a monitor at 60, and a hardcoded step makes containment noticeably
    // firmer on one than the other.
    const deltaSeconds = clock.tick();

    for (const grabbable of grabbables) {
      const body = grabbable.aggregate.body;
      // A held object is driven by the hand, so containment must not fight it.
      if (body.getMotionType() !== PhysicsMotionType.DYNAMIC) continue;

      grabbable.mesh.absolutePosition.subtractToRef(anchor, offset);
      const distance = offset.length();

      if (distance > CONTAIN_SOFT) {
        body.getLinearVelocityToRef(velocity);
        // Acceleration inward, proportional to how far past the soft boundary
        // it has drifted, integrated over the real frame time.
        const pull = (distance - CONTAIN_SOFT) * CONTAIN_PULL * deltaSeconds;
        velocity.subtractInPlace(offset.scale(pull / Math.max(distance, 1e-4)));
        body.setLinearVelocity(velocity);
      }

      if (distance > CONTAIN_HARD) {
        // Hard stop. Place it back on the boundary and drop the outward part of
        // its velocity, so it settles rather than bouncing.
        const clamped = anchor.add(offset.scale(CONTAIN_HARD / Math.max(distance, 1e-4)));
        grabbable.mesh.setAbsolutePosition(clamped);
        body.setLinearVelocity(Vector3.Zero());
      }

      body.getLinearVelocityToRef(velocity);
      const speed = velocity.length();
      if (speed > MAX_SPEED) {
        body.setLinearVelocity(velocity.scaleInPlace(MAX_SPEED / speed));
      }
    }
  });

  return {
    plugin,
    grabbables,

    add(mesh, id, mass) {
      // A convex hull rather than the exact mesh: these are boxy props, the
      // difference is imperceptible when nothing collides hard, and hull
      // queries are far cheaper than triangle soup on a standalone headset.
      const aggregate = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.CONVEX_HULL,
        { mass, restitution: 0.05, friction: 0.7 },
        scene,
      );
      aggregate.body.setLinearDamping(LINEAR_DAMPING);
      aggregate.body.setAngularDamping(ANGULAR_DAMPING);

      const grabbable: Grabbable = { id, mesh, aggregate };
      grabbables.push(grabbable);
      return grabbable;
    },

    addToucher(id, radius = 0.045) {
      const sphere = CreateSphere(`toucher-${id}`, { diameter: radius * 2, segments: 6 }, scene);
      sphere.isVisible = false;
      sphere.isPickable = false;

      const aggregate = new PhysicsAggregate(
        sphere,
        PhysicsShapeType.SPHERE,
        { mass: 0, restitution: 0.1, friction: 0.9 },
        scene,
      );
      // ANIMATED: driven from outside the simulation, but still pushes dynamic
      // bodies out of its way. STATIC would be immovable *and* unmovable.
      aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      // Without this the body never reads the mesh transform, so the hand would
      // be a solid parked wherever it was created. Babylon disables the
      // pre-step by default for performance.
      aggregate.body.disablePreStep = false;
      sphere.setEnabled(false);

      return {
        moveTo(position: Vector3) {
          sphere.setAbsolutePosition(position);
        },
        setActive(active: boolean) {
          sphere.setEnabled(active);
        },
        dispose() {
          aggregate.dispose();
          sphere.dispose();
        },
      };
    },

    activeCount() {
      let count = 0;
      for (const grabbable of grabbables) {
        if (grabbable.aggregate.body.getMotionType() === PhysicsMotionType.DYNAMIC) count += 1;
      }
      return count;
    },

    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const grabbable of grabbables) grabbable.aggregate.dispose();
      grabbables.length = 0;
      scene.disablePhysicsEngine();
    },
  };
}

/** Nudge everything into slow motion, so the coda opens already drifting. */
export function stir(world: PhysicsWorld, strength = 0.18): void {
  for (const grabbable of world.grabbables) {
    const drift = new Vector3(
      (Math.random() - 0.5) * strength,
      (Math.random() - 0.5) * strength * 0.6,
      (Math.random() - 0.5) * strength,
    );
    grabbable.aggregate.body.setLinearVelocity(drift);
    grabbable.aggregate.body.setAngularVelocity(drift.scale(1.5));
  }
}

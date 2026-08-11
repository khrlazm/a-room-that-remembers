import { createStage, EYE_HEIGHT } from './engine/bootstrap';
import { anchorPosition, loadChapter } from './assets/chapters';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const gate = document.getElementById('gate') as HTMLDivElement;
const enterVrButton = document.getElementById('enter-vr') as HTMLButtonElement;
const enterDesktopButton = document.getElementById('enter-desktop') as HTMLButtonElement;
const statusLine = document.getElementById('status') as HTMLParagraphElement;

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function dismissGate(): void {
  gate.classList.add('fading');
  window.setTimeout(() => gate.setAttribute('hidden', ''), 650);
}

async function main(): Promise<void> {
  const stage = createStage(canvas);

  setStatus('Loading the room…');
  const hub = await loadChapter(stage.scene, 'hub');
  hub.addToScene();

  // The viewer's vantage and what they face are authored in Blender, not here.
  // Hand-written coordinates would have to replicate the Z-up to Y-up
  // conversion, which is a reliable source of sign errors.
  const vantage = anchorPosition(hub, 'viewer');
  const focus = anchorPosition(hub, 'focus');
  if (vantage) {
    stage.previewCamera.position = vantage.add(new Vector3(0, EYE_HEIGHT, 0));
  }
  if (focus) {
    stage.previewCamera.setTarget(focus);
  }

  console.info(
    `[hub] ${hub.container.meshes.length} meshes, ` +
      `${hub.anchors.size} anchors, ${hub.gates.size} gates ` +
      `(${[...hub.gates.keys()].join(', ') || 'none'})`,
  );

  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  let vrSupported = false;
  if (xr) {
    try {
      vrSupported = await xr.isSessionSupported('immersive-vr');
    } catch {
      vrSupported = false;
    }
  }

  enterDesktopButton.disabled = false;
  enterDesktopButton.addEventListener('click', () => {
    stage.previewCamera.attachControl(true);
    dismissGate();
  });

  if (vrSupported) {
    enterVrButton.disabled = false;
    setStatus('Headset detected.');
    enterVrButton.addEventListener('click', () => {
      setStatus('XR session wiring lands next.');
    });
  } else {
    setStatus(
      xr
        ? 'No VR headset detected — desktop preview available.'
        : 'WebXR unavailable here — desktop preview available.',
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  setStatus(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
});

const HOOK_SCALE = 1.35 * 1.5;
const HOOK_HEIGHT = 26.11 * HOOK_SCALE;
const HOOK_WIDTH = 12 * HOOK_SCALE;
const TROLLEY_WIDTH = 28 * 1.35;
const TIP_X = (29.7 - 28) * HOOK_SCALE;
const TIP_Y = (23.7 - 1.73) * HOOK_SCALE;
const HOLE_RADIUS = 2.23 / 51.43;

export const HOOK = {
  spring: 0.025,
  damping: 0.24,
  maxSpeed: 14,
  pendulumGravity: 0.45,
  pendulumDamping: 0.965,
  restLength: Math.max(40, HOOK_HEIGHT),
  lowerSpeed: 260,
  raiseSpeed: 220,
  catchDistance: 18
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createHook(Matter, physics, artwork, width, height) {
  const { Body, Composite, Constraint, Vector } = Matter;
  const trolley = artwork.trolley;
  const hook = artwork.hook;
  const frontHook = hook.cloneNode(true);
  const cable = document.createElement("div");
  trolley.classList.add("crane-trolley");
  hook.classList.add("crane-hook");
  frontHook.classList.add("crane-hook", "crane-hook-front");
  cable.className = "crane-cable";
  trolley.style.width = `${TROLLEY_WIDTH}px`;
  trolley.style.height = "2px";
  hook.style.width = `${HOOK_WIDTH}px`;
  hook.style.height = `${HOOK_HEIGHT}px`;
  frontHook.style.width = `${HOOK_WIDTH}px`;
  frontHook.style.height = `${HOOK_HEIGHT}px`;

  let x = width / 2;
  let target = x;
  let velocity = 0;
  let angle = 0;
  let angularVelocity = 0;
  let length = HOOK.restLength;
  let lowering = false;
  let keyboardDirection = null;
  let catchBlocked = false;
  let attachment = null;
  let attachedHole = null;

  function detach(blockCatch = false) {
    if (!attachment) return;
    Composite.remove(physics.engine.world, attachment);
    attachment = null;
    attachedHole = null;
    catchBlocked = blockCatch;
  }

  function step(seconds) {
    const acceleration = (target - x) * HOOK.spring - velocity * HOOK.damping;
    const speedLimit = HOOK.maxSpeed * (attachment ? 0.6 : 1);
    const previousVelocity = velocity;
    velocity = clamp(velocity + acceleration, -speedLimit, speedLimit);
    x = clamp(x + velocity, 0, width);
    const effectiveAcceleration = (velocity - previousVelocity) * (attachment ? 1.6 : 1);
    angularVelocity += -(HOOK.pendulumGravity / length) * Math.sin(angle)
      - (effectiveAcceleration / length) * Math.cos(angle);
    angularVelocity *= HOOK.pendulumDamping;
    angle = clamp(angle + angularVelocity, -1.2, 1.2);
    length = clamp(
      length + (keyboardDirection === null
        ? (lowering ? HOOK.lowerSpeed : -HOOK.raiseSpeed)
        : keyboardDirection > 0 ? HOOK.lowerSpeed : keyboardDirection < 0 ? -HOOK.raiseSpeed : 0) * seconds,
      HOOK.restLength,
      Math.max(HOOK.restLength, height - 20)
    );
    const tip = {
      x: x + Math.sin(angle) * length + Math.cos(angle) * TIP_X,
      y: Math.cos(angle) * length - Math.sin(angle) * TIP_X
    };
    Body.setPosition(physics.anchor, tip);

    if ((lowering || keyboardDirection !== null || catchBlocked) && !attachment) {
      let closest = null;
      for (const block of physics.blocks) {
        for (const hole of block.holes) {
          const local = { x: hole.x * physics.size, y: hole.y * physics.size };
          const rotated = Vector.rotate(local, block.body.angle);
          const point = Vector.add(block.body.position, rotated);
          const distance = Math.hypot(point.x - tip.x, point.y - tip.y);
          if (distance < HOOK.catchDistance && (!closest || distance < closest.distance)) {
            closest = { block, hole, rotated, distance };
          }
        }
      }
      if (!closest) catchBlocked = false;
      if (closest && !catchBlocked && (lowering || keyboardDirection !== null)) {
        attachment = Constraint.create({
          bodyA: physics.anchor,
          bodyB: closest.block.body,
          pointB: closest.rotated,
          length: 1,
          stiffness: 0.9,
          damping: 0.1
        });
        attachedHole = { block: closest.block, hole: closest.hole };
        Composite.add(physics.engine.world, attachment);
      }
    }
  }

  function render() {
    const cableLength = Math.max(0, length - TIP_Y);
    const hookX = x + Math.sin(angle) * cableLength;
    const hookY = Math.cos(angle) * cableLength;
    const transform = `translate(${hookX - HOOK_WIDTH / 2}px, ${hookY}px) rotate(${-angle}rad)`;
    trolley.style.transform = `translate(${x - TROLLEY_WIDTH / 2}px, 0)`;
    cable.style.height = `${cableLength}px`;
    cable.style.transform = `translate(${x - 1}px, 0) rotate(${-angle}rad)`;
    hook.style.transform = transform;
    frontHook.style.transform = transform;
    if (!attachedHole) {
      frontHook.style.display = "none";
      return;
    }
    const { block, hole } = attachedHole;
    const center = Vector.add(block.body.position, Vector.rotate({
      x: hole.x * physics.size, y: hole.y * physics.size
    }, block.body.angle));
    const radius = HOLE_RADIUS * physics.size;
    // Reveal only the lower half of the hole; the upper half hides the hook tip.
    const points = [center];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * i / 12;
      points.push(Vector.add(center, Vector.rotate({
        x: Math.cos(a) * radius, y: Math.sin(a) * radius
      }, block.body.angle)));
    }
    frontHook.style.clipPath = `polygon(${points.map((point) => {
      const local = Vector.rotate({ x: point.x - hookX, y: point.y - hookY }, angle);
      return `${local.x + HOOK_WIDTH / 2}px ${local.y}px`;
    }).join(", ")})`;
    frontHook.style.display = "block";
  }

  return {
    backElements: [trolley, cable, hook],
    frontElement: frontHook,
    step, render, detach,
    setTarget(value) { target = clamp(value, 0, width); },
    setLowering(value) { keyboardDirection = null; lowering = value; },
    setCableDirection(value) { keyboardDirection = value; lowering = false; },
    moveTarget(delta) { target = clamp(target + delta, 0, width); },
    get attached() { return Boolean(attachment); },
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      x = clamp(x, 0, width);
      target = width / 2;
      length = HOOK.restLength;
      velocity = 0;
      angle = 0;
      angularVelocity = 0;
      lowering = false;
      keyboardDirection = null;
      catchBlocked = false;
      detach();
    }
  };
}

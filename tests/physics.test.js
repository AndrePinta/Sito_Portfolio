import test from "node:test";
import assert from "node:assert/strict";
import Matter from "matter-js";
import { createPhysics } from "../crane/physics.js";
import { createHook, HOOK } from "../crane/hook.js";

globalThis.document = {
  createElement() {
    return { className: "", style: {} };
  }
};

function artwork() {
  const holePositions = [
    [19.57, 25.76, 64.22],
    [73.44, 79.84, 118.3],
    [127.3, 133.06, 171.52],
    [181.17, 187.66, 226.12],
    [235.04, 241.52, 279.99]
  ];
  const element = () => ({
    style: {},
    classList: { add() {} },
    cloneNode() { return element(); }
  });
  return {
    blocks: holePositions.map(([left, first, second], index) => ({
      letter: "PINTA"[index],
      holes: [first, second].map((x) => ({
        x: (x - left) / 51.43 - 0.5,
        y: (78.6 - 72.97) / 51.43 - 0.5
      })),
      element: element()
    })),
    trolley: element(),
    hook: element()
  };
}

function step(physics, hook, frames) {
  for (let i = 0; i < frames; i++) {
    hook.step(1 / 60);
    Matter.Engine.update(physics.engine, 1000 / 60);
  }
}

test("all ten holes can attach and lift their own block", () => {
  for (let index = 0; index < 5; index++) {
    for (let holeIndex = 0; holeIndex < 2; holeIndex++) {
      const art = artwork();
      const physics = createPhysics(Matter, art, 1280, 1200);
      const hook = createHook(Matter, physics, art, 1280, 1200);
      const block = physics.blocks[index];
      const startY = block.body.position.y;
      hook.setTarget(block.body.position.x + block.holes[holeIndex].x * physics.size);
      step(physics, hook, 600);
      hook.setLowering(true);
      for (let frame = 0; frame < 300 && !hook.attached; frame++) step(physics, hook, 1);
      const constraint = Matter.Composite.allConstraints(physics.engine.world)[0];
      assert.equal(constraint?.bodyB, block.body, `${block.letter}, hole ${holeIndex + 1}`);
      hook.setLowering(false);
      step(physics, hook, 110);
      assert.ok(block.body.position.y < startY - 100, `${block.letter} should lift`);
      hook.detach();
      assert.equal(Matter.Composite.allConstraints(physics.engine.world).length, 0);
      physics.destroy();
    }
  }
});

test("the enlarged hook remains aligned with the attachment point at rest", () => {
  const art = artwork();
  const physics = createPhysics(Matter, art, 1280, 800);
  const hook = createHook(Matter, physics, art, 1280, 800);
  step(physics, hook, 1);
  hook.render();
  assert.ok(Math.abs(parseFloat(art.hook.style.height) - 26.11 * 1.35 * 1.5) < 0.001);
  assert.ok(Math.abs(parseFloat(art.trolley.style.width) - 28 * 1.35) < 0.001);
  const hookTop = parseFloat(art.hook.style.transform.match(/,\s*([\d.-]+)px/)[1]);
  assert.ok(Math.abs(physics.anchor.position.y - hookTop - (23.7 - 1.73) * 1.35 * 1.5) < 0.001);
  assert.equal(physics.anchor.position.y, HOOK.restLength);
  assert.equal(hook.frontElement.style.display, "none");
  physics.destroy();
});

test("the foreground hook is clipped to the attached hole and hidden on release", () => {
  const art = artwork();
  const physics = createPhysics(Matter, art, 1280, 800);
  const hook = createHook(Matter, physics, art, 1280, 800);
  const block = physics.blocks[0];
  hook.setTarget(block.body.position.x + block.holes[0].x * physics.size);
  step(physics, hook, 300);
  hook.setLowering(true);
  for (let frame = 0; frame < 300 && !hook.attached; frame++) step(physics, hook, 1);
  assert.ok(hook.attached);
  hook.render();
  assert.equal(hook.frontElement.style.display, "block");
  assert.match(hook.frontElement.style.clipPath, /^polygon\(/);
  hook.detach();
  hook.render();
  assert.equal(hook.frontElement.style.display, "none");
  physics.destroy();
});

test("released blocks fall and rest on another block, and reset restores order", () => {
  const art = artwork();
  const physics = createPhysics(Matter, art, 1280, 800);
  const hook = createHook(Matter, physics, art, 1280, 800);
  const [upper, lower] = physics.blocks;
  Matter.Body.setPosition(upper.body, { x: lower.body.position.x, y: 80 });
  step(physics, hook, 300);
  assert.ok(Math.abs(upper.body.position.y - (lower.body.position.y - physics.size)) < 3);
  physics.reset(1280, 1200);
  const positions = physics.blocks.map(({ body }) => body.position.x);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.ok(physics.blocks.every(({ body }) => body.angle === 0 && body.velocity.x === 0));
  physics.destroy();
});

test("the smaller blocks rest on the lowered floor after resize", () => {
  const art = artwork();
  const physics = createPhysics(Matter, art, 1280, 800);
  const hook = createHook(Matter, physics, art, 1280, 800);
  for (const [width, height] of [[1280, 800], [1024, 600]]) {
    physics.resize(width, height);
    const previousSize = Math.min(220, Math.max(70, width * 0.155), (width - 20) / 5.08, height * 0.32);
    assert.ok(Math.abs(physics.size - previousSize * 0.9 * 0.8) < 0.001);
    for (const { body } of physics.blocks) {
      assert.ok(Math.abs(body.position.y + physics.size / 2 - height * 0.6) < 0.001);
    }
    step(physics, hook, 120);
    for (const { body } of physics.blocks) {
      assert.ok(Math.abs(body.position.y + physics.size / 2 - height * 0.6) < 1);
    }
  }
  physics.destroy();
});

test("a lifted block remains within the top of the scene and falls after release", () => {
  const art = artwork();
  const physics = createPhysics(Matter, art, 1280, 800);
  const hook = createHook(Matter, physics, art, 1280, 800);
  const block = physics.blocks[0];
  hook.setTarget(block.body.position.x + block.holes[0].x * physics.size);
  step(physics, hook, 600);
  hook.setLowering(true);
  for (let frame = 0; frame < 300 && !hook.attached; frame++) step(physics, hook, 1);
  assert.ok(hook.attached);
  hook.setLowering(false);
  step(physics, hook, 120);
  assert.ok(block.body.bounds.min.y > -3);
  const liftedY = block.body.position.y;
  hook.detach();
  step(physics, hook, 240);
  assert.ok(block.body.position.y > liftedY + 40);
  physics.destroy();
});

test("keyboard cable controls hold position, catch automatically and release without recatching", () => {
  const art = artwork();
  const physics = createPhysics(Matter, art, 1280, 800);
  const hook = createHook(Matter, physics, art, 1280, 800);
  const block = physics.blocks[2];
  hook.setTarget(block.body.position.x + block.holes[0].x * physics.size);
  hook.setCableDirection(0);
  step(physics, hook, 300);
  const restingY = physics.anchor.position.y;
  step(physics, hook, 60);
  assert.ok(Math.abs(physics.anchor.position.y - restingY) < 0.1);
  hook.setCableDirection(1);
  for (let frame = 0; frame < 300 && !hook.attached; frame++) step(physics, hook, 1);
  assert.ok(hook.attached);
  hook.setCableDirection(0);
  hook.detach(true);
  step(physics, hook, 1);
  assert.equal(hook.attached, false);
  hook.setCableDirection(-1);
  step(physics, hook, 90);
  assert.ok(physics.anchor.position.y < restingY + 5);
  physics.destroy();
});

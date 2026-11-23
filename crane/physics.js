export const PHYSICS = {
  gravity: 1.2,
  density: 0.02,
  friction: 0.9,
  frictionStatic: 1,
  restitution: 0.02,
  frictionAir: 0.02
};

function blockSize(width, height) {
  return 0.8 * 0.9 * Math.min(220, Math.max(70, width * 0.155), (width - 20) / 5.08, height * 0.32);
}

const FLOOR_HEIGHT = 0.6;

export function createPhysics(Matter, artwork, width, height) {
  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const engine = Engine.create({
    positionIterations: 10,
    velocityIterations: 8,
    gravity: { x: 0, y: PHYSICS.gravity }
  });
  let boundaries = [];
  let size = blockSize(width, height);
  const blocks = artwork.blocks.map((item) => ({
    ...item,
    body: Bodies.rectangle(0, 0, size, size, {
      chamfer: { radius: 6 },
      density: PHYSICS.density,
      friction: PHYSICS.friction,
      frictionStatic: PHYSICS.frictionStatic,
      restitution: PHYSICS.restitution,
      frictionAir: PHYSICS.frictionAir
    })
  }));
  const anchor = Bodies.circle(0, 0, 1, {
    isStatic: true,
    isSensor: true,
    collisionFilter: { mask: 0 }
  });
  Composite.add(engine.world, [...blocks.map((block) => block.body), anchor]);

  function resize(nextWidth, nextHeight) {
    Composite.remove(engine.world, boundaries);
    const thickness = 100;
    boundaries = [
      Bodies.rectangle(nextWidth / 2, nextHeight * FLOOR_HEIGHT + thickness / 2, nextWidth + 2 * thickness, thickness, { isStatic: true, friction: PHYSICS.friction }),
      Bodies.rectangle(nextWidth / 2, -thickness / 2, nextWidth + 2 * thickness, thickness, { isStatic: true, friction: PHYSICS.friction }),
      Bodies.rectangle(-thickness / 2, nextHeight / 2, thickness, nextHeight * 4, { isStatic: true, friction: PHYSICS.friction }),
      Bodies.rectangle(nextWidth + thickness / 2, nextHeight / 2, thickness, nextHeight * 4, { isStatic: true, friction: PHYSICS.friction })
    ];
    Composite.add(engine.world, boundaries);
    const nextSize = blockSize(nextWidth, nextHeight);
    for (const block of blocks) {
      Body.scale(block.body, nextSize / size, nextSize / size);
      block.element.style.width = `${nextSize}px`;
      block.element.style.height = `${nextSize}px`;
    }
    size = nextSize;
    reset(nextWidth, nextHeight);
  }

  function reset(nextWidth, nextHeight) {
    const gap = Math.min(3, size * 0.02);
    const firstX = (nextWidth - (5 * size + 4 * gap)) / 2 + size / 2;
    blocks.forEach(({ body }, index) => {
      Body.setPosition(body, { x: firstX + index * (size + gap), y: nextHeight * FLOOR_HEIGHT - size / 2 });
      Body.setAngle(body, 0);
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
    });
  }

  resize(width, height);
  return {
    engine, blocks, anchor, resize, reset,
    get size() { return size; },
    destroy() {
      Events.off(engine);
      Composite.clear(engine.world, false, true);
      Engine.clear(engine);
    }
  };
}

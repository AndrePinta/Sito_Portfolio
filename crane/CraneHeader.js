import { loadArtwork } from "./blocks.js";
import { createPhysics } from "./physics.js";
import { createHook } from "./hook.js";

const header = document.querySelector("#crane-header");
const scene = header.querySelector(".crane-scene");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const desktopLayout = matchMedia("(min-width: 781px)");
const dismissedKey = "portfolio-crane-dismissed";
const STEP = 1000 / 60;
let destroyCurrent = null;
let generation = 0;
let matterPromise;
let dismissed = sessionStorage.getItem(dismissedKey) === "true";

function syncHeaderVisibility() {
  const bounds = header.getBoundingClientRect();
  document.body.classList.toggle("is-crane-visible", bounds.width > 0 && bounds.bottom > 0 && bounds.top < innerHeight);
}
const headerVisibility = new IntersectionObserver(syncHeaderVisibility, { threshold: [0, 0.001] });

function unmount() {
  generation++;
  destroyCurrent?.();
  destroyCurrent = null;
  headerVisibility.unobserve(header);
  scene.replaceChildren();
  delete header.dataset.ready;
  header.hidden = true;
  header.remove();
  document.body.classList.remove("is-crane-visible");
}

function dismiss() {
  if (dismissed) return;
  dismissed = true;
  sessionStorage.setItem(dismissedKey, "true");
  const height = header.offsetHeight;
  const scrollPosition = window.scrollY;
  unmount();
  window.scrollTo({ top: Math.max(0, scrollPosition - height), behavior: "instant" });
  header.dispatchEvent(new Event("crane-dismissed"));
}

function onScroll() {
  if (header.isConnected && !header.hidden && desktopLayout.matches
      && header.offsetHeight && header.getBoundingClientRect().bottom <= 0) {
    dismiss();
  } else {
    syncHeaderVisibility();
  }
}

function loadMatter() {
  if (window.Matter) return Promise.resolve();
  if (!matterPromise) {
    matterPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./vendor/matter.min.js", import.meta.url).href;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Cannot load Matter.js"));
      document.head.append(script);
    });
  }
  return matterPromise;
}

function syncLayout() {
  if (!desktopLayout.matches || dismissed) {
    if (header.isConnected) {
      const height = header.offsetHeight;
      const scrollPosition = window.scrollY;
      unmount();
      if (height) window.scrollTo({ top: Math.max(0, scrollPosition - height), behavior: "instant" });
    }
    return;
  }
  if (document.querySelector("#stage").dataset.view !== "hero"
      || (window.scrollY > 0 && (header.hidden || !header.isConnected))) {
    dismissed = true;
    sessionStorage.setItem(dismissedKey, "true");
    unmount();
    return;
  }
  if (!header.isConnected) document.body.insertBefore(header, document.querySelector(".detail-back"));
  const staticArtwork = header.querySelector(".crane-static");
  if (!staticArtwork.hasAttribute("src")) staticArtwork.src = staticArtwork.dataset.src;
  header.hidden = false;
  headerVisibility.observe(header);
  syncHeaderVisibility();
  mount();
}

async function mount() {
  const currentGeneration = ++generation;
  destroyCurrent?.();
  destroyCurrent = null;
  delete header.dataset.ready;
  scene.replaceChildren();
  header.querySelector(".crane-error")?.remove();
  if (reducedMotion.matches || !header.isConnected || !desktopLayout.matches || dismissed) return;

  try {
    await loadMatter();
    if (currentGeneration !== generation || !header.isConnected || !desktopLayout.matches || dismissed) return;
    if (!window.Matter) throw new Error("Matter.js is not available");
    const artwork = await loadArtwork();
    if (currentGeneration !== generation || reducedMotion.matches || !header.isConnected || dismissed) return;
    const Matter = window.Matter;
    let width = header.clientWidth;
    let height = header.clientHeight;
    if (!width || !height) {
      width = window.innerWidth;
      height = Math.max(window.innerHeight, 420);
    }
    const physics = createPhysics(Matter, artwork, width, height);
    const hook = createHook(Matter, physics, artwork, width, height);
    const rail = document.createElement("div");
    rail.className = "crane-rail";
    physics.blocks.forEach((block) => block.element.classList.add("crane-block"));
    scene.append(rail, ...hook.backElements, ...physics.blocks.map((block) => block.element), hook.frontElement);

    let frame = 0;
    let previous = 0;
    let accumulator = 0;
    let visible = false;
    let activePointer = null;
    let pressedAt = 0;
    let shakeUntil = 0;
    let shakeStrength = 0;
    const keys = new Set();
    let downPressedAt = 0;
    let keyboardControl = false;

    function render(now) {
      for (const block of physics.blocks) {
        const { position, angle } = block.body;
        block.element.style.transform = `translate(${position.x - physics.size / 2}px, ${position.y - physics.size / 2}px) rotate(${angle}rad)`;
      }
      hook.render();
      const remaining = Math.max(0, (shakeUntil - now) / 120);
      const shake = shakeStrength * remaining;
      scene.style.transform = shake
        ? `translate(${Math.sin(now * 0.16) * shake}px, ${Math.cos(now * 0.19) * shake}px)`
        : "";
    }

    function tick(now) {
      if (!visible || document.hidden) {
        frame = 0;
        previous = 0;
        return;
      }
      if (!previous) previous = now;
      accumulator += Math.min(now - previous, 100);
      previous = now;
      while (accumulator >= STEP) {
        if (keys.has("ArrowLeft") || keys.has("ArrowRight")) {
          hook.moveTarget((Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"))) * 7);
        }
        hook.step(STEP / 1000);
        Matter.Engine.update(physics.engine, STEP);
        accumulator -= STEP;
      }
      render(now);
      frame = requestAnimationFrame(tick);
    }

    function resume() {
      if (visible && !document.hidden && !frame) frame = requestAnimationFrame(tick);
    }

    function pointerX(event) {
      return event.clientX - header.getBoundingClientRect().left;
    }

    function onPointerMove(event) {
      if (activePointer !== null && event.pointerId !== activePointer) return;
      if (keyboardControl) {
        keys.clear();
        keyboardControl = false;
        hook.setLowering(activePointer !== null);
      }
      hook.setTarget(pointerX(event));
    }

    function onPointerDown(event) {
      if (activePointer !== null || event.button !== 0) return;
      activePointer = event.pointerId;
      keys.clear();
      keyboardControl = false;
      pressedAt = performance.now();
      hook.setTarget(pointerX(event));
      hook.setLowering(true);
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    function endPointer(event, cancelled = false) {
      if (event.pointerId !== activePointer) return;
      hook.setLowering(false);
      if (!cancelled && performance.now() - pressedAt < 200 && hook.attached) hook.detach();
      activePointer = null;
      if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
      if (event.pointerType === "touch") hook.setTarget(width / 2);
    }

    function onPointerLeave(event) {
      if (activePointer !== null) endPointer(event, true);
      if (!keyboardControl) hook.setTarget(width / 2);
    }

    function onPointerCancel(event) {
      endPointer(event, true);
    }

    function onKeyDown(event) {
      if (!visible || event.ctrlKey || event.metaKey || event.altKey
          || event.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
      if (event.key.toLowerCase() === "r" && !event.repeat) {
        keys.clear();
        hook.detach();
        hook.resize(width, height);
        physics.reset(width, height);
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        keyboardControl = true;
        if (event.key === "ArrowDown" && !keys.has(event.key)) downPressedAt = performance.now();
        keys.add(event.key);
        hook.setCableDirection(Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp")));
      }
    }

    function onKeyUp(event) {
      if (!keys.has(event.key)) return;
      event.preventDefault();
      keys.delete(event.key);
      if (event.key === "ArrowDown" && performance.now() - downPressedAt < 200 && hook.attached) {
        hook.detach(true);
      }
      hook.setCableDirection(Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp")));
    }

    function clearKeys() {
      if (!keys.size) return;
      keys.clear();
      hook.setCableDirection(0);
    }

    function onVisibilityChange() {
      if (document.hidden) clearKeys();
      else resume();
    }

    function onCollision(event) {
      for (const pair of event.pairs) {
        const a = pair.bodyA.velocity;
        const b = pair.bodyB.velocity;
        const impact = Math.hypot(a.x - b.x, a.y - b.y);
        if (impact > 6) {
          shakeStrength = Math.min(4, (impact - 6) * 0.5);
          shakeUntil = performance.now() + 120;
        }
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = header.clientWidth;
      const nextHeight = header.clientHeight;
      if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth;
      height = nextHeight;
      hook.resize(width, height);
      physics.resize(width, height);
      render(performance.now());
    });
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRect.height > 0;
      if (!visible) {
        clearKeys();
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
        accumulator = 0;
      } else {
        resume();
      }
    }, { threshold: [0, 0.001] });

    Matter.Events.on(physics.engine, "collisionStart", onCollision);
    header.addEventListener("pointermove", onPointerMove);
    header.addEventListener("pointerdown", onPointerDown);
    header.addEventListener("pointerup", endPointer);
    header.addEventListener("pointercancel", onPointerCancel);
    header.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", onVisibilityChange);
    resizeObserver.observe(header);
    intersectionObserver.observe(header);
    render(performance.now());
    header.dataset.ready = "true";

    destroyCurrent = () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      header.removeEventListener("pointermove", onPointerMove);
      header.removeEventListener("pointerdown", onPointerDown);
      header.removeEventListener("pointerup", endPointer);
      header.removeEventListener("pointercancel", onPointerCancel);
      header.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      hook.detach();
      physics.destroy();
      scene.replaceChildren();
      scene.style.transform = "";
      delete header.dataset.ready;
    };
  } catch (error) {
    if (currentGeneration !== generation) return;
    console.error("Crane header initialization failed:", error);
    const notice = document.createElement("p");
    notice.className = "crane-error";
    notice.setAttribute("role", "status");
    notice.textContent = "Interactive header unavailable.";
    header.append(notice);
  }
}

reducedMotion.addEventListener("change", mount);
desktopLayout.addEventListener("change", syncLayout);
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", syncHeaderVisibility);
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    unmount();
    headerVisibility.disconnect();
    reducedMotion.removeEventListener("change", mount);
    desktopLayout.removeEventListener("change", syncLayout);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", syncHeaderVisibility);
  }
});
syncLayout();

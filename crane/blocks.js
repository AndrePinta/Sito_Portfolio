const BLOCK_TOP = 72.97;
const BLOCK_SIZE = 51.43;

const blockDefinitions = [
  { letter: "P", container: 4, left: 19.57, holes: [25.76, 64.22] },
  { letter: "I", container: 0, left: 73.44, holes: [79.84, 118.3] },
  { letter: "N", container: 1, left: 127.3, holes: [133.06, 171.52] },
  { letter: "T", container: 2, left: 181.17, holes: [187.66, 226.12] },
  { letter: "A", container: 3, left: 235.04, holes: [241.52, 279.99] }
];

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg(viewBox, paths) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  for (const [source, fill] of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", source.getAttribute("d"));
    path.setAttribute("fill", fill);
    svg.append(path);
  }
  return svg;
}

export async function loadArtwork() {
  const response = await fetch(new URL("../assets/media/Risorsa 2.svg", import.meta.url));
  if (!response.ok) throw new Error(`Cannot load crane artwork: ${response.status}`);
  const source = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
  if (source.querySelector("parsererror")) throw new Error("Invalid crane SVG");
  const containers = [...source.querySelectorAll("path.cls-1")];
  const letters = [...source.querySelectorAll("path:not([class])")];
  if (containers.length !== 6 || letters.length !== 5) {
    throw new Error("The crane SVG does not contain the expected blocks and hook");
  }
  return {
    blocks: blockDefinitions.map((definition, index) => {
      const element = makeSvg(`${definition.left} ${BLOCK_TOP} ${BLOCK_SIZE} ${BLOCK_SIZE}`, [
        [containers[definition.container], "#fff"],
        [letters[index], "#000"]
      ]);
      const backing = document.createElementNS(SVG_NS, "rect");
      for (const [name, value] of Object.entries({
        x: definition.left, y: BLOCK_TOP, width: BLOCK_SIZE, height: BLOCK_SIZE, rx: 4.46, fill: "#000"
      })) backing.setAttribute(name, value);
      element.prepend(backing);
      return {
        letter: definition.letter,
        holes: definition.holes.map((x) => ({
          x: (x - definition.left) / BLOCK_SIZE - 0.5,
          y: (78.6 - BLOCK_TOP) / BLOCK_SIZE - 0.5
        })),
        element
      };
    }),
    trolley: makeSvg("14 0 28 1.74", [[containers[5], "#fff"]]),
    hook: makeSvg("22 1.73 12 26.11", [[containers[5], "#fff"]])
  };
}

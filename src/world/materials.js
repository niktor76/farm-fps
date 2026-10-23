/**
 * Procedural material library. Textures are drawn to a canvas at startup so the
 * game ships with no downloaded assets (REQ-3).
 *
 * Owned by PH-1-world.
 *
 * Every material keeps its texture repeat at 1. Tiling density is applied to
 * the geometry instead, through createTexturedBox and scaleUvs, so a barn wall
 * and a crate show the same plank width even though their faces differ in size.
 *
 * @returns {{
 *   grass: import('three').Material, dirt: import('three').Material,
 *   wood: import('three').Material, paintedWood: import('three').Material,
 *   roof: import('three').Material, metal: import('three').Material,
 *   rustedMetal: import('three').Material, hay: import('three').Material,
 *   stone: import('three').Material, foliage: import('three').Material,
 *   bark: import('three').Material, crop: import('three').Material,
 *   glass: import('three').Material
 * }}
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../core/rng.js';

const TEXTURE_SIZE = 256;
const TEXTURE_SEED = 20261023;

export function createMaterialLibrary() {
  const random = new Random(TEXTURE_SEED);

  const grassField = createNoiseField(TEXTURE_SIZE, 4, random);
  const dirtField = createNoiseField(TEXTURE_SIZE, 4, random);
  const rustField = createNoiseField(TEXTURE_SIZE, 3, random);
  const foliageField = createNoiseField(TEXTURE_SIZE, 3, random);
  const cropField = createNoiseField(TEXTURE_SIZE, 3, random);

  const grass = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintField(context, size, grassField, [52, 70, 38], [118, 139, 80]);
      paintSpeckles(context, size, random, 2600, [[74, 94, 48], [142, 156, 92], [46, 60, 34]], 1.6);
    }),
    roughnessMap: createDataTexture((context, size) => {
      paintFieldGray(context, size, grassField, 198, 255);
    }),
    roughness: 1,
    metalness: 0
  });

  const dirt = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintField(context, size, dirtField, [80, 63, 45], [137, 114, 85]);
      paintSpeckles(context, size, random, 900, [[96, 82, 66], [66, 52, 38], [150, 132, 104]], 2.2);
    }),
    roughnessMap: createDataTexture((context, size) => {
      paintFieldGray(context, size, dirtField, 190, 250);
    }),
    roughness: 0.96,
    metalness: 0
  });

  const wood = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintBoards(context, size, random, [124, 100, 68], 8, 0.16);
    }),
    roughness: 0.86,
    metalness: 0
  });

  const paintedWood = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintBoards(context, size, random, [136, 51, 41], 8, 0.22);
    }),
    roughness: 0.74,
    metalness: 0
  });

  const roof = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintCorrugation(context, size, random, [60, 67, 63]);
    }),
    roughness: 0.66,
    metalness: 0.32
  });

  const metal = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintBrushedMetal(context, size, random, [146, 152, 158]);
    }),
    roughness: 0.34,
    metalness: 0.78
  });

  const rustedMetal = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintField(context, size, rustField, [96, 58, 38], [148, 112, 80]);
      paintSpeckles(context, size, random, 1400, [[74, 42, 28], [162, 126, 88], [110, 74, 50]], 2.4);
      paintRivets(context, size, [58, 38, 26]);
    }),
    roughnessMap: createDataTexture((context, size) => {
      paintFieldGray(context, size, rustField, 150, 240);
    }),
    roughness: 0.86,
    metalness: 0.28
  });

  const hay = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintStraw(context, size, random, [191, 161, 84]);
    }),
    roughness: 1,
    metalness: 0
  });

  const stone = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintBlocks(context, size, random, [156, 152, 144]);
    }),
    roughness: 0.92,
    metalness: 0
  });

  const foliage = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintField(context, size, foliageField, [38, 62, 30], [88, 114, 50]);
      paintSpeckles(context, size, random, 1800, [[30, 50, 26], [104, 128, 62]], 2);
    }),
    roughness: 0.94,
    metalness: 0,
    flatShading: true
  });

  const bark = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintBark(context, size, random, [72, 56, 41]);
    }),
    roughness: 0.98,
    metalness: 0
  });

  const crop = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintField(context, size, cropField, [118, 126, 58], [178, 177, 97]);
    }),
    roughness: 0.94,
    metalness: 0
  });

  const glass = new THREE.MeshStandardMaterial({
    map: createColorTexture((context, size) => {
      paintGlass(context, size, [74, 96, 110]);
    }),
    roughness: 0.14,
    metalness: 0.1,
    transparent: true,
    opacity: 0.42
  });

  return {
    grass,
    dirt,
    wood,
    paintedWood,
    roof,
    metal,
    rustedMetal,
    hay,
    stone,
    foliage,
    bark,
    crop,
    glass
  };
}

/**
 * Box geometry whose texture density is constant in metres rather than per
 * face, so large and small parts share the same apparent plank or block size.
 */
export function createTexturedBox(sizeX, sizeY, sizeZ, tilesPerMeter) {
  const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
  const uv = geometry.attributes.uv;
  const faceSpans = [
    [sizeZ, sizeY],
    [sizeZ, sizeY],
    [sizeX, sizeZ],
    [sizeX, sizeZ],
    [sizeX, sizeY],
    [sizeX, sizeY]
  ];

  for (let face = 0; face < 6; face += 1) {
    const scaleU = faceSpans[face][0] * tilesPerMeter;
    const scaleV = faceSpans[face][1] * tilesPerMeter;
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      uv.setXY(index, uv.getX(index) * scaleU, uv.getY(index) * scaleV);
    }
  }

  uv.needsUpdate = true;
  return geometry;
}

export function scaleUvs(geometry, scaleU, scaleV) {
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * scaleU, uv.getY(index) * scaleV);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Collapses a part list into one mesh per material, which is what keeps the
 * whole farm inside the draw-call budget (AC-2).
 *
 * @param {{ geometry: import('three').BufferGeometry, material: import('three').Material }[]} parts
 */
export function mergeByMaterial(parts, castShadow, receiveShadow) {
  const byMaterial = new Map();

  for (const part of parts) {
    const geometry = part.geometry.index === null ? part.geometry : part.geometry.toNonIndexed();
    const existing = byMaterial.get(part.material);
    if (existing) existing.push(geometry);
    else byMaterial.set(part.material, [geometry]);
  }

  const group = new THREE.Group();
  for (const [material, geometries] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
  }

  return group;
}

function createCanvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  draw(canvas.getContext('2d'), TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function createColorTexture(draw) {
  const texture = createCanvasTexture(draw);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDataTexture(draw) {
  const texture = createCanvasTexture(draw);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/**
 * Tileable fractal value noise. Lattice indices wrap, so the field repeats
 * exactly across the texture edge.
 */
function createNoiseField(size, octaves, random) {
  const field = new Float32Array(size * size);
  let amplitude = 1;
  let amplitudeTotal = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    const cells = 4 << octave;
    const lattice = new Float32Array(cells * cells);
    for (let index = 0; index < lattice.length; index += 1) lattice[index] = random.next();

    for (let y = 0; y < size; y += 1) {
      const latticeY = (y / size) * cells;
      for (let x = 0; x < size; x += 1) {
        field[y * size + x] += amplitude * sampleLattice(lattice, cells, (x / size) * cells, latticeY);
      }
    }

    amplitudeTotal += amplitude;
    amplitude *= 0.5;
  }

  let minimum = Infinity;
  let maximum = -Infinity;
  for (let index = 0; index < field.length; index += 1) {
    field[index] /= amplitudeTotal;
    if (field[index] < minimum) minimum = field[index];
    if (field[index] > maximum) maximum = field[index];
  }

  const span = maximum - minimum;
  for (let index = 0; index < field.length; index += 1) {
    field[index] = (field[index] - minimum) / span;
  }

  return field;
}

function sampleLattice(lattice, cells, x, y) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fractionX = x - cellX;
  const fractionY = y - cellY;
  const smoothX = fractionX * fractionX * (3 - 2 * fractionX);
  const smoothY = fractionY * fractionY * (3 - 2 * fractionY);

  const leftIndex = ((cellX % cells) + cells) % cells;
  const topIndex = ((cellY % cells) + cells) % cells;
  const rightIndex = (leftIndex + 1) % cells;
  const bottomIndex = (topIndex + 1) % cells;

  const topLeft = lattice[topIndex * cells + leftIndex];
  const topRight = lattice[topIndex * cells + rightIndex];
  const bottomLeft = lattice[bottomIndex * cells + leftIndex];
  const bottomRight = lattice[bottomIndex * cells + rightIndex];

  const top = topLeft + (topRight - topLeft) * smoothX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * smoothX;
  return top + (bottom - top) * smoothY;
}

function paintField(context, size, field, lowColor, highColor) {
  const image = context.createImageData(size, size);
  const data = image.data;

  for (let index = 0; index < field.length; index += 1) {
    const amount = field[index];
    const offset = index * 4;
    data[offset] = lowColor[0] + (highColor[0] - lowColor[0]) * amount;
    data[offset + 1] = lowColor[1] + (highColor[1] - lowColor[1]) * amount;
    data[offset + 2] = lowColor[2] + (highColor[2] - lowColor[2]) * amount;
    data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);
}

function paintFieldGray(context, size, field, lowValue, highValue) {
  const image = context.createImageData(size, size);
  const data = image.data;

  for (let index = 0; index < field.length; index += 1) {
    const value = lowValue + (highValue - lowValue) * field[index];
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);
}

function paintSpeckles(context, size, random, count, palette, maximumRadius) {
  for (let index = 0; index < count; index += 1) {
    const color = palette[random.integer(0, palette.length)];
    context.fillStyle = toCssColor(color);
    context.beginPath();
    context.arc(
      random.next() * size,
      random.next() * size,
      random.range(0.4, maximumRadius),
      0,
      Math.PI * 2
    );
    context.fill();
  }
}

function paintBoards(context, size, random, baseColor, boardCount, weathering) {
  const boardWidth = size / boardCount;

  for (let board = 0; board < boardCount; board += 1) {
    const shade = random.range(1 - weathering, 1 + weathering);
    context.fillStyle = toCssColor(scaleColor(baseColor, shade));
    context.fillRect(board * boardWidth, 0, boardWidth, size);
  }

  context.lineWidth = 1;
  for (let line = 0; line < size * 1.6; line += 1) {
    const x = random.next() * size;
    const dark = random.next() < 0.5;
    context.strokeStyle = dark ? 'rgba(30,20,10,0.10)' : 'rgba(255,240,215,0.07)';
    context.beginPath();
    context.moveTo(x, random.range(-size * 0.2, size * 0.4));
    context.lineTo(x + random.range(-2, 2), random.range(size * 0.6, size * 1.2));
    context.stroke();
  }

  context.strokeStyle = 'rgba(24,16,10,0.55)';
  context.lineWidth = 2;
  for (let board = 0; board <= boardCount; board += 1) {
    const x = board * boardWidth;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, size);
    context.stroke();
  }
}

function paintCorrugation(context, size, random, baseColor) {
  const ribWidth = size / 24;

  for (let rib = 0; rib < 24; rib += 1) {
    const amount = Math.sin((rib / 24) * Math.PI * 2 * 12);
    context.fillStyle = toCssColor(scaleColor(baseColor, 1 + amount * 0.22));
    context.fillRect(rib * ribWidth, 0, ribWidth, size);
  }

  context.strokeStyle = 'rgba(18,22,20,0.5)';
  context.lineWidth = 3;
  for (let seam = 0; seam <= 2; seam += 1) {
    const y = (seam * size) / 2;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y);
    context.stroke();
  }

  paintSpeckles(context, size, random, 500, [[96, 62, 40], [120, 86, 56], [44, 50, 47]], 2);
}

function paintBrushedMetal(context, size, random, baseColor) {
  context.fillStyle = toCssColor(baseColor);
  context.fillRect(0, 0, size, size);

  context.lineWidth = 1;
  for (let streak = 0; streak < size * 2; streak += 1) {
    const y = random.next() * size;
    context.strokeStyle = random.next() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y + random.range(-1.5, 1.5));
    context.stroke();
  }

  paintRivets(context, size, [92, 98, 104]);
}

function paintRivets(context, size, color) {
  context.fillStyle = toCssColor(color);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      context.beginPath();
      context.arc((column + 0.5) * (size / 4), (row + 0.5) * (size / 4), size / 90, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function paintStraw(context, size, random, baseColor) {
  context.fillStyle = toCssColor(scaleColor(baseColor, 0.82));
  context.fillRect(0, 0, size, size);

  context.lineWidth = 1.4;
  for (let straw = 0; straw < 3200; straw += 1) {
    const x = random.next() * size;
    const y = random.next() * size;
    const angle = random.range(0, Math.PI * 2);
    const length = random.range(4, 16);
    context.strokeStyle = toCssColor(scaleColor(baseColor, random.range(0.72, 1.25)));
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }
}

function paintBlocks(context, size, random, baseColor) {
  context.fillStyle = toCssColor(scaleColor(baseColor, 0.72));
  context.fillRect(0, 0, size, size);

  const rows = 5;
  const columns = 4;
  const blockHeight = size / rows;
  const blockWidth = size / columns;
  const mortar = 3;

  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : blockWidth / 2;
    for (let column = -1; column <= columns; column += 1) {
      context.fillStyle = toCssColor(scaleColor(baseColor, random.range(0.84, 1.12)));
      context.fillRect(
        column * blockWidth + offset + mortar,
        row * blockHeight + mortar,
        blockWidth - mortar * 2,
        blockHeight - mortar * 2
      );
    }
  }

  paintSpeckles(context, size, random, 700, [[132, 128, 120], [178, 174, 166]], 1.4);
}

function paintBark(context, size, random, baseColor) {
  context.fillStyle = toCssColor(baseColor);
  context.fillRect(0, 0, size, size);

  for (let ridge = 0; ridge < 70; ridge += 1) {
    const x = random.next() * size;
    const width = random.range(2, 7);
    context.fillStyle = toCssColor(scaleColor(baseColor, random.range(0.6, 1.35)));
    context.fillRect(x, 0, width, size);
  }

  context.lineWidth = 1;
  context.strokeStyle = 'rgba(24,16,10,0.4)';
  for (let crack = 0; crack < 120; crack += 1) {
    const x = random.next() * size;
    const y = random.next() * size;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + random.range(-1.5, 1.5), y + random.range(8, 30));
    context.stroke();
  }
}

function paintGlass(context, size, baseColor) {
  context.fillStyle = toCssColor(baseColor);
  context.fillRect(0, 0, size, size);

  context.strokeStyle = 'rgba(226,240,250,0.35)';
  context.lineWidth = size / 14;
  for (let streak = 0; streak < 3; streak += 1) {
    const offset = streak * (size / 3);
    context.beginPath();
    context.moveTo(offset - size * 0.3, size);
    context.lineTo(offset + size * 0.5, 0);
    context.stroke();
  }
}

function scaleColor(color, factor) {
  return [
    Math.min(255, color[0] * factor),
    Math.min(255, color[1] * factor),
    Math.min(255, color[2] * factor)
  ];
}

function toCssColor(color) {
  return `rgb(${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])})`;
}

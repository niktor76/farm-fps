/**
 * Navigation graph for bots: a lattice of reachable points linked where the
 * straight line between them is walkable, searched with A*.
 *
 * Chosen over a generated navmesh because the map is flat with box cover
 * (DEC-13); a few dozen nodes plus local steering covers it.
 *
 * Doorways get the treatment every classic shooter bot system converges on: a
 * threshold node on the wall plane plus an approach node set back on each
 * side, a tight arrival radius so bots line up instead of clipping the frame,
 * and an explicit per-lane capacity so a chokepoint cannot deadlock.
 *
 * Owned by PH-7-navigation.
 */

import * as THREE from 'three';
import { WORLD, FIGHTER, FEEL_PRESETS } from '../config/tunables.js';

/** Graph tuning. Gameplay numbers come from tunables.js, never from here. */
const NODE_SPACING = 6;
const LATTICE_MARGIN = 2.5;
const MINIMUM_NODE_SEPARATION = 1.5;

/** Two nodes this far apart vertically are separate storeys, not duplicates. */
const LEVEL_SEPARATION = FIGHTER.standingHeight;

/** A node must have room for a fighter plus a little slack on every side. */
const NODE_CLEARANCE_RADIUS = FIGHTER.radius + 0.25;

/** Hay bales, the barn loft and the garage roof qualify; building roofs do not. */
const MAXIMUM_NODE_SURFACE_HEIGHT = 3.5;

/** Walkability is tested as a corridor, not a ray: a ray squeezes past a frame. */
const CORRIDOR_RADIUS = FIGHTER.radius + 0.1;
const CORRIDOR_SAMPLE_SPACING = 0.3;
const SHORTCUT_SAMPLE_SPACING = 0.5;
const SHORTCUT_LOOKAHEAD = 4;

const MAXIMUM_EDGE_LENGTH = NODE_SPACING * 1.6;

/**
 * Largest rise an edge may climb. Taken as the smallest jump of any feel
 * preset so one graph stays valid whichever preset the match runs on; a drop
 * of any size is traversable and is not checked.
 */
const MAXIMUM_CLIMB = Math.min(
  ...Object.values(FEEL_PRESETS).map((preset) => preset.jumpPeakHeight)
);

/** Doorway detection. A wall box is thin on exactly one horizontal axis. */
const WALL_THICKNESS_LIMIT = 0.6;
const MINIMUM_DOORWAY_WIDTH = FIGHTER.radius * 2 + 0.3;
const MAXIMUM_DOORWAY_WIDTH = 8;
const WALL_LINE_PRECISION = 20;

/** An opening this wide genuinely carries two bots abreast, so it gets two lanes. */
const DOORWAY_TWO_LANE_WIDTH = 5;
const DOORWAY_LANE_SPACING = 2.4;
const DOORWAY_APPROACH_DISTANCE = 2.5;
const DOORWAY_LANE_CAPACITY = 1;

/** Chest of a crouched fighter: cover must hide even a low silhouette. */
const COVER_SIGHT_HEIGHT = FIGHTER.crouchingHeight;

export const NODE_TYPE = { open: 0, approach: 1, threshold: 2 };

/**
 * Arrival radius per node type. A wide radius in a gap makes bots careless and
 * clip the frame; a tight radius in the open makes them walk a robotic line.
 */
const ARRIVAL_RADII = [2.0, 0.9, 0.4];

/** 0 means uncapped. Only thresholds are a width-one corridor. */
const NODE_CAPACITIES = [0, 0, DOORWAY_LANE_CAPACITY];

const UNOCCUPIED = -1;

const DEBUG_EDGE_COLOR = 0x3366cc;
const DEBUG_THRESHOLD_COLOR = 0xff3366;
const DEBUG_APPROACH_COLOR = 0xffcc33;
const DEBUG_POINT_SIZE = 0.55;

const scratchFrom = new THREE.Vector3();
const scratchTo = new THREE.Vector3();

export class WaypointGraph {
  constructor(collisionWorld, nodes, directedEdges) {
    this.collisionWorld = collisionWorld;
    this.nodeCount = nodes.length;

    this.positionX = new Float64Array(this.nodeCount);
    this.positionY = new Float64Array(this.nodeCount);
    this.positionZ = new Float64Array(this.nodeCount);
    this.nodeTypes = new Uint8Array(this.nodeCount);
    this.arrivalRadii = new Float64Array(this.nodeCount);
    this.capacities = new Int32Array(this.nodeCount);

    for (let index = 0; index < this.nodeCount; index += 1) {
      const node = nodes[index];
      this.positionX[index] = node.x;
      this.positionY[index] = node.y;
      this.positionZ[index] = node.z;
      this.nodeTypes[index] = node.type;
      this.arrivalRadii[index] = ARRIVAL_RADII[node.type];
      this.capacities[index] = NODE_CAPACITIES[node.type];
    }

    this.edgeStart = new Int32Array(this.nodeCount + 1);
    for (const edge of directedEdges) this.edgeStart[edge.from + 1] += 1;
    for (let index = 0; index < this.nodeCount; index += 1) {
      this.edgeStart[index + 1] += this.edgeStart[index];
    }

    this.edgeTarget = new Int32Array(directedEdges.length);
    this.edgeCost = new Float64Array(directedEdges.length);
    const fillCursor = Int32Array.from(this.edgeStart.subarray(0, this.nodeCount));
    for (const edge of directedEdges) {
      const slot = fillCursor[edge.from];
      fillCursor[edge.from] = slot + 1;
      this.edgeTarget[slot] = edge.to;
      this.edgeCost[slot] = edge.cost;
    }

    this.slotsPerNode = Math.max(1, ...NODE_CAPACITIES);
    this.occupantSlots = new Int32Array(this.nodeCount * this.slotsPerNode).fill(UNOCCUPIED);

    this.costFromStart = new Float64Array(this.nodeCount);
    this.estimatedTotal = new Float64Array(this.nodeCount);
    this.cameFrom = new Int32Array(this.nodeCount);
    this.nodeStamp = new Int32Array(this.nodeCount).fill(-1);
    this.nodeClosed = new Uint8Array(this.nodeCount);
    this.openHeap = new Int32Array(this.nodeCount);
    this.heapPosition = new Int32Array(this.nodeCount);
    this.reversedPath = new Int32Array(this.nodeCount);
    this.openHeapSize = 0;
    this.searchGeneration = 0;
  }

  /**
   * @param {import('./collision.js').CollisionWorld} collisionWorld
   * @param {import('../core/rng.js').Random} random
   * @param {import('three').Vector3[]} coverPoints positions from buildFarm
   */
  static build(collisionWorld, random, coverPoints = []) {
    const nodes = [];

    const doorways = findDoorways(collisionWorld);
    for (const [doorwayId, doorway] of doorways.entries()) {
      addDoorwayNodes(collisionWorld, nodes, doorway, doorwayId);
    }
    addLatticeNodes(collisionWorld, nodes);
    addCoverNodes(collisionWorld, nodes, coverPoints);

    const directedEdges = linkNodes(collisionWorld, nodes, doorways);
    const kept = strongComponentContainingCenter(nodes, directedEdges);

    const remapped = new Int32Array(nodes.length).fill(-1);
    const keptNodes = [];
    for (let index = 0; index < nodes.length; index += 1) {
      if (!kept[index]) continue;
      remapped[index] = keptNodes.length;
      keptNodes.push(nodes[index]);
    }

    const keptEdges = [];
    for (const edge of directedEdges) {
      if (!kept[edge.from] || !kept[edge.to]) continue;
      keptEdges.push({ from: remapped[edge.from], to: remapped[edge.to], cost: edge.cost });
    }

    return new WaypointGraph(collisionWorld, keptNodes, keptEdges);
  }

  isThresholdNode(index) {
    return this.nodeTypes[index] === NODE_TYPE.threshold;
  }

  isApproachNode(index) {
    return this.nodeTypes[index] === NODE_TYPE.approach;
  }

  /** How close a bot must get before the node counts as reached. */
  arrivalRadius(index) {
    return this.arrivalRadii[index];
  }

  /** @returns {number} index of the node nearest to a world position */
  nearestNode(position) {
    let best = -1;
    let bestDistanceSquared = Infinity;

    for (let index = 0; index < this.nodeCount; index += 1) {
      const offsetX = position.x - this.positionX[index];
      const offsetY = position.y - this.positionY[index];
      const offsetZ = position.z - this.positionZ[index];
      const distanceSquared = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
      if (distanceSquared >= bestDistanceSquared) continue;
      bestDistanceSquared = distanceSquared;
      best = index;
    }

    return best;
  }

  /** @returns {number[]} node indices from start to goal, empty when unreachable */
  findPath(startIndex, goalIndex) {
    if (startIndex === goalIndex) return [startIndex];

    this.searchGeneration += 1;
    const generation = this.searchGeneration;
    const { nodeStamp, nodeClosed, costFromStart, estimatedTotal, cameFrom } = this;

    this.openHeapSize = 0;
    nodeStamp[startIndex] = generation;
    nodeClosed[startIndex] = 0;
    costFromStart[startIndex] = 0;
    cameFrom[startIndex] = -1;
    estimatedTotal[startIndex] = this.straightDistance(startIndex, goalIndex);
    this.heapPush(startIndex);

    while (this.openHeapSize > 0) {
      const current = this.heapPop();
      if (current === goalIndex) return this.reconstructPath(goalIndex);
      nodeClosed[current] = 1;

      const edgeEnd = this.edgeStart[current + 1];
      for (let edge = this.edgeStart[current]; edge < edgeEnd; edge += 1) {
        const neighbour = this.edgeTarget[edge];
        const visited = nodeStamp[neighbour] === generation;
        if (visited && nodeClosed[neighbour] === 1) continue;

        const tentative = costFromStart[current] + this.edgeCost[edge];
        if (visited && tentative >= costFromStart[neighbour]) continue;

        nodeStamp[neighbour] = generation;
        nodeClosed[neighbour] = 0;
        costFromStart[neighbour] = tentative;
        cameFrom[neighbour] = current;
        estimatedTotal[neighbour] = tentative + this.straightDistance(neighbour, goalIndex);

        if (visited) this.heapSiftUp(this.heapPosition[neighbour]);
        else this.heapPush(neighbour);
      }
    }

    return [];
  }

  /** @returns {import('three').Vector3} */
  nodePosition(index, target) {
    return target.set(this.positionX[index], this.positionY[index], this.positionZ[index]);
  }

  randomNode(random) {
    return random.integer(0, this.nodeCount);
  }

  /** Node whose position breaks line of sight to a threat, for taking cover. */
  findCoverNode(fromPosition, threatPosition, searchRadius) {
    const radiusSquared = searchRadius * searchRadius;
    scratchTo.set(threatPosition.x, threatPosition.y + COVER_SIGHT_HEIGHT, threatPosition.z);

    let best = -1;
    let bestDistanceSquared = Infinity;

    for (let index = 0; index < this.nodeCount; index += 1) {
      const offsetX = fromPosition.x - this.positionX[index];
      const offsetZ = fromPosition.z - this.positionZ[index];
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared > radiusSquared) continue;
      if (distanceSquared >= bestDistanceSquared) continue;

      scratchFrom.set(
        this.positionX[index],
        this.positionY[index] + COVER_SIGHT_HEIGHT,
        this.positionZ[index]
      );
      if (!this.collisionWorld.isBlocked(scratchFrom, scratchTo)) continue;

      bestDistanceSquared = distanceSquared;
      best = index;
    }

    return best;
  }

  /**
   * Claims a slot on a capacity-limited node. Uncapped nodes always succeed,
   * so a caller can reserve every node it routes through without branching.
   */
  tryReserveNode(nodeIndex, fighterId) {
    const capacity = this.capacities[nodeIndex];
    if (capacity === 0) return true;

    const base = nodeIndex * this.slotsPerNode;
    let freeSlot = -1;

    for (let slot = 0; slot < capacity; slot += 1) {
      const occupant = this.occupantSlots[base + slot];
      if (occupant === fighterId) return true;
      if (occupant === UNOCCUPIED && freeSlot === -1) freeSlot = base + slot;
    }

    if (freeSlot === -1) return false;
    this.occupantSlots[freeSlot] = fighterId;
    return true;
  }

  releaseNode(nodeIndex, fighterId) {
    const base = nodeIndex * this.slotsPerNode;
    for (let slot = 0; slot < this.slotsPerNode; slot += 1) {
      if (this.occupantSlots[base + slot] !== fighterId) continue;
      this.occupantSlots[base + slot] = UNOCCUPIED;
      return;
    }
  }

  /** Called when a fighter dies, so a corpse never wedges a doorway shut. */
  releaseAllFor(fighterId) {
    for (let slot = 0; slot < this.occupantSlots.length; slot += 1) {
      if (this.occupantSlots[slot] === fighterId) this.occupantSlots[slot] = UNOCCUPIED;
    }
  }

  /** Line geometry of the graph, for the debug overlay. */
  buildDebugMesh() {
    const group = new THREE.Group();
    group.name = 'waypoints';

    const edgeVertices = [];
    for (let node = 0; node < this.nodeCount; node += 1) {
      const edgeEnd = this.edgeStart[node + 1];
      for (let edge = this.edgeStart[node]; edge < edgeEnd; edge += 1) {
        const target = this.edgeTarget[edge];
        if (target < node) continue;
        edgeVertices.push(
          this.positionX[node],
          this.positionY[node],
          this.positionZ[node],
          this.positionX[target],
          this.positionY[target],
          this.positionZ[target]
        );
      }
    }

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
    group.add(
      new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: DEBUG_EDGE_COLOR }))
    );

    group.add(this.buildTypePoints(NODE_TYPE.threshold, DEBUG_THRESHOLD_COLOR));
    group.add(this.buildTypePoints(NODE_TYPE.approach, DEBUG_APPROACH_COLOR));
    return group;
  }

  buildTypePoints(type, color) {
    const vertices = [];
    for (let index = 0; index < this.nodeCount; index += 1) {
      if (this.nodeTypes[index] !== type) continue;
      vertices.push(this.positionX[index], this.positionY[index], this.positionZ[index]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: DEBUG_POINT_SIZE }));
  }

  straightDistance(fromIndex, toIndex) {
    const offsetX = this.positionX[toIndex] - this.positionX[fromIndex];
    const offsetY = this.positionY[toIndex] - this.positionY[fromIndex];
    const offsetZ = this.positionZ[toIndex] - this.positionZ[fromIndex];
    return Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);
  }

  reconstructPath(goalIndex) {
    const reversed = this.reversedPath;
    let length = 0;

    for (let node = goalIndex; node !== -1; node = this.cameFrom[node]) {
      reversed[length] = node;
      length += 1;
    }

    for (let head = 0, tail = length - 1; head < tail; head += 1, tail -= 1) {
      const swap = reversed[head];
      reversed[head] = reversed[tail];
      reversed[tail] = swap;
    }

    return this.shortcutPath(reversed, length);
  }

  /**
   * Greedy string pulling over the A* result. Threshold and approach nodes are
   * never skipped: that is what keeps bots funnelled onto the doorway axis
   * instead of cutting a diagonal across the frame.
   */
  shortcutPath(path, length) {
    const result = [path[0]];
    let anchor = 0;

    while (anchor < length - 1) {
      let furthest = anchor + 1;
      const limit = Math.min(length - 1, anchor + SHORTCUT_LOOKAHEAD);

      for (let probe = anchor + 2; probe <= limit; probe += 1) {
        if (this.nodeTypes[path[probe - 1]] !== NODE_TYPE.open) break;
        if (!this.canTraverseDirect(path[anchor], path[probe])) break;
        furthest = probe;
      }

      result.push(path[furthest]);
      anchor = furthest;
    }

    return result;
  }

  canTraverseDirect(fromIndex, toIndex) {
    if (this.positionY[toIndex] - this.positionY[fromIndex] > MAXIMUM_CLIMB) return false;
    return isCorridorWalkable(
      this.collisionWorld,
      this.positionX[fromIndex],
      this.positionY[fromIndex],
      this.positionZ[fromIndex],
      this.positionX[toIndex],
      this.positionY[toIndex],
      this.positionZ[toIndex],
      SHORTCUT_SAMPLE_SPACING
    );
  }

  heapPush(node) {
    const index = this.openHeapSize;
    this.openHeapSize = index + 1;
    this.openHeap[index] = node;
    this.heapPosition[node] = index;
    this.heapSiftUp(index);
  }

  heapPop() {
    const top = this.openHeap[0];
    this.openHeapSize -= 1;

    if (this.openHeapSize > 0) {
      const moved = this.openHeap[this.openHeapSize];
      this.openHeap[0] = moved;
      this.heapPosition[moved] = 0;
      this.heapSiftDown(0);
    }

    return top;
  }

  heapSiftUp(startIndex) {
    const heap = this.openHeap;
    const scores = this.estimatedTotal;
    const node = heap[startIndex];
    const score = scores[node];
    let index = startIndex;

    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = heap[parentIndex];
      if (scores[parent] <= score) break;
      heap[index] = parent;
      this.heapPosition[parent] = index;
      index = parentIndex;
    }

    heap[index] = node;
    this.heapPosition[node] = index;
  }

  heapSiftDown(startIndex) {
    const heap = this.openHeap;
    const scores = this.estimatedTotal;
    const size = this.openHeapSize;
    const node = heap[startIndex];
    const score = scores[node];
    let index = startIndex;

    for (;;) {
      const left = index * 2 + 1;
      if (left >= size) break;
      const right = left + 1;
      const child = right < size && scores[heap[right]] < scores[heap[left]] ? right : left;
      const childNode = heap[child];
      if (scores[childNode] >= score) break;
      heap[index] = childNode;
      this.heapPosition[childNode] = index;
      index = child;
    }

    heap[index] = node;
    this.heapPosition[node] = index;
  }
}

/**
 * Walkability of the swept circle between two points, sampled along the
 * segment. A ray would slip through a door frame by less than the fighter's
 * own radius, which is exactly the shortcut that makes bots clip corners.
 */
function isCorridorWalkable(collisionWorld, fromX, fromY, fromZ, toX, toY, toZ, sampleSpacing) {
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const deltaZ = toZ - fromZ;
  const groundDistance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
  const sampleCount = Math.max(1, Math.ceil(groundDistance / sampleSpacing));

  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const fraction = sample / sampleCount;
    const blocked = collisionWorld.overlapsAt(
      fromX + deltaX * fraction,
      fromY + deltaY * fraction,
      fromZ + deltaZ * fraction,
      CORRIDOR_RADIUS,
      FIGHTER.standingHeight
    );
    if (blocked) return false;
  }

  return true;
}

function highestSurfaceAt(collisionWorld, x, z) {
  return collisionWorld.groundHeightAt(x, z, FIGHTER.radius, MAXIMUM_NODE_SURFACE_HEIGHT);
}

/** Surface a fighter stands on when the storey above is a roof or a loft. */
function floorSurfaceAt(collisionWorld, x, z, floorY) {
  return collisionWorld.groundHeightAt(x, z, FIGHTER.radius, floorY + WORLD.stepHeight);
}

function addNodeIfClear(collisionWorld, nodes, x, y, z, type, doorway = -1) {
  if (collisionWorld.overlapsAt(x, y, z, NODE_CLEARANCE_RADIUS, FIGHTER.standingHeight)) return false;

  for (const node of nodes) {
    const offsetX = node.x - x;
    const offsetZ = node.z - z;
    if (offsetX * offsetX + offsetZ * offsetZ >= MINIMUM_NODE_SEPARATION * MINIMUM_NODE_SEPARATION) {
      continue;
    }
    if (Math.abs(node.y - y) < LEVEL_SEPARATION) return false;
  }

  nodes.push({ x, y, z, type, doorway });
  return true;
}

/**
 * Each lattice cell offers up to two nodes: the highest standable surface, so
 * hay bales and the garage roof are covered, plus the ground beneath it when
 * that is a separate storey, so the garage and barn interiors stay navigable.
 */
function addLatticeNodes(collisionWorld, nodes) {
  const limit = WORLD.playHalfExtent - LATTICE_MARGIN;
  const stepCount = Math.floor((limit * 2) / NODE_SPACING) + 1;
  const origin = -((stepCount - 1) * NODE_SPACING) / 2;

  for (let column = 0; column < stepCount; column += 1) {
    for (let row = 0; row < stepCount; row += 1) {
      const x = origin + column * NODE_SPACING;
      const z = origin + row * NODE_SPACING;
      const high = highestSurfaceAt(collisionWorld, x, z);
      const ground = floorSurfaceAt(collisionWorld, x, z, WORLD.groundLevel);

      addNodeIfClear(collisionWorld, nodes, x, high, z, NODE_TYPE.open);
      if (high - ground >= LEVEL_SEPARATION) {
        addNodeIfClear(collisionWorld, nodes, x, ground, z, NODE_TYPE.open);
      }
    }
  }
}

function addCoverNodes(collisionWorld, nodes, coverPoints) {
  for (const point of coverPoints) {
    const y = highestSurfaceAt(collisionWorld, point.x, point.z);
    addNodeIfClear(collisionWorld, nodes, point.x, y, point.z, NODE_TYPE.open);
  }
}

/**
 * Doorways are derived from the collision geometry rather than from hardcoded
 * coordinates: buildings.js exports no opening positions, so a gap in a line
 * of collinear wall boxes wide enough for a fighter is taken as a doorway.
 * Posts and pillars are excluded because a wall box is thin on exactly one
 * horizontal axis while a post is thin on both.
 */
function findDoorways(collisionWorld) {
  const headY = WORLD.groundLevel + FIGHTER.standingHeight;
  const stepCeiling = WORLD.groundLevel + WORLD.stepHeight;
  const lines = new Map();

  for (const box of collisionWorld.boxes) {
    if (box.min.y > stepCeiling) continue;
    if (box.max.y <= stepCeiling) continue;

    const sizeX = box.max.x - box.min.x;
    const sizeZ = box.max.z - box.min.z;
    const thinOnX = sizeX < WALL_THICKNESS_LIMIT;
    const thinOnZ = sizeZ < WALL_THICKNESS_LIMIT;
    if (thinOnX === thinOnZ) continue;

    const normalAxis = thinOnX ? 'x' : 'z';
    const planeCoordinate = thinOnX ? (box.min.x + box.max.x) / 2 : (box.min.z + box.max.z) / 2;
    const key = `${normalAxis}:${Math.round(planeCoordinate * WALL_LINE_PRECISION)}`;

    let line = lines.get(key);
    if (!line) {
      line = { normalAxis, planeCoordinate, segments: [] };
      lines.set(key, line);
    }

    line.segments.push({
      from: thinOnX ? box.min.z : box.min.x,
      to: thinOnX ? box.max.z : box.max.x,
      baseY: box.min.y
    });
  }

  const doorways = [];

  for (const line of lines.values()) {
    line.segments.sort((first, second) => first.from - second.from);
    let reach = line.segments[0].to;
    let reachBaseY = line.segments[0].baseY;

    for (let index = 1; index < line.segments.length; index += 1) {
      const segment = line.segments[index];
      const width = segment.from - reach;

      if (width >= MINIMUM_DOORWAY_WIDTH && width <= MAXIMUM_DOORWAY_WIDTH) {
        doorways.push({
          normalAxis: line.normalAxis,
          planeCoordinate: line.planeCoordinate,
          center: reach + width / 2,
          width,
          floorY: Math.min(reachBaseY, segment.baseY)
        });
      }

      if (segment.to > reach) {
        reach = segment.to;
        reachBaseY = segment.baseY;
      }
    }
  }

  return doorways.filter((doorway) => isDoorwayPassable(collisionWorld, doorway));
}

function isDoorwayPassable(collisionWorld, doorway) {
  const x = doorway.normalAxis === 'x' ? doorway.planeCoordinate : doorway.center;
  const z = doorway.normalAxis === 'x' ? doorway.center : doorway.planeCoordinate;
  const y = floorSurfaceAt(collisionWorld, x, z, doorway.floorY);
  return !collisionWorld.overlapsAt(x, y, z, FIGHTER.radius, FIGHTER.standingHeight);
}

/**
 * Threshold on the wall plane, approach set back on each side. Heights come
 * from the floor the wall stands on, never from the highest surface: a loft or
 * a roof overhang sits above many doorways and would lift the nodes onto it.
 */
function addDoorwayNodes(collisionWorld, nodes, doorway, doorwayId) {
  const laneCount = doorway.width >= DOORWAY_TWO_LANE_WIDTH ? 2 : 1;

  for (let lane = 0; lane < laneCount; lane += 1) {
    const along = doorway.center + (lane - (laneCount - 1) / 2) * DOORWAY_LANE_SPACING;
    const x = doorway.normalAxis === 'x' ? doorway.planeCoordinate : along;
    const z = doorway.normalAxis === 'x' ? along : doorway.planeCoordinate;
    const y = floorSurfaceAt(collisionWorld, x, z, doorway.floorY);
    addNodeIfClear(collisionWorld, nodes, x, y, z, NODE_TYPE.threshold, doorwayId);
  }

  for (const side of [-1, 1]) {
    const offset = side * DOORWAY_APPROACH_DISTANCE;
    const x = doorway.normalAxis === 'x' ? doorway.planeCoordinate + offset : doorway.center;
    const z = doorway.normalAxis === 'x' ? doorway.center : doorway.planeCoordinate + offset;
    const y = floorSurfaceAt(collisionWorld, x, z, doorway.floorY);
    addNodeIfClear(collisionWorld, nodes, x, y, z, NODE_TYPE.approach, doorwayId);
  }
}

/**
 * A threshold reaches only the approach nodes of its own doorway, and those
 * two approach nodes never reach each other directly. Without that the search
 * would route around its own doorway structure and bots would cut the frame.
 */
function isLinkable(start, end) {
  if (start.type === NODE_TYPE.threshold || end.type === NODE_TYPE.threshold) {
    const threshold = start.type === NODE_TYPE.threshold ? start : end;
    const other = threshold === start ? end : start;
    return other.type === NODE_TYPE.approach && other.doorway === threshold.doorway;
  }

  if (start.type === NODE_TYPE.approach && end.type === NODE_TYPE.approach) {
    return start.doorway !== end.doorway;
  }

  return true;
}

/**
 * True when the segment passes through a doorway opening. Any such edge other
 * than the doorway's own approach-to-threshold pair would let the search route
 * around the chain and send bots diagonally through the frame.
 */
function crossesDoorway(doorway, start, end) {
  const startNormal = doorway.normalAxis === 'x' ? start.x : start.z;
  const endNormal = doorway.normalAxis === 'x' ? end.x : end.z;
  const span = endNormal - startNormal;
  if (Math.abs(span) < 1e-6) return false;

  const fraction = (doorway.planeCoordinate - startNormal) / span;
  if (fraction < 0 || fraction > 1) return false;

  const startAlong = doorway.normalAxis === 'x' ? start.z : start.x;
  const endAlong = doorway.normalAxis === 'x' ? end.z : end.x;
  const along = startAlong + (endAlong - startAlong) * fraction;
  if (Math.abs(along - doorway.center) > doorway.width / 2 + CORRIDOR_RADIUS) return false;

  const y = start.y + (end.y - start.y) * fraction;
  return y < doorway.floorY + FIGHTER.standingHeight;
}

function linkNodes(collisionWorld, nodes, doorways) {
  const edges = [];

  for (let from = 0; from < nodes.length; from += 1) {
    for (let to = from + 1; to < nodes.length; to += 1) {
      const start = nodes[from];
      const end = nodes[to];
      const offsetX = end.x - start.x;
      const offsetY = end.y - start.y;
      const offsetZ = end.z - start.z;

      const groundDistanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (groundDistanceSquared > MAXIMUM_EDGE_LENGTH * MAXIMUM_EDGE_LENGTH) continue;
      if (!isLinkable(start, end)) continue;

      const atThreshold =
        start.type === NODE_TYPE.threshold || end.type === NODE_TYPE.threshold;
      if (!atThreshold && doorways.some((doorway) => crossesDoorway(doorway, start, end))) continue;

      const upwards = offsetY > MAXIMUM_CLIMB;
      const downwards = -offsetY > MAXIMUM_CLIMB;
      if (upwards && downwards) continue;

      const walkable = isCorridorWalkable(
        collisionWorld,
        start.x,
        start.y,
        start.z,
        end.x,
        end.y,
        end.z,
        CORRIDOR_SAMPLE_SPACING
      );
      if (!walkable) continue;

      const cost = Math.sqrt(groundDistanceSquared + offsetY * offsetY);
      if (!upwards) edges.push({ from, to, cost });
      if (!downwards) edges.push({ from: to, to: from, cost });
    }
  }

  return edges;
}

/**
 * Keeps only nodes mutually reachable with the node nearest the farm centre.
 * Edges are directed because a ledge can be dropped off but not climbed, so
 * plain connectivity would still leave one-way traps that fail a search.
 */
function strongComponentContainingCenter(nodes, directedEdges) {
  const forward = buildAdjacency(nodes.length, directedEdges, false);
  const backward = buildAdjacency(nodes.length, directedEdges, true);

  let seed = 0;
  let bestDistanceSquared = Infinity;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const distanceSquared = node.x * node.x + node.z * node.z;
    if (distanceSquared >= bestDistanceSquared) continue;
    bestDistanceSquared = distanceSquared;
    seed = index;
  }

  const reachable = breadthFirstReach(nodes.length, forward, seed);
  const reaching = breadthFirstReach(nodes.length, backward, seed);
  const kept = new Uint8Array(nodes.length);
  for (let index = 0; index < nodes.length; index += 1) {
    kept[index] = reachable[index] === 1 && reaching[index] === 1 ? 1 : 0;
  }

  return kept;
}

function buildAdjacency(nodeCount, directedEdges, reversed) {
  const adjacency = [];
  for (let index = 0; index < nodeCount; index += 1) adjacency.push([]);
  for (const edge of directedEdges) {
    if (reversed) adjacency[edge.to].push(edge.from);
    else adjacency[edge.from].push(edge.to);
  }
  return adjacency;
}

function breadthFirstReach(nodeCount, adjacency, seed) {
  const seen = new Uint8Array(nodeCount);
  const queue = [seed];
  seen[seed] = 1;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbour of adjacency[queue[cursor]]) {
      if (seen[neighbour] === 1) continue;
      seen[neighbour] = 1;
      queue.push(neighbour);
    }
  }

  return seen;
}

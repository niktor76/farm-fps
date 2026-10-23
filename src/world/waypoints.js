/**
 * Navigation graph for bots: a lattice of reachable points linked where the
 * straight line between them is walkable, searched with A*.
 *
 * Chosen over a generated navmesh because the map is flat with box cover
 * (DEC-13); a few dozen nodes plus local steering covers it.
 *
 * Owned by PH-7-navigation.
 */
export class WaypointGraph {
  /**
   * @param {import('./collision.js').CollisionWorld} collisionWorld
   * @param {import('../core/rng.js').Random} random
   */
  static build(collisionWorld, random) {
    throw new Error('not implemented: PH-7-navigation');
  }

  /** @returns {number} index of the node nearest to a world position */
  nearestNode(position) {
    throw new Error('not implemented: PH-7-navigation');
  }

  /** @returns {number[]} node indices from start to goal, empty when unreachable */
  findPath(startIndex, goalIndex) {
    throw new Error('not implemented: PH-7-navigation');
  }

  /** @returns {import('three').Vector3} */
  nodePosition(index, target) {
    throw new Error('not implemented: PH-7-navigation');
  }

  randomNode(random) {
    throw new Error('not implemented: PH-7-navigation');
  }

  /** Node whose position breaks line of sight to a threat, for taking cover. */
  findCoverNode(fromPosition, threatPosition, searchRadius) {
    throw new Error('not implemented: PH-7-navigation');
  }

  /** Line geometry of the graph, for the debug overlay. */
  buildDebugMesh() {
    throw new Error('not implemented: PH-7-navigation');
  }
}

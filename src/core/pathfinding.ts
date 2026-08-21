// Pure BFS pathfinding over a grid. `blocked(x, y)` returns true for unwalkable tiles.

export function findPathBFSGrid(mapW, mapH, fromX, fromY, toX, toY, blocked) {
  if (fromX === toX && fromY === toY) return [];
  const visited = Array.from({ length: mapH }, () => Array(mapW).fill(false));
  const parent = Array.from({ length: mapH }, () => Array(mapW).fill(null));
  const queue = [{ x: fromX, y: fromY }];
  visited[fromY][fromX] = true;
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (queue.length) {
    const cur = queue.shift();
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) continue;
      if (visited[ny][nx]) continue;
      if (blocked(nx, ny)) continue;
      visited[ny][nx] = true;
      parent[ny][nx] = { x: cur.x, y: cur.y };
      if (nx === toX && ny === toY) {
        const path = [];
        let p = { x: nx, y: ny };
        while (p.x !== fromX || p.y !== fromY) {
          path.unshift(p);
          const pp = parent[p.y][p.x];
          if (!pp) break;
          p = pp;
        }
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

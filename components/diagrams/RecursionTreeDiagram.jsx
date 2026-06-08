"use client";

function buildFibTree(value, level, maxDepth, labelIndexRef, labels) {
  const label = labels[labelIndexRef.value] || `fib(${value})`;
  labelIndexRef.value += 1;

  if (level >= maxDepth - 1 || value <= 1) {
    return { label, children: [] };
  }

  return {
    label,
    children: [
      buildFibTree(value - 1, level + 1, maxDepth, labelIndexRef, labels),
      buildFibTree(Math.max(value - 2, 0), level + 1, maxDepth, labelIndexRef, labels),
    ],
  };
}

function layoutTree(node, depth = 0, index = 0, maxDepth = 1) {
  const xSpread = Math.pow(2, maxDepth - depth - 1);
  const x = (index + 0.5) * xSpread;
  const y = depth;

  const positioned = { ...node, x, y, depth };
  positioned.children = node.children.map((child, childIndex) =>
    layoutTree(child, depth + 1, index * 2 + childIndex, maxDepth),
  );

  return positioned;
}

function flattenTree(node, list = []) {
  list.push(node);
  for (const child of node.children) {
    flattenTree(child, list);
  }
  return list;
}

export default function RecursionTreeDiagram({ spec = {} }) {
  const root = Number(spec.root ?? 4);
  const depth = Math.min(Math.max(Number(spec.depth ?? 3), 1), 6);
  const labels = Array.isArray(spec.labels) ? spec.labels : [];
  const labelIndexRef = { value: 0 };
  const tree = layoutTree(buildFibTree(root, 0, depth, labelIndexRef, labels), 0, 0, depth);
  const nodes = flattenTree(tree);
  const width = Math.max(320, Math.pow(2, depth - 1) * 72);
  const height = depth * 72 + 48;
  const unitX = width / Math.pow(2, depth - 1);
  const unitY = 56;

  const edges = [];
  for (const node of nodes) {
    for (const child of node.children) {
      edges.push({ from: node, to: child });
    }
  }

  return (
    <svg
      aria-label={`Recursion tree for fib(${root})`}
      className="study-spec-diagram study-recursion-tree"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      {edges.map(({ from, to }) => (
        <line
          key={`${from.label}-${to.label}-${to.x}`}
          stroke="#94a3b8"
          strokeWidth="1.5"
          x1={from.x * unitX}
          x2={to.x * unitX}
          y1={from.y * unitY + 28}
          y2={to.y * unitY + 8}
        />
      ))}
      {nodes.map((node) => (
        <g key={`${node.label}-${node.x}-${node.y}`} transform={`translate(${node.x * unitX - 28}, ${node.y * unitY})`}>
          <rect fill="#fff" height="28" rx="8" stroke="#11615c" strokeWidth="1.5" width="56" x="0" y="0" />
          <text dominantBaseline="middle" fill="#192026" fontSize="11" textAnchor="middle" x="28" y="15">
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

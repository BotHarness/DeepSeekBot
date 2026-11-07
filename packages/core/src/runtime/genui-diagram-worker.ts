import { parentPort, workerData } from 'node:worker_threads';
import { detectType, register, render } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';
import sequence from 'pele/diagrams/sequence';
import xychart from 'pele/diagrams/xychart';

const request: {
  source: string;
  width: number;
  idPrefix: string;
  sourceLimit: number;
  outputLimit: number;
  maxEdges: number;
} = workerData;

try {
  register(flowchart, sequence, xychart);
  const family = detectType(request.source);
  if (family !== 'flowchart' && family !== 'sequence' && family !== 'xychart')
    throw new Error('Unsupported diagram family. Use flowchart, sequenceDiagram or xychart-beta.');
  const result = render(request.source, {
    idPrefix: request.idPrefix,
    maxWidth: request.width,
    responsive: true,
    links: false,
    images: false,
    limit: request.sourceLimit,
    outputLimit: request.outputLimit,
    maxEdges: request.maxEdges,
    fontFamily: 'system-ui, sans-serif',
  });
  parentPort?.postMessage({
    ok: true,
    family,
    svg: result.svg,
    width: result.width,
    height: result.height,
  });
} catch {
  parentPort?.postMessage({ ok: false });
}

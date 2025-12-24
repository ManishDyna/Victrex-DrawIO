const { XMLParser } = require('fast-xml-parser');
const zlib = require('zlib');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true, // Convert string "1" to number 1
  trimValues: true,
});

/* -------------------- helpers -------------------- */

function inferShapeFromStyle(style = '') {
  const s = style.toLowerCase();

  if (s.includes('ellipse')) return 'ellipse';
  if (s.includes('rhombus') || s.includes('diamond')) return 'decision';
  if (s.includes('parallelogram')) return 'data';
  if (s.includes('document')) return 'document';
  if (s.includes('swimlane') || s.includes('subprocess')) return 'subprocess';

  return 'rectangle';
}

function decodeCompressedDiagram(base64) {
  const buffer = Buffer.from(base64, 'base64');

  try {
    const inflated = zlib.inflateRawSync(buffer).toString('utf8');
    return decodeURIComponent(inflated);
  } catch {
    const inflated = zlib.inflateSync(buffer).toString('utf8');
    return decodeURIComponent(inflated);
  }
}

/**
 * Recursively collect all mxCell elements from nested structures
 */
function collectAllCells(obj, cells = []) {
  if (!obj) return cells;

  // If it's an array, process each item
  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectAllCells(item, cells);
    }
    return cells;
  }

  // If it's an object
  if (typeof obj === 'object') {
    // Check if this is an mxCell
    if (obj.id !== undefined && (obj.vertex !== undefined || obj.edge !== undefined || obj.parent !== undefined)) {
      cells.push(obj);
    }

    // Recursively check all properties
    for (const key in obj) {
      if (key === 'mxCell') {
        // Handle wrapped mxCell
        const wrapped = Array.isArray(obj.mxCell) ? obj.mxCell : [obj.mxCell];
        wrapped.forEach(cell => {
          if (cell) cells.push(cell);
        });
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        collectAllCells(obj[key], cells);
      }
    }
  }

  return cells;
}

/**
 * Normalize mxCell list:
 * - supports direct mxCell
 * - supports wrapped { mxCell: {...} }
 * - supports nested structures
 */
function normalizeCells(mxCells) {
  if (!mxCells) return [];

  // Use recursive collection to get all cells
  const allCells = collectAllCells(mxCells);

  // If we found cells recursively, use those
  if (allCells.length > 0) {
    return allCells;
  }

  // Fallback to original logic
  if (!Array.isArray(mxCells)) {
    mxCells = [mxCells];
  }

  const normalized = [];

  for (const item of mxCells) {
    if (item.mxCell) {
      // wrapped form (Visio / tagged)
      const wrapped = Array.isArray(item.mxCell) ? item.mxCell : [item.mxCell];
      wrapped.forEach(cell => {
        if (cell) normalized.push(cell);
      });
    } else if (item.id !== undefined) {
      // normal draw.io mxCell
      normalized.push(item);
    }
  }

  return normalized;
}

/* -------------------- main parser -------------------- */

function parseMxGraphXml(xml, defaultDiagramId = 'Page-1') {
  if (!xml || typeof xml !== 'string') {
    throw new Error('XML must be a non-empty string');
  }

  let diagramId = defaultDiagramId;
  let model;

  /* ---------- mxfile with compressed diagram ---------- */
  if (xml.includes('<mxfile') && xml.includes('<diagram')) {
    const diagramMatch = xml.match(/<diagram[^>]*>([\s\S]*?)<\/diagram>/);
    if (!diagramMatch) {
      throw new Error('Invalid mxfile: <diagram> not found');
    }

    const nameMatch = xml.match(/<diagram[^>]*name="([^"]+)"/);
    if (nameMatch) diagramId = nameMatch[1];

    const decodedXml = decodeCompressedDiagram(diagramMatch[1].trim());
    const parsed = parser.parse(decodedXml);
    model = parsed.mxGraphModel;
  }

  /* ---------- plain mxGraphModel ---------- */
  if (!model) {
    const parsed = parser.parse(xml);
    model = parsed.mxGraphModel;
  }

  if (!model?.root) {
    throw new Error('Invalid mxGraphModel: root not found');
  }

  /* ---------- normalize cells ---------- */
  // Try to get cells from root.mxCell, or recursively search
  const rootCells = model.root.mxCell || model.root;
  const cells = normalizeCells(rootCells);

  if (cells.length === 0) {
    console.warn('⚠️  No cells found in diagram. Structure:', JSON.stringify(model.root, null, 2).substring(0, 500));
  }

  const nodes = [];
  const connections = [];

  for (const cell of cells) {
    // More flexible vertex/edge detection
    const vertexValue = cell.vertex;
    const edgeValue = cell.edge;
    
    const isVertex = 
      vertexValue === 1 || 
      vertexValue === '1' || 
      vertexValue === true || 
      vertexValue === 'true' ||
      (vertexValue !== undefined && edgeValue === undefined && !cell.source && !cell.target);
    
    const isEdge = 
      edgeValue === 1 || 
      edgeValue === '1' || 
      edgeValue === true || 
      edgeValue === 'true' ||
      (edgeValue !== undefined && vertexValue === undefined);

    /* ---------- nodes ---------- */
    if (isVertex) {
      const geom = cell.mxGeometry || {};
      nodes.push({
        id: cell.id,
        label: cell.value || '',
        shape: inferShapeFromStyle(cell.style),
        x: geom.x != null ? Number(geom.x) : 0,
        y: geom.y != null ? Number(geom.y) : 0,
      });
    }
  
    /* ---------- edges ---------- */
    if (isEdge && cell.source && cell.target) {
      connections.push({
        from: cell.source,
        to: cell.target,
      });
    }
  }
  
  // for (const cell of cells) {
  //   /* ---------- nodes ---------- */
  //   if (cell.vertex === '1') {
  //     const geom = cell.mxGeometry || {};

  //     nodes.push({
  //       id: cell.id,
  //       label: cell.value || '',
  //       shape: inferShapeFromStyle(cell.style),
  //       x: geom.x != null ? Number(geom.x) : 0,
  //       y: geom.y != null ? Number(geom.y) : 0,
  //     });
  //   }

  //   /* ---------- edges ---------- */
  //   if (cell.edge === '1' && cell.source && cell.target) {
  //     connections.push({
  //       from: cell.source,
  //       to: cell.target,
  //     });
  //   }
  // }

  return {
    diagramId,
    nodes,
    connections,
  };
}

module.exports = {
  parseMxGraphXml,
};

const zlib = require('zlib');

/**
 * Maps shape type to draw.io style string
 */
function getStyleFromShape(shape) {
  const styleMap = {
    rectangle: 'rounded=0;whiteSpace=wrap;html=1;',
    ellipse: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;',
    decision: 'rhombus;whiteSpace=wrap;html=1;',
    data: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
    document: 'shape=document;whiteSpace=wrap;html=1;',
    subprocess: 'swimlane;whiteSpace=wrap;html=1;',
  };

  return styleMap[shape] || styleMap.rectangle;
}

/**
 * Escapes XML special characters
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Converts parsedData (nodes and connections) back to draw.io XML format
 * 
 * @param {Object} parsedData - Object with nodes and connections arrays
 * @param {string} parsedData.diagramId - Diagram ID (default: 'Page-1')
 * @param {Array} parsedData.nodes - Array of node objects with id, label, shape, x, y
 * @param {Array} parsedData.connections - Array of connection objects with from, to
 * @returns {string} - XML string in draw.io mxGraphModel format
 */
function buildMxGraphXml(parsedData) {
  const { diagramId = 'Page-1', nodes = [], connections = [] } = parsedData;


  // Build XML string manually to match draw.io format exactly
  let xml = '<mxGraphModel dx="1484" dy="645" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '  <root>\n';
  
  // Root cell (id="0")
  xml += '    <mxCell id="0"/>\n';
  
  // Parent cell (id="1", parent="0")
  xml += '    <mxCell id="1" parent="0"/>\n';
  
  // Node cells (vertices)
  nodes.forEach((node) => {
    const style = getStyleFromShape(node.shape || 'rectangle');
    const width = 120; // Default width
    const height = node.shape === 'ellipse' ? 80 : 60; // Default height
    const value = escapeXml(node.label || '');
    
    xml += `    <mxCell id="${escapeXml(node.id)}" value="${value}" style="${escapeXml(style)}" vertex="1" parent="1">\n`;
    xml += `      <mxGeometry x="${node.x || 0}" y="${node.y || 0}" width="${width}" height="${height}" as="geometry"/>\n`;
    xml += '    </mxCell>\n';
  });
  
  // Connection cells (edges)
  connections.forEach((conn, index) => {
    const edgeId = `edge_${conn.from}_${conn.to}_${index}`;
    
    xml += `    <mxCell id="${escapeXml(edgeId)}" edge="1" parent="1" source="${escapeXml(conn.from)}" target="${escapeXml(conn.to)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;">\n`;
    xml += '      <mxGeometry relative="1" as="geometry"/>\n';
    xml += '    </mxCell>\n';
  });
  
  xml += '  </root>\n';
  xml += '</mxGraphModel>';
  
  return xml;
}

module.exports = {
  buildMxGraphXml,
  getStyleFromShape,
};


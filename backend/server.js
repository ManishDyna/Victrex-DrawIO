/**
 * Backend server for draw.io
 *
 * Responsibilities:
 * - Serve the local draw.io webapp (unmodified)
 * - Provide a REST API for storing and retrieving diagrams in MongoDB
 * - Handle CORS for iframe embedding and frontend API calls
 */

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { parseMxGraphXml } = require('./utils/mxGraphParser');

const app = express();
const PORT = process.env.PORT || 3001;

// ---- MongoDB Setup --------------------------------------------------------

// Connection string, override with MONGODB_URI env var if desired
// NOTE: This default points at your MongoDB Atlas cluster.
// For production, consider moving this into an environment variable only.
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://manishsoni_db_user:zFcvZnoOojXytiZI@cluster0.8ctpqtn.mongodb.net/';

// Diagram schema: stores XML plus parsed structure and metadata
const diagramSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    xml: { type: String, required: true },
    sourceFileName: { type: String },
    // Process owner information
    processOwner: { type: String }, // Overall process owner
    // Parsed structure from XML
    parsedData: {
      diagramId: { type: String },
      nodes: [
        {
          id: { type: String },
          label: { type: String },
          shape: { type: String },
          x: { type: Number },
          y: { type: Number },
          owner: { type: String }, // Owner name for this specific step
          subprocesses: [{ type: String }], // Subprocess IDs if any
        },
      ],
      connections: [
        {
          from: { type: String },
          to: { type: String },
        },
      ],
    },
  },
  { timestamps: true }
);

const Diagram = mongoose.model('Diagram', diagramSchema);

// Connect to MongoDB once at startup
mongoose
  .connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    console.error('Full error:', err);
  });

// ---- Middleware -----------------------------------------------------------

// Parse JSON bodies for API routes
app.use(express.json({ limit: '5mb' }));

// Enable CORS for all routes (needed for iframe embedding and API)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ---- Static draw.io hosting ----------------------------------------------

// Path to draw.io webapp directory
const DRAWIO_WEBAPP_PATH = path.join(
  __dirname,
  '..',
  'drawio',
  'src',
  'main',
  'webapp'
);

// Serve static files from draw.io webapp directory
app.use(express.static(DRAWIO_WEBAPP_PATH));

// ---- REST API for diagrams -----------------------------------------------

/**
 * POST /api/diagrams
 * Creates a new diagram entry in MongoDB.
 * Parses the XML and stores both raw XML and parsed structure.
 *
 * Body: { name: string, xml: string, sourceFileName?: string, diagramId?: string }
 */
app.post('/api/diagrams', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const { name, xml, sourceFileName, diagramId } = req.body || {};

    if (!name || !xml) {
      return res.status(400).json({
        error: 'Both "name" and "xml" fields are required.',
      });
    }

    let parsedData;

    // Debug: Log XML structure info
    const isVSDX = sourceFileName?.toLowerCase().endsWith('.vsdx') || sourceFileName?.toLowerCase().endsWith('.vsd');
    console.log('\n📄 Diagram save request:');
    console.log(`   - Name: ${name}`);
    console.log(`   - Source: ${sourceFileName || 'manual'}`);
    console.log(`   - Is VSDX: ${isVSDX}`);
    console.log(`   - XML length: ${xml.length} chars`);
    console.log(`   - XML starts with: ${xml.substring(0, 100)}`);
    console.log(`   - Has <mxfile>: ${xml.includes('<mxfile')}`);
    console.log(`   - Has <diagram>: ${xml.includes('<diagram')}`);
    console.log(`   - Has mxGraphModel: ${xml.includes('mxGraphModel')}`);
    console.log(`   - Has mxCell: ${xml.includes('mxCell')}`);

    try {
      parsedData = parseMxGraphXml(xml, diagramId || 'Page-1');
      console.log('✅ Parsed diagram successfully:', JSON.stringify(parsedData, null, 2));
      console.log(`   - Nodes: ${parsedData.nodes.length}`);
      console.log(`   - Connections: ${parsedData.connections.length}`);
      
      if (parsedData.nodes.length === 0 && parsedData.connections.length === 0) {
        console.warn('⚠️  WARNING: Parsed successfully but found 0 nodes and 0 connections!');
        console.warn('   This might indicate the XML structure is different from expected.');
      }
    } catch (err) {
      console.error('❌ Diagram parsing failed:', err.message);
      console.error('   Error stack:', err.stack);
      console.error('   XML preview (first 500 chars):', xml.substring(0, 500));
      // Don't set parsedData, let it remain undefined
    }

    const doc = await Diagram.create({
      name,
      xml,
      sourceFileName: sourceFileName || undefined,
      parsedData: parsedData || undefined,
    });

    return res.status(201).json({
      id: doc._id,
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      processOwner: doc.processOwner,
      parsedData: doc.parsedData,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error creating diagram:', err);
    return res.status(500).json({ error: 'Failed to create diagram.' });
  }
});


/**
 * GET /api/diagrams
 * Returns a list of diagrams with basic metadata (no XML payload).
 */
app.get('/api/diagrams', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const diagrams = await Diagram.find(
      {},
      'name sourceFileName createdAt updatedAt'
    )
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json(
      diagrams.map((d) => ({
        id: d._id,
        name: d.name,
        sourceFileName: d.sourceFileName,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }))
    );
  } catch (err) {
    console.error('Error listing diagrams:', err);
    return res.status(500).json({ error: 'Failed to list diagrams.' });
  }
});

/**
 * GET /api/diagrams/:id
 * Returns a single diagram including XML payload and parsed data.
 */
app.get('/api/diagrams/:id', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const { id } = req.params;
    const doc = await Diagram.findById(id);

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    return res.json({
      id: doc._id,
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      xml: doc.xml,
      processOwner: doc.processOwner,
      parsedData: doc.parsedData,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error fetching diagram:', err);
    return res.status(500).json({ error: 'Failed to fetch diagram.' });
  }
});

/**
 * GET /api/diagrams/:id/parsed
 * Returns only the parsed structure (nodes and connections) for a diagram.
 */
app.get('/api/diagrams/:id/parsed', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Diagram.findById(id).select('parsedData name');

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    if (!doc.parsedData) {
      return res.status(404).json({ error: 'Parsed data not available for this diagram.' });
    }

    return res.json({
      id: doc._id,
      name: doc.name,
      ...doc.parsedData,
    });
  } catch (err) {
    console.error('Error fetching parsed diagram:', err);
    return res.status(500).json({ error: 'Failed to fetch parsed diagram.' });
  }
});

/**
 * PATCH /api/diagrams/:id
 * Updates a diagram with owner information and edited content.
 * 
 * Body: { processOwner?: string, parsedData?: { nodes?: [...], connections?: [...] } }
 */
app.patch('/api/diagrams/:id', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const { id } = req.params;
    const { processOwner, parsedData } = req.body;

    const doc = await Diagram.findById(id);

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    // Update process owner if provided
    if (processOwner !== undefined) {
      doc.processOwner = processOwner;
    }

    // Update parsed data if provided
    if (parsedData) {
      if (!doc.parsedData) {
        doc.parsedData = {};
      }

      if (parsedData.nodes) {
        doc.parsedData.nodes = parsedData.nodes;
      }

      if (parsedData.connections) {
        doc.parsedData.connections = parsedData.connections;
      }

      // Preserve other parsedData fields if they exist
      if (parsedData.diagramId) {
        doc.parsedData.diagramId = parsedData.diagramId;
      }
    }

    await doc.save();

    return res.json({
      id: doc._id,
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      processOwner: doc.processOwner,
      parsedData: doc.parsedData,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error updating diagram:', err);
    return res.status(500).json({ error: 'Failed to update diagram.' });
  }
});

// ---- Start server --------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Draw.io server running at http://localhost:${PORT}`);
  console.log(`Serving files from: ${DRAWIO_WEBAPP_PATH}`);
});



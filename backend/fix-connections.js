/**
 * Script to clean up corrupted subprocess connections
 * 
 * This script:
 * 1. Finds all diagrams with subprocesses
 * 2. Removes phantom connections (connections to non-existent nodes)
 * 3. Rebuilds correct connections based on subprocess parent relationships
 * 
 * Run with: node backend/fix-connections.js
 */

const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://manishsoni_db_user:zFcvZnoOojXytiZI@cluster0.8ctpqtn.mongodb.net/';

// Diagram schema
const diagramSchema = new mongoose.Schema({
  name: String,
  xml: String,
  sourceFileName: String,
  processOwner: String,
  parsedData: {
    diagramId: String,
    nodes: Array,
    connections: Array,
  },
}, { timestamps: true });

const Diagram = mongoose.model('Diagram', diagramSchema);

async function fixConnections() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all diagrams
    const diagrams = await Diagram.find({});
    console.log(`📊 Found ${diagrams.length} diagram(s)\n`);

    for (const diagram of diagrams) {
      console.log(`\n📋 Processing: "${diagram.name}" (ID: ${diagram._id})`);
      
      if (!diagram.parsedData || !diagram.parsedData.nodes) {
        console.log('   ⏭️  Skipping - no parsedData');
        continue;
      }

      const nodes = diagram.parsedData.nodes || [];
      const connections = diagram.parsedData.connections || [];
      
      // Collect all valid node IDs (main nodes + subprocesses)
      const validNodeIds = new Set();
      let subprocessCount = 0;
      
      // Add main node IDs
      nodes.forEach(node => {
        validNodeIds.add(String(node.id));
        
        // Calculate subprocess IDs based on their index
        if (node.subprocesses && node.subprocesses.length > 0) {
          node.subprocesses.forEach((_, index) => {
            const subprocessId = 10000 + subprocessCount;
            validNodeIds.add(String(subprocessId));
            subprocessCount++;
          });
        }
      });
      
      console.log(`   Valid node IDs: ${Array.from(validNodeIds).sort((a, b) => Number(a) - Number(b)).join(', ')}`);
      
      // Find invalid connections (phantom connections)
      const invalidConnections = connections.filter(conn => {
        const fromExists = validNodeIds.has(String(conn.from));
        const toExists = validNodeIds.has(String(conn.to));
        return !fromExists || !toExists;
      });
      
      if (invalidConnections.length > 0) {
        console.log(`   ⚠️  Found ${invalidConnections.length} invalid connection(s):`);
        invalidConnections.forEach(conn => {
          console.log(`      ${conn.from} → ${conn.to} (from exists: ${validNodeIds.has(String(conn.from))}, to exists: ${validNodeIds.has(String(conn.to))})`);
        });
        
        // Remove invalid connections
        const validConnections = connections.filter(conn => {
          const fromExists = validNodeIds.has(String(conn.from));
          const toExists = validNodeIds.has(String(conn.to));
          return fromExists && toExists;
        });
        
        console.log(`   🔧 Cleaning: ${connections.length} → ${validConnections.length} connections`);
        
        // Update diagram
        diagram.parsedData.connections = validConnections;
        await diagram.save();
        
        console.log(`   ✅ Fixed "${diagram.name}"`);
      } else {
        console.log(`   ✅ No invalid connections found`);
      }
    }
    
    console.log('\n\n🎉 Connection cleanup complete!');
    console.log('💡 Tip: Restart your backend server to load the cleaned data');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the fix
fixConnections().then(() => process.exit(0));


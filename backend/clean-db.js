/**
 * Standalone script to connect to MongoDB and clean the database
 * 
 * Usage:
 *   node clean-db.js                    # Lists all collections and document counts
 *   node clean-db.js --delete-all       # Deletes all documents from all collections
 *   node clean-db.js --drop-collections  # Drops all collections (more destructive)
 */

const mongoose = require('mongoose');

// Same connection string as in server.js
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://shubhamkumbhar_db_user:Fv4VcXUQz5xkzU5z@cluster0.cdu40ye.mongodb.net/?appName=Cluster0';

// Simple Diagram schema (same as server.js)
const diagramSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    xml: { type: String, required: true },
    sourceFileName: { type: String },
  },
  { timestamps: true }
);

const Diagram = mongoose.model('Diagram', diagramSchema);

async function main() {
  const args = process.argv.slice(2);
  const deleteAll = args.includes('--delete-all');
  const dropCollections = args.includes('--drop-collections');

  console.log('Connecting to MongoDB...');
  console.log('URI:', MONGODB_URI.replace(/:[^:@]+@/, ':****@')); // Hide password in logs

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // 10 seconds
    });
    console.log('✓ Connected to MongoDB successfully!\n');

    // Get the database instance
    const db = mongoose.connection.db;

    // List all collections
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collection(s):\n`);

    if (collections.length === 0) {
      console.log('Database is empty. No collections found.');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Show collection info
    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      console.log(`  - ${coll.name}: ${count} document(s)`);
    }

    if (deleteAll) {
      console.log('\n⚠️  DELETING ALL DOCUMENTS FROM ALL COLLECTIONS...\n');
      
      for (const coll of collections) {
        const result = await db.collection(coll.name).deleteMany({});
        console.log(`  ✓ Deleted ${result.deletedCount} document(s) from ${coll.name}`);
      }
      
      console.log('\n✓ All documents deleted successfully!');
    } else if (dropCollections) {
      console.log('\n⚠️  DROPPING ALL COLLECTIONS (DESTRUCTIVE!)...\n');
      
      for (const coll of collections) {
        await db.collection(coll.name).drop();
        console.log(`  ✓ Dropped collection: ${coll.name}`);
      }
      
      console.log('\n✓ All collections dropped successfully!');
    } else {
      console.log('\n💡 To delete all documents, run: node clean-db.js --delete-all');
      console.log('💡 To drop all collections, run: node clean-db.js --drop-collections');
    }

    await mongoose.connection.close();
    console.log('\n✓ Connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ MongoDB connection error:', error.message);
    
    if (error.message.includes('IP')) {
      console.error('\n💡 Common fix: Add your IP address to MongoDB Atlas Network Access:');
      console.error('   https://www.mongodb.com/docs/atlas/security-whitelist/');
      console.error('   Or temporarily allow 0.0.0.0/0 (all IPs) for testing.');
    }
    
    process.exit(1);
  }
}

main();


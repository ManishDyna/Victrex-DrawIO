# Connector Properties & Subprocess Connector Fixes

## Issues Fixed

### 1. **Connector Properties Not Stored**
**Problem**: When importing VSDX files, connector properties (width, strokeWidth, strokeColor, endArrow, etc.) were lost because only `from` and `to` were stored in the database.

**Solution**:
- Updated MongoDB schema (`backend/server.js`) to store connector properties:
  - `style`: Full style string
  - `id`: Edge cell ID
  - `strokeWidth`, `strokeColor`, `endArrow`, `startArrow`, `dashed`, `dashPattern`: Extracted properties

- Updated parser (`backend/utils/mxGraphParser.js`) to extract connector properties from XML:
  - Parses style string to extract individual properties
  - Stores both full style and individual properties for easier access

### 2. **Subprocess Connectors Not Showing**
**Problem**: When adding subprocesses in FormView, the nodes appeared but connectors didn't show in the editor.

**Root Causes**:
1. Subprocess node IDs weren't registered in `cellIdMap` before creating edges
2. Edge format might not match draw.io's expected format exactly
3. Insufficient validation of source/target IDs

**Solutions**:
- **ID Registration**: Added subprocess IDs to `cellIdMap` immediately after creation so edges can reference them
- **Better Validation**: Added comprehensive ID verification for both source and target nodes
- **Improved Logging**: Added detailed logging to track edge creation and insertion
- **XML Format**: Ensured edges are inserted with proper formatting and after nodes
- **Edge Verification**: Added post-insertion verification to ensure edges are in XML

### 3. **Enhanced Error Handling**
- Added validation to check if source/target IDs exist before creating edges
- Added warnings when IDs don't match
- Added verification after XML insertion to confirm edges are present

## Changes Made

### Files Modified:

1. **`backend/server.js`**
   - Updated `connections` schema to include connector properties
   - Now stores: `style`, `id`, `strokeWidth`, `strokeColor`, `endArrow`, `startArrow`, `dashed`, `dashPattern`

2. **`backend/utils/mxGraphParser.js`**
   - Enhanced edge parsing to extract style properties
   - Added `parseStyleProperty()` helper function
   - Now extracts and stores all connector visual properties

3. **`backend/utils/xmlUpdater.js`**
   - Fixed subprocess connector creation:
     - Register subprocess IDs in `cellIdMap` before creating edges
     - Improved ID validation and verification
     - Better edge XML format matching
     - Enhanced logging for debugging
   - Added post-insertion verification of edges and nodes

4. **`frontend/src/components/FormView.jsx`**
   - Updated success message to show connection count
   - Added note about reloading diagram to see connectors

## How It Works Now

### VSDX Import Flow:
1. VSDX file imported → Draw.io converts to mxGraphModel
2. XML exported → Contains all connector properties in `style` attribute
3. Parser extracts → Stores `from`, `to`, `style`, and individual properties
4. Database stores → Full connector information preserved

### Subprocess Connector Creation:
1. User adds subprocess in FormView
2. Subprocess node created with unique ID
3. ID registered in `cellIdMap`
4. Edge created with `source` (parent node) and `target` (subprocess ID)
5. Both node and edge inserted into XML (nodes first, then edges)
6. XML updated and saved to database
7. Parser re-runs to extract new connections
8. **User needs to reload diagram in editor to see connectors**

## Important Notes

### ⚠️ Editor Reload Required
After saving subprocesses from FormView, **the user must reload the diagram in the editor** to see the new connectors. The XML is updated correctly, but draw.io needs to reload it.

### Connector Properties
- Full `style` string is preserved for complete compatibility
- Individual properties extracted for easier querying/filtering
- Properties like `strokeWidth`, `strokeColor`, `endArrow` are now available in JSON data

### ID Management
- Subprocess IDs start from `maxId + 1000` to avoid conflicts
- Edge IDs start from `maxId + 2000`
- All IDs are verified before use
- IDs are registered in `cellIdMap` for validation

## Testing Recommendations

1. **Test VSDX Import**:
   - Import a VSDX file with various connector styles
   - Verify connector properties are stored in database
   - Check that style information is preserved

2. **Test Subprocess Connectors**:
   - Add subprocesses in FormView
   - Save changes
   - Reload diagram in editor
   - Verify connectors appear between parent nodes and subprocesses

3. **Test Multiple Subprocesses**:
   - Add multiple subprocesses to a node
   - Verify all connectors are created
   - Check that connectors between subprocesses are also created

4. **Test Edge Validation**:
   - Check server logs for ID verification messages
   - Verify warnings appear if IDs don't match
   - Confirm edges are inserted correctly in XML

## Debugging

If connectors still don't appear:
1. Check server logs for edge creation messages
2. Verify edge IDs are in the XML (search for `edge="1"`)
3. Check that source/target IDs match actual node IDs
4. Ensure diagram is reloaded in editor after saving
5. Check browser console for any draw.io errors


# Fix Instructions for Corrupted Subprocess Connections

## 🐛 Problem Summary

Your database has corrupted connection data:
1. **Extra Node2** appearing in diagram
2. **Wrong connections** (Node3 connecting to Node1 instead of Node2)
3. **Phantom connections** to non-existent nodes (connection to Node ID 10003 which doesn't exist)

## 🔍 Root Cause

When saving from FormView, old connections were preserved instead of being cleaned up. This caused:
- Duplicate connections
- Phantom connections to non-existent nodes
- Wrong parent-child relationships

## ✅ Solution Steps

### Step 1: Clean Up Database

Run the cleanup script to remove phantom connections:

```bash
cd C:\python\Victrex-DrawIO
node backend/fix-connections.js
```

**What this does:**
- Finds all diagrams with subprocesses
- Identifies phantom connections (to non-existent nodes)
- Removes invalid connections
- Keeps only valid connections

### Step 2: Restart Backend Server

After cleaning the database, restart your backend:

```bash
# Stop the current backend server (Ctrl+C)
# Then restart:
cd C:\python\Victrex-DrawIO\backend
node server.js
```

### Step 3: Test the Fix

1. Open your application
2. Go to "Available Processes"
3. Click edit icon for "customer support"
4. Verify the subprocesses show correctly:
   - Node1 (parent: Main Step)
   - Node2 (parent: Node1)
   - Node3 (parent: Node2)
5. Click "Save Changes"
6. Switch to diagram view
7. Verify connections:
   - Main Step → Node1 ✅
   - Node1 → Node2 ✅
   - Node2 → Node3 ✅ (should be correct now)

---

## 🛠️ Backend Fix Applied

**File:** `backend/utils/xmlUpdater.js`

**What was fixed:**
1. Now removes BOTH incoming AND outgoing edges when updating subprocesses
2. Prevents duplicate edges when parent relationships change
3. Added debug logging to track parent lookups

**Before:**
```javascript
// Only removed edges TO the subprocess
const oldEdgeToPattern = ...;
updatedXml = updatedXml.replace(oldEdgeToPattern, ...);
```

**After:**
```javascript
// Remove edges TO the subprocess
const oldEdgeToPattern = ...;
updatedXml = updatedXml.replace(oldEdgeToPattern, ...);

// Remove edges FROM the subprocess (NEW!)
const oldEdgeFromPattern = ...;
updatedXml = updatedXml.replace(oldEdgeFromPattern, ...);
```

---

## 📊 Expected Results

### Before Fix:
```
Connections:
  Main → Node1 ✅
  Node1 → Node2 ✅
  Node1 → Node3 ❌ WRONG!
  Node3 → 10003 ❌ Phantom node!
  
Display:
  Subprocess box shows: "Node3, Node2, Node2" (duplicate Node2)
```

### After Fix:
```
Connections:
  Main → Node1 ✅
  Node1 → Node2 ✅
  Node2 → Node3 ✅ CORRECT!
  
Display:
  Subprocess box shows: "Node1, Node2, Node3" (correct)
```

---

## 🧪 Future Prevention

The backend fix prevents this from happening again:

1. ✅ Old edges are fully cleaned up before creating new ones
2. ✅ Both incoming and outgoing edges are removed
3. ✅ Parent relationships are correctly resolved
4. ✅ Debug logging helps track issues

---

## 🆘 If Problems Persist

If you still see issues after running the cleanup:

1. **Check the console logs** when saving - look for:
   ```
   📍 Parent lookup: parent="subprocess-1", parentIndex=1
   📍 SubprocessIdMap: [[0, 10000], [1, 10001], [2, 10002]]
   ✅ Subprocess "Node3" CORRECTLY connecting to "Node2" (ID 10001)
   ```

2. **Manual database cleanup:**
   - Open MongoDB Compass
   - Find the "customer support" document
   - In `parsedData.connections`, remove any connections where:
     - `from` or `to` is 10003 or higher
     - `from` points to wrong parent

3. **Complete reset:**
   - Delete the process
   - Re-upload the original VSDX file
   - Add subprocesses one by one again

---

## 📝 Summary

1. ✅ Run: `node backend/fix-connections.js`
2. ✅ Restart backend server
3. ✅ Test in application
4. ✅ Verify connections are correct

The fix is now in place to prevent future issues! 🎉

